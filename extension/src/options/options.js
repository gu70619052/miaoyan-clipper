/**
 * 妙言剪藏 · 设置页
 */
import {
  getRootHandle,
  saveRootHandle,
  clearRootHandle,
  ensurePermission,
  queryPermissionState,
  requestPermissionNow,
} from '../lib/fsdb.js';
import { getSettings, setSettings } from '../lib/settings.js';
import { listFolders } from '../lib/writer.js';
import { readFolderTree, cacheFolderTree, clearFolderTree } from '../lib/foldercache.js';
import { getGrantedOrigins, removeOriginPermissions } from '../lib/permissions.js';

const $ = (id) => document.getElementById(id);

let folders = [];
let rootName = '';

function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    t.hidden = true;
  }, 2200);
}

async function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (res) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(res || { ok: false, error: '后台没有响应' });
    });
  });
}

async function refreshRoot() {
  let handle = null;
  try {
    handle = await getRootHandle();
  } catch (err) {
    handle = null;
  }
  if (!handle) {
    $('root-path').textContent = '未授权';
    $('btn-regrant').hidden = true;
    return false;
  }
  const state = await queryPermissionState(handle, 'readwrite');
  const name = handle.name || '（已授权）';
  $('btn-regrant').hidden = state === 'granted';
  if (state === 'granted') {
    $('root-path').textContent = `${name} · 权限有效`;
    return true;
  }
  $('root-path').textContent =
    state === 'prompt'
      ? `${name} · 需要再确认一次授权（点「重新授权此目录」）`
      : state === 'denied'
        ? `${name} · 权限被拒绝，请重新选择目录`
        : `${name} · 读不到权限状态（${state}）`;
  return false;
}

/** 用已有句柄重新申请权限：必须在点击手势里调用 */
async function regrant() {
  let handle = null;
  try {
    handle = await getRootHandle();
  } catch (err) {
    handle = null;
  }
  if (!handle) {
    toast('还没有选过目录，请点「选择目录」');
    return;
  }
  toast(`正在请求「${handle.name || '妙言库'}」的访问权限…`);
  const state = await requestPermissionNow(handle, 'readwrite');
  if (state !== 'granted') {
    toast(state === 'denied' ? '权限被拒绝：请重新选择目录' : `权限仍未授予（${state}）`);
    await refreshRoot();
    return;
  }
  await refreshRoot();
  await loadFolders();
  toast('已重新授权，可以正常保存了');
}

async function pickRoot() {
  if (!window.showDirectoryPicker) {
    toast('当前浏览器不支持文件系统访问 API（需要 Chrome 116+）');
    return;
  }
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite', id: 'miaoyan-library' });
    await saveRootHandle(handle);
    await refreshRoot();
    await loadFolders();
    toast('已授权：' + (handle.name || ''));
  } catch (err) {
    if (err && err.name === 'AbortError') {
      toast('已取消选择');
      return;
    }
    toast('授权失败：' + (err && err.message));
  }
}

async function clearRoot() {
  await clearRootHandle();
  // 目录缓存里留着分类名，撤销授权后也不该继续留着
  await clearFolderTree();
  $('root-path').textContent = '未授权';
  folders = [];
  fillFolderSelect();
  toast('已清除授权');
}

async function loadFolders() {
  // 在扩展页上下文里直接枚举目录（后台上下文在 iCloud 目录上可能枚举不到子目录）
  const res = await listFolders();
  folders = (res && res.folders) || [];
  rootName = (res && res.rootName) || rootName;
  fillFolderSelect();
  // 页内浮层只能读缓存，授权/刷新目录后同步一份过去
  await cacheFolderTree({ folders, rootName, error: (res && res.error) || '' });
  if (res && !res.ok) {
    toast(res.error || '读取目录失败');
  } else if (res && res.error) {
    toast(res.error);
  }
  return res;
}

function fillFolderSelect() {
  const sel = $('select-default');
  const current = sel.value;
  sel.innerHTML = '';
  const rootOpt = document.createElement('option');
  rootOpt.value = '';
  rootOpt.textContent = rootName ? `（库根目录）${rootName}` : '（库根目录）';
  sel.appendChild(rootOpt);
  folders.forEach((f) => {
    const opt = document.createElement('option');
    opt.value = f.path;
    opt.textContent = f.path;
    sel.appendChild(opt);
  });
  if (current) sel.value = current;
}

async function loadSettings() {
  const s = await getSettings();
  $('input-default').value = s.defaultFolder || '';
  document.querySelectorAll('input[name="imagePolicy"]').forEach((radio) => {
    radio.checked = radio.value === s.imagePolicy;
  });
  $('opt-source').checked = !!s.includeSource;
  $('opt-meta').checked = !!s.includeMeta;
  $('opt-tags').checked = !!s.includeTags;
  $('opt-auto-panel').checked = !!s.autoOpenPanel;
  $('opt-keep-remote').checked = !!s.keepRemoteImageOnFail;
  $('opt-allow-private').checked = !!s.allowPrivateImages;
  $('opt-remember-tags').checked = s.rememberTags !== false;
  await loadFolders();
  const sel = $('select-default');
  if (s.defaultFolder && [...sel.options].some((o) => o.value === s.defaultFolder)) {
    sel.value = s.defaultFolder;
  }
}

async function persist(patch) {
  await setSettings(patch);
}

/** 设置页上下文里的诊断信息 */
async function pageDiag() {
  const report = { context: 'options-page', at: new Date().toISOString() };
  try {
    const handle = await getRootHandle();
    report.hasHandle = !!handle;
    if (handle) {
      report.rootName = handle.name || '';
      report.readPerm = await ensurePermission(handle, 'read', false);
      report.readwritePerm = await ensurePermission(handle, 'readwrite', false);
      report.permissionState = {
        read: await queryPermissionState(handle, 'read'),
        readwrite: await queryPermissionState(handle, 'readwrite'),
      };
      // 轻量读探针：能枚举出来说明目录本身可读（区分「权限没给」与「目录不可读」）
      try {
        let count = 0;
        for await (const _entry of handle.values()) {
          count += 1;
          if (count > 50) break;
        }
        report.readProbe = { ok: true, entries: count };
      } catch (err) {
        report.readProbe = { ok: false, error: `${(err && err.name) || 'Error'}: ${(err && err.message) || err}` };
      }
      try {
        const res = await listFolders();
        report.folders = (res.folders || []).length;
        report.listOk = !!res.ok;
        report.listError = res.error || '';
        report.folderPaths = (res.folders || []).map((f) => f.path);
      } catch (err) {
        report.listOk = false;
        report.listError = String(err && err.message);
      }
    } else {
      report.readPerm = null;
      report.readwritePerm = null;
    }
  } catch (err) {
    report.error = String(err && err.message);
  }
  const cache = await readFolderTree();
  report.cachedFolders = cache ? (cache.folders || []).length : 0;
  report.cacheAt = cache ? new Date(cache.updatedAt || 0).toISOString() : '';
  return report;
}

/** 对比「设置页上下文」和「后台上下文」，看问题出在哪一侧 */
async function runDiag() {
  const out = $('diag-out');
  out.hidden = false;
  out.textContent = '正在诊断…';
  $('diag-summary').textContent = '';
  const page = await pageDiag();
  let bg = null;
  try {
    bg = await sendMessage({ type: 'MYCLIP_DIAG' });
  } catch (err) {
    bg = { ok: false, error: String(err && err.message) };
  }
  const bgReport = bg && bg.report ? bg.report : bg;
  out.textContent = [
    '【设置页上下文】',
    JSON.stringify(page, null, 2),
    '',
    '【后台 Service Worker 上下文】',
    JSON.stringify(bgReport, null, 2),
  ].join('\n');
  $('diag-summary').textContent =
    `设置页读到 ${page.folders || 0} 个子目录，后台读到 ${(bgReport && bgReport.folders) || 0} 个`;
}

/** 列出当前保留的可选主机权限（只为下载跨站图片而授予的那些站点） */
async function loadOrigins() {
  const list = $('origin-list');
  const summary = $('origin-summary');
  if (!list || !summary) return;
  let origins = [];
  try {
    origins = await getGrantedOrigins();
  } catch (err) {
    origins = [];
  }
  list.innerHTML = '';
  if (!origins.length) {
    summary.textContent = '目前没有保留任何站点授权';
    const li = document.createElement('li');
    li.textContent = '没有常驻访问的网站：剪藏时 Chrome 只临时给当前站点权限。';
    list.appendChild(li);
    return;
  }
  summary.textContent = `已保留 ${origins.length} 个站点的访问权`;
  origins.forEach((o) => {
    const li = document.createElement('li');
    li.textContent = o;
    list.appendChild(li);
  });
}

function bind() {
  $('btn-pick').addEventListener('click', pickRoot);
  $('btn-regrant').addEventListener('click', regrant);
  $('btn-clear').addEventListener('click', clearRoot);
  $('btn-diag').addEventListener('click', runDiag);
  $('btn-refresh-folders').addEventListener('click', async () => {
    await loadFolders();
    toast('目录列表已刷新');
  });
  const btnRefreshOrigins = $('btn-refresh-origins');
  if (btnRefreshOrigins) {
    btnRefreshOrigins.addEventListener('click', async () => {
      await loadOrigins();
      toast('站点授权列表已刷新');
    });
  }
  const btnRevoke = $('btn-revoke-origins');
  if (btnRevoke) {
    btnRevoke.addEventListener('click', async () => {
      const ok = await removeOriginPermissions();
      await loadOrigins();
      toast(ok ? '已撤销全部站点授权' : '撤销失败');
    });
  }

  $('input-default').addEventListener('change', (ev) => {
    persist({ defaultFolder: ev.target.value.trim() });
    toast('已保存默认目录');
  });
  $('select-default').addEventListener('change', (ev) => {
    const value = ev.target.value;
    $('input-default').value = value;
    persist({ defaultFolder: value });
    toast('已保存默认目录');
  });

  document.querySelectorAll('input[name="imagePolicy"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      if (radio.checked) {
        persist({ imagePolicy: radio.value });
        toast('图片策略已更新');
      }
    });
  });

  const toggles = [
    ['opt-source', 'includeSource'],
    ['opt-meta', 'includeMeta'],
    ['opt-tags', 'includeTags'],
    ['opt-auto-panel', 'autoOpenPanel'],
    ['opt-keep-remote', 'keepRemoteImageOnFail'],
    ['opt-allow-private', 'allowPrivateImages'],
    ['opt-remember-tags', 'rememberTags'],
  ];
  toggles.forEach(([id, key]) => {
    $(id).addEventListener('change', (ev) => {
      persist({ [key]: ev.target.checked });
      toast('已保存');
    });
  });
}

(async function init() {
  bind();
  await refreshRoot();
  await loadSettings();
  await loadOrigins();
  // 目录列表稍后刷新（枚举 iCloud 目录可能要一两秒，别让整页等它）
  loadFolders().catch(() => {});
})();
