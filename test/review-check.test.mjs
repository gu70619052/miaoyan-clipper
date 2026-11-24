#!/usr/bin/env node
/**
 * 审核监控脚本的单元测试（零依赖，node 直接跑）。
 *
 *   node test/review-check.test.mjs
 *
 * 测的是「什么时候该发 QQ、发什么」，不联网、不发消息。
 * 被测模块：../scripts/review-check.mjs（与 ~/.dsh/workflows/miaoyan-cws/ 下那份保持一致）
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MOD = pathToFileURL(path.join(HERE, '..', 'scripts', 'review-check.mjs')).href;
const {
  snapshot,
  compareVersions,
  legacyKeyToEvent,
  eventsOf,
  outcomeOf,
  planNotification,
} = await import(MOD);

let pass = 0;
let fail = 0;
const failures = [];

function t(name, fn) {
  try {
    fn();
    pass += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    fail += 1;
    failures.push({ name, err });
    console.log(`  ✗ ${name}\n      ${err.message}`);
  }
}

/** 造一个 API 原始返回 */
function api({ pubState, pubVer, subState, subVer, takenDown, warned } = {}) {
  const out = {};
  if (pubState) {
    out.publishedItemRevisionStatus = {
      state: pubState,
      distributionChannels: pubVer ? [{ crxVersion: pubVer, deployPercentage: 100 }] : [],
    };
  }
  if (subState) {
    out.submittedItemRevisionStatus = {
      state: subState,
      distributionChannels: subVer ? [{ crxVersion: subVer, deployPercentage: 100 }] : [],
    };
  }
  if (takenDown) out.takenDown = true;
  if (warned) out.warned = true;
  return out;
}

const snap = (o) => snapshot(api(o));

console.log('\n[1] snapshot —— 把 API 返回压成四五个字段');
t('空返回 → 全部 NONE', () => {
  const s = snapshot({});
  assert.equal(s.publishedState, 'NONE');
  assert.equal(s.submittedState, 'NONE');
  assert.equal(s.publishedVersion, null);
  assert.equal(s.takenDown, false);
  assert.equal(s.warned, false);
});
t('有发布版本 → 拿到版本号', () => {
  const s = snap({ pubState: 'PUBLISHED', pubVer: '0.6.0' });
  assert.equal(s.publishedState, 'PUBLISHED');
  assert.equal(s.publishedVersion, '0.6.0');
});
t('takenDown / warned 会被读出来', () => {
  const s = snap({ pubState: 'PUBLISHED', pubVer: '0.6.0', takenDown: true, warned: true });
  assert.equal(s.takenDown, true);
  assert.equal(s.warned, true);
});

console.log('\n[2] compareVersions —— 版本号按数值比，不是字符串比');
t('0.6.10 > 0.6.9（字符串比会反）', () => {
  assert.equal(compareVersions('0.6.10', '0.6.9'), 1);
  assert.equal(compareVersions('0.6.9', '0.6.10'), -1);
});
t('相同版本 → 0', () => {
  assert.equal(compareVersions('0.6.0', '0.6.0'), 0);
});
t('少一段也能比', () => {
  assert.equal(compareVersions('0.7', '0.6.9'), 1);
  assert.equal(compareVersions('0.6', '0.6.0'), 0);
});

console.log('\n[3] eventsOf —— 什么状态算「出了结果」');
t('审核中 → 没有事件', () => {
  assert.deepEqual(eventsOf(snap({ subState: 'PENDING_REVIEW', subVer: '0.6.1' })), []);
});
t('已发布 → live 事件', () => {
  const ev = eventsOf(snap({ pubState: 'PUBLISHED', pubVer: '0.6.0' }));
  assert.equal(ev.length, 1);
  assert.equal(ev[0].kind, 'live');
  assert.equal(ev[0].version, '0.6.0');
});
t('STAGED（通过待发布）→ 也算 live', () => {
  const ev = eventsOf(snap({ subState: 'STAGED', subVer: '0.6.1' }));
  assert.equal(ev.length, 1);
  assert.equal(ev[0].kind, 'live');
  assert.equal(ev[0].staged, true);
});
t('PUBLISHED_TO_TESTERS → 也算 live', () => {
  const ev = eventsOf(snap({ subState: 'PUBLISHED_TO_TESTERS', subVer: '0.6.1' }));
  assert.equal(ev[0].kind, 'live');
  assert.equal(ev[0].testers, true);
});
t('REJECTED → rejected 事件', () => {
  const ev = eventsOf(snap({ subState: 'REJECTED', subVer: '0.6.1' }));
  assert.equal(ev[0].kind, 'rejected');
  assert.equal(ev[0].version, '0.6.1');
});
t('takenDown → 下架事件（优先级最高）', () => {
  const ev = eventsOf(snap({ pubState: 'PUBLISHED', pubVer: '0.6.0', takenDown: true }));
  assert.equal(ev[0].kind, 'takenDown');
});
t('warned → 警告事件（线上版本已说过就不再说）', () => {
  const ev = eventsOf(snap({ pubState: 'PUBLISHED', pubVer: '0.6.0', warned: true }));
  const warned = ev.find((e) => e.kind === 'warned');
  assert.ok(warned, '应有 warned 事件');
  assert.equal(warned.version, '0.6.0');
});
t('同时被拒又被警告 → 被拒排前面', () => {
  const ev = eventsOf(snap({ subState: 'REJECTED', subVer: '0.6.1', warned: true, pubState: 'PUBLISHED', pubVer: '0.6.0' }));
  assert.ok(ev.find((e) => e.kind === 'rejected'));
  assert.ok(ev.find((e) => e.kind === 'warned'));
  assert.ok(ev.findIndex((e) => e.kind === 'rejected') < ev.findIndex((e) => e.kind === 'warned'));
});
t('警告没有版本号时也报（版本记 ?）', () => {
  const ev = eventsOf(snap({ warned: true }));
  assert.equal(ev[0].kind, 'warned');
  assert.equal(ev[0].version, '?');
});
t('滚动上线期间 published 与 submitted 同版本 → 只算一件事', () => {
  const ev = eventsOf(snap({ pubState: 'PUBLISHED', pubVer: '0.6.1', subState: 'PUBLISHED', subVer: '0.6.1' }));
  assert.equal(ev.length, 1);
});
t('outcomeOf 取最要紧的那件事', () => {
  const o = outcomeOf(snap({ subState: 'REJECTED', subVer: '0.6.1', pubState: 'PUBLISHED', pubVer: '0.6.0' }));
  assert.equal(o.kind, 'rejected');
});

console.log('\n[4] planNotification —— 该不该发、发哪个键');
t('审核中 → 不发', () => {
  const p = planNotification(snap({ subState: 'PENDING_REVIEW', subVer: '0.6.1' }), {});
  assert.equal(p.notify, false);
  assert.equal(p.reason, '审核中');
});
t('新版本上线 → 发一次，键 live|<版本>', () => {
  const p = planNotification(snap({ pubState: 'PUBLISHED', pubVer: '0.6.1' }), {});
  assert.equal(p.notify, true);
  assert.equal(p.key, 'live|0.6.1');
});
t('同一版本再跑一次 → 不发（键已记过）', () => {
  const state = { notifiedKeys: ['live|0.6.1'] };
  const p = planNotification(snap({ pubState: 'PUBLISHED', pubVer: '0.6.1' }), state);
  assert.equal(p.notify, false);
  assert.equal(p.reason, '已通知过');
});
t('版本换了 → 再发一条（这就是「每次迭代都通知」）', () => {
  const state = { notifiedKeys: ['live|0.6.0'] };
  const p = planNotification(snap({ pubState: 'PUBLISHED', pubVer: '0.6.1' }), state);
  assert.equal(p.notify, true);
  assert.equal(p.key, 'live|0.6.1');
});
t('STAGED 与随后 PUBLISHED 是同一个键 → 不会发两条', () => {
  const state = { notifiedKeys: [] };
  const staged = planNotification(snap({ subState: 'STAGED', subVer: '0.6.1' }), state);
  assert.equal(staged.key, 'live|0.6.1');
  state.notifiedKeys.push(staged.key);
  const published = planNotification(snap({ pubState: 'PUBLISHED', pubVer: '0.6.1' }), state);
  assert.equal(published.notify, false);
});
t('被拒 → 键带次数', () => {
  const p = planNotification(snap({ subState: 'REJECTED', subVer: '0.6.1' }), {});
  assert.equal(p.notify, true);
  assert.equal(p.key, 'rejected|0.6.1|#1');
});
t('同一版又被拒一次 → 次数 +1，键不同 → 还要发', () => {
  const state = {
    notifiedKeys: ['rejected|0.6.1|#1'],
    rejectedEpisodes: { '0.6.1': 1 },
    lastSnapshot: { submittedState: 'PENDING_REVIEW', submittedVersion: '0.6.1' },
  };
  const p = planNotification(snap({ subState: 'REJECTED', subVer: '0.6.1' }), state);
  assert.equal(p.notify, true);
  assert.equal(p.key, 'rejected|0.6.1|#2');
});
t('没变过的被拒状态反复出现 → 仍是同一次，不重复发', () => {
  const state = {
    notifiedKeys: ['rejected|0.6.1|#1'],
    rejectedEpisodes: { '0.6.1': 1 },
    lastSnapshot: { submittedState: 'REJECTED', submittedVersion: '0.6.1' },
  };
  const p = planNotification(snap({ subState: 'REJECTED', subVer: '0.6.1' }), state);
  assert.equal(p.notify, false);
});
t('同时两件事要发 → plans 里两条（线上版本已报过的不算）', () => {
  const state = { notifiedKeys: ['live|0.6.0'], lastSnapshot: { warned: false, takenDown: false } };
  const p = planNotification(snap({ subState: 'REJECTED', subVer: '0.6.1', warned: true, pubState: 'PUBLISHED', pubVer: '0.6.0' }), state);
  assert.equal(p.notify, true);
  assert.equal(p.plans.length, 2);
  assert.deepEqual(p.plans.map((x) => x.key).sort(), ['rejected|0.6.1|#1', 'warned|0.6.0']);
});
t('警告是「状态翻转」事件：上一轮就有警告 → 不再报', () => {
  const state = { notifiedKeys: ['live|0.6.0'], lastSnapshot: { warned: true, takenDown: false } };
  const p = planNotification(snap({ pubState: 'PUBLISHED', pubVer: '0.6.0', warned: true }), state);
  assert.equal(p.notify, false);
});
t('警告第一次出现 → 报一次', () => {
  const state = { notifiedKeys: ['live|0.6.0'], lastSnapshot: { warned: false, takenDown: false } };
  const p = planNotification(snap({ pubState: 'PUBLISHED', pubVer: '0.6.0', warned: true }), state);
  assert.equal(p.notify, true);
  assert.equal(p.key, 'warned|0.6.0');
});

console.log('\n[5] legacyKeyToEvent —— 老状态迁移，不能让 v0.6.0 重发');
t('旧指纹 ?|NONE|0.6.0|PUBLISHED → live|0.6.0', () => {
  assert.equal(legacyKeyToEvent('?|NONE|0.6.0|PUBLISHED'), 'live|0.6.0');
});
t('旧指纹 0.6.1|PUBLISHED|0.6.0|PUBLISHED → live|0.6.1', () => {
  assert.equal(legacyKeyToEvent('0.6.1|PUBLISHED|0.6.0|PUBLISHED'), 'live|0.6.1');
});
t('旧指纹 0.6.1|REJECTED|0.6.0|PUBLISHED → rejected|0.6.1|#1', () => {
  assert.equal(legacyKeyToEvent('0.6.1|REJECTED|0.6.0|PUBLISHED'), 'rejected|0.6.1|#1');
});
t('新格式的键不会被误当成旧格式', () => {
  assert.equal(legacyKeyToEvent('live|0.6.0'), null);
});
t('迁移后：老状态里已发过的版本不会重发', () => {
  const state = { notifiedKeys: ['?|NONE|0.6.0|PUBLISHED'] };
  for (const oldKey of state.notifiedKeys.slice()) {
    const ev = legacyKeyToEvent(oldKey);
    if (ev && !state.notifiedKeys.includes(ev)) state.notifiedKeys.push(ev);
  }
  const p = planNotification(snap({ pubState: 'PUBLISHED', pubVer: '0.6.0' }), state);
  assert.equal(p.notify, false);
});

console.log(`\n结果：${pass} 通过 / ${fail} 失败\n`);
if (fail) {
  for (const f of failures) console.error(`✗ ${f.name}\n${f.err.stack}`);
  process.exit(1);
}
