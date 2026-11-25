/**
 * 妙言剪藏 · 写入调度
 *
 * 面板与后台共用：把一份「草稿」写进妙言库（Markdown 笔记 + i/ 附件）。
 */
import { getRootHandle, queryPermissionState, requestPermissionNow } from './fsdb.js';
import { getSettings, setSettings } from './settings.js';
import { cacheFolderTree } from './foldercache.js';
import { hasOriginPermission, originPattern } from './permissions.js';
import {
  sanitizeFileName,
  listDirNames,
  pickUniqueName,
  writeTextFileExclusive,
  writeBytesFile,
  listFolderTree,
  buildNoteContent,
  formatTimestamp,
  attachmentBaseName,
  sanitizeAttachmentName,
  shortHash,
  mimeToExt,
} from './miaoyan.js';

/**
 * 图片占位符：转换器输出 `![alt](myimg://<序号>)`。
 * 必须整段匹配序号，否则 myimg://1 会命中 myimg://10（审计 P0-2：11 张图丢图且链接错位）。
 */
const IMAGE_MARKDOWN_RE = /!\[([^\]]*)\]\(myimg:\/\/(\d+)\)/g;
const IMAGE_PLACEHOLDER_RE = /myimg:\/\/(\d+)/g;

/** 附件取名规则与笔记一致：大小写 / Unicode 归一化不敏感（见 miaoyan.js nameKey） */
function uniqueFileName(base, ext, existing) {
  // 附件名用 `-2` 后缀：Markdown 里 `/i/xxx (2).png` 会被右括号提前闭合
  return pickUniqueName(base, ext, existing, { dash: true });
}

function dataUrlToBytes(dataUrl) {
  const comma = dataUrl.indexOf(',');
  const meta = dataUrl.slice(0, comma);
  const payload = dataUrl.slice(comma + 1);
  const mimeMatch = /data:([^;,]+)/.exec(meta);
  const mime = mimeMatch ? mimeMatch[1] : 'image/png';
  if (/;base64/i.test(meta)) {
    const bin = atob(payload);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    return { bytes, mime };
  }
  const decoded = decodeURIComponent(payload);
  const bytes = new TextEncoder().encode(decoded);
  return { bytes, mime };
}

/** 单张图片上限：10MB */
const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
/** 图片下载超时：15 秒 */
const IMAGE_TIMEOUT_MS = 15000;

/**
 * 拒绝内网 / 环回地址。
 *
 * 剪藏会把网页里的图片 URL 原样抓下来；如果网页放的是 127.0.0.1:端口 或
 * 169.254.169.254（云元数据接口），扩展就替页面发了内网请求（审计 P1-8）。
 * 只按 URL 字面量判断，DNS 层面的重绑定不在覆盖范围内。
 */
function isPrivateUrl(url) {
  let u;
  try {
    u = new URL(url);
  } catch (err) {
    return true;
  }
  const proto = u.protocol.toLowerCase();
  if (proto !== 'http:' && proto !== 'https:') return true;
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!h) return true;
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (h.includes(':')) {
    // IPv6：环回 / 未指定 / 唯一本地 / 链路本地
    if (h === '::1' || h === '::') return true;
    if (/^f[cd]/.test(h) || h.startsWith('fe80')) return true;
    return false;
  }
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true; // 组播 / 保留
  }
  return false;
}

async function fetchImageBytes(url, opts = {}) {
  if (url.startsWith('data:')) return dataUrlToBytes(url);
  if (!opts.allowPrivate && isPrivateUrl(url)) throw new Error('拒绝下载内网地址');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      credentials: 'omit',
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    // 跟随重定向之后可能落到内网，再确认一次
    if (!opts.allowPrivate && res.url && isPrivateUrl(res.url)) throw new Error('重定向到了内网地址');
    const mime = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (mime && !mime.startsWith('image/')) throw new Error(`不是图片（${mime}）`);
    const declared = Number(res.headers.get('content-length') || 0);
    if (declared && declared > IMAGE_MAX_BYTES) throw new Error('图片太大');
    const buf = await res.arrayBuffer();
    if (buf.byteLength > IMAGE_MAX_BYTES) throw new Error('图片太大');
    return { bytes: new Uint8Array(buf), mime };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 同名保存的跨上下文互斥锁。
 *
 * 只靠「先列目录 → 再写」挡不住并发：两个标签页同时保存同名笔记时，
 * 两边都看到目录里还没有这个文件，然后都写进去，后写的覆盖先写的（审计 P0-3）。
 * 用 Web Locks（navigator.locks）在扩展自己的源上把同名保存串行化：
 * 后一个拿到锁时重新列目录，看到文件已经在了，自动换成 (2)，两边都不丢。
 * 锁不可用时退化为原来的行为（仍有独占写入做二次保护）。
 */
async function withSaveLock(key, fn) {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : null;
  if (!locks || typeof locks.request !== 'function') return fn();
  try {
    return await locks.request(`miaoyan-save:${key}`, { mode: 'exclusive' }, fn);
  } catch (err) {
    // 锁本身出错不该让保存失败，直接执行
    return fn();
  }
}

/** 列出库里的可选分类目录 */
export async function listFolders(opts = {}) {
  let root = opts.root || null;
  if (!root) {
    root = await getRootHandle();
  }
  if (!root) return { ok: false, error: '尚未授权妙言库目录', folders: [], rootName: '' };
  const errors = [];
  let tree = [];
  try {
    tree = await listFolderTree(root, 3, errors);
  } catch (err) {
    // 权限真的没了才会抛 NotAllowedError；queryPermission 报 prompt 但实际可读的情况也在这里被放过
    if (isPermissionError(err)) {
      return { ok: false, code: 'PERMISSION_REQUIRED', error: '妙言库目录需要确认一次授权', folders: [], rootName: '' };
    }
    return { ok: false, error: `读取目录失败：${(err && err.name) || ''} ${(err && err.message) || err}`, folders: [], rootName: '' };
  }
  const folders = [];
  const walk = (nodes, prefix) => {
    nodes.forEach((n) => {
      const path = prefix ? `${prefix}/${n.name}` : n.name;
      folders.push({ name: n.name, path });
      if (n.children && n.children.length) walk(n.children, path);
    });
  };
  walk(tree, '');
  let rootName = '';
  try {
    rootName = root.name || '';
  } catch (err) {
    rootName = '';
  }
  const firstError = errors.length ? errors[0] : null;
  const res = {
    ok: true,
    folders,
    rootName,
    error: firstError ? `读取子目录失败：${firstError.message}` : '',
    errors,
  };
  // 枚举成功就把目录树写进缓存，页内浮层直接读缓存用
  if (folders.length) await cacheFolderTree({ folders, rootName });
  return res;
}

/** 取出（必要时创建）目标目录句柄 */
async function resolveTargetDir(root, folderPath) {
  let dir = root;
  const parts = String(folderPath || '')
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const part of parts) {
    dir = await dir.getDirectoryHandle(part, { create: true });
  }
  return dir;
}

/**
 * 保存草稿到妙言库
 * @param {object} draft {kind, title, markdown, images, imageDataUrl, url, site, author, capturedAt}
 * @param {object} opts {folder, title, tags, root, requestPermission}
 *        root: 传入已有的目录句柄（扩展页上下文里已经拿到，避免再读一次 IndexedDB）
 *        requestPermission: true 时允许在没有用户手势的情况下失败（由调用方保证有手势）
 */
/** 权限类错误：Chrome 在没拿到授权时会抛这两个 */
function isPermissionError(err) {
  const name = (err && err.name) || '';
  return name === 'NotAllowedError' || name === 'SecurityError';
}

function permissionFailure(err) {
  return {
    ok: false,
    code: 'PERMISSION_REQUIRED',
    error: `妙言库目录需要确认一次授权（${(err && err.name) || 'NotAllowedError'}）`,
  };
}

/**
 * 保存一份草稿。
 *
 * 权限处理是「先试后申请」：不再用 queryPermission 事先否决——Chrome 对 iCloud 这类
 * File Provider 目录经常把权限报成 prompt，但实际写入仍然允许；反过来真没权限时，
 * 文件操作本身会抛 NotAllowedError，信息更准确。
 * 只有在用户手势里（opts.requestPermission = true）才会申请授权并原地重试一次。
 */
export async function saveDraft(draft, opts = {}) {
  if (!draft) return { ok: false, error: '没有可保存的内容' };
  const settings = await getSettings();
  const root = opts.root || (await getRootHandle());
  if (!root) {
    return { ok: false, code: 'NO_ROOT', error: '尚未授权妙言库目录：请在侧栏或设置页点「选择妙言库目录」' };
  }

  // 授权状态先问一遍，但**不因此就放弃写入**：Chrome 对 iCloud 这类目录
  // 经常把权限报成 prompt，可实际写还是允许的，真正的判据是「能不能写」。
  //
  // permissionPromise：面板在用户点「保存」的**同一个任务**里就把授权请求发出去了
  // （见 panel.js 的 kickPermission）。requestPermission 依赖「用户激活」，而激活
  // 只有几秒有效期 —— 一旦中途弹了别的框（跨站图片授权）或做了慢操作，等轮到它时
  // 激活已过期，Chrome 抛 NotAllowedError，于是「第一次保存说没权限、再点一次就好」。
  // 所以这里优先等那个已经发出去的请求。
  let granted = false;
  if (opts.permissionPromise) {
    const state = await opts.permissionPromise;
    granted = state === 'granted';
    if (!granted && state === 'needgesture') {
      return {
        ok: false,
        code: 'NEED_CONFIRM',
        error: '目录授权需要在点击时立刻确认，请再点一次「保存到妙言」',
      };
    }
  }
  if (!granted && opts.requestPermission) {
    const state = await queryPermissionState(root, 'readwrite');
    // unknown 也要试一次申请：读不到状态不等于有权限
    if (state !== 'granted') {
      const asked = await requestPermissionNow(root, 'readwrite');
      granted = asked === 'granted';
    } else {
      granted = true;
    }
  }

  let res = await writeOnce(draft, settings, root, opts);
  if (!res.ok && res.code === 'PERMISSION_REQUIRED' && opts.requestPermission && !granted) {
    const state = await requestPermissionNow(root, 'readwrite');
    if (state === 'granted') {
      res = await writeOnce(draft, settings, root, opts);
    } else if (state === 'needgesture') {
      return { ...res, code: 'NEED_CONFIRM', error: '妙言库目录需要你点一次「确认授权并保存」' };
    }
  }
  if (res.ok) {
    // 记住这次用的目标目录和标签：下次剪藏默认带出来（少打几个字）
    try {
      await setSettings({
        lastFolder: res.folder || '',
        lastTags: Array.isArray(opts.tags) ? opts.tags.filter(Boolean) : [],
      });
    } catch (err) {
      /* 记不住不影响这次保存 */
    }
  }
  return res;
}

async function writeOnce(draft, settings, root, opts) {
  const folderPath = (opts.folder !== undefined ? opts.folder : settings.defaultFolder) || '';
  const title = String(opts.title || draft.title || '未命名剪藏').trim() || '未命名剪藏';
  const tags = Array.isArray(opts.tags) ? opts.tags.filter(Boolean) : [];

  let dir;
  try {
    dir = await resolveTargetDir(root, folderPath);
  } catch (err) {
    if (isPermissionError(err)) return permissionFailure(err);
    return {
      ok: false,
      code: 'TARGET_UNAVAILABLE',
      error: `目标目录不可用：${(err && err.name) || ''} ${(err && err.message) || err}`,
    };
  }

  let body = String(draft.markdown || '');
  let attachmentDir;
  let existingAttachments;
  // 图片没下载到本地（用户没给来源站点授权 / 网络失败）时统计一下，交给界面提示
  let remoteImages = 0;
  const permissionOrigins = new Set();
  try {
    attachmentDir = await dir.getDirectoryHandle('i', { create: true });
    existingAttachments = new Set(await listDirNames(attachmentDir));
  } catch (err) {
    if (isPermissionError(err)) return permissionFailure(err);
    return {
      ok: false,
      code: 'TARGET_UNAVAILABLE',
      error: `附件目录不可用：${(err && err.name) || ''} ${(err && err.message) || err}`,
    };
  }

  // ---- 附件写入 ----
  if (draft.kind === 'image' && draft.imageDataUrl) {
    try {
      const { bytes, mime } = dataUrlToBytes(draft.imageDataUrl);
      const ext = mimeToExt(mime, 'png');
      const name = uniqueFileName(sanitizeAttachmentName(`${title}-截图`, 80), ext, existingAttachments);
      await writeBytesFile(attachmentDir, name, bytes);
      existingAttachments.add(name);
      body = `![${title}](/i/${name})`;
    } catch (err) {
      return { ok: false, error: `截图写入失败：${err && err.message}` };
    }
  } else if (Array.isArray(draft.images) && draft.images.length) {
    // 整体替换占位符，绝不用 split('myimg://1')：
    // 那样会把 myimg://10、myimg://11 一起切掉（审计 P0-2：11 张图丢图且链接错位）。
    const referenced = new Set();
    const scanRe = new RegExp(IMAGE_PLACEHOLDER_RE.source, 'g');
    let m = scanRe.exec(body);
    while (m !== null) {
      referenced.add(Number(m[1]));
      m = scanRe.exec(body);
    }

    const repl = new Map();
    for (let i = 0; i < draft.images.length; i += 1) {
      const img = draft.images[i];
      if (!img || !img.src) continue;
      if (!referenced.has(i)) continue; // 正文里没引用这张图，不用下载
      if (settings.imagePolicy === 'remote' || opts.forceRemoteImages) {
        // 用户没给图片来源站点授权（或设置里选了只存链接）→ 保留原始链接
        repl.set(i, { kind: 'link', value: img.src });
        remoteImages += 1;
        continue;
      }
      try {
        const { bytes, mime } = await fetchImageBytes(img.src, {
          allowPrivate: !!settings.allowPrivateImages,
        });
        const ext = mimeToExt(mime, mimeToExt((img.src.split('.').pop() || '').toLowerCase(), 'png'));
        const base = sanitizeAttachmentName(attachmentBaseName(img.src, i), 60);
        const name = uniqueFileName(`${base}-${shortHash(img.src)}`, ext, existingAttachments);
        await writeBytesFile(attachmentDir, name, bytes);
        existingAttachments.add(name);
        repl.set(i, { kind: 'link', value: `/i/${name}` });
      } catch (err) {
        // 跨站图片下不下来，多半是没拿到那个站点的访问权（v0.6.0 起不再有全站权限）
        if (!(await hasOriginPermission(img.src))) {
          const pattern = originPattern(img.src);
          if (pattern) permissionOrigins.add(pattern);
        }
        if (settings.keepRemoteImageOnFail) {
          repl.set(i, { kind: 'link', value: img.src });
          remoteImages += 1;
        } else {
          // 下载失败时把**整张图片语法**换成一行说明文字；
          // 只换 URL 会产出 ![坏图](_坏图（下载失败）_) 这种畸形 Markdown（审计 P1-8）。
          const alt = String(img.alt || '图片').replace(/[\[\]()]/g, '');
          repl.set(i, { kind: 'text', value: `（图片下载失败：${alt}）` });
        }
      }
    }

    body = body.replace(IMAGE_MARKDOWN_RE, (match, alt, idx) => {
      const r = repl.get(Number(idx));
      if (!r) return match;
      if (r.kind === 'text') return r.value;
      return `![${alt}](${r.value})`;
    });
    // 兜底：正文里还剩裸占位符（例如带标题的图片语法）也换掉
    body = body.replace(IMAGE_PLACEHOLDER_RE, (match, idx) => {
      const r = repl.get(Number(idx));
      if (!r) return match;
      return r.value;
    });
  }

  const meta = {
    title,
    url: draft.url || '',
    site: draft.site || '',
    author: draft.author || '',
    date: formatTimestamp(draft.capturedAt ? new Date(draft.capturedAt) : new Date()),
    tags,
  };
  const content = buildNoteContent(meta, body, {
    includeSource: settings.includeSource,
    includeMeta: settings.includeMeta,
    includeTags: settings.includeTags,
  });

  // 「列目录 → 取名 → 写入」整段放在同名锁里，
  // 否则两个标签页同时保存同名笔记会互相覆盖（审计 P0-3）。
  const lockKey = `${folderPath}::${sanitizeFileName(title)}`;
  const writeRes = await withSaveLock(lockKey, async () => {
    let names;
    try {
      names = new Set(await listDirNames(dir));
    } catch (err) {
      if (isPermissionError(err)) return permissionFailure(err);
      // 列举失败时不能当成「目录是空的」继续写——那会直接覆盖同名笔记（审计 P1-9）
      return {
        ok: false,
        code: 'LIST_FAILED',
        error: `读取目标目录失败：${(err && err.name) || ''} ${(err && err.message) || err}`,
      };
    }

    // 独占写入 + 换名重试：万一锁没生效（例如另一个上下文没用同一把锁），
    // 也会发现「名字被占了」，自动换成 (2)（审计 P0-3）。
    const base = sanitizeFileName(title);
    let fileName = '';
    let lastErr = null;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const candidate = pickUniqueName(base, 'md', names);
      let attemptRes;
      try {
        attemptRes = await writeTextFileExclusive(dir, candidate, content);
      } catch (err) {
        if (isPermissionError(err)) return permissionFailure(err);
        lastErr = err;
        break;
      }
      if (attemptRes && attemptRes.ok) {
        fileName = candidate;
        break;
      }
      // 有人正在写 / 已经有同名文件 → 记下这个名字，换下一个
      names.add(candidate);
    }
    if (!fileName) {
      return {
        ok: false,
        code: 'WRITE_FAILED',
        error: lastErr
          ? `写入失败：${(lastErr && lastErr.name) || ''} ${(lastErr && lastErr.message) || lastErr}`
          : '写入失败：同名文件正被其他标签页同时写入，请重试',
      };
    }
    return { ok: true, fileName };
  });

  if (!writeRes || !writeRes.ok) return writeRes;
  return {
    ok: true,
    fileName: writeRes.fileName,
    folder: folderPath,
    path: folderPath ? `${folderPath}/${writeRes.fileName}` : writeRes.fileName,
    bytes: content.length,
    remoteImages: typeof remoteImages === 'number' ? remoteImages : 0,
    imagePermissionNeeded: Array.from(permissionOrigins || []),
  };
}
