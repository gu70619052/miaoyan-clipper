/**
 * 妙言剪藏 · 妙言笔记写入层
 *
 * 妙言的规则（本机实测）：
 * 1. 笔记标题取自文件名，文件名里不能出现 / : * ? " \ | < > 这些字符，需换成全角。
 * 2. 附件放在「笔记所在目录」的 i/ 子目录，正文统一写 /i/<文件名>（相对分类目录，不是库根）。
 * 3. 开头 frontmatter 只放 key: value 标量行，数组会被 MiaoYan 当正文渲染出来。
 */

/** 保留目录名（分类名）不做全角替换，只做危险字符处理 */
const RESERVED_DIRS = new Set(['i', 'Trash', 'trash']);

export const MIME_EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp',
  'image/avif': 'avif',
  'image/heic': 'heic',
};

export function mimeToExt(mime, fallback = 'png') {
  if (!mime) return fallback;
  const key = String(mime).split(';')[0].trim().toLowerCase();
  if (MIME_EXT[key]) return MIME_EXT[key];
  if (key.startsWith('image/')) {
    const guess = key.slice(6).replace(/[^a-z0-9]/g, '');
    return guess || fallback;
  }
  return fallback;
}

/** UTF-8 字节长度（浏览器与 node 通用） */
export function byteLength(str) {
  const text = String(str == null ? '' : str);
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text).length;
  return unescape(encodeURIComponent(text)).length;
}

/** 把标题转成安全的文件名（对应为知迁移时的 slug_filename 规则） */
export function sanitizeFileName(title, maxBytes = 120) {
  let t = String(title == null ? '' : title)
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  t = t.replace(/\//g, '／')
    .replace(/:/g, '：')
    .replace(/\*/g, '＊')
    .replace(/\?/g, '？')
    .replace(/"/g, '＂')
    .replace(/\\/g, '＼')
    .replace(/\|/g, '｜')
    .replace(/</g, '＜')
    .replace(/>/g, '＞');
  t = t.trim().replace(/[. ]+$/, '');
  if (!t) t = '未命名';
  // 按 Unicode 码点截断，不能按 UTF-16 码元回退：
  // 否则 emoji 会被劈成半个代理项，文件名末尾出现 U+FFFD 乱码（审计 B-3）。
  let chars = Array.from(t);
  while (chars.length && byteLength(chars.join('')) > maxBytes) {
    chars.pop();
  }
  t = chars.join('');
  t = t.trim().replace(/[. ]+$/, '');
  return t || '未命名';
}

/** 时间格式：2026-11-22 21:30 */
export function formatTimestamp(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}`;
}

/** ISO 日期（frontmatter 用） */
export function formatDate(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

function yamlString(value) {
  const s = String(value == null ? '' : value).replace(/"/g, "'").replace(/\n/g, ' ').trim();
  return `"${s}"`;
}

/**
 * 生成 frontmatter。只输出标量 key: value，MiaoYan 会把它隐藏掉。
 * @param {object} meta {title, url, site, author, date, tags}
 * @param {object} opts {includeSource, includeMeta, includeTags}
 */
/**
 * 来源地址脱敏：去掉可能带凭据的查询参数，避免把 token 写进笔记长期留存。
 * 只针对常见的敏感键名，其余参数原样保留（否则链接会失效）。
 */
const SENSITIVE_QUERY_KEYS = new Set([
  'token', 'access_token', 'id_token', 'refresh_token', 'auth', 'authorization',
  'key', 'apikey', 'api_key', 'secret', 'password', 'passwd', 'pwd',
  'signature', 'sig', 'session', 'sessionid', 'session_id', 'sid', 'code',
  'ticket', 'sso', 'jwt', 'assertion', 'credential', 'cred', 'x-amz-signature',
]);

export function sanitizeSourceUrl(raw) {
  const text = String(raw || '').trim();
  if (!text) return '';
  let url;
  try {
    url = new URL(text);
  } catch {
    return text; // 不是合法 URL 就原样保留
  }
  let changed = false;
  for (const key of [...url.searchParams.keys()]) {
    if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
      url.searchParams.set(key, '***');
      changed = true;
    }
  }
  if (url.hash && /^(?:access_token|id_token|token)=/i.test(url.hash.replace(/^#/, ''))) {
    url.hash = '#***';
    changed = true;
  }
  return changed ? url.toString() : text;
}

export function buildFrontmatter(meta, opts = {}) {
  const {
    includeSource = true,
    includeMeta = true,
    includeTags = true,
  } = opts;
  const lines = ['---'];
  // 键名与本机既有迁移笔记保持一致（title + 中文补充键），全部是标量 key: value
  if (meta.title) lines.push(`title: ${yamlString(meta.title)}`);
  if (includeSource && meta.url) lines.push(`来源: ${yamlString(sanitizeSourceUrl(meta.url))}`);
  if (includeMeta) {
    if (meta.site) lines.push(`站点: ${yamlString(meta.site)}`);
    if (meta.author) lines.push(`作者: ${yamlString(meta.author)}`);
    if (meta.date) lines.push(`剪藏时间: ${yamlString(meta.date)}`);
  }
  if (includeTags && meta.tags && meta.tags.length) {
    lines.push(`标签: ${yamlString(meta.tags.join(', '))}`);
  }
  lines.push('---');
  return lines.join('\n');
}

/** 完整笔记内容 = frontmatter + 正文 */
export function buildNoteContent(meta, body, opts = {}) {
  const fm = buildFrontmatter(meta, opts);
  const text = String(body || '').trim();
  return `${fm}\n\n${text}\n`;
}

/** 列出目录下的文件名 */
export async function listDirNames(dirHandle) {
  const names = [];
  for await (const entry of dirHandle.values()) {
    names.push(entry.name);
  }
  return names;
}

/**
 * 文件名比较键。
 *
 * macOS 的 APFS / HFS+ 默认**大小写不敏感**，而且会把 Unicode 做归一化（NFD/NFC 视作同一个文件）。
 * 所以「标题.md」和「标题.MD」、「é」和「é」在盘上是同一个文件——
 * 只用精确字符串比较取名会直接覆盖用户已有的笔记（审计 P0-4）。
 */
export function nameKey(name) {
  return String(name == null ? '' : name).normalize('NFC').toLowerCase();
}

/** 同名时追加序号：xxx.md → xxx (2).md（比较时用 nameKey，兼顾大小写与 Unicode 归一化） */
export function pickUniqueName(base, ext, existing, opts = {}) {
  const list = existing instanceof Set ? [...existing] : Array.isArray(existing) ? existing : [];
  const keys = new Set(list.map(nameKey));
  const keyOf = (n) => nameKey(`${n}.${ext}`);
  if (!keys.has(keyOf(base))) return `${base}.${ext}`;
  // 附件名用 `-2` 这种不含空格/括号的写法：Markdown 里 `/i/名字 (2).png` 会被提前闭合
  const dash = !!opts.dash;
  let i = 2;
  while (keys.has(keyOf(dash ? `${base}-${i}` : `${base} (${i})`))) i += 1;
  return dash ? `${base}-${i}.${ext}` : `${base} (${i}).${ext}`;
}

/**
 * 附件文件名：额外清掉会破坏 Markdown 链接的字符（空格、括号等）。
 * 妙言里图片是按 `/i/<文件名>` 引用的，文件名里带空格或括号链接就不成立了。
 */
export function sanitizeAttachmentName(name, maxBytes = 80) {
  const cleaned = String(name == null ? '' : name)
    .replace(/[\s\u00a0]+/g, '-')
    .replace(/[()\[\]<>]/g, '')
    .replace(/[\\/:*?"\u0000-\u001f|]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+/, '');
  return sanitizeFileName(cleaned, maxBytes);
}

/** 取得（或创建）子目录 */
export async function getSubDir(parentHandle, name, create = false) {
  return parentHandle.getDirectoryHandle(name, { create });
}

/** 按路径逐级找到目录，找不到抛错 */
export async function resolveFolder(rootHandle, folderPath) {
  const parts = String(folderPath || '')
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);
  let handle = rootHandle;
  for (const part of parts) {
    handle = await handle.getDirectoryHandle(part, { create: false });
  }
  return handle;
}

/** 递归列出可作为目标的目录树（隐藏 i/ 、Trash/ 与点目录） */
export async function listFolderTree(rootHandle, maxDepth = 2, errors = []) {
  async function walk(handle, prefix, depth) {
    const out = [];
    let entries = [];
    try {
      for await (const entry of handle.values()) {
        if (entry.kind !== 'directory') continue;
        if (RESERVED_DIRS.has(entry.name)) continue;
        if (entry.name.startsWith('.')) continue;
        entries.push(entry);
      }
    } catch (err) {
      // 枚举失败（例如 iCloud 目录在后台上下文里不可枚举）不能静默吞掉：
      // 记进 errors，让界面能显示真实原因而不是一个空目录列表。
      errors.push({
        path: prefix || '/',
        name: (err && err.name) || 'Error',
        message: (err && err.message) || String(err),
      });
      return out;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
    for (const entry of entries) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      const node = { name: entry.name, path, children: [] };
      if (depth < maxDepth) {
        node.children = await walk(entry, path, depth + 1);
      }
      out.push(node);
    }
    return out;
  }
  return walk(rootHandle, '', 1);
}

/** 写文本文件（UTF-8） */
export async function writeTextFile(dirHandle, fileName, text) {
  const fh = await dirHandle.getFileHandle(fileName, { create: true });
  const writable = await fh.createWritable();
  await writable.write(new TextEncoder().encode(text));
  await writable.close();
  return fileName;
}

/**
 * 独占写入一个文本文件——用来防「两个标签页同时保存同名笔记」互相覆盖（审计 P0-3）。
 *
 * 做法：
 * 1. 先用 create:false 查文件在不在；在且**已有内容** → 直接判定「这个名字被占了」，
 *    由调用方换一个名字重试（绝不覆盖用户已有笔记）。
 * 2. 在也不存在 → create 后用 createWritable({exclusive:true})：
 *    同一时刻别的上下文写同一个文件会抛 NoModificationAllowedError，
 *    说明「有别人正在写」，同样换名字重试。
 *
 * @returns {Promise<{ok:boolean, reason?:'exists'|'locked', fileName?:string}>}
 */
export async function writeTextFileExclusive(dirHandle, fileName, text) {
  let fh = null;
  let existed = false;
  try {
    fh = await dirHandle.getFileHandle(fileName, { create: false });
    existed = true;
  } catch (err) {
    if ((err && err.name) !== 'NotFoundError') throw err;
  }
  if (existed && fh) {
    let size = 0;
    try {
      size = (await fh.getFile()).size;
    } catch (err) {
      size = 0;
    }
    // 已经有内容 = 别人的笔记（或上一次的产物），不覆盖
    if (size > 0) return { ok: false, reason: 'exists', fileName };
  }
  if (!fh) fh = await dirHandle.getFileHandle(fileName, { create: true });
  let writable;
  try {
    writable = await fh.createWritable({ exclusive: true });
  } catch (err) {
    const name = (err && err.name) || '';
    if (name === 'NoModificationAllowedError' || name === 'InvalidStateError') {
      return { ok: false, reason: 'locked', fileName };
    }
    throw err;
  }
  try {
    await writable.write(new TextEncoder().encode(text));
    await writable.close();
  } catch (err) {
    try {
      await writable.abort();
    } catch (e) {
      /* 忽略 */
    }
    throw err;
  }
  return { ok: true, fileName };
}

/** 写二进制文件 */
export async function writeBytesFile(dirHandle, fileName, bytes) {
  const fh = await dirHandle.getFileHandle(fileName, { create: true });
  const writable = await fh.createWritable();
  await writable.write(bytes);
  await writable.close();
  return fileName;
}

/** 由 URL 猜一个附件文件名（不含扩展名） */
export function attachmentBaseName(url, index = 0) {
  let raw = '';
  try {
    const u = new URL(url);
    const seg = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || '');
    raw = seg.replace(/\.[a-z0-9]{2,5}$/i, '');
  } catch (err) {
    raw = '';
  }
  raw = raw.replace(/[\x00-\x1f]/g, '').trim();
  if (!raw) raw = `图片${index + 1}`;
  return sanitizeFileName(raw, 60);
}

/** 短 hash（用于附件去重） */
export function shortHash(str) {
  let h = 5381;
  const s = String(str || '');
  for (let i = 0; i < s.length; i += 1) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  }
  return h.toString(36).slice(0, 6);
}
