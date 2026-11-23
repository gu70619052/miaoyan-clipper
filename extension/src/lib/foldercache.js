/**
 * 妙言剪藏 · 目录树缓存
 *
 * 为什么需要缓存：
 *   页内浮层（content script）跑在网页的 origin 下，读不到扩展自己的 IndexedDB，
 *   拿不到妙言库目录句柄，只能通过后台 Service Worker 间接问目录。
 *   而后台上下文在 iCloud Drive（File Provider）目录上可能枚举不到子目录，
 *   于是浮层里的「目标目录」只剩「（库根目录）」。
 *
 * 做法：
 *   能在页面上下文正常读到目录的扩展页（侧栏 / 设置页）枚举成功后，
 *   把目录树写进 chrome.storage.local；浮层直接读缓存，不再依赖后台枚举。
 */
const KEY = 'folderTree';

/** 写缓存（失败不影响主流程） */
export async function cacheFolderTree(payload) {
  try {
    await chrome.storage.local.set({
      [KEY]: {
        folders: (payload && payload.folders) || [],
        rootName: (payload && payload.rootName) || '',
        error: (payload && payload.error) || '',
        updatedAt: Date.now(),
      },
    });
  } catch (err) {
    /* 忽略：缓存只是加速手段 */
  }
}

/** 读缓存 */
export async function readFolderTree() {
  try {
    const res = await chrome.storage.local.get(KEY);
    const data = res && res[KEY];
    if (!data) return null;
    return {
      folders: data.folders || [],
      rootName: data.rootName || '',
      error: data.error || '',
      updatedAt: data.updatedAt || 0,
    };
  } catch (err) {
    return null;
  }
}

/** 清缓存 */
export async function clearFolderTree() {
  try {
    await chrome.storage.local.remove(KEY);
  } catch (err) {
    /* 忽略 */
  }
}
