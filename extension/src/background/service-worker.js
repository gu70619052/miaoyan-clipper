/**
 * 妙言剪藏 · 后台 Service Worker
 *
 * 职责：工具栏图标 / 右键菜单 / 快捷键 → 触发页面剪藏；汇总目录树；执行写入；抓当前标签页截图。
 */
import { listFolders, saveDraft } from '../lib/writer.js';
import { getSettings } from '../lib/settings.js';
import { getRootHandle, ensurePermission } from '../lib/fsdb.js';
import { readFolderTree } from '../lib/foldercache.js';

const MENU_ITEMS = [
  { id: 'myclip-select', title: '妙言剪藏：框选剪藏', contexts: ['page'] },
  { id: 'myclip-selection', title: '妙言剪藏：剪藏选中文字', contexts: ['selection'] },
  { id: 'myclip-article', title: '妙言剪藏：整篇正文', contexts: ['page'] },
  { id: 'myclip-screenshot', title: '妙言剪藏：截图剪藏', contexts: ['page'] },
];

const MENU_MODE = {
  'myclip-select': 'select',
  'myclip-selection': 'selection',
  'myclip-article': 'article',
  'myclip-screenshot': 'screenshot',
};

function setupMenus() {
  chrome.contextMenus.removeAll(() => {
    MENU_ITEMS.forEach((item) => {
      try {
        chrome.contextMenus.create(item);
      } catch (err) {
        /* 忽略重复创建 */
      }
    });
  });
}

// 点地址栏旁的图标 = 直接发起剪藏（像印象笔记那样），
// 所以侧栏的「点图标打开面板」行为要关掉，否则 onClicked 不会触发。
try {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
} catch (err) {
  /* 老版本 Chrome 忽略 */
}

chrome.runtime.onInstalled.addListener(() => {
  setupMenus();
  try {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
  } catch (err) {
    /* 老版本 Chrome 忽略 */
  }
});

chrome.runtime.onStartup.addListener(() => {
  setupMenus();
});

function notifyUnsupportedPage(tabId, url) {
  // file:// / chrome:// 等页面注入不了内容脚本，右键剪藏没有反应。
  // 用角标给一个可见提示（不需要额外权限）。
  try {
    chrome.action.setBadgeText({ tabId, text: '!' });
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#c0431f' });
    chrome.action.setTitle({
      tabId,
      title: '妙言剪藏：当前页面不支持剪藏（file:// / chrome:// / 应用商店页面）',
    });
    setTimeout(() => {
      chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {});
      chrome.action.setTitle({ tabId, title: '妙言剪藏：把网页正文存成妙言笔记' }).catch(() => {});
    }, 6000);
  } catch (err) {
    /* 忽略 */
  }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const mode = MENU_MODE[info.menuItemId];
  if (!mode || !tab || tab.id == null) return;
  startClipOnTab(tab, mode);
});

/**
 * 在某个标签页上发起剪藏。
 * 打不开内容脚本的页面（file://、chrome://、应用商店…）给角标提示，并打开侧栏。
 */
function startClipOnTab(tab, mode) {
  if (!tab || tab.id == null) return false;
  const url = tab.url || '';
  if (!/^https?:\/\//i.test(url)) {
    notifyUnsupportedPage(tab.id, url);
    openPanel(tab.id);
    return false;
  }
  chrome.tabs.sendMessage(tab.id, { type: 'MYCLIP_START', mode }, () => {
    const err = chrome.runtime.lastError;
    if (err) {
      // 页面没加载内容脚本（file://、chrome://、应用商店页面等）→ 给个可见提示
      notifyUnsupportedPage(tab.id, url);
      openPanel(tab.id);
    }
  });
  return true;
}

// 点地址栏旁的扩展图标 = 发起剪藏（默认整篇正文，页面上还能拖范围框调整）
chrome.action.onClicked.addListener((tab) => {
  startClipOnTab(tab, 'article');
});

const MODE_BY_COMMAND = {
  'clip-article': 'article',
  'clip-select': 'select',
  'clip-screenshot': 'screenshot',
};

// 快捷键：Ctrl/Cmd + Shift + S / A / E
chrome.commands.onCommand.addListener((command) => {
  const mode = MODE_BY_COMMAND[command] || 'article';
  chrome.tabs
    .query({ active: true, currentWindow: true })
    .then((tabs) => {
      const tab = tabs && tabs[0];
      startClipOnTab(tab, mode);
    })
    .catch(() => {});
});

/** 剪藏成功后给这个页面打个 ✓ 角标（导航走掉就清掉） */
async function markClippedTab(draft) {
  const url = draft && draft.url;
  if (!url) return;
  try {
    const base = String(url).split('#')[0];
    const tabs = await chrome.tabs.query({});
    const tab = tabs.find((t) => String(t.url || '').split('#')[0] === base);
    if (tab && tab.id != null) {
      await chrome.action.setBadgeText({ tabId: tab.id, text: '✓' });
      await chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: '#2e9e82' });
    }
  } catch (err) {
    /* 忽略 */
  }
}

/**
 * 记住用户最近在看的网页。
 * 侧边栏用它判断「面板里的草稿是不是上一篇的内容」。
 */
function rememberActiveUrl(url) {
  if (!url || !/^https?:\/\//i.test(url)) return;
  chrome.storage.session.set({ lastActiveUrl: url }).catch(() => {});
}

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    rememberActiveUrl(tab && tab.url);
  } catch (err) {
    /* 忽略 */
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo && changeInfo.url) {
    chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {});
  }
  // 用户在当前标签页里换了网址，「最近在看的网页」也要跟着换，
  // 否则侧边栏会以为草稿还是当前页的。
  if (tab && tab.active && tab.url) rememberActiveUrl(tab.url);
});

async function openPanel(tabId) {
  try {
    await chrome.sidePanel.open({ tabId });
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * 后台上下文的诊断信息：和扩展页上下文做对比用。
 * iCloud Drive 目录在后台里经常读不到句柄或枚举不到子目录，
 * 有了这份对比报告就能一眼看出问题出在哪个上下文。
 */
async function diag() {
  const report = { context: 'background', at: new Date().toISOString() };
  try {
    const handle = await getRootHandle();
    report.hasHandle = !!handle;
    if (handle) {
      report.rootName = handle.name || '';
      report.readPerm = await ensurePermission(handle, 'read', false);
      report.readwritePerm = await ensurePermission(handle, 'readwrite', false);
      try {
        const res = await listFolders();
        report.folders = res.folders ? res.folders.length : 0;
        report.listError = res.error || '';
        report.listOk = !!res.ok;
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

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return undefined;

  switch (msg.type) {
    case 'MYCLIP_CAPTURED': {
      // 截图剪藏的草稿可能很大，storage.session 有 10MB 配额；
      // 写失败必须让页面知道，不能静默丢（审计 P1-10）。
      rememberActiveUrl(msg.draft && msg.draft.url);
      chrome.storage.session.set({ draft: msg.draft }).catch((err) => {
        try {
          chrome.storage.session.remove('draft');
        } catch (e) {
          /* 忽略 */
        }
        sendResponse({
          ok: false,
          error: `草稿保存失败（会话存储可能已满）：${String(err && err.message)}`,
        });
      });
      getSettings()
        .then((settings) => {
          if (!settings.autoOpenPanel) return null;
          if (sender && sender.tab && sender.tab.id != null) return openPanel(sender.tab.id);
          return null;
        })
        .catch(() => {});
      sendResponse({ ok: true });
      return undefined;
    }

    case 'MYCLIP_FOLDERS': {
      Promise.all([listFolders(), getSettings()])
        .then(async ([folders, settings]) => {
          const res = {
            ok: folders.ok,
            error: folders.error,
            folders: folders.folders || [],
            rootName: folders.rootName || '',
            defaultFolder: settings.defaultFolder || '',
            cached: false,
          };
          if (!res.ok || !res.folders.length) {
            // 后台上下文读不到 iCloud 目录时，退回扩展页写好的目录树缓存
            const cache = await readFolderTree();
            if (cache && (cache.folders || []).length) {
              res.folders = cache.folders;
              res.rootName = res.rootName || cache.rootName || '';
              res.cached = true;
              if (!res.ok) res.ok = true;
              if (!res.error && cache.error) res.error = cache.error;
            }
          }
          sendResponse(res);
        })
        .catch((err) => sendResponse({ ok: false, error: String(err && err.message) }));
      return true;
    }

    case 'MYCLIP_SAVE': {
      saveDraft(msg.draft, { folder: msg.folder, title: msg.title, tags: msg.tags })
        .then(async (res) => {
          if (res && res.ok) {
            await markClippedTab(msg.draft);
          }
          // 后台上下文读不到 iCloud 目录句柄（NO_ROOT）或权限失效（PERMISSION_REQUIRED）时，
          // 把请求交给侧栏（扩展页上下文）代存——那里的句柄和权限都是有效的。
          const needsPanel = res.code === 'PERMISSION_REQUIRED' || res.code === 'NO_ROOT';
          if (!res.ok && needsPanel && msg.from !== 'panel') {
            await chrome.storage.session.set({
              pendingSave: {
                draft: msg.draft,
                folder: msg.folder || '',
                title: msg.title || '',
                tags: msg.tags || [],
                at: Date.now(),
              },
            });
            sendResponse({
              ok: false,
              code: 'NEEDS_PANEL',
              error: '目录授权需要确认一次，已转交侧栏保存',
            });
            return;
          }
          sendResponse(res);
        })
        .catch((err) => sendResponse({ ok: false, error: String(err && err.message) }));
      return true;
    }

    case 'MYCLIP_START_ACTIVE': {
      // 面板里的「剪藏当前页面」：等价于用户点了地址栏旁的扩展图标
      const mode = msg.mode || 'article';
      chrome.tabs
        .query({ active: true, currentWindow: true })
        .then((tabs) => {
          const tab = tabs && tabs[0];
          if (!tab) {
            sendResponse({ ok: false, error: '找不到当前标签页' });
            return;
          }
          const ok = startClipOnTab(tab, mode);
          sendResponse({ ok, error: ok ? '' : '当前页面不支持剪藏（file:// / chrome:// 等）' });
        })
        .catch((err) => sendResponse({ ok: false, error: String(err && err.message) }));
      return true;
    }

    case 'MYCLIP_ACTIVE_URL': {
      // 面板问后台：用户最近在看哪个网页（用来判断草稿是不是「上一篇」）
      chrome.storage.session
        .get('lastActiveUrl')
        .then((res) => sendResponse({ ok: true, url: (res && res.lastActiveUrl) || '' }))
        .catch(() => sendResponse({ ok: true, url: '' }));
      return true;
    }

    case 'MYCLIP_SAVE_RESULT': {
      chrome.storage.session
        .get('lastSaveResult')
        .then((res) => sendResponse({ ok: true, result: (res && res.lastSaveResult) || null }))
        .catch(() => sendResponse({ ok: true, result: null }));
      return true;
    }

    case 'MYCLIP_DIAG': {
      diag()
        .then((report) => sendResponse({ ok: true, report }))
        .catch((err) => sendResponse({ ok: false, error: String(err && err.message) }));
      return true;
    }


    case 'MYCLIP_CAPTURE_TAB': {
      const windowId = sender && sender.tab ? sender.tab.windowId : undefined;
      chrome.tabs.captureVisibleTab(windowId, { format: 'png' })
        .then((dataUrl) => sendResponse({ ok: true, dataUrl }))
        .catch((err) => sendResponse({ ok: false, error: String(err && err.message) }));
      return true;
    }

    case 'MYCLIP_OPEN_PANEL': {
      const tabId = sender && sender.tab ? sender.tab.id : undefined;
      if (tabId == null) {
        sendResponse({ ok: false });
        return undefined;
      }
      openPanel(tabId).then((ok) => sendResponse({ ok }));
      return true;
    }

    case 'GET_DRAFT': {
      chrome.storage.session
        .get('draft')
        .then((res) => sendResponse({ ok: true, draft: res.draft || null }))
        .catch(() => sendResponse({ ok: true, draft: null }));
      return true;
    }

    case 'CLEAR_DRAFT': {
      chrome.storage.session.remove('draft').catch(() => {});
      sendResponse({ ok: true });
      return undefined;
    }

    default:
      return undefined;
  }
});
