#!/usr/bin/env node
/**
 * 妙言剪藏 · Chrome 应用商店审核结果检查
 *
 * 只做一件事：查 Chrome Web Store 上这个商品的审核状态，
 * **只有出结果（通过 / 被拒）才发一条 QQ**，还在审核中就连日志都不多写。
 *
 * 由 launchd 定时调用（~/Library/LaunchAgents/com.guxueyichen.miaoyan-cws-review.plist）。
 *
 * 配置：~/.dsh/workflows/miaoyan-cws/config.json
 * 状态：~/.dsh/state/miaoyan-cws-review.json
 * 日志：~/.dsh/logs/miaoyan-cws-review.log（launchd 的 stdout/stderr 也进这里）
 *
 * 手动跑：node ~/.dsh/workflows/miaoyan-cws/review-check.mjs
 *        node ... --force    强制发一次当前状态（自测用，会真的发 QQ）
 *
 * ── 去重规则（每次迭代只发一条）────────────────────────────────────────
 * 记的不是「当前状态长什么样」，而是「发生过什么事件」：
 *   live|<版本>      —— 这个版本已经上线
 *   rejected|<版本>|#n —— 这个版本第 n 次被拒
 * 用事件做键，API 怎么变都不会重发；
 * 上一版上线后，下一版审核通过时键变了，于是正好再发一条。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const HOME = os.homedir();
const DIR = path.join(HOME, '.dsh/workflows/miaoyan-cws');
// 下面几个路径可用环境变量覆盖：单元测试与离线演练需要换到临时目录
const CONF = process.env.CWS_CONFIG_FILE || path.join(DIR, 'config.json');
const STATE = process.env.CWS_STATE_FILE || path.join(HOME, '.dsh/state/miaoyan-cws-review.json');
const LOG = process.env.CWS_LOG_FILE || path.join(HOME, '.dsh/logs/miaoyan-cws-review.log');

const TOKEN_URL = process.env.CWS_TOKEN_URL || 'https://oauth2.googleapis.com/token';
const API = process.env.CWS_API_BASE || 'https://chromewebstore.googleapis.com';
const SCOPE = 'https://www.googleapis.com/auth/chromewebstore';
const STORE_PAGE = (id) => `https://chromewebstore.google.com/detail/${id}`;
const DASH = 'https://chrome.google.com/webstore/devconsole';

const FORCE = process.argv.includes('--force');
const SELFTEST = process.argv.includes('--selftest');

// ---------------------------------------------------------------- 小工具

function log(msg) {
  const stamp = new Date().toLocaleString('sv-SE', { hour12: false });
  const line = `[${stamp}] ${msg}\n`;
  try {
    fs.mkdirSync(path.dirname(LOG), { recursive: true });
    fs.appendFileSync(LOG, line);
  } catch {
    /* 日志写不了也不能影响主流程 */
  }
}

function die(msg, code = 1) {
  log(`✗ ${msg}`);
  console.error(msg);
  process.exit(code);
}

function loadJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function saveState(s) {
  fs.mkdirSync(path.dirname(STATE), { recursive: true });
  fs.writeFileSync(STATE, JSON.stringify(s, null, 2) + '\n');
}

// ---------------------------------------------------------------- 凭据

/** 服务账号 JSON 存在 macOS 钥匙串里，不落盘（服务名可由 config 覆盖） */
function readServiceAccount(service) {
  // 离线演练用：CWS_SA_JSON_FILE 指向一个临时 JSON（仅测试用，生产不设这个变量）
  const file = process.env.CWS_SA_JSON_FILE;
  if (file) {
    const sa = loadJson(file);
    if (!sa || !sa.client_email || !sa.private_key) die(`指定的密钥文件不完整：${file}`);
    return sa;
  }
  let out;
  try {
    out = execFileSync('security', ['find-generic-password', '-s', service, '-w'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    die(`读不到钥匙串条目「${service}」：${String(err.stderr || err.message).trim()}`);
  }
  // `security -w` 在 macOS 上可能把内容转成 16 进制打印；JSON 一定以 { 开头，否则按 hex 解
  const text = out.trim();
  const json = text.startsWith('{') ? text : Buffer.from(text, 'hex').toString('utf8');
  const sa = loadJsonText(json);
  if (!sa || !sa.client_email || !sa.private_key) die('钥匙串里的服务账号 JSON 不完整（缺 client_email / private_key）');
  return sa;
}

function loadJsonText(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: sa.client_email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const signature = crypto.createSign('RSA-SHA256').update(signingInput).sign(sa.private_key);
  const assertion = `${signingInput}.${b64url(signature)}`;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    die(`换 access token 失败（HTTP ${res.status}）：${JSON.stringify(body)}`);
  }
  return body.access_token;
}

async function fetchStatus(token, cfg) {
  const url = `${API}/v2/publishers/${encodeURIComponent(cfg.publisherId)}/items/${encodeURIComponent(cfg.itemId)}:fetchStatus`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = `${res.status} ${JSON.stringify(body.error || body)}`;
    throw new Error(msg);
  }
  if (body.publicKey) delete body.publicKey; // 一大段公钥，日志里没用
  return body;
}

// ---------------------------------------------------------------- 判定

const CHANNEL = (status) => status?.distributionChannels?.[0] || {};

export function snapshot(status) {
  const pub = status.publishedItemRevisionStatus || null;
  const sub = status.submittedItemRevisionStatus || null;
  return {
    publishedState: pub?.state || 'NONE',
    publishedVersion: CHANNEL(pub).crxVersion || null,
    submittedState: sub?.state || 'NONE',
    submittedVersion: CHANNEL(sub).crxVersion || null,
    takenDown: !!status.takenDown,
    warned: !!status.warned,
  };
}

/** 版本号比较：0.6.10 > 0.6.9（不能比字符串） */
export function compareVersions(a, b) {
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/**
 * 当前快照里「发生了哪些事件」。
 * 空数组 = 还没出结果（审核中 / 什么都没提交），不打扰。
 *
 * 事件种类：
 *   takenDown —— 线上版本被下架（最紧急）
 *   rejected  —— 提交被拒
 *   live      —— 通过并上线（STAGED = 已通过待发布，PUBLISHED_TO_TESTERS = 只发给了测试用户，也算通过）
 *   warned    —— 被警告（政策问题，不处理会被下架）
 *
 * 同一件事可能同时出现在两个字段里（滚动上线期间 published 与 submitted 短暂不一致），
 * 所以按「种类 + 版本号」去重。
 */
const PRIORITY = { takenDown: 0, rejected: 1, warned: 2, live: 3 };

export function eventsOf(s) {
  const out = [];
  const push = (kind, version, extra) => {
    if (!version) return;
    if (out.some((e) => e.kind === kind && e.version === version)) return;
    out.push({ kind, version, ...(extra || {}) });
  };
  const pushItem = (kind, version, extra) => {
    // 下架 / 警告是针对整个商品的，就算 API 还没给版本号也要报
    push(kind, version || '?', extra);
  };

  // 线上版本被下架：published 记录还在，但 takenDown 为真
  if (s.takenDown) pushItem('takenDown', s.publishedVersion);
  // 线上版本：已发布记录在、或提交记录刚变成 PUBLISHED（滚动上线期间两者可能不一致）
  if (s.publishedState === 'PUBLISHED') push('live', s.publishedVersion);
  if (s.submittedState === 'PUBLISHED') push('live', s.submittedVersion);
  // STAGED：已通过审核、等待发布。算「通过」，键与上线一致，避免之后 PUBLISHED 时再发一条
  if (s.submittedState === 'STAGED') push('live', s.submittedVersion, { staged: true });
  // 只发给了测试用户：也算上线，键同样与公开上线一致
  if (s.submittedState === 'PUBLISHED_TO_TESTERS') push('live', s.submittedVersion, { testers: true });
  // 被拒：提交记录还在，且状态是 REJECTED
  if (s.submittedState === 'REJECTED') push('rejected', s.submittedVersion);
  // 政策警告
  if (s.warned) pushItem('warned', s.publishedVersion || s.submittedVersion);

  out.sort((a, b) => {
    const pa = PRIORITY[a.kind] ?? 9;
    const pb = PRIORITY[b.kind] ?? 9;
    if (pa !== pb) return pa - pb;
    const cmp = compareVersions(b.version, a.version); // 大的在前
    if (cmp !== 0) return cmp;
    return a.kind === b.kind ? 0 : a.kind === 'rejected' ? -1 : 1;
  });
  return out;
}

/** 兼容旧调用：只取最要紧的那件事 */
export function outcomeOf(s) {
  const list = eventsOf(s);
  return list.length ? list[0] : null;
}

/** 事件 → 稳定的事件键 */
function eventKey(event, state) {
  if (event.kind === 'rejected') {
    const v = event.version || '?';
    const episodes = state.rejectedEpisodes || {};
    // 上一轮也在这个版本的拒绝状态里 = 同一次被拒，不算新的一次
    const last = state.lastSnapshot || null;
    const sameEpisode = last && last.submittedState === 'REJECTED' && last.submittedVersion === event.version;
    const index = sameEpisode ? (episodes[v] || 1) : (episodes[v] || 0) + 1;
    return { key: `rejected|${v}|#${index}`, rejectedIndex: index };
  }
  // 下架 / 警告是「状态翻转」类事件：只在刚出现的那一轮报一次，
  // 否则每次发新版本都会把老警告再报一遍。
  const last = state.lastSnapshot || null;
  if (event.kind === 'takenDown' && last && last.takenDown) return { key: null, skip: true };
  if (event.kind === 'warned' && last && last.warned) return { key: null, skip: true };
  return { key: `${event.kind}|${event.version}` };
}

/**
 * 算出这一轮要发哪些事件。
 * state 里带 notifiedKeys（已发过的事件）、rejectedEpisodes（同版本被拒次数）、lastSnapshot（上轮快照）。
 */
export function planNotification(snap, state) {
  const events = eventsOf(snap);
  if (!events.length) return { notify: false, reason: '审核中', outcome: null, key: null, plans: [] };

  const notified = Array.isArray(state.notifiedKeys) ? state.notifiedKeys : [];
  const plans = [];
  for (const event of events) {
    const { key, rejectedIndex, skip } = eventKey(event, state);
    if (skip) continue; // 这条状态不是新出现的
    if (notified.includes(key)) continue; // 这件事已经说过了
    plans.push({ outcome: event, key, rejectedIndex });
  }
  if (!plans.length) return { notify: false, reason: '已通知过', outcome: events[0], key: null, plans: [] };
  return {
    notify: true,
    reason: '出结果了',
    outcome: plans[0].outcome,
    key: plans[0].key,
    rejectedIndex: plans[0].rejectedIndex,
    plans,
  };
}

/** 旧版指纹（4 段）→ 新版事件键，用于把老状态迁移过来，避免 v0.6.0 重发一次 */
export function legacyKeyToEvent(key) {
  if (typeof key !== 'string') return null;
  const parts = key.split('|');
  if (parts.length !== 4) return null;
  const [subVer, subState, pubVer, pubState] = parts;
  if (subState === 'PUBLISHED' && subVer && subVer !== '?') return `live|${subVer}`;
  if ((subState === 'STAGED' || subState === 'PUBLISHED_TO_TESTERS') && subVer && subVer !== '?') return `live|${subVer}`;
  if (subState === 'REJECTED' && subVer && subVer !== '?') return `rejected|${subVer}|#1`;
  if (pubState === 'PUBLISHED' && pubVer && pubVer !== '?') return `live|${pubVer}`;
  return null;
}

function buildMessage(outcome, cfg) {
  const ver = outcome.version ? ' v' + outcome.version : '';
  const name = cfg.displayName || '妙言剪藏';
  if (outcome.kind === 'live') {
    const tail = outcome.staged
      ? '已经通过审核，等商店放出去（有时还要在后台点一下发布）。'
      : outcome.testers
        ? '已经通过审核，目前只发给了测试用户，正式上线还要等商店放出去。'
        : '审核通过，已经上线。';
    return [
      `✅ ${name}${ver} ${tail}`,
      '',
      `商店页：${STORE_PAGE(cfg.itemId)}`,
      `开发者后台：${DASH}`,
      '',
      '（这条是自动检查发的，同一个版本只发一次）',
    ].join('\n');
  }
  if (outcome.kind === 'takenDown') {
    return [
      `🚨 ${name}${ver} 被下架了`,
      '',
      `去后台看原因：${DASH}`,
      '常见原因：违反商店政策、权限说明与实际行为不符、长时间不维护。',
    ].join('\n');
  }
  if (outcome.kind === 'warned') {
    return [
      `⚠️ ${name}${ver} 收到政策警告`,
      '',
      `去后台看具体警告：${DASH}`,
      '警告不处理会被下架，建议尽快看一下。',
    ].join('\n');
  }
  return [
    `❌ ${name}${ver} 审核没通过`,
    '',
    `去这里看拒绝理由：${DASH}`,
    '常见原因：权限理由不够具体、隐私政策与实际行为不一致、上架素材不达标。',
  ].join('\n');
}

// ---------------------------------------------------------------- 发 QQ

function sendQQ(cfg, text) {
  const exe = cfg.qqSend || path.join(HOME, '.dsh/scripts/qq-send');
  if (!fs.existsSync(exe)) return { ok: false, error: `找不到 ${exe}` };
  try {
    execFileSync(exe, [text], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000 });
    return { ok: true };
  } catch (err) {
    const code = err.status;
    const detail = String(err.stderr || err.message || '').trim().split('\n').slice(-3).join(' | ');
    return { ok: false, error: `exit=${code} ${detail}` };
  }
}

// ---------------------------------------------------------------- 主流程

async function main() {
  const cfg = loadJson(CONF);
  if (SELFTEST) {
    if (!cfg || !cfg.itemId) die(`缺配置：${CONF}`, 2);
    const sent = sendQQ(
      cfg,
      [
        '🔧 测试：妙言剪藏审核检查已就绪',
        '',
        '以后只在审核出结果（通过 / 被拒）时才会发消息，平时不会打扰你。',
        `当前商品：${STORE_PAGE(cfg.itemId)}`,
      ].join('\n'),
    );
    log(sent.ok ? '✓ --selftest：测试消息已发' : `✗ --selftest：没发出去 ${sent.error}`);
    if (!sent.ok) process.exit(1);
    return;
  }
  if (!cfg || !cfg.publisherId || !cfg.itemId) {
    die(`缺配置：${CONF}（需要 publisherId 与 itemId）`, 2);
  }
  const state = loadJson(STATE, {}) || {};
  state.notifiedKeys = Array.isArray(state.notifiedKeys) ? state.notifiedKeys : [];
  state.rejectedEpisodes = state.rejectedEpisodes || {};
  state.failures ||= 0;
  state.lastFailureAlertAt ||= 0;

  // 老指纹迁移：老版本记的是「当前状态长什么样」，新版本记「发生过什么事件」
  for (const oldKey of state.notifiedKeys.slice()) {
    const ev = legacyKeyToEvent(oldKey);
    if (ev && !state.notifiedKeys.includes(ev)) state.notifiedKeys.push(ev);
  }

  let status;
  try {
    const sa = readServiceAccount(cfg.keychainService || 'miaoyan-cws-sa');
    const token = await getAccessToken(sa);
    status = await fetchStatus(token, cfg);
  } catch (err) {
    state.failures += 1;
    state.lastRunAt = Date.now();
    log(`✗ 查询失败（连续 ${state.failures} 次）：${String(err.message).slice(0, 300)}`);
    // 连续失败 2 次以上、且距上次告警 > 1 小时，才发一条，避免刷屏
    if (state.failures >= 2 && Date.now() - state.lastFailureAlertAt > 3600_000) {
      const sent = sendQQ(cfg, `⚠️ 妙言剪藏审核检查连续 ${state.failures} 次查不动了\n\n原因：${String(err.message).slice(0, 200)}`);
      if (sent.ok) {
        state.lastFailureAlertAt = Date.now();
        log('↑ 已发失败告警');
      } else {
        log(`↑ 失败告警也没发出去：${sent.error}`);
      }
    }
    saveState(state);
    process.exitCode = 1; // 让 launchd 也能看出这轮失败了
    return;
  }

  state.failures = 0;
  state.lastRunAt = Date.now();
  const snap = snapshot(status);
  const plan = planNotification(snap, state);

  log(
    `状态：提交 ${snap.submittedState}${snap.submittedVersion ? ' (v' + snap.submittedVersion + ')' : ''} / 已发布 ${snap.publishedState}${snap.publishedVersion ? ' (v' + snap.publishedVersion + ')' : ''}${snap.takenDown ? ' / 已下架' : ''}${snap.warned ? ' / 有警告' : ''}${plan.outcome ? ' → ' + plan.outcome.kind + ' ' + (plan.outcome.version || '') : ''}`,
  );

  if (!plan.notify && !FORCE) {
    // 还在审核 / 这些结果已经发过了
    state.lastSnapshot = snap;
    saveState(state);
    return;
  }

  // 一次可能有多件事（例如既被拒又被警告），逐条发、逐条记账
  const pending = FORCE
    ? [{ outcome: plan.outcome, key: plan.key, rejectedIndex: plan.rejectedIndex }]
    : plan.plans;

  let allSent = true;
  for (const item of pending) {
    const text = buildMessage(item.outcome, cfg);
    const sent = sendQQ(cfg, text);
    if (!sent.ok) {
      allSent = false;
      log(`✗ QQ 没发出去：${sent.error}`);
      continue;
    }
    if (!FORCE) {
      state.notifiedKeys.push(item.key);
      if (state.notifiedKeys.length > 50) state.notifiedKeys = state.notifiedKeys.slice(-50);
      if (item.outcome.kind === 'rejected') {
        state.rejectedEpisodes[item.outcome.version || '?'] = item.rejectedIndex || 1;
      }
      log(`✓ 已发 QQ 提醒（事件 ${item.key}）`);
    } else {
      log('✓ --force：已发 QQ');
    }
  }

  if (!allSent) {
    // 发失败的那条不记账、不更新快照，下轮重试（不会丢结果）
    saveState(state);
    process.exitCode = 1;
    return;
  }

  state.lastSnapshot = snap;
  saveState(state);
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((err) => die(`未捕获错误：${err && err.stack ? err.stack : err}`, 9));
}
