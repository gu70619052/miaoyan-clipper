#!/usr/bin/env node
/**
 * 审核监控的离线端到端演练（零依赖，不联网、不发真 QQ）。
 *
 *   node test/review-check.e2e.mjs
 *
 * 做法：本地起一个假 API 服务器，按脚本给的状态依次返回不同状态；
 * 再用一个假的 qq-send 脚本把「消息」写到临时文件里。
 * 最后检查：每次迭代只发一条、同一件事不重发、审核中不打扰。
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, '..', 'scripts', 'review-check.mjs');

let pass = 0;
let fail = 0;
async function check(name, fn) {
  try {
    await fn();
    pass += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    fail += 1;
    console.log(`  ✗ ${name}\n      ${err.message}`);
  }
}

// ---------------------------------------------------------------- 临时环境

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'miaoyan-cws-e2e-'));
const SA_FILE = path.join(TMP, 'sa.json');
const OUT_FILE = path.join(TMP, 'sent.txt');
const STATE_FILE = path.join(TMP, 'state.json');
const LOG_FILE = path.join(TMP, 'log.txt');
const CONF_FILE = path.join(TMP, 'config.json');

// 假服务账号（只用来签 JWT，签出来的 token 假服务器不校验）
const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
fs.writeFileSync(
  SA_FILE,
  JSON.stringify({
    type: 'service_account',
    client_email: 'fake@example.iam.gserviceaccount.com',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  }),
);

// 假 qq-send：把消息追加到文件
const FAKE_QQ = path.join(TMP, 'qq-send.sh');
fs.writeFileSync(FAKE_QQ, `#!/bin/sh\nprintf '%s\\n---\\n' "$1" >> ${JSON.stringify(OUT_FILE)}\nexit 0\n`);
fs.chmodSync(FAKE_QQ, 0o755);

fs.writeFileSync(
  CONF_FILE,
  JSON.stringify({
    publisherId: 'pub-test',
    itemId: 'pbdpebhchbkgmgdgdehnoppglilakiaj',
    displayName: '妙言剪藏',
    qqSend: FAKE_QQ,
  }),
);

const sent = () => (fs.existsSync(OUT_FILE) ? fs.readFileSync(OUT_FILE, 'utf8').split('\n---\n').filter(Boolean) : []);
function resetOut() {
  fs.writeFileSync(OUT_FILE, '');
}

// ---------------------------------------------------------------- 假 API

/** 依次返回的状态队列 */
let queue = [];
/** 模拟 API 报错 */
let failMode = false;
const server = http.createServer((req, res) => {
  if (req.url.includes('/token')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ access_token: 'fake-token', expires_in: 3600 }));
    return;
  }
  if (failMode) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 503, message: 'backend unavailable' } }));
    return;
  }
  const next = queue.length ? queue.shift() : {};
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(next));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;

function env() {
  return {
    ...process.env,
    CWS_CONFIG_FILE: CONF_FILE,
    CWS_STATE_FILE: STATE_FILE,
    CWS_LOG_FILE: LOG_FILE,
    CWS_SA_JSON_FILE: SA_FILE,
    CWS_API_BASE: `http://127.0.0.1:${port}`,
    CWS_TOKEN_URL: `http://127.0.0.1:${port}/token`,
  };
}

async function runOnce() {
  try {
    await execFileAsync(process.execPath, [SCRIPT], { env: env(), encoding: 'utf8' });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err.stderr || err.message) };
  }
}

const pub = (v, extra = {}) => ({
  publishedItemRevisionStatus: { state: 'PUBLISHED', distributionChannels: [{ crxVersion: v, deployPercentage: 100 }] },
  ...extra,
});
const sub = (state, v) => ({
  submittedItemRevisionStatus: { state, distributionChannels: [{ crxVersion: v, deployPercentage: 100 }] },
});
const readState = () => JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));

console.log('\n[1] 第一次跑：线上已有 v0.6.0（旧状态格式），不该重发');
resetOut();
fs.writeFileSync(STATE_FILE, JSON.stringify({ notifiedKeys: ['?|NONE|0.6.0|PUBLISHED'], failures: 0 }));
queue = [pub('0.6.0')];
let r = await runOnce();
await check('脚本正常退出', () => assert.equal(r.ok, true, r.error));
await check('没有发消息（v0.6.0 之前报过了）', () => assert.equal(sent().length, 0));
await check('旧指纹被迁移成事件键', () => {
  const st = readState();
  assert.ok(st.notifiedKeys.includes('live|0.6.0'), JSON.stringify(st.notifiedKeys));
});

console.log('\n[2] 提交 v0.6.1 审核中：不打扰');
resetOut();
queue = [{ ...pub('0.6.0'), ...sub('PENDING_REVIEW', '0.6.1') }];
r = await runOnce();
await check('脚本正常退出', () => assert.equal(r.ok, true, r.error));
await check('一条消息都没发', () => assert.equal(sent().length, 0));

console.log('\n[3] v0.6.1 审核通过上线：发一条');
resetOut();
queue = [pub('0.6.1')];
r = await runOnce();
await check('脚本正常退出', () => assert.equal(r.ok, true, r.error));
await check('发了正好一条', () => assert.equal(sent().length, 1));
await check('消息里有版本号与商店页', () => {
  const m = sent()[0];
  assert.ok(m.includes('v0.6.1'), m);
  assert.ok(m.includes('chromewebstore.google.com/detail/'), m);
});

console.log('\n[4] 下一次轮询（状态没变）：不再发');
resetOut();
queue = [pub('0.6.1')];
r = await runOnce();
await check('脚本正常退出', () => assert.equal(r.ok, true, r.error));
await check('一条消息都没发', () => assert.equal(sent().length, 0));

console.log('\n[5] 下一轮迭代 v0.6.2 上线：再发一条（每次迭代都通知）');
resetOut();
queue = [pub('0.6.2')];
r = await runOnce();
await check('脚本正常退出', () => assert.equal(r.ok, true, r.error));
await check('发了正好一条', () => assert.equal(sent().length, 1));
await check('消息里是 v0.6.2', () => assert.ok(sent()[0].includes('v0.6.2'), sent()[0]));

console.log('\n[6] v0.6.3 被拒：发一条；反复查不重发');
resetOut();
queue = [{ ...pub('0.6.2'), ...sub('REJECTED', '0.6.3') }];
r = await runOnce();
await check('脚本正常退出', () => assert.equal(r.ok, true, r.error));
await check('发了正好一条', () => assert.equal(sent().length, 1));
await check('消息里说审核没通过', () => assert.ok(sent()[0].includes('审核没通过'), sent()[0]));
resetOut();
queue = [{ ...pub('0.6.2'), ...sub('REJECTED', '0.6.3') }];
r = await runOnce();
await check('再跑一次不发', () => assert.equal(sent().length, 0));

console.log('\n[7] v0.6.3 改好后重新提交、通过上线：再发一条');
resetOut();
queue = [{ ...pub('0.6.2'), ...sub('PUBLISHED', '0.6.3') }];
r = await runOnce();
await check('脚本正常退出', () => assert.equal(r.ok, true, r.error));
await check('发了正好一条', () => assert.equal(sent().length, 1));
await check('消息里是 v0.6.3', () => assert.ok(sent()[0].includes('v0.6.3'), sent()[0]));

console.log('\n[8] API 返回错误：连续失败两次才告警');
resetOut();
failMode = true;
fs.writeFileSync(STATE_FILE, JSON.stringify({ notifiedKeys: ['live|0.6.0'], failures: 0, lastFailureAlertAt: 0 }));
r = await runOnce();
await check('查询失败时脚本以非 0 退出', () => assert.equal(r.ok, false));
await check('失败第一次不发告警', () => assert.equal(sent().length, 0));
await check('失败计数 +1', () => assert.equal(readState().failures, 1));
r = await runOnce();
await check('连续第二次失败 → 告警', () => assert.equal(sent().length, 1));
await check('告警内容说明是检查挂了', () => assert.ok(sent()[0].includes('查不动'), sent()[0]));
failMode = false;

console.log(`\n结果：${pass} 通过 / ${fail} 失败\n`);
try {
  fs.rmSync(TMP, { recursive: true, force: true });
} catch {
  /* 临时目录清不掉也无妨 */
}
if (fail) process.exit(1);
