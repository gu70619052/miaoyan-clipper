/**
 * 妙言剪藏 · 可选主机权限（按需申请）
 *
 * v0.6.0 起扩展不再声明全站主机权限：
 *  - 剪藏本身靠 activeTab：只有你点扩展图标 / 用右键菜单 / 按快捷键时，
 *    Chrome 才临时把当前这个站点交给我们，别的网站一概碰不到；
 *  - 只有「把图片下载到本地」才需要访问图片所在的网站，这部分是
 *    optional_host_permissions，在你点保存的那一刻按需申请。
 *    你不授权也能继续用 —— 图片会退回成原始链接。
 *
 * 说明：chrome.permissions 只在扩展页（侧边栏 / 设置页）可用，内容脚本里没有。
 */

/** 从一个网址算出 Chrome 的主机权限模式，例如 https://example.com/a → https://example.com/* */
export function originPattern(url) {
  try {
    const u = new URL(String(url));
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return `${u.protocol}//${u.host}/*`;
  } catch (err) {
    return '';
  }
}

/** 已经拿到的可选主机权限（不含 activeTab 的临时授权） */
export async function getGrantedOrigins() {
  try {
    const all = await chrome.permissions.getAll();
    return (all && all.origins) || [];
  } catch (err) {
    return [];
  }
}

/** 这个站点有没有拿到可选主机权限 */
export async function hasOriginPermission(url) {
  const pattern = originPattern(url);
  if (!pattern) return false;
  try {
    return await chrome.permissions.contains({ origins: [pattern] });
  } catch (err) {
    return false;
  }
}

/**
 * 申请主机权限。**必须在用户手势里调用**（按钮点击），否则 Chrome 会直接拒绝。
 * 返回 { granted, origins, error }。
 */
export async function requestOriginPermissions(urls) {
  const origins = [];
  for (const u of urls || []) {
    const p = originPattern(u);
    if (p && !origins.includes(p)) origins.push(p);
  }
  if (!origins.length) return { granted: true, origins: [] };
  try {
    const granted = await chrome.permissions.request({ origins });
    return { granted: !!granted, origins };
  } catch (err) {
    return { granted: false, origins, error: String(err && err.message) };
  }
}

/** 撤销可选主机权限 */
export async function removeOriginPermissions() {
  try {
    await chrome.permissions.remove({ origins: ['http://*/*', 'https://*/*'] });
    return true;
  } catch (err) {
    return false;
  }
}

/** 正文里引用到的图片分别来自哪些网址 */
export function collectImageUrls(draft) {
  const list = (draft && Array.isArray(draft.images) ? draft.images : [])
    .map((img) => img && img.src)
    .filter((s) => typeof s === 'string' && /^https?:\/\//i.test(s));
  const urls = [];
  for (const u of list) if (!urls.includes(u)) urls.push(u);
  return urls;
}

/**
 * 计算「还需要授权哪些站点才能把图片下载到本地」。
 *
 * 页面自己的站点不用申请：剪藏时 activeTab 已经给了临时访问权，
 * 同源图片直接能下。跨站图片（CDN 之类）才需要单独授权。
 */
export async function pendingImageOrigins(draft) {
  const pagePattern = originPattern((draft && draft.url) || '');
  const granted = await getGrantedOrigins();
  const need = [];
  for (const u of collectImageUrls(draft)) {
    const pattern = originPattern(u);
    if (!pattern || pattern === pagePattern) continue;
    if (granted.includes('http://*/*') || granted.includes('https://*/*')) continue;
    if (granted.includes(pattern)) continue;
    if (!need.includes(u)) need.push(u);
  }
  return need;
}
