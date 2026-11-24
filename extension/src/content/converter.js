/**
 * 妙言剪藏 · DOM → Markdown 转换器
 *
 * 目标格式是「妙言 Markdown」：标准 Markdown + 妙言支持的扩展。
 * 图片统一输出成占位符 myimg://<序号>，由面板在下载图片后替换成 /i/<文件名>。
 */
(function () {
  if (window.MiaoYanConverter) return;

  const SKIP_TAGS = new Set([
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'IFRAME', 'OBJECT', 'EMBED', 'CANVAS',
    'FORM', 'BUTTON', 'SELECT', 'TEXTAREA', 'INPUT', 'AUDIO', 'VIDEO', 'SOURCE', 'TRACK',
    'MAP', 'AREA', 'BASE', 'LINK', 'META', 'HEAD', 'TITLE', 'NAV', 'FOOTER', 'ASIDE',
  ]);

  const BLOCK_TAGS = new Set([
    'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DD', 'DETAILS', 'DIV', 'DL', 'DT',
    'FIELDSET', 'FIGCAPTION', 'FIGURE', 'FOOTER', 'FORM', 'H1', 'H2', 'H3', 'H4', 'H5',
    'H6', 'HEADER', 'HGROUP', 'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE', 'SECTION',
    'SUMMARY', 'TABLE', 'TBODY', 'TD', 'TFOOT', 'TH', 'THEAD', 'TR', 'UL',
  ]);

  const HEADING_TAGS = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6']);

  /**
   * 纯文本 → Markdown 行内文本
   *
   * 现有行为：转义 Markdown 语法字符（\ * _ ` [ ]），不转义 Markdown 本身，
   * 这样 `&` 之类字符在 Markdown 解析后仍渲染成原字符。
   *
   * 新增（P2）：补上 HTML 三件套 & < >。
   * 网页正文里出现 `<img src=x onerror=alert(1)>` 这类字面文本时，
   * 原文直接写进 .md，渲染器（MiaoYan 支持原生 HTML）可能把它当 HTML 执行。
   * 转成实体后 Markdown 语义不变（实体在 Markdown 里会解析回原字符），
   * 但裸标签不会再被当成 HTML。
   *
   * 顺序：必须先转 & 再转 < >，否则 &lt; 里的 & 会被二次转义成 &amp;lt;。
   */
  function escapeText(text) {
    return String(text == null ? '' : text)
      .replace(/\r/g, '')
      .replace(/[ \t\f\v]+/g, ' ')
      .replace(/\n\s*/g, ' ')
      .replace(/\\/g, '\\\\')
      .replace(/\*/g, '\\*')
      .replace(/_/g, '\\_')
      .replace(/`/g, '\\`')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function absUrl(href, base) {
    if (!href) return '';
    const raw = String(href).trim();
    if (!raw || raw.startsWith('#')) return '';
    if (/^(javascript|data|vbscript):/i.test(raw)) return '';
    try {
      return new URL(raw, base || document.baseURI).href;
    } catch (err) {
      return '';
    }
  }

  /**
   * 常见视觉隐藏类名：
   *   hidden          —— Tailwind `.hidden { display: none }`
   *   d-none          —— Bootstrap `.d-none { display: none }`
   *   invisible       —— Bootstrap `.invisible { visibility: hidden }`
   *   sr-only         —— Bootstrap 屏幕阅读器专用
   *   visually-hidden —— Bootstrap 5 同上
   *   sr-only-focusable
   * 只匹配完整的 class token，避免误伤 `is-hidden`、`d-none-sm`、`d-md-none`
   * 这类变体（响应式变体只在特定断点下隐藏，不能一概当隐藏）。
   */
  const HIDDEN_CLASS_RE = /(?:^|\s)(?:hidden|d-none|invisible|sr-only|visually-hidden|sr-only-focusable)(?=\s|$)/;

  /** 计算样式缓存：同一个元素在一次转换里只读一次 getComputedStyle */
  let computedStyleCache = new WeakMap();
  /** 「位于未展开的 <details> 内」缓存 */
  let detailsHiddenCache = new WeakMap();
  /** 本次转换的作用域里有没有 <details>；没有的话整个祖先链判断可以直接跳过 */
  let detailsScope = true;

  /**
   * 读元素的 class 字符串。
   * 优先用 className 属性（比 getAttribute 快，剪藏时每个节点都要读）；
   * SVG 元素的 className 是 SVGAnimatedString 对象，退回属性读取。
   */
  function classOf(el) {
    const c = el.className;
    if (typeof c === 'string') return c;
    if (c && typeof c.baseVal === 'string') return c.baseVal;
    return (el.getAttribute && el.getAttribute('class')) || '';
  }

  /**
   * 这个元素有没有可能被外部样式表命中？
   *
   * 取舍（性能）：
   *   getComputedStyle 会强制刷新样式/布局，一次剪藏上万个节点时
   *   对每个节点都调用一次，代价太高（页面 DOM 被改动后浏览器要重算）。
   *   而现实中「用样式表把内容藏起来」的写法，几乎都挂在 class 或 id 上；
   *   只按标签选择器命中的那些（script/nav/aside/form/input 等），
   *   已经由 SKIP_TAGS 直接跳过。所以这里只对「带 class 或 id」的元素
   *   去读计算样式，其余元素保持零布局读取。
   *
   *   cls 由调用方传入，避免同一个元素把 class 读两遍。
   */
  function hasCssHook(el, cls) {
    if (cls && cls.trim()) return true;
    const id = el.id;
    if (typeof id === 'string') return id.length > 0;
    return !!(el.getAttribute && el.getAttribute('id'));
  }

  /** 读计算样式判断是否被 CSS 隐藏；拿不到计算样式时安全返回 false（不抛错） */
  function computedStyleHidden(el) {
    if (typeof window.getComputedStyle !== 'function') return false;
    let cs = computedStyleCache.get(el);
    if (cs === undefined) {
      try {
        cs = window.getComputedStyle(el);
      } catch (err) {
        cs = null; // 元素已脱离文档 / 浏览器拒绝计算 → 按可见处理
      }
      computedStyleCache.set(el, cs);
    }
    if (!cs) return false;
    const display = cs.display;
    const visibility = cs.visibility;
    const opacity = cs.opacity;
    if (display === 'none') return true;
    if (visibility === 'hidden' || visibility === 'collapse') return true;
    if (opacity !== undefined && opacity !== null && opacity !== '' && parseFloat(opacity) === 0) return true;
    return false;
  }

  /** <details> 的图例（legend）是它的第一个 <summary> 子元素 */
  function legendOf(details) {
    const kids = details.children || [];
    for (let i = 0; i < kids.length; i += 1) {
      if (kids[i].tagName === 'SUMMARY') return kids[i];
    }
    return null;
  }

  /**
   * 本次转换的作用域里会不会遇到 <details>？
   *   子树里有 details，或者 root 自己的祖先链里有 details → true。
   *   绝大多数页面一个 <details> 都没有，这时可以整段跳过祖先链判断
   *   （每个节点省掉一次向上遍历），代价只是 root 上的一次原生 querySelector。
   */
  function computeDetailsScope(root) {
    if (!root) return false;
    try {
      if (root.tagName === 'DETAILS') return true;
      if (!root.querySelector) return true; // 判不准就按「有 details」处理，宁可多查一次
      if (root.querySelector('details')) return true;
    } catch (err) {
      return true; // 判不准就按「有 details」处理，宁可多查一次
    }
    let node = root.parentElement;
    while (node) {
      if (node.tagName === 'DETAILS') return true;
      node = node.parentElement;
    }
    return false;
  }

  /**
   * 元素是否位于「未展开的 <details>」内部。
   *
   * 未 open 的 <details> 只显示它的图例（第一个 <summary> 子元素），
   * 其余子内容在页面上不可见，不能剪进笔记。
   *
   * 用 WeakMap 记忆化：沿祖先链往上走时把结论缓存下来，
   * 每个节点最多被走一次，整体仍是 O(n)，且全程不触发布局。
   */
  function hiddenByClosedDetails(el) {
    if (!detailsScope) return false;
    const chain = [];
    let node = el;
    let result = false;
    while (node && node.nodeType === 1) {
      const cached = detailsHiddenCache.get(node);
      if (cached !== undefined) {
        result = cached;
        break;
      }
      chain.push(node);
      const parent = node.parentElement;
      if (!parent) break;
      if (parent.tagName === 'DETAILS' && !(parent.hasAttribute && parent.hasAttribute('open'))) {
        const legend = legendOf(parent);
        // 在图例里（就是 summary 本身或其后代）→ 仍然可见
        if (!(legend && legend.contains(node))) {
          result = true;
          break;
        }
      }
      node = parent;
    }
    for (let i = 0; i < chain.length; i += 1) detailsHiddenCache.set(chain[i], result);
    return result;
  }

  /**
   * 元素是否不可见。
   *
   * 分三层，从便宜到贵：
   *   1) 属性 / 内联样式 / 隐藏类名 —— 不触发布局，最便宜，先判；
   *   2) 未展开的 <details> —— 只走 DOM 结构，不触发布局；
   *   3) 计算样式兜底 —— 只在 1、2 都没结论、且元素带 class/id 时才读
   *      getComputedStyle（见 hasCssHook 里的取舍说明）。
   */
  function isHidden(el) {
    if (!el || el.nodeType !== 1) return false;

    // ---- 第 1 层：属性 + 内联样式 + 隐藏类名 ----
    if (el.hasAttribute && el.hasAttribute('hidden')) return true;
    const style = el.getAttribute ? el.getAttribute('style') || '' : '';
    if (/display\s*:\s*none/i.test(style)) return true;
    if (/visibility\s*:\s*(hidden|collapse)/i.test(style)) return true;
    if (/opacity\s*:\s*0(?:\.0+)?\s*(?:!\s*important\s*)?(?:;|$)/i.test(style)) return true;
    if (el.getAttribute && el.getAttribute('aria-hidden') === 'true') return true;
    const cls = classOf(el);
    if (cls && HIDDEN_CLASS_RE.test(cls)) return true;

    // ---- 第 2 层：未展开的 <details> ----
    if (hiddenByClosedDetails(el)) return true;

    // ---- 第 3 层：计算样式兜底 ----
    if (hasCssHook(el, cls) && computedStyleHidden(el)) return true;

    return false;
  }

  function styleFlags(el) {
    const style = (el.getAttribute && el.getAttribute('style')) || '';
    const bold = /font-weight\s*:\s*(bold|bolder|[6-9]00)/i.test(style);
    const italic = /font-style\s*:\s*italic/i.test(style);
    const underline = /text-decoration[^;]*underline/i.test(style);
    return { bold, italic, underline };
  }

  function imageSource(el) {
    const candidates = [
      el.getAttribute('src'),
      el.getAttribute('data-src'),
      el.getAttribute('data-original'),
      el.getAttribute('data-lazy-src'),
      el.getAttribute('data-actualsrc'),
    ];
    for (const c of candidates) {
      if (c && !/^data:/i.test(c)) return c;
    }
    const srcset = el.getAttribute('srcset') || el.getAttribute('data-srcset');
    if (srcset) {
      const first = srcset.split(',')[0];
      if (first) return first.trim().split(/\s+/)[0];
    }
    return '';
  }

  function inlineCode(text) {
    const t = String(text || '');
    const longest = (t.match(/`+/g) || []).reduce((max, m) => Math.max(max, m.length), 0);
    const fence = '`'.repeat(Math.max(1, longest + 1));
    const pad = t.startsWith('`') || t.endsWith('`') ? ' ' : '';
    return `${fence}${pad}${t}${pad}${fence}`;
  }

  /** 从 class 里识别代码语言（language-xxx / lang-xxx / highlight-source-xxx / hljs xxx） */
  function detectLang(cls) {
    const tokens = String(cls || '').trim().split(/\s+/).filter(Boolean);
    const patterns = [
      /^language-([A-Za-z0-9+#._-]+)$/,
      /^lang-([A-Za-z0-9+#._-]+)$/,
      /^highlight-source-(.+)$/,
      /^highlight-(.+)$/,
      /^brush:\s*(.+)$/,
    ];
    for (const t of tokens) {
      for (const re of patterns) {
        const m = re.exec(t);
        if (m) return m[1].replace(/[._-]+$/, '');
      }
    }
    // class="hljs python"：hljs 后面的 token 就是语言
    const idx = tokens.findIndex((t) => /^hljs$/i.test(t));
    if (idx >= 0 && tokens[idx + 1]) return tokens[idx + 1].replace(/[._-]+$/, '');
    return '';
  }

  /**
   * 代码块：取 <code> 的原始 textContent，不经过 escapeText。
   *
   * 为什么代码块不转义 < > &：
   *   Markdown（CommonMark / GFM，以及 MiaoYan 这类标准 Markdown 渲染器）
   *   在输出代码块时本来就会把 < > & 转成 HTML 实体，代码内容天然是「字面量」，
   *   围栏里的 <script> 只会显示、不会被执行。
   *   如果这里再转一次，渲染出来就是 &lt;div&gt; 这种被二次转义的字面文本，
   *   等于把用户的代码改坏了。所以代码块保持原样，只保证围栏（```）不被内容里的反引号打断。
   */
  function codeBlock(pre, ctx) {
    const codeEl = pre.querySelector('code') || pre;
    const text = String(codeEl.textContent || '').replace(/\n+$/, '');
    const cls = `${codeEl.className || ''} ${pre.className || ''}`;
    const lang = detectLang(cls);
    const longest = (text.match(/`+/g) || []).reduce((max, x) => Math.max(max, x.length), 0);
    const fence = '`'.repeat(Math.max(3, longest + 1));
    return `\n\n${fence}${lang}\n${text}\n${fence}\n\n`;
  }

  function renderList(list, ctx, depth) {
    const ordered = list.tagName === 'OL';
    const startAttr = parseInt(list.getAttribute('start') || '', 10);
    let counter = Number.isFinite(startAttr) ? startAttr : 1;
    const indent = '  '.repeat(depth || 0);
    let out = '';

    const items = Array.prototype.filter.call(list.children, (c) => c.tagName === 'LI');
    items.forEach((li) => {
      const checkbox = li.querySelector(':scope > input[type="checkbox"]');
      let buf = '';
      let nested = '';
      Array.prototype.forEach.call(li.childNodes, (child) => {
        if (child.nodeType === 1 && (child.tagName === 'UL' || child.tagName === 'OL')) {
          nested += renderList(child, ctx, (depth || 0) + 1);
          return;
        }
        if (child.nodeType === 1 && child.tagName === 'P') {
          const t = renderInlineChildren(child, ctx).trim();
          buf += (buf ? ' ' : '') + t;
          return;
        }
        if (child.nodeType === 3) {
          buf += escapeText(child.nodeValue);
          return;
        }
        if (child.nodeType === 1) {
          buf += renderInlineNode(child, ctx);
        }
      });
      const text = buf.trim();
      let marker;
      if (ordered) {
        marker = `${indent}${counter}. `;
        counter += 1;
      } else if (checkbox) {
        marker = `${indent}- [${checkbox.checked ? 'x' : ' '}] `;
      } else {
        marker = `${indent}- `;
      }
      const lines = text.split('\n');
      let item = marker + (lines[0] || '');
      for (let i = 1; i < lines.length; i += 1) item += `\n${indent}  ${lines[i]}`;
      out += `${item}\n`;
      out += nested;
    });
    return `\n${out}\n`;
  }

  function cellText(cell, ctx) {
    const clone = cell.cloneNode(true);
    clone.querySelectorAll('p, div, br').forEach((n) => {
      if (n.tagName === 'BR') n.replaceWith(document.createTextNode(' '));
      else n.replaceWith(document.createTextNode(' '));
    });
    return renderInlineChildren(clone, ctx).trim().replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|');
  }

  function renderTable(table, ctx) {
    const rows = Array.prototype.filter.call(
      table.querySelectorAll('tr'),
      (tr) => tr.closest('table') === table
    );
    if (!rows.length) return '';
    const grid = rows.map((tr) =>
      Array.prototype.map.call(tr.children, (c) => {
        if (c.tagName !== 'TD' && c.tagName !== 'TH') return '';
        return cellText(c, ctx);
      })
    );
    const width = Math.max.apply(null, grid.map((r) => r.length));
    if (!width) return '';
    const pad = (r) => {
      const copy = r.slice();
      while (copy.length < width) copy.push('');
      return copy;
    };
    const lines = [];
    const header = pad(grid[0]);
    lines.push(`| ${header.join(' | ')} |`);
    lines.push(`| ${new Array(width).fill('---').join(' | ')} |`);
    grid.slice(1).forEach((row) => {
      lines.push(`| ${pad(row).join(' | ')} |`);
    });
    return `\n\n${lines.join('\n')}\n\n`;
  }

  // ---------------------------------------------------------------- 数学公式（v0.7.0）
  //
  // 妙言支持 $...$ / $$...$$（KaTeX 语法，含 mhchem 的 \ce{} \pu{}）。
  // 网页上的公式有三种常见形态：
  //   1. <math>…</math>：原生 MathML（Defuddle 标准化后会带上 data-latex）
  //   2. <span class="katex">：KaTeX 渲染出来的（HTML 和 MathML 双份）
  //   3. <script type="math/tex">：老式写法
  // 我们统一还原成 LaTeX 源码，输出 $...$（行内）或 $$...$$（独立成段）。

  /** 这个元素是不是「一个公式」（而不是普通文字） */
  function isMathElement(el) {
    if (!el || el.nodeType !== 1) return false;
    // 注意：HTML 里的 <math> 会被解析成 MathML 命名空间元素，
    // 它的 tagName 是小写的 'math'，所以这里统一转成大写再比。
    const tag = String(el.tagName || '').toUpperCase();
    if (tag === 'MATH') return true;
    if (tag === 'MJX-CONTAINER') return true;
    if (tag === 'SCRIPT') {
      const type = String(el.getAttribute('type') || '').toLowerCase();
      return type.startsWith('math/tex');
    }
    if (tag === 'SPAN') {
      const cls = String(el.getAttribute('class') || '');
      return /(^|\s)katex(\s|$)/.test(cls);
    }
    return false;
  }

  /** 从一个数学节点里取 LaTeX 源码，取不到返回空串 */
  function mathLatex(el) {
    if (!el) return '';
    const tag = String(el.tagName || '').toUpperCase();
    if (tag === 'SCRIPT') {
      return String(el.textContent || '').trim();
    }
    if (tag === 'MJX-CONTAINER') {
      const inner = el.querySelector('math');
      const latex = latexFromMathNode(inner);
      if (latex) return latex;
      // MathJax 偶尔把原始 TeX 放在前一个 script 里
      const prev = el.previousElementSibling;
      if (prev && prev.tagName === 'SCRIPT' && /math\/tex/i.test(prev.getAttribute('type') || '')) {
        return String(prev.textContent || '').trim();
      }
      return '';
    }
    if (tag === 'SPAN' && /(^|\s)katex(\s|$)/.test(el.getAttribute('class') || '')) {
      // KaTeX 会同时输出 MathML 和排版后的 HTML，只取 MathML 那一份
      const inner = el.querySelector('math');
      return latexFromMathNode(inner);
    }
    return latexFromMathNode(el);
  }

  /** <math> 节点里取 LaTeX：data-latex → alttext → annotation */
  function latexFromMathNode(el) {
    if (!el) return '';
    const attr = el.getAttribute('data-latex') || el.getAttribute('alttext');
    if (attr && attr.trim()) return restoreLessGreater(attr.trim());
    const ann = el.querySelector('annotation[encoding="application/x-tex"]');
    if (ann) {
      const text = String(ann.textContent || '').trim();
      if (text) return restoreLessGreater(text);
    }
    return '';
  }

  /**
   * MathJax 的 annotation 里写的是 &lt; / &gt;，浏览器解析 HTML 时已经把它们
   * 变成真正的 < 与 >。直接输出会让妙言把后面的内容当成 HTML 吃掉，
   * 所以还原成 LaTeX 的 \lt / \gt。
   */
  function restoreLessGreater(text) {
    return String(text).replace(/</g, '\\lt ').replace(/>/g, '\\gt ');
  }

  /** 公式是不是「独立成段」（block） */
  function mathIsDisplay(el) {
    if (!el) return false;
    const tag = String(el.tagName || '').toUpperCase();
    if (tag === 'MJX-CONTAINER') {
      return el.getAttribute('display') === 'true' || /(^|\s)display(\s|$)/.test(el.getAttribute('class') || '');
    }
    if (tag === 'MATH') {
      return el.getAttribute('display') === 'block';
    }
    if (tag === 'SCRIPT') {
      return /mode=display/i.test(el.getAttribute('type') || '');
    }
    // KaTeX 的块级结构是 <span class="katex-display"><span class="katex">…</span></span>，
    // 我们命中的是内层 .katex，所以要连父级一起看。
    if (/(^|\s)katex(\s|$)/.test(el.getAttribute('class') || '')) {
      if (/(^|\s)katex-display(\s|$)/.test(el.getAttribute('class') || '')) return true;
      const parent = el.closest && el.closest('.katex-display');
      if (parent) return true;
    }
    return /(^|\s)katex-display(\s|$)/.test(el.getAttribute('class') || '');
  }

  /**
   * 把公式节点转成妙言能渲染的 LaTeX。
   * @returns {string} 例如 `$E = mc^2$` 或 `\n\n$$\nE = mc^2\n$$\n\n`
   */
  function renderMath(el) {
    const raw = mathLatex(el);
    if (!raw) return '';
    let body = raw.trim();
    // 去掉公式自带的定界符，避免和我们的 $ 打架
    body = body.replace(/^\$(?!\$)/, '').replace(/(?<!\\)\$$/, '').trim();
    if (!body) return '';
    // 公式内部还有 $（MathJax 2 的 equation* 环境常见）会让 $…$ 提前闭合，
    // 这类改用 ```math 代码块，妙言里也能当公式看。
    if (body.includes('$') || /\\ce\{|\\pu\{/.test(body)) {
      return `\n\n\`\`\`math\n${body}\n\`\`\`\n\n`;
    }
    if (mathIsDisplay(el)) return `\n\n$$\n${body}\n$$\n\n`;
    return `$${body}$`;
  }

  function renderInlineNode(el, ctx) {
    // 公式先拦下来（MathML 的 tagName 是小写 'math'，switch 里匹配不到）
    if (isMathElement(el)) return renderMath(el);
    const tag = el.tagName;
    switch (tag) {
      case 'MATH':
        return renderMath(el);
      case 'BR':
        return '\n';
      case 'STRONG':
      case 'B': {
        const inner = renderInlineChildren(el, ctx);
        return inner.trim() ? `**${inner}**` : inner;
      }
      case 'EM':
      case 'I':
      case 'CITE':
      case 'VAR': {
        const inner = renderInlineChildren(el, ctx);
        return inner.trim() ? `*${inner}*` : inner;
      }
      case 'DEL':
      case 'S':
      case 'STRIKE': {
        const inner = renderInlineChildren(el, ctx);
        return inner.trim() ? `~~${inner}~~` : inner;
      }
      case 'CODE':
        return inlineCode(el.textContent);
      case 'KBD':
        return `<kbd>${escapeText(el.textContent)}</kbd>`;
      case 'SUB':
        return `<sub>${renderInlineChildren(el, ctx)}</sub>`;
      case 'SUP':
        return `<sup>${renderInlineChildren(el, ctx)}</sup>`;
      case 'A': {
        const href = absUrl(el.getAttribute('href'), ctx.base);
        const inner = renderInlineChildren(el, ctx).trim();
        if (!href) return inner;
        if (!inner) return `<${href}>`;
        return `[${inner}](${href})`;
      }
      case 'IMG': {
        const src = absUrl(imageSource(el), ctx.base);
        if (!src) return '';
        const alt = escapeText(el.getAttribute('alt') || '');
        const idx = ctx.images.length;
        ctx.images.push({ src, alt: el.getAttribute('alt') || '' });
        return `![${alt}](myimg://${idx})`;
      }
      case 'PICTURE':
      case 'SVG':
      case 'CANVAS':
        return '';
      case 'SPAN':
      case 'FONT':
      case 'TIME':
      case 'MARK':
      case 'SMALL':
      case 'U':
      case 'ABBR':
      case 'LABEL':
      case 'Q':
      case 'RUBY':
      case 'RT':
      case 'RB':
      case 'WBR':
      case 'BGSOUND': {
        const inner = renderInlineChildren(el, ctx);
        const flags = styleFlags(el);
        let out = inner;
        if (flags.bold && out.trim()) out = `**${out}**`;
        if (flags.italic && out.trim()) out = `*${out}*`;
        return out;
      }
      default:
        if (HEADING_TAGS.has(tag) || tag === 'P' || tag === 'DIV' || tag === 'LI') {
          return renderBlock(el, ctx);
        }
        return renderInlineChildren(el, ctx);
    }
  }

  function renderInlineChildren(el, ctx) {
    let out = '';
    Array.prototype.forEach.call(el.childNodes, (child) => {
      if (child.nodeType === 3) {
        out += escapeText(child.nodeValue);
        return;
      }
      if (child.nodeType !== 1) return;
      if (isMathElement(child)) {
        out += renderMath(child);
        return;
      }
      if (SKIP_TAGS.has(child.tagName)) return;
      if (isHidden(child)) return;
      out += renderInlineNode(child, ctx);
    });
    return out;
  }

  function renderBlock(el, ctx) {
    const tag = el.tagName;
    switch (tag) {
      case 'H1':
      case 'H2':
      case 'H3':
      case 'H4':
      case 'H5':
      case 'H6': {
        const level = parseInt(tag.slice(1), 10);
        const text = renderInlineChildren(el, ctx).trim();
        return text ? `\n\n${'#'.repeat(level)} ${text}\n\n` : '';
      }
      case 'P': {
        const text = renderInlineChildren(el, ctx).trim();
        return text ? `\n\n${text}\n\n` : '';
      }
      case 'BLOCKQUOTE': {
        const inner = renderBlocks(el, ctx).trim();
        if (!inner) return '';
        const quoted = inner
          .split('\n')
          .map((line) => (line.trim() ? `> ${line}` : '>'))
          .join('\n');
        return `\n\n${quoted}\n\n`;
      }
      case 'PRE':
        return codeBlock(el, ctx);
      case 'UL':
      case 'OL':
        return renderList(el, ctx, 0);
      case 'TABLE':
        return renderTable(el, ctx);
      case 'HR':
        return '\n\n---\n\n';
      case 'FIGCAPTION': {
        const text = renderInlineChildren(el, ctx).trim();
        return text ? `\n\n*${text}*\n\n` : '';
      }
      case 'DT': {
        const text = renderInlineChildren(el, ctx).trim();
        return text ? `\n\n**${text}**\n\n` : '';
      }
      case 'DD':
        return renderBlocks(el, ctx);
      case 'SUMMARY': {
        const text = renderInlineChildren(el, ctx).trim();
        return text ? `\n\n**${text}**\n\n` : '';
      }
      default:
        return renderBlocks(el, ctx);
    }
  }

  function renderBlocks(el, ctx) {
    let out = '';
    let buf = '';
    const flush = () => {
      const text = buf.trim();
      buf = '';
      if (text) out += `\n\n${text}\n\n`;
    };
    Array.prototype.forEach.call(el.childNodes, (child) => {
      if (child.nodeType === 3) {
        buf += escapeText(child.nodeValue);
        return;
      }
      if (child.nodeType !== 1) return;
      if (isMathElement(child)) {
        const md = renderMath(child);
        if (!md) return;
        // 独立成段的公式要另起一段；行内公式接着当前段落写
        if (md.charAt(0) === '\n') {
          flush();
          out += md;
        } else {
          buf += md;
        }
        return;
      }
      if (SKIP_TAGS.has(child.tagName)) return;
      if (isHidden(child)) return;
      if (BLOCK_TAGS.has(child.tagName)) {
        flush();
        out += renderBlock(child, ctx);
        return;
      }
      buf += renderInlineNode(child, ctx);
    });
    flush();
    return out;
  }

  function cleanup(md) {
    return String(md || '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^\s+|\s+$/g, '');
  }

  /**
   * 把一个 DOM 节点转成 Markdown
   * @param {Node} root 节点（元素或 DocumentFragment）
   * @param {object} opts {base}
   * @returns {{markdown: string, images: Array<{src:string, alt:string}>}}
   */
  function convert(root, opts) {
    // 页面内容可能在两次剪藏之间发生变化（details 被展开、样式被改写），
    // 所以每次转换都重置可见性缓存，避免拿到过期的计算样式 / details 状态。
    computedStyleCache = new WeakMap();
    detailsHiddenCache = new WeakMap();
    detailsScope = computeDetailsScope(root);
    const ctx = { images: [], base: (opts && opts.base) || document.baseURI };
    const md = cleanup(renderBlocks(root, ctx));
    return { markdown: md, images: ctx.images };
  }

  /** 把一段 DOM Range 转成 Markdown */
  function convertRange(range, opts) {
    const fragment = range.cloneContents();
    return convert(fragment, opts);
  }

  window.MiaoYanConverter = {
    convert,
    convertRange,
    escapeText,
    absUrl,
    // v0.7.0：数学公式
    isMathElement,
    mathLatex,
    renderMath,
  };
})();
