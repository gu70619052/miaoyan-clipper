/**
 * 妙言剪藏 · 设置项（chrome.storage.local）
 */

export const DEFAULT_SETTINGS = {
  defaultFolder: '',        // 默认目标分类（空 = 库根目录）
  lastFolder: '',           // 最近一次保存用的分类（剪藏面板默认带出这个）
  lastTags: [],             // 最近一次保存用的标签（下次剪藏预填）
  imagePolicy: 'download',  // download = 下载到 i/ ；remote = 保留远程链接
  includeSource: true,      // frontmatter 里写来源链接
  includeMeta: true,        // frontmatter 里写站点 / 作者 / 剪藏时间
  includeTags: true,
  autoOpenPanel: true,      // 剪藏完成后自动打开侧边栏
  keepRemoteImageOnFail: true, // 图片下载失败时退回远程链接
  allowPrivateImages: false,   // 是否允许下载内网/环回地址的图片（默认拒绝，防 SSRF）
  rememberTags: true,         // 是否记住上次用的标签并预填
};

export async function getSettings() {
  try {
    const stored = await chrome.storage.local.get('settings');
    return { ...DEFAULT_SETTINGS, ...(stored && stored.settings ? stored.settings : {}) };
  } catch (err) {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function setSettings(patch) {
  const current = await getSettings();
  const next = { ...current, ...patch };
  await chrome.storage.local.set({ settings: next });
  return next;
}
