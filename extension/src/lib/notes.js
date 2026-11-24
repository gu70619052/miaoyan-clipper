/**
 * 妙言剪藏 · 列出库内已有笔记（给「插入双链」用）
 *
 * 妙言的笔记标题就是文件名，所以双链 [[标题]] 直接用文件名（去掉 .md）。
 * 只读目录，不写任何东西；i/ 附件目录、Trash 回收站、点目录都会跳过。
 */

const SKIP_DIRS = new Set(['i', 'Trash', 'trash']);

/**
 * 递归列出库里的 Markdown 笔记。
 * @param {FileSystemDirectoryHandle} rootHandle 妙言库根目录
 * @param {object} [opts] {maxDepth=3, limit=500}
 * @returns {Promise<Array<{title:string, path:string}>>}
 */
export async function listNoteTitles(rootHandle, opts = {}) {
  const maxDepth = Number.isFinite(opts.maxDepth) ? opts.maxDepth : 3;
  const limit = Number.isFinite(opts.limit) ? opts.limit : 500;
  // 枚举上限：单层目录可能塞着几万个文件，全量物化会卡住面板。
  // 扫到硬上限就停，宁可少列也不要让界面卡住。
  const hardCap = Math.max(limit * 4, 2000);
  const out = [];

  async function walk(handle, prefix, depth) {
    if (out.length >= hardCap) return;
    try {
      // 直接在迭代器上判断，攒够就 break，不再把整层收进数组
      for await (const entry of handle.values()) {
        if (out.length >= hardCap) break;
        if (entry.kind === 'file') {
          if (!/\.md$/i.test(entry.name)) continue;
          const title = entry.name.replace(/\.md$/i, '');
          out.push({ title, path: prefix ? `${prefix}/${entry.name}` : entry.name });
          continue;
        }
        if (entry.kind !== 'directory') continue;
        if (SKIP_DIRS.has(entry.name)) continue;
        if (entry.name.startsWith('.')) continue;
        if (depth >= maxDepth) continue;
        await walk(entry, prefix ? `${prefix}/${entry.name}` : entry.name, depth + 1);
      }
    } catch (err) {
      // 目录读不到（iCloud 没挂载 / 权限失效）就停在这一层，不影响上层
      return;
    }
  }

  if (!rootHandle) return out;
  await walk(rootHandle, '', 1);
  return out.slice(0, limit);
}

/** 按关键字过滤标题（不区分大小写） */
export function filterNotes(notes, keyword) {
  const list = Array.isArray(notes) ? notes : [];
  const kw = String(keyword || '').trim().toLowerCase();
  if (!kw) return list;
  return list.filter((n) => String(n.title || '').toLowerCase().includes(kw));
}
