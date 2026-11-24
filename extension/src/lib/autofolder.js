/**
 * 妙言剪藏 · 按域名自动归档（v0.7.0）
 *
 * 规则表长这样：
 *   [{ id, pattern: 'github.com', folder: '工作/项目', enabled: true }]
 *
 * 匹配规则：
 *   - pattern 写 'github.com' 时，github.com 与 www.github.com 都命中；
 *   - pattern 写 '*.github.com' 等价于 'github.com'（都按「域名及其子域」匹配）；
 *   - 规则按顺序命中，第一条命中的生效；
 *   - 「此站点不再自动归档」名单里的域名优先级最高，直接跳过。
 *
 * 总开关默认关闭：开了才会改变用户原本的保存目录，
 * 所以默认行为必须和 v0.6.0 完全一致。
 */

/** 取 URL 的 hostname（小写） */
export function hostOf(url) {
  try {
    return new URL(String(url || '')).hostname.toLowerCase();
  } catch {
    return '';
  }
}

/**
 * host 是否命中 pattern。
 * pattern 里的 '*.' 前缀会被去掉，之后按「完全相等或子域」判断。
 *
 * 只在 pattern 本身像个完整域名（含点）时才做子域匹配 ——
 * 否则写 'com' 这种裸后缀会命中所有 .com 站点，把归档全劫持走。
 */
export function hostMatches(pattern, host) {
  const p = String(pattern || '').trim().toLowerCase().replace(/^\*\./, '');
  const h = String(host || '').trim().toLowerCase();
  if (!p || !h) return false;
  if (p === h) return true;
  if (!p.includes('.')) return false;
  return h.endsWith(`.${p}`);
}

/** 这个域名是不是被用户拉黑了（此站点不再自动归档） */
export function isDisabledHost(host, settings) {
  const list = settings && Array.isArray(settings.archiveDisabledHosts) ? settings.archiveDisabledHosts : [];
  return list.some((item) => hostMatches(item, host));
}

/**
 * 按域名找应该保存到哪个目录。
 *
 * folder 为空串表示「库根目录」——设置页下拉框的第一项就是它，
 * 用户明确选了它就是有效规则，不能当成「没配置」跳过。
 * 只有 folder 根本没填（undefined / null）才算没配置。
 * @returns {{folder:string, pattern:string, ruleId:string}|null}
 */
export function ruleForHost(url, settings) {
  if (!settings) return null;
  if (settings.autoArchive !== true) return null;
  const host = hostOf(url);
  if (!host) return null;
  if (isDisabledHost(host, settings)) return null;
  const rules = Array.isArray(settings.archiveRules) ? settings.archiveRules : [];
  for (const rule of rules) {
    if (!rule || rule.enabled === false) continue;
    if (!hostMatches(rule.pattern, host)) continue;
    if (rule.folder === undefined || rule.folder === null) continue;
    const folder = String(rule.folder).trim();
    return { folder, pattern: rule.pattern, ruleId: rule.id || '' };
  }
  return null;
}

/**
 * 在一批候选目录里挑出真正存在的那个。
 * 规则里写的目录可能已经被删了，这时退回库根目录（返回 ''，missing 为 true）。
 * 库根目录（folder === ''）永远存在。
 */
export function resolveAutoFolder(url, settings, folders) {
  const hit = ruleForHost(url, settings);
  if (!hit) return null;
  if (hit.folder === '') {
    return { folder: '', pattern: hit.pattern, ruleId: hit.ruleId, missing: false };
  }
  const list = Array.isArray(folders) ? folders : [];
  const exists = list.some((f) => f && f.path === hit.folder);
  if (!exists) {
    return { folder: '', pattern: hit.pattern, ruleId: hit.ruleId, missing: true };
  }
  return { folder: hit.folder, pattern: hit.pattern, ruleId: hit.ruleId, missing: false };
}

/** 把某个域名加进「不再自动归档」名单 */
export function withDisabledHost(settings, url) {
  const host = hostOf(url);
  if (!host) return settings;
  const list = Array.isArray(settings.archiveDisabledHosts) ? settings.archiveDisabledHosts.slice() : [];
  if (!list.some((item) => hostMatches(item, host))) list.push(host);
  return { ...settings, archiveDisabledHosts: list };
}

/** 生成一条新规则的 id */
export function newRuleId() {
  return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
