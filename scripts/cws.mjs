#!/usr/bin/env node
/**
 * 妙言剪藏 · Chrome 应用商店发布工具
 *
 * 用服务账号（Service Account）调 Chrome Web Store API v2，
 * 走「上传 → 等上传完成 → 提交审核 → 查状态」这套流程。
 *
 * 用法：
 *   node scripts/cws.mjs status            # 只看状态（不会改动任何东西）
 *   node scripts/cws.mjs upload <zip>      # 上传新版本（manifest 版本号必须先加过）
 *   node scripts/cws.mjs publish           # 把已上传的版本提交审核
 *   node scripts/cws.mjs release           # 打包 + 上传 + 提交审核（一条命令发版）
 *   node scripts/cws.mjs cancel            # 撤回正在审核的提交
 *   node scripts/cws.mjs token             # 只验证凭据能不能换到 access token
 *
 * 凭据从 macOS 钥匙串读取（不落盘、不进仓库、不进 shell 历史）：
 *   服务名  miaoyan-cws-sa      内容 = 服务账号 JSON 密钥的完整内容
 * 配置在 scripts/cws.config.json（publisherId / itemId，都不是机密）。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXT = path.resolve(HERE, '..');
const CONFIG_PATH = path.join(HERE, 'cws.config.json');
const KEYCHAIN_SERVICE = process.env.CWS_SA_KEYCHAIN_SERVICE || 'miaoyan-cws-sa';
const SCOPE = 'https://www.googleapis.com/auth/chromewebstore';
const API = 'https://chromewebstore.googleapis.com';

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    fail(`缺少 ${path.relative(process.cwd(), CONFIG_PATH)}。
先复制 scripts/cws.config.example.json 为 cws.config.json，填入 publisherId 与 itemId。
（publisherId 在开发者中心「发布商 > 设置」，itemId 就是扩展 ID）`);
  }
  const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  if (!cfg.publisherId || !cfg.itemId) fail('cws.config.json 里的 publisherId / itemId 不能为空');
  return cfg;
}

/** 从钥匙串取服务账号 JSON */
function loadServiceAccount() {
  let raw;
  try {
    raw = execFileSync('security', ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-w'], {
      encoding: 'utf8',
    }).trim();
  } catch (err) {
    fail(`钥匙串里没有服务账号密钥（服务名 ${KEYCHAIN_SERVICE}）。
先跑 scripts/import-sa-key.sh 把 JSON 密钥导进去（命令会在本文件同目录）。

注意：不要把密钥贴进聊天或提交到仓库。`);
  }
  // 存进去的内容带换行时，security 会当二进制处理、读出来是十六进制串
  if (/^[0-9a-f]+$/i.test(raw) && raw.length % 2 === 0) {
    try {
      raw = Buffer.from(raw, 'hex').toString('utf8');
    } catch (err) {
      /* 保持原样，交给下面的 JSON.parse 报错 */
    }
  }
  let sa;
  try {
    sa = JSON.parse(raw);
  } catch (err) {
    fail('钥匙串里存的不是合法 JSON，重新跑 scripts/import-sa-key.sh');
  }
  if (!sa.client_email || !sa.private_key) fail('密钥里缺 client_email / private_key，确认下的是「服务账号 JSON 密钥」');
  return sa;
}

function b64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** 用服务账号私钥签 JWT，换 access token（不需要 gcloud，也不落临时文件） */
async function getAccessToken() {
  const sa = loadServiceAccount();
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: SCOPE,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const signingInput = `${header}.${claims}`;
  const signature = b64url(crypto.createSign('RSA-SHA256').update(signingInput).sign(sa.private_key));
  const assertion = `${signingInput}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }).toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    fail(`换 access token 失败（HTTP ${res.status}）：${JSON.stringify(data)}

常见原因：
· 开发者中心「账号」页没把这个服务账号邮箱加进去
· Cloud 项目里没启用「Chrome Web Store API」
· 服务账号密钥被删除了`);
  }
  return data.access_token;
}

async function api(token, urlPath, init = {}) {
  const res = await fetch(`${API}${urlPath}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch (err) {
    body = { raw: text.slice(0, 400) };
  }
  return { ok: res.ok, status: res.status, body };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchStatus(token, cfg) {
  return api(token, `/v2/publishers/${cfg.publisherId}/items/${cfg.itemId}:fetchStatus`);
}

function printStatus(body) {
  const pub = body.publishedItemRevisionStatus || {};
  const sub = body.submittedItemRevisionStatus || {};
  console.log(`  已发布版本状态：${pub.state || '—'}${pub.distributionChannels ? `（${pub.distributionChannels.join(', ')}）` : ''}`);
  if (sub.state) console.log(`  提交版本状态：${sub.state}`);
  if (body.lastAsyncUploadError) console.log(`  上次上传错误：${JSON.stringify(body.lastAsyncUploadError)}`);
  const raw = JSON.stringify(body);
  if (raw.length < 600) console.log(`  原始返回：${raw}`);
}

async function cmdStatus({ quiet = false } = {}) {
  const cfg = loadConfig();
  const token = await getAccessToken();
  const { ok, status, body } = await fetchStatus(token, cfg);
  if (!ok) fail(`查询状态失败（HTTP ${status}）：${JSON.stringify(body)}`);
  if (!quiet) {
    console.log(`商品 ${cfg.itemId}`);
    printStatus(body);
  }
  return body;
}

async function cmdUpload(zipPath) {
  const cfg = loadConfig();
  const file = path.resolve(zipPath);
  if (!fs.existsSync(file)) fail(`找不到 zip：${file}`);
  const bytes = fs.readFileSync(file);
  console.log(`上传 ${path.basename(file)}（${(bytes.length / 1024).toFixed(0)} KB）…`);

  const token = await getAccessToken();
  const { ok, status, body } = await api(
    token,
    `/upload/v2/publishers/${cfg.publisherId}/items/${cfg.itemId}:upload`,
    { method: 'POST', headers: { 'content-type': 'application/zip' }, body: bytes },
  );
  if (!ok) fail(`上传失败（HTTP ${status}）：${JSON.stringify(body)}

如果是版本号问题：manifest.json 里的 version 必须比已发布的大。`);

  console.log(`  uploadState = ${body.uploadState || '—'}`);
  if (body.uploadState === 'IN_PROGRESS' || body.uploadState === 'UPLOAD_IN_PROGRESS') {
    for (let i = 0; i < 60; i += 1) {
      await sleep(5000);
      const st = await fetchStatus(token, cfg);
      const state = st.body.uploadState || st.body.lastAsyncUploadError ? 'FAILED' : 'SUCCEEDED';
      if (st.body.lastAsyncUploadError) {
        fail(`上传被服务端拒绝：${JSON.stringify(st.body.lastAsyncUploadError)}`);
      }
      if (state === 'SUCCEEDED') {
        console.log('  上传完成');
        return;
      }
      process.stdout.write('.');
    }
    console.log('\n  等了 5 分钟还没完成，用 status 命令再看一次');
    return;
  }
  console.log('  上传完成');
}

async function cmdPublish() {
  const cfg = loadConfig();
  const token = await getAccessToken();
  console.log('提交审核…');
  const { ok, status, body } = await api(
    token,
    `/v2/publishers/${cfg.publisherId}/items/${cfg.itemId}:publish`,
    { method: 'POST' },
  );
  if (!ok) fail(`提交失败（HTTP ${status}）：${JSON.stringify(body)}

常见原因：
· 开发者中心里「商店信息」「隐私」标签页没填完
· 之前手动改过可见性设置，需要先在后台手动发布一次
· 账号没开两步验证（2FA 是硬要求）`);
  if (body.state) console.log(`  提交状态：${body.state}`);
}

async function cmdCancel() {
  const cfg = loadConfig();
  const token = await getAccessToken();
  const { ok, status, body } = await api(
    token,
    `/v2/publishers/${cfg.publisherId}/items/${cfg.itemId}:cancelSubmission`,
    { method: 'POST' },
  );
  if (!ok) fail(`撤回失败（HTTP ${status}）：${JSON.stringify(body)}`);
  console.log('已撤回当前提交');
}

/** 打包（和 store/listing.md 里的命令保持一致） */
function buildZip() {
  const version = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8')).version;
  const out = path.resolve(EXT, '..', `miaoyan-clipper-${version}-store.zip`);
  fs.rmSync(out, { force: true });
  const args = [
    '-rq', out,
    'manifest.json', 'README.md', 'PRIVACY.md', 'icons', 'src',
    '-x', 'icons/make_icons.py',
  ];
  execFileSync('zip', args, { cwd: EXT, stdio: 'inherit' });
  console.log(`打包完成：${path.relative(process.cwd(), out)}（v${version}）`);
  return out;
}

/** 一条命令发版：预检 → 打包 → 上传 → 提交审核 → 查状态 */
async function cmdRelease(force) {
  const before = await cmdStatus({ quiet: true });
  const submitted = (before.submittedItemRevisionStatus || {}).state || '';
  const published = (before.publishedItemRevisionStatus || {}).state || '';
  console.log(`当前：已发布 ${published || '—'} / 提交 ${submitted || '—'}`);

  if (!force && (submitted === 'PENDING_REVIEW' || submitted === 'IN_REVIEW')) {
    fail(`上一版还在审核中（${submitted}），现在再提交会被拒，也可能把排队中的那版挤掉。
等审核出结果（node scripts/cws.mjs status），或者先撤回（node scripts/cws.mjs cancel）。
确实要提交新版本：node scripts/cws.mjs release --force`);
  }
  if (!published) {
    console.log('提示：这个商品还没有已发布的版本 —— 首版审核通过后，API 才能接管后续发版。');
  }

  const zip = buildZip();
  await cmdUpload(zip);
  await cmdPublish();
  console.log('\n已提交审核。审核通过后会自动上线，用下面命令看进度：');
  console.log('  node scripts/cws.mjs status');
  await cmdStatus();
}

function fail(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

const [cmd = 'status', ...rest] = process.argv.slice(2);
try {
  if (cmd === 'status') {
    if (rest.includes('--json')) {
      const cfg = loadConfig();
      const token = await getAccessToken();
      const { ok, status, body } = await fetchStatus(token, cfg);
      if (!ok) fail(`查询状态失败（HTTP ${status}）：${JSON.stringify(body)}`);
      console.log(JSON.stringify(body, null, 2));
    } else {
      await cmdStatus();
    }
  }
  else if (cmd === 'upload') {
    if (!rest[0]) fail('用法：node scripts/cws.mjs upload <zip 路径>');
    await cmdUpload(rest[0]);
  } else if (cmd === 'publish') await cmdPublish();
  else if (cmd === 'cancel') await cmdCancel();
  else if (cmd === 'token') {
    await getAccessToken();
    console.log('✓ 凭据可用，能换到 access token');
  } else if (cmd === 'release') await cmdRelease(rest.includes('--force'));
  else {
    fail(`不认识的命令：${cmd}
可用：status / upload <zip> / publish / release / cancel / token`);
  }
} catch (err) {
  fail(String((err && err.message) || err));
}
