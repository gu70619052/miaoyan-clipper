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
  // v0.7.0
  useDefuddle: true,          // 用 Defuddle 认正文（失败自动回退到自研提取器）
  autoArchive: false,         // 按域名自动归档（默认关闭，关掉时行为和 v0.6.0 完全一致）
  archiveRules: [],           // [{id, pattern, folder, enabled}]
  archiveDisabledHosts: [],   // 「此站点不再自动归档」的域名名单
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
