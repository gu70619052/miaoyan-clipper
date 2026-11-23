/**
 * 妙言剪藏 · 文件句柄持久化
 *
 * 用 IndexedDB 保存 FileSystemDirectoryHandle（Chrome 的 File System Access API）。
 * 句柄存放在扩展自身的 origin 下，面板 / 选项页 / Service Worker 共享同一份，
 * 所以「授权一次库目录」之后，后台就能直接按真实路径写文件。
 */

const DB_NAME = 'miaoyan-clipper';
const DB_VERSION = 1;
const STORE = 'handles';
const KEY_ROOT = 'libraryRoot';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function runTx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    let req;
    try {
      req = fn(store);
    } catch (err) {
      reject(err);
      return;
    }
    tx.oncomplete = () => {
      // fn 返回的是 IDBRequest 时，取它的 result（取不到就是 undefined）
      if (req && typeof req === 'object' && 'result' in req) {
        resolve(req.result);
        return;
      }
      resolve(req);
    };
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** 保存库根目录句柄 */
export async function saveRootHandle(handle) {
  const db = await openDb();
  await runTx(db, 'readwrite', (store) => store.put(handle, KEY_ROOT));
  db.close();
}

/** 取回库根目录句柄 */
export async function getRootHandle() {
  try {
    const db = await openDb();
    const handle = await runTx(db, 'readonly', (store) => store.get(KEY_ROOT));
    db.close();
    return handle || null;
  } catch (err) {
    // 后台上下文读不到句柄时不要抛错：调用方按「未授权」处理即可
    return null;
  }
}

/** 清除库根目录句柄 */
export async function clearRootHandle() {
  const db = await openDb();
  await runTx(db, 'readwrite', (store) => store.delete(KEY_ROOT));
  db.close();
}

/**
 * 查询目录权限状态。
 * 返回 'granted' | 'prompt' | 'denied' | 'unknown'
 *   granted —— 可以直接读写
 *   prompt  —— 授权还在，但需要用户点一下确认（Chrome 重启、扩展重载、iCloud 目录重新挂载后常见）
 *   denied  —— 用户拒绝过
 */
export async function queryPermissionState(handle, mode = 'readwrite') {
  if (!handle || typeof handle.queryPermission !== 'function') return 'unknown';
  try {
    const state = await handle.queryPermission({ mode });
    return state || 'unknown';
  } catch (err) {
    return 'unknown';
  }
}

/**
 * 在用户手势里重新申请目录权限。
 * Chrome 会弹一次确认框；授权后句柄继续可用，不需要重新选目录。
 */
export async function requestPermissionNow(handle, mode = 'readwrite') {
  if (!handle || typeof handle.requestPermission !== 'function') return 'unknown';
  try {
    const state = await handle.requestPermission({ mode });
    return state || 'unknown';
  } catch (err) {
    const name = (err && err.name) || '';
    // NotAllowedError：没有用户激活（不是用户拒绝），提示再点一次即可
    if (name === 'NotAllowedError' || name === 'SecurityError') return 'needgesture';
    return 'denied';
  }
}

/**
 * 检查并（必要时）申请目录读写权限。
 * requestPermission 需要用户手势，必须由扩展页面（面板 / 选项页）直接调用。
 */
export async function ensurePermission(handle, mode = 'readwrite', request = false) {
  if (!handle || typeof handle.queryPermission !== 'function') return false;
  const opts = { mode };
  let state = await handle.queryPermission(opts);
  if (state !== 'granted' && request) {
    try {
      state = await handle.requestPermission(opts);
    } catch (err) {
      return false;
    }
  }
  return state === 'granted';
}
