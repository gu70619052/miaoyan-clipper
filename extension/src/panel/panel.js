/**
 * 妙言剪藏 · 侧边栏面板
 *
 * 面板负责：授权妙言库目录、接收剪藏草稿、编辑 Markdown、选择目标目录、触发保存。
 *
 * 关键设计：目录枚举与写盘都在「扩展页上下文」里直接做（import writer.js），
 * 而不是发消息给后台 Service Worker。原因是 iCloud Drive 目录（File Provider）
 * 在后台上下文里可能读不到句柄或枚举不到子目录，页面上下文则正常。
 * 点击「保存」本身就是一次用户手势，可以就地重新申请目录权限。
 */
import {
  getRootHandle,
  saveRootHandle,
  ensurePermission,
  queryPermissionState,
  requestPermissionNow,
} from '../lib/fsdb.js';
import { listFolders, saveDraft } from '../lib/writer.js';
import { cacheFolderTree } from '../lib/foldercache.js';
import { getSettings, setSettings } from '../lib/settings.js';
import { listNoteTitles, filterNotes } from '../lib/notes.js';
import { resolveAutoFolder, withDisabledHost } from '../lib/autofolder.js';
import {
  originPattern,
  hasOriginPermission,
  requestOriginPermissions,
  pendingImageOrigins,
} from '../lib/permissions.js';

const $ = (id) => document.getElementById(id);

const el = {
  rootChip: $('root-chip'),
  authCard: $('auth-card'),
  authTitle: $('auth-title'),
  authDesc: $('auth-desc'),
  btnRegrant: $('btn-regrant'),
  btnPickRoot: $('btn-pick-root'),
  emptyCard: $('empty-card'),
  draftCard: $('draft-card'),
  staleNote: $('stale-note'),
  staleText: $('stale-text'),
  btnClipCurrent: $('btn-clip-current'),
  btnClipCurrent2: $('btn-clip-current-2'),
  authHint: $('auth-hint'),
  draftKind: $('draft-kind'),
  draftSource: $('draft-source'),
  draftMeta: $('draft-meta'),
  title: $('input-title'),
  markdown: $('input-markdown'),
  preview: $('preview'),
  folder: $('select-folder'),
  tags: $('input-tags'),
  saveStatus: $('save-status'),
  statusbar: $('statusbar'),
  newFolderRow: $('new-folder-row'),
  newFolderInput: $('input-new-folder'),
  // v0.7.0
  autoFolderNote: $('auto-folder-note'),
  autoFolderText: $('auto-folder-text'),
  btnDisableAuto: $('btn-disable-auto'),
  btnWikilink: $('btn-wikilink'),
  wikilinkPop: $('wikilink-pop'),
  wikilinkSearch: $('wikilink-search'),
  wikilinkList: $('wikilink-list'),
  wikilinkEmpty: $('wikilink-empty'),
};

let currentDraft = null;
let folders = [];
let rootName = '';
let rootHandle = null;        // 缓存目录句柄：保存时要在用户手势的同一个任务里发起授权，不能等异步取
let pendingReauthor = null;   // 权限失效时暂存的保存请求，重新授权后自动续存
let allNotes = [];            // 库里已有的笔记标题（插入双链用）
const handledPending = new Set();   // 已处理过的 pendingSave 请求（按 at 去重，防重复保存）

/**
 * 在用户手势的**同一个任务**里立刻发起目录授权。
 *
 * requestPermission() 依赖「用户激活」，而激活只有几秒有效期：
 * 一旦中途弹了别的框（跨站图片授权）或做了慢操作，等轮到它时激活已经过期，
 * Chrome 会抛 NotAllowedError —— 这正是「第一次保存说没权限、再点一次就好」的由来。
 * 所以趁手势还在，先把授权请求发出去，再去干别的。
 *
 * 返回的 promise 永远不会 reject：状态以字符串形式给出。
 */
function kickPermission(handle) {
  if (!handle || typeof handle.requestPermission !== 'function') return null;
  try {
    const p = handle.requestPermission({ mode: 'readwrite' });
    if (!p || typeof p.then !== 'function') return null;
    return p.then(
      (state) => state || 'unknown',
      (err) => {
        const name = (err && err.name) || '';
        return name === 'NotAllowedError' || name === 'SecurityError' ? 'needgesture' : 'denied';
      },
    );
  } catch (err) {
    return null;
  }
}

// ---------------------------------------------------------------- 工具

function setStatus(text, kind) {
  el.statusbar.textContent = text || '';
  el.statusbar.style.color = kind === 'err' ? 'var(--err-text)' : kind === 'ok' ? 'var(--ok-text)' : '';
}

function setSaveStatus(text, kind) {
  el.saveStatus.hidden = !text;
  el.saveStatus.textContent = text || '';
  el.saveStatus.className = `status ${kind || 'info'}`;
}

function sendMessage(message) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(message, (res) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve(res || { ok: false, error: '后台没有响应' });
      });
    } catch (err) {
      resolve({ ok: false, error: String(err && err.message) });
    }
  });
}

// ---------------------------------------------------------------- 授权

const AUTH_COPY = {
  none: {
    title: '先授权妙言笔记库',
    desc: '妙言没有开放接口，本扩展通过 Chrome 的文件系统权限直接往你的妙言库目录里写 Markdown。授权一次即可长期有效，笔记不会离开你的电脑。',
    hint: '默认位置：iCloud › 妙言 › Documents（也可以选任意目录）',
  },
  prompt: {
    title: '目录还需要你确认一次',
    desc: '妙言库目录的句柄还在（上方的目录名就是它），但 Chrome 把这次授权退回了「待确认」——浏览器重启、扩展重载或 iCloud 目录重新挂载后都会这样。点一下「授权并保存」即可，不用重新找目录。',
    hint: '点按钮后 Chrome 会弹一次确认框，选「允许」即可继续保存（这次会连着把刚才那篇一起存进去）。',
  },
  denied: {
    title: '目录权限被拒绝了',
    desc: 'Chrome 记录了对这个目录的拒绝。可以点「选择妙言库目录」重新选一次，或者在 chrome://extensions 里移除重装本扩展后再授权。',
    hint: '如果重新选目录还是失败，请把设置页「运行诊断」的输出发出来。',
  },
  unknown: {
    title: '读不到目录权限状态',
    desc: '句柄还在，但当前无法查询权限（浏览器或系统层面暂时不可用）。可以先点「重新授权此目录」；不行就重新选择目录。',
    hint: '默认位置：iCloud › 妙言 › Documents',
  },
};

function showAuthCard(state) {
  const copy = AUTH_COPY[state] || AUTH_COPY.unknown;
  if (el.btnRegrant) {
    el.btnRegrant.textContent = pendingReauthor ? '授权并保存（一次完成）' : '重新授权此目录（推荐）';
  }
  el.authTitle.textContent = copy.title;
  el.authDesc.textContent = copy.desc;
  el.authHint.textContent = copy.hint;
  el.btnRegrant.hidden = state === 'none';
  el.btnPickRoot.classList.toggle('primary', state === 'none');
  el.btnPickRoot.classList.toggle('ghost', state !== 'none');
  el.authCard.hidden = false;
}

async function refreshRoot() {
  let handle = null;
  try {
    handle = await getRootHandle();
  } catch (err) {
    handle = null;
  }
  if (!handle) {
    rootHandle = null;
    el.rootChip.textContent = '未授权';
    el.rootChip.classList.add('warn');
    showAuthCard('none');
    el.emptyCard.hidden = true;
    el.draftCard.hidden = true;
    return false;
  }
  rootHandle = handle;
  rootName = handle.name || rootName;
  const state = await queryPermissionState(handle, 'readwrite');
  if (state === 'granted') {
    el.rootChip.textContent = rootName || '已授权';
    el.rootChip.classList.remove('warn');
    el.authCard.hidden = true;
    return true;
  }
  el.rootChip.textContent = state === 'denied' ? '权限被拒绝' : '待确认授权';
  el.rootChip.classList.add('warn');
  // 权限状态不是 granted 时不再抢占界面：Chrome 的状态有时滞后，真正的判据是「能不能写」。
  // 只有「权限被拒绝」才直接摆出授权卡；待确认的情况留到保存那一刻再申请，草稿照常可编辑。
  if (state === 'denied') {
    showAuthCard('denied');
    el.emptyCard.hidden = true;
    el.draftCard.hidden = true;
  } else {
    el.authCard.hidden = true;
  }
  setStatus(
    state === 'denied' ? '目录权限被拒绝：请重新选择目录' : '目录授权待确认：保存时会请求一次授权',
    'err',
  );
  return false;
}

/**
 * 用已有句柄重新申请权限（不需要重新选目录）。
 * 必须在点击手势里调用：requestPermission() 依赖瞬间用户激活。
 */
async function regrant() {
  // 句柄已经在缓存里的话就用它：这样可以在用户手势的同一个任务里发起授权，
  // 不必先 await 一次 IndexedDB（await 会把「用户激活」拖到过期）。
  const handle = rootHandle || (await getRootHandle().catch(() => null));
  if (!handle) {
    setStatus('还没有选过目录，请点「选择妙言库目录」', 'err');
    return;
  }
  el.btnRegrant.disabled = true;
  setStatus(`正在请求「${handle.name || '妙言库'}」的访问权限…`, 'info');
  const perm = kickPermission(handle);
  const state = perm ? await perm : await requestPermissionNow(handle, 'readwrite');
  el.btnRegrant.disabled = false;
  if (state !== 'granted') {
    setStatus(
      state === 'needgesture'
        ? '浏览器要求必须在点击时立刻授权：请再点一次「授权并保存」'
        : state === 'denied'
          ? '权限被拒绝：可以点「选择妙言库目录」重新授权'
          : `权限仍未授予（${state}）`,
      'err',
    );
    await refreshRoot();
    return;
  }
  setStatus('已重新授权，可以保存了', 'ok');
  await refreshRoot();
  await loadFolders();
  await loadDraft();
  // 把刚才那次授权的结果直接带进续存：否则续存时又会去申请一次，
  // 而那时用户手势已经用掉了 → 又得让用户点第二下。
  await flushPending(perm);
}

/** 权限失效期间没存成功的草稿，重新授权后接着存 */
async function flushPending(permissionPromise) {
  if (!pendingReauthor) return;
  const payload = pendingReauthor;
  pendingReauthor = null;
  setSaveStatus('已重新授权，正在继续保存…', 'info');
  const res = await writeDraft(payload, { permissionPromise: permissionPromise || null });
  if (res && res.ok) {
    const where = res.folder ? `${res.folder}/${res.fileName}` : res.fileName;
    setSaveStatus(`已保存：${where}`, 'ok');
    setStatus(`已保存：${where}`, 'ok');
    await sendMessage({ type: 'CLEAR_DRAFT' });
    currentDraft = null;
    el.draftCard.hidden = true;
    el.emptyCard.hidden = false;
    el.markdown.value = '';
  } else {
    setSaveStatus(`保存失败：${(res && res.error) || '未知错误'}`, 'err');
  }
}

async function pickRoot() {
  if (!window.showDirectoryPicker) {
    setSaveStatus('当前浏览器不支持文件系统访问 API（需要 Chrome 116+）', 'err');
    return;
  }
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite', id: 'miaoyan-library' });
    await saveRootHandle(handle);
    rootHandle = handle;
    await refreshRoot();
    await loadFolders();
    setStatus(`已授权：${handle.name}`, 'ok');
    await loadDraft();
    await flushPending();
  } catch (err) {
    if (err && err.name === 'AbortError') {
      setStatus('已取消选择', 'info');
      return;
    }
    setStatus(`授权失败：${err && err.message}`, 'err');
  }
}

// ---------------------------------------------------------------- 目录

async function loadFolders() {
  // 在扩展页上下文里直接枚举：iCloud 目录在后台上下文里可能枚举不到子目录
  const [res, settings] = await Promise.all([listFolders(), getSettings()]);
  if (!res || !res.ok) {
    folders = [];
    fillFolderSelect();
    setStatus((res && res.error) || '读取目录失败', 'err');
    return false;
  }
  folders = res.folders || [];
  rootName = res.rootName || rootName;
  fillFolderSelect();
  // 目录树写进缓存：页内浮层读不到扩展的 IndexedDB，只能读这份缓存
  await cacheFolderTree({ folders, rootName, error: res.error || '' });
  // 先带出「最近一次保存用的目录」，没有再退回设置里的默认目录
  const want = settings.lastFolder || settings.defaultFolder || '';
  if (want && [...el.folder.options].some((o) => o.value === want)) {
    el.folder.value = want;
  }
  if (res.error) {
    setStatus(res.error, 'err');
    return false;
  }
  return true;
}

function fillFolderSelect(preferred) {
  const current = preferred !== undefined ? preferred : el.folder.value;
  el.folder.innerHTML = '';
  const rootOpt = document.createElement('option');
  rootOpt.value = '';
  rootOpt.textContent = rootName ? `（库根目录）${rootName}` : '（库根目录）';
  el.folder.appendChild(rootOpt);
  folders.forEach((f) => {
    const opt = document.createElement('option');
    opt.value = f.path;
    opt.textContent = f.path;
    el.folder.appendChild(opt);
  });
  if (current && [...el.folder.options].some((o) => o.value === current)) {
    el.folder.value = current;
  }
}

function addNewFolder() {
  const name = el.newFolderInput.value.trim();
  if (!name) {
    el.newFolderInput.focus();
    return;
  }
  const exists = folders.find((f) => f.name === name);
  const path = exists ? exists.path : name;
  if (!exists) {
    folders = folders.concat([{ name, path }]);
    fillFolderSelect(path);
  } else {
    el.folder.value = path;
  }
  el.newFolderRow.hidden = true;
  el.newFolderInput.value = '';
}

// ---------------------------------------------------------------- 草稿

async function loadDraft() {
  const res = await sendMessage({ type: 'GET_DRAFT' });
  const draft = res && res.draft;
  if (!draft) {
    currentDraft = null;
    el.draftCard.hidden = true;
    el.staleNote.hidden = true;
    const handle = await getRootHandle();
    const granted = handle ? await ensurePermission(handle, 'readwrite', false) : false;
    el.emptyCard.hidden = !granted;
    return;
  }
  currentDraft = draft;
  const isImage = draft.kind === 'image';
  el.draftKind.textContent = isImage ? '截图' : '正文';
  el.draftKind.className = isImage ? 'badge image' : 'badge';
  el.draftSource.textContent = draft.url || '';
  el.title.value = draft.title || '';
  el.markdown.value = draft.markdown || '';
  const chars = (draft.markdown || '').length;
  const imgCount = (draft.images || []).length + (isImage ? 1 : 0);
  el.draftMeta.textContent = `${chars} 字 · ${imgCount} 张图`;
  el.draftCard.hidden = false;
  el.emptyCard.hidden = true;
  renderPreview();
  await prefillTags();
  await markStale(draft);
  await applyAutoArchive(draft);
}

/**
 * v0.7.0：按域名自动归档。
 *
 * 命中规则时把目标目录切到规则指定的目录，并提示用户；
 * 用户仍然可以在下拉框里临时改成别的目录。
 * 规则表为空、或总开关关闭时，这里什么都不做（行为和 v0.6.0 完全一致）。
 */
async function applyAutoArchive(draft) {
  if (!el.autoFolderNote) return;
  el.autoFolderNote.hidden = true;
  if (!draft || !draft.url) return;
  let settings = null;
  try {
    settings = await getSettings();
  } catch (err) {
    return;
  }
  if (!settings || settings.autoArchive !== true) return;
  const hit = resolveAutoFolder(draft.url, settings, folders);
  if (!hit) return;
  if (hit.missing) {
    // 规则指向的目录没了：把下拉框清空，
    // 否则会留在上一次记住的目录（settings.lastFolder），存错地方。
    el.folder.value = '';
    el.autoFolderText.textContent = `规则「${hit.pattern}」指向的目录已经不存在，已退回库根目录`;
    el.autoFolderNote.hidden = false;
    return;
  }
  if ([...el.folder.options].some((o) => o.value === hit.folder)) {
    el.folder.value = hit.folder;
  }
  el.autoFolderText.textContent =
    hit.folder === ''
      ? `已按域名规则「${hit.pattern}」归档到「（库根目录）」`
      : `已按域名规则「${hit.pattern}」归档到「${hit.folder}」`;
  el.autoFolderNote.hidden = false;
}

/** 「此站点不再自动归档」：把当前域名加进黑名单 */
async function disableAutoArchiveForThisSite() {
  if (!currentDraft || !currentDraft.url) return;
  try {
    const settings = await getSettings();
    const next = withDisabledHost(settings, currentDraft.url);
    await setSettings({ archiveDisabledHosts: next.archiveDisabledHosts });
    if (el.autoFolderNote) el.autoFolderNote.hidden = true;
    setStatus('这个站点以后不再自动归档', 'ok');
  } catch (err) {
    setStatus('保存设置失败', 'err');
  }
}

// ---------------------------------------------------------------- 双链插入（v0.7.0）

/** 打开/关闭「插入双链」面板 */
async function toggleWikilink() {
  if (!el.wikilinkPop) return;
  if (!el.wikilinkPop.hidden) {
    el.wikilinkPop.hidden = true;
    return;
  }
  el.wikilinkPop.hidden = false;
  el.wikilinkSearch.value = '';
  try {
    const handle = await getRootHandle();
    if (!handle) {
      el.wikilinkList.innerHTML = '';
      el.wikilinkEmpty.textContent = '还没有授权妙言库目录';
      el.wikilinkEmpty.hidden = false;
      return;
    }
    const granted = await ensurePermission(handle, 'read', false);
    if (!granted) {
      el.wikilinkList.innerHTML = '';
      el.wikilinkEmpty.textContent = '目录权限需要确认一次，请先完成上面的授权';
      el.wikilinkEmpty.hidden = false;
      return;
    }
    allNotes = await listNoteTitles(handle, { maxDepth: 3, limit: 500 });
    renderWikilinkList('');
    el.wikilinkSearch.focus();
  } catch (err) {
    el.wikilinkList.innerHTML = '';
    el.wikilinkEmpty.textContent = `读取笔记列表失败：${(err && err.message) || err}`;
    el.wikilinkEmpty.hidden = false;
  }
}

function renderWikilinkList(keyword) {
  const list = filterNotes(allNotes, keyword);
  el.wikilinkList.innerHTML = '';
  list.slice(0, 100).forEach((n) => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'wikilink-item';
    // 同名笔记可能分布在不同目录，显示时带上目录以便区分
    const inDir = n.path && n.path.includes('/');
    btn.textContent = inDir ? `${n.title}（${n.path.slice(0, n.path.lastIndexOf('/'))}）` : n.title;
    btn.title = n.path;
    btn.addEventListener('click', () => insertWikilink(n.title));
    li.appendChild(btn);
    el.wikilinkList.appendChild(li);
  });
  el.wikilinkEmpty.hidden = list.length > 0;
  if (!list.length) el.wikilinkEmpty.textContent = '没有找到匹配的笔记';
}

/**
 * 在光标处插入 [[标题]]。
 * 标题里的 [ ] | # 和换行会破坏 wikilink 语法（macOS 文件名允许这些字符），
 * 所以插入前先消毒。
 */
function insertWikilink(title) {
  const ta = el.markdown;
  const safe = String(title || '')
    .replace(/\[/g, '［')
    .replace(/\]/g, '］')
    .replace(/\|/g, '｜')
    .replace(/#/g, '＃')
    .replace(/[\r\n]+/g, ' ')
    .trim();
  if (!safe) return;
  const text = `[[${safe}]]`;
  const start = typeof ta.selectionStart === 'number' ? ta.selectionStart : ta.value.length;
  const end = typeof ta.selectionEnd === 'number' ? ta.selectionEnd : start;
  ta.value = ta.value.slice(0, start) + text + ta.value.slice(end);
  const pos = start + text.length;
  ta.focus();
  ta.setSelectionRange(pos, pos);
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  el.wikilinkPop.hidden = true;
}

/** 预填上次用过的标签（少打几个字） */
async function prefillTags() {
  try {
    const settings = await getSettings();
    if (settings.rememberTags === false) return;
    const tags = Array.isArray(settings.lastTags) ? settings.lastTags.filter(Boolean) : [];
    if (!tags.length) return;
    if (!el.tags.value.trim()) el.tags.value = tags.join(', ');
  } catch (err) {
    /* 忽略 */
  }
}

function normalizeUrl(url) {
  return String(url || '').split('#')[0].replace(/\/+$/, '');
}

/**
 * 面板里的草稿是不是「上一篇」？
 * 剪藏的文章和当前标签页不是同一个 URL 时给出提示 + 「剪藏当前页面」按钮，
 * 免得以为面板里还是这一页的内容。
 */
async function markStale(draft) {
  if (!draft) {
    el.staleNote.hidden = true;
    return;
  }
  try {
    // 后台记着「用户最近在看的网页」，比在这里查标签页更准
    // （侧边栏自己也是一个标签页，查 active tab 只会查到自己）。
    const res = await sendMessage({ type: 'MYCLIP_ACTIVE_URL' });
    const cur = (res && res.url) || '';
    if (!/^https?:\/\//i.test(cur)) {
      el.staleNote.hidden = true;
      return;
    }
    const same = normalizeUrl(cur) === normalizeUrl(draft.url || '');
    el.staleNote.hidden = same;
    if (!same) {
      el.staleText.textContent = `这是上一次剪藏的内容（${draft.url || '未知来源'}）`;
    }
  } catch (err) {
    el.staleNote.hidden = true;
  }
}

/**
 * 在当前标签页发起剪藏（等价于点地址栏旁的扩展图标）。
 * 先清掉上一篇草稿，免得面板还显示旧内容。
 *
 * v0.6.0：扩展不再有全站主机权限，从侧栏按钮发起时拿不到 activeTab，
 * 所以这里要先向 Chrome 申请「只这一个站点」的访问权（用户手势里会弹一次确认）。
 */
async function clipActiveTab(mode = 'article') {
  setStatus('正在发起剪藏…', 'info');
  await sendMessage({ type: 'CLEAR_DRAFT' });
  currentDraft = null;
  el.draftCard.hidden = true;
  el.staleNote.hidden = true;
  el.emptyCard.hidden = false;

  // 找到当前标签页（manifest 里有 tabs 权限，能读到地址）
  let tab = null;
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    tab = tabs && tabs[0];
  } catch (err) {
    tab = null;
  }
  if (!tab || tab.id == null) {
    setStatus('发起剪藏失败：找不到当前标签页', 'err');
    return false;
  }
  const url = tab.url || '';
  if (!/^https?:\/\//i.test(url)) {
    setStatus('当前页面不支持剪藏（file:// / chrome:// / 应用商店页面）', 'err');
    return false;
  }

  // 需要这个站点的访问权才能把内容脚本注进去
  if (originPattern(url) && !(await hasOriginPermission(url))) {
    const ask = await requestOriginPermissions([url]);
    if (!ask.granted) {
      setStatus('未获得该站点的访问权限，无法剪藏。可以改用地址栏旁的扩展图标或右键菜单发起', 'err');
      return false;
    }
  }

  const res = await sendMessage({ type: 'MYCLIP_START_ACTIVE', mode, tabId: tab.id });
  if (!res || !res.ok) {
    setStatus(`发起剪藏失败：${(res && res.error) || '未知错误'}`, 'err');
    return false;
  }
  setStatus('已发起剪藏：在页面上确认范围后，内容会出现在这里', 'ok');
  return true;
}

function currentMarkdown() {
  return el.markdown.value;
}

// ---------------------------------------------------------------- 预览

const ALLOWED_TAGS = new Set([
  'P', 'BR', 'STRONG', 'EM', 'DEL', 'CODE', 'PRE', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'UL', 'OL', 'LI', 'A', 'IMG', 'HR', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TH', 'TD',
  'SPAN', 'DIV', 'SUP', 'SUB', 'KBD', 'INPUT',
]);

const ALLOWED_ATTRS = new Set(['href', 'src', 'alt', 'title', 'type', 'checked', 'disabled', 'start', 'colspan', 'rowspan']);

function safeUrl(value, allowData) {
  const v = String(value || '').trim();
  if (!v) return false;
  // 协议相对地址（//evil.com）会跟着当前协议走，等同于外链 → 直接拒掉
  if (v.startsWith('//')) return false;
  if (/^(https?:|mailto:|tel:)/i.test(v)) return true;
  if (v.startsWith('#') || v.startsWith('/')) return true;
  if (allowData && /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,/i.test(v)) return true;
  return false;
}

/** 预览用的 HTML 清洗：剪藏内容来自任意网页，必须消毒后再插进扩展页 */
function sanitizeHtml(html) {
  const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
  doc.querySelectorAll('script,style,iframe,object,embed,link,meta,form,noscript').forEach((n) => n.remove());
  const all = doc.body.querySelectorAll('*');
  all.forEach((node) => {
    if (!ALLOWED_TAGS.has(node.tagName)) {
      node.replaceWith(...Array.from(node.childNodes));
      return;
    }
    Array.from(node.attributes).forEach((attr) => {
      const name = attr.name.toLowerCase();
      if (!ALLOWED_ATTRS.has(name)) {
        node.removeAttribute(attr.name);
        return;
      }
      if (name === 'href' && !safeUrl(attr.value, false)) node.removeAttribute(attr.name);
      if (name === 'src' && !safeUrl(attr.value, true)) node.removeAttribute(attr.name);
    });
    if (node.tagName === 'A') {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
    if (node.tagName === 'INPUT') {
      if (node.getAttribute('type') !== 'checkbox') node.remove();
    }
  });
  return doc.body.innerHTML;
}

function renderPreview() {
  if (el.preview.hidden) return;
  let md = currentMarkdown();
  // 图片占位符还没落盘，先用文字代替
  md = md.replace(/!\[([^\]]*)\]\(myimg:\/\/(\d+)\)/g, (_m, alt) => `*🖼 图片${alt ? `：${alt}` : ''}*`);
  let html = '';
  try {
    html = window.marked.parse(md, { gfm: true, breaks: false, headerIds: false, mangle: false });
  } catch (err) {
    html = `<pre>${escapeHtml(md)}</pre>`;
  }
  el.preview.innerHTML = sanitizeHtml(html);
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ---------------------------------------------------------------- 保存

async function save() {
  if (!currentDraft) {
    setSaveStatus('没有可保存的剪藏内容', 'err');
    return;
  }
  const payload = {
    draft: { ...currentDraft, markdown: currentMarkdown() },
    folder: el.folder.value || '',
    title: el.title.value.trim() || currentDraft.title,
    tags: el.tags.value
      .split(/[,，\s]+/)
      .map((s) => s.trim())
      .filter(Boolean),
  };
  $('btn-save').disabled = true;
  setSaveStatus('正在保存…', 'info');

  // ① 先把「目录授权」的请求发出去：这一步必须在用户手势的同一个任务里，
  //    后面那些 await（读设置、弹图片授权框）都可能把用户激活耗掉，
  //    等轮到 requestPermission 时激活已过期 → 第一次保存失败、再点一次才好。
  const permissionPromise = kickPermission(rootHandle);

  // ② 图片要存到本地，就得能访问图片所在的网站。
  //    跨站图片（CDN 之类）需要单独授权一次 —— 在用户手势里问，不授权就退回原始链接。
  let forceRemoteImages = false;
  try {
    const settings = await getSettings();
    if (settings.imagePolicy !== 'remote') {
      const need = await pendingImageOrigins(payload.draft);
      if (need.length) {
        // 先等目录授权的框处理完再弹图片站点的框：两个弹窗别叠在一起，
        // 否则后弹的那个会把用户激活拖过期。
        if (permissionPromise) await permissionPromise.catch(() => {});
        const ask = await requestOriginPermissions(need);
        if (!ask.granted) forceRemoteImages = true;
      }
    }
  } catch (err) {
    /* 拿不到权限信息就按原样尝试 */
  }

  let res = null;
  try {
    res = await writeDraft(payload, { forceRemoteImages, permissionPromise });
  } catch (err) {
    res = { ok: false, error: String(err && err.message) };
  }
  $('btn-save').disabled = false;
  if (!res || !res.ok) {
    const msg = (res && res.error) || '未知错误';
    setSaveStatus(`保存失败：${msg}`, 'err');
    setStatus(`保存失败：${msg}`, 'err');
    if (res && (res.code === 'PERMISSION_REQUIRED' || res.code === 'NEED_CONFIRM' || res.code === 'NO_ROOT')) {
      pendingReauthor = payload;
      showAuthCard(res.code === 'NO_ROOT' ? 'none' : 'prompt');
      setSaveStatus(
        res.code === 'NO_ROOT'
          ? '还没有授权妙言库目录，请点上方「选择妙言库目录」'
          : '目录授权需要确认一次：点上方「重新授权此目录（推荐）」，确认后会自动接着保存',
        'err',
      );
    }
    return;
  }
  const where = res.folder ? `${res.folder}/${res.fileName}` : res.fileName;
  const remoteNote = res.remoteImages
    ? `（${res.remoteImages} 张图片没下载到本地，已保留原始链接）`
    : '';
  setSaveStatus(`已保存：${where}${remoteNote}`, 'ok');
  setStatus(`已保存：${where}${remoteNote}`, 'ok');
  await sendMessage({ type: 'CLEAR_DRAFT' });
  currentDraft = null;
  el.draftCard.hidden = true;
  el.emptyCard.hidden = false;
  el.markdown.value = '';
}

/**
 * 真正写盘：优先在扩展页上下文里做（可带用户手势重新授权），
 * 失败再退回后台 Service Worker。
 */
async function writeDraft(payload, opts = {}) {
  const allowFallback = opts.allowFallback !== false;
  let handle = null;
  try {
    handle = await getRootHandle();
  } catch (err) {
    handle = null;
  }
  if (handle) {
    try {
      const res = await saveDraft(payload.draft, {
        folder: payload.folder,
        title: payload.title,
        tags: payload.tags,
        root: handle,
        requestPermission: true,
        forceRemoteImages: !!opts.forceRemoteImages,
        // 已经在用户手势里发起过的授权请求：直接用它的结果，别再申请一次
        permissionPromise: opts.permissionPromise || null,
      });
      if (res && res.ok) return res;
      if (!allowFallback) return res || { ok: false, error: '保存失败' };
      const fallback = await sendMessage({
        type: 'MYCLIP_SAVE',
        ...payload,
        from: 'panel',
        forceRemoteImages: !!opts.forceRemoteImages,
      });
      if (fallback && fallback.ok) return fallback;
      return res || fallback || { ok: false, error: '保存失败' };
    } catch (err) {
      return { ok: false, error: String(err && err.message) };
    }
  }
  if (!allowFallback) return { ok: false, error: '尚未授权妙言库目录' };
  return sendMessage({
    type: 'MYCLIP_SAVE',
    ...payload,
    from: 'panel',
    forceRemoteImages: !!opts.forceRemoteImages,
  });
}

/**
 * 页内浮层点「保存到妙言」时，如果后台权限失效，请求会转到这里，
 * 由扩展页上下文代存（这里的句柄权限是有效的）。
 */
async function handlePendingSave(req) {
  // 同一个请求只处理一次：storage.onChanged 与 init() 可能同时把同一个
  // pendingSave 递进来，不去重就会保存两遍（审计 P0-1）。
  const reqKey = String((req && req.at) || '');
  if (reqKey && handledPending.has(reqKey)) return;
  if (reqKey) handledPending.add(reqKey);

  // 只消费一次：先把 storage.session 里的 pendingSave 取走。
  // 否则它会一直留在会话存储里，每开一次侧栏就被重新消费一次，
  // 每开一次多生成一篇「(2).md」（审计 P0-1）。
  try {
    const cur = await chrome.storage.session.get('pendingSave');
    const curReq = cur && cur.pendingSave;
    if (curReq && curReq.at === req.at) {
      await chrome.storage.session.remove('pendingSave');
    }
  } catch (err) {
    /* 取不到就算了，下面照常处理 */
  }

  const payload = {
    draft: req.draft,
    folder: req.folder || '',
    title: req.title || '',
    tags: req.tags || [],
  };

  // 先看目录权限：没有权限时自动代存必然失败（这里没有用户手势，
  // Chrome 不会弹授权框）。与其让状态条先闪一次「正在保存」再闪红，
  // 不如直接摆出「授权并保存」按钮——用户点一次就能连着存完。
  let preState = 'unknown';
  try {
    const handle = await getRootHandle();
    if (handle) preState = await queryPermissionState(handle, 'readwrite');
  } catch (err) {
    /* 读不到就照常试 */
  }
  if (preState !== 'granted' && preState !== 'unknown') {
    pendingReauthor = payload;
    await refreshRoot();
    showAuthCard('prompt');
    setSaveStatus('需要先确认一次目录授权：点上面「授权并保存」，确认后会自动接着保存', 'err');
    await chrome.storage.session.set({
      lastSaveResult: {
        ok: false,
        error: '请在侧栏点一次「授权并保存」，确认后会自动保存',
        fileName: '',
        folder: payload.folder,
        path: '',
        at: Date.now(),
      },
    }).catch(() => {});
    return;
  }

  setSaveStatus('正在保存（侧栏代存）…', 'info');
  const res = await writeDraft(payload, { allowFallback: false });
  if (res && !res.ok && (res.code === 'PERMISSION_REQUIRED' || res.code === 'NO_ROOT')) {
    // 代存也拿不到权限（这里没有用户手势，Chrome 不会弹授权框）：
    // 记下这次保存，等用户点「重新授权此目录」后自动续存
    pendingReauthor = payload;
    await refreshRoot();
    showAuthCard('prompt');
    setSaveStatus('目录授权需要确认一次：点上面「重新授权此目录」，确认后会自动接着保存', 'err');
    await chrome.storage.session.set({
      lastSaveResult: {
        ok: false,
        error: '请在侧栏点一次「重新授权此目录」，确认后会自动保存',
        fileName: '',
        folder: payload.folder,
        path: '',
        at: Date.now(),
      },
    }).catch(() => {});
    return;
  }
  try {
    await chrome.storage.session.set({
      lastSaveResult: {
        ok: !!(res && res.ok),
        error: (res && res.error) || '',
        fileName: (res && res.fileName) || '',
        folder: (res && res.folder) || '',
        path: (res && res.path) || '',
        remoteImages: (res && res.remoteImages) || 0,
        at: Date.now(),
      },
    });
  } catch (err) {
    /* 忽略 */
  }
  if (res && res.ok) {
    const where = res.folder ? `${res.folder}/${res.fileName}` : res.fileName;
    const imgNote = res.remoteImages ? `（${res.remoteImages} 张图片未下载到本地）` : '';
    setSaveStatus(`已保存：${where}${imgNote}`, 'ok');
    setStatus(`已保存：${where}${imgNote}`, 'ok');
    await sendMessage({ type: 'CLEAR_DRAFT' });
  } else {
    setSaveStatus(`保存失败：${(res && res.error) || '未知错误'}`, 'err');
  }
}

// ---------------------------------------------------------------- 事件

function bindEvents() {
  $('btn-pick-root').addEventListener('click', pickRoot);
  el.btnRegrant.addEventListener('click', regrant);
  el.btnClipCurrent.addEventListener('click', () => clipActiveTab('article'));
  el.btnClipCurrent2.addEventListener('click', () => clipActiveTab('article'));
  $('btn-options').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
  $('btn-save').addEventListener('click', save);
  $('btn-discard').addEventListener('click', async () => {
    await sendMessage({ type: 'CLEAR_DRAFT' });
    currentDraft = null;
    el.draftCard.hidden = true;
    el.staleNote.hidden = true;
    el.emptyCard.hidden = !(await getRootHandle());
    setStatus('已丢弃当前剪藏', 'info');
  });
  $('btn-new-folder').addEventListener('click', () => {
    el.newFolderRow.hidden = !el.newFolderRow.hidden;
    if (!el.newFolderRow.hidden) el.newFolderInput.focus();
  });
  $('btn-new-folder-ok').addEventListener('click', addNewFolder);
  el.newFolderInput.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      addNewFolder();
    }
  });

  // v0.7.0
  if (el.btnDisableAuto) {
    el.btnDisableAuto.addEventListener('click', disableAutoArchiveForThisSite);
  }
  if (el.btnWikilink) {
    el.btnWikilink.addEventListener('click', toggleWikilink);
  }
  if (el.wikilinkSearch) {
    el.wikilinkSearch.addEventListener('input', () => renderWikilinkList(el.wikilinkSearch.value));
  }

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const isPreview = tab.dataset.tab === 'preview';
      el.markdown.hidden = isPreview;
      el.preview.hidden = !isPreview;
      renderPreview();
    });
  });

  el.markdown.addEventListener('input', () => {
    if (currentDraft) currentDraft.markdown = el.markdown.value;
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'session') return;
    if (changes.draft) {
      loadDraft();
    }
    if (changes.pendingSave) {
      const req = changes.pendingSave.newValue;
      if (req && req.draft) handlePendingSave(req);
    }
    // 后台递过来的状态（正在识别 / 失败原因）—— 剪藏失败时以前只有角标，用户看不见
    if (changes.panelNotice) {
      const notice = changes.panelNotice.newValue;
      if (notice && notice.text) setStatus(notice.text, notice.kind);
    }
  });
}

// ---------------------------------------------------------------- 启动

// 测试钩子：e2e 需要断言「授权必须在用户手势里发起」这类逻辑，
// 而面板里的按钮没法在无头浏览器里点。只在扩展页（面板页）里存在，网页上永远拿不到。
window.__myClipPanel = {
  kickPermission,
  showAuthCard,
  AUTH_COPY,
  getPending: () => pendingReauthor,
  setPending: (v) => {
    pendingReauthor = v;
  },
};

(async function init() {
  bindEvents();
  const ok = await refreshRoot();
  // 目录枚举不再依赖「先确认权限」：直接枚举，真出错时 loadFolders 自己会把原因写进状态条
  const foldersOk = await loadFolders();
  // 草稿与「是否已授权」无关：没授权时也要能看到并编辑已剪藏的内容
  await loadDraft();
  // 面板晚于请求打开时，pendingSave 已经在 storage.session 里了
  try {
    const res = await chrome.storage.session.get('pendingSave');
    if (res && res.pendingSave && res.pendingSave.draft) {
      handlePendingSave(res.pendingSave);
    }
  } catch (err) {
    /* 忽略 */
  }
  // 同理：后台可能在面板打开之前就写了状态（剪藏失败原因等）
  try {
    const res = await chrome.storage.session.get('panelNotice');
    if (res && res.panelNotice && res.panelNotice.text) {
      setStatus(res.panelNotice.text, res.panelNotice.kind);
    }
  } catch (err) {
    /* 忽略 */
  }
  if (ok && foldersOk) {
    setStatus('已连接妙言库，等你剪藏', 'ok');
  }
})();
