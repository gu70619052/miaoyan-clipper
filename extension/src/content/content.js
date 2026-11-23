/**
 * 妙言剪藏 · 页面浮层
 *
 * 职责：
 *  - 框选剪藏：拖拽出选区 → 定位对应 DOM → 转 Markdown
 *  - 选中文字：取 Range → 转 Markdown
 *  - 整篇正文：正文识别 → 转 Markdown
 *  - 截图剪藏：拿当前可视区域截图 → 拖拽裁剪 → PNG
 *  - 快速保存：卡片里选目录 → 交给后台写入妙言库
 */
(function () {
  if (window.__miaoyanClipLoaded) return;
  window.__miaoyanClipLoaded = true;

  // 宿主 id 每次注入随机生成：页面无法预先造一个同 id 的元素来「接管」我们的浮层，
  // 也无法靠固定 id 找到它（审计 P1-5 / H-1）。
  const HOST_ID = `miaoyan-clip-host-${Math.random().toString(36).slice(2, 10)}`;
  const HOST_Z = '2147483647';
  const FRAME_HOST_ID = `miaoyan-frame-host-${Math.random().toString(36).slice(2, 10)}`;
  const FRAME_Z = '2147483646';

  const state = {
    mode: null,          // select | selection | article | screenshot
    host: null,
    shadow: null,
    frameHost: null,
    frameShadow: null,
    layers: {},
    draft: null,
    folders: [],
    dragging: false,
    startX: 0,
    startY: 0,
    screenshot: null,
    frame: null,        // { element, box:{x,y,w,h}(文档坐标), adjusted:bool }
    frameDrag: null,
    toastAction: null,  // toast 上「继续剪藏」按钮要执行的动作
    toastTimer: null,
  };

  // 配色取自妙言 App：米色底 + 青绿强调色
  const CSS = `
:host { all: initial; }
* { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif; }
.layer { position: fixed; inset: 0; display: none; pointer-events: auto; background: transparent; cursor: crosshair; }
.layer.active { background: rgba(30, 29, 27, 0.10); }
.rect { position: fixed; border: 1.5px solid #4dbf9e; background: rgba(77,191,158,0.12); border-radius: 3px; pointer-events: none; display: none; }
.rect .size { position: absolute; left: 0; top: -22px; background: #3aa88a; color: #fff; font-size: 11px; line-height: 1; padding: 4px 6px; border-radius: 4px; white-space: nowrap; }
.hint { position: fixed; left: 50%; top: 24px; transform: translateX(-50%); background: rgba(30,29,27,0.93); color: #e9e6e0; font-size: 13px; padding: 9px 16px; border-radius: 999px; box-shadow: 0 8px 28px rgba(0,0,0,0.3); display: flex; gap: 14px; align-items: center; pointer-events: auto; backdrop-filter: blur(8px); }
.hint kbd { background: rgba(255,255,255,0.12); border-radius: 4px; padding: 1px 5px; font-family: inherit; font-size: 11px; }
.hint button { all: unset; cursor: pointer; color: #8fd6bf; font-size: 12.5px; }
.hint button:hover { color: #c8f0e2; text-decoration: underline; }
.card { position: fixed; right: 20px; top: 20px; width: 330px; max-width: calc(100vw - 40px); background: #fffdf8; color: #23211d; border-radius: 14px; box-shadow: 0 18px 48px rgba(60,50,35,0.22), 0 2px 6px rgba(60,50,35,0.10); padding: 16px; display: none; pointer-events: auto; border: 1px solid #e6dfd1; }
.card.show { display: block; }
.card h3 { margin: 0 0 12px; font-size: 14px; font-weight: 650; display: flex; align-items: center; gap: 8px; }
.card h3 .dot { width: 8px; height: 8px; border-radius: 50%; background: #2e9e82; }
.card h3 .x { margin-left: auto; cursor: pointer; color: #a49d91; font-size: 16px; line-height: 1; }
.card h3 .x:hover { color: #4a453d; }
.field { margin-bottom: 10px; }
.field label { display: block; font-size: 11.5px; color: #7b756b; margin-bottom: 4px; letter-spacing: .02em; }
.field input[type="text"], .field select { width: 100%; border: 1px solid #e6dfd1; background: #f5f1e9; border-radius: 9px; padding: 8px 10px; font-size: 13px; color: #23211d; outline: none; }
.field input[type="text"]:focus, .field select:focus { border-color: #2e9e82; box-shadow: 0 0 0 3px rgba(46,158,130,0.14); }
.meta { font-size: 11.5px; color: #918a7e; margin: -2px 0 12px; line-height: 1.6; word-break: break-all; }
.folder-note { font-size: 11.5px; line-height: 1.55; color: #b8442a; margin: -4px 0 10px; }
.folder-note:empty { display: none; }
.actions { display: flex; gap: 8px; margin-top: 12px; }
.btn { all: unset; flex: 1; text-align: center; cursor: pointer; border-radius: 9px; padding: 9px 10px; font-size: 13px; font-weight: 550; transition: background .15s, opacity .15s; }
.btn.primary { background: #2e9e82; color: #fff; }
.btn.primary:hover { background: #26876f; }
.btn.ghost { background: #efe9dd; color: #4a453d; }
.btn.ghost:hover { background: #e6dfd1; }
.btn[disabled] { opacity: .55; cursor: default; }
.status { margin-top: 10px; font-size: 12px; line-height: 1.6; display: none; padding: 8px 10px; border-radius: 8px; }
.status.ok { display: block; background: #e6f4ec; color: #1d7a52; }
.status.err { display: block; background: #fbe9e4; color: #b8442a; }
.status.info { display: block; background: #e7f2ef; color: #1f6f5c; }
.shot { position: fixed; inset: 0; pointer-events: auto; overflow: hidden; }
.shot img { position: absolute; left: 0; top: 0; width: 100%; height: 100%; object-fit: cover; }
@media (prefers-color-scheme: dark) {
  .card { background: #242320; color: #e9e6e0; border-color: #302f2d; box-shadow: 0 18px 48px rgba(0,0,0,0.5); }
  .field input[type="text"], .field select { background: #1e1d1b; border-color: #302f2d; color: #e9e6e0; }
  .field input[type="text"]:focus, .field select:focus { border-color: #4dbf9e; box-shadow: 0 0 0 3px rgba(77,191,158,0.16); }
  .btn.primary { background: #4dbf9e; color: #14352c; }
  .btn.primary:hover { background: #62d3b1; }
  .btn.ghost { background: #2f2e2a; color: #d3cec5; }
  .btn.ghost:hover { background: #3a3833; }
  .meta { color: #98938a; }
  .folder-note { color: #ff9c86; }
  .status.ok { background: #1e3229; color: #7bd3ab; }
  .status.err { background: #3a2320; color: #ff9c86; }
  .status.info { background: #1f2f2b; color: #8fd6bf; }
}
`;


  // 全文剪藏的范围框（独立的 shadow host，用文档坐标，页面滚动时跟着内容走）
  const FRAME_CSS = `
:host { all: initial; }
* { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif; }
.box { position: absolute; border: 2px solid #2e9e82; background: rgba(46,158,130,0.10); border-radius: 4px; pointer-events: none; box-shadow: 0 0 0 9999px rgba(30,29,27,0.16); }
.box.dragging { border-style: dashed; }
.tag { position: absolute; left: -2px; top: -28px; max-width: 60vw; overflow: hidden; text-overflow: ellipsis; background: #2e9e82; color: #fff; font-size: 11.5px; line-height: 1; padding: 7px 9px; border-radius: 6px 6px 6px 0; white-space: nowrap; pointer-events: auto; cursor: grab; user-select: none; }
.tag:active { cursor: grabbing; }
.h { position: absolute; width: 13px; height: 13px; margin: -6.5px 0 0 -6.5px; background: #fffdf8; border: 2px solid #2e9e82; border-radius: 3px; pointer-events: auto; box-shadow: 0 1px 3px rgba(0,0,0,0.18); }
.h.nw { left: 0; top: 0; cursor: nwse-resize; }
.h.n { left: 50%; top: 0; cursor: ns-resize; }
.h.ne { left: 100%; top: 0; cursor: nesw-resize; }
.h.e { left: 100%; top: 50%; cursor: ew-resize; }
.h.se { left: 100%; top: 100%; cursor: nwse-resize; }
.h.s { left: 50%; top: 100%; cursor: ns-resize; }
.h.sw { left: 0; top: 100%; cursor: nesw-resize; }
.h.w { left: 0; top: 50%; cursor: ew-resize; }
.bar { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); display: flex; gap: 10px; align-items: center; background: rgba(30,29,27,0.94); color: #e9e6e0; padding: 9px 10px 9px 16px; border-radius: 999px; box-shadow: 0 12px 34px rgba(0,0,0,0.34); pointer-events: auto; font-size: 13px; backdrop-filter: blur(8px); max-width: calc(100vw - 32px); }
.bar .info { font-size: 12.5px; color: #cfe9df; max-width: 40vw; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bar .tip { font-size: 11.5px; color: #98938a; white-space: nowrap; }
.bar button { all: unset; cursor: pointer; font-size: 12.5px; font-weight: 550; padding: 7px 13px; border-radius: 999px; white-space: nowrap; transition: background .15s; }
.bar button.ok { background: #4dbf9e; color: #14352c; }
.bar button.ok:hover { background: #62d3b1; }
.bar button.again, .bar button.cancel { background: rgba(255,255,255,0.10); color: #d3cec5; }
.bar button.again:hover, .bar button.cancel:hover { background: rgba(255,255,255,0.18); }
.toast { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%) translateY(10px); display: none; align-items: center; gap: 12px; background: rgba(30,29,27,0.96); color: #e9e6e0; padding: 9px 10px 9px 16px; border-radius: 999px; box-shadow: 0 12px 34px rgba(0,0,0,0.34); pointer-events: auto; font-size: 13px; max-width: calc(100vw - 32px); opacity: 0; transition: opacity .18s ease, transform .18s ease; }
.toast.show { display: flex; opacity: 1; transform: translateX(-50%) translateY(0); }
.toast .msg { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.toast button { all: unset; cursor: pointer; font-size: 12.5px; font-weight: 550; padding: 7px 13px; border-radius: 999px; background: #4dbf9e; color: #14352c; white-space: nowrap; }
.toast button:hover { background: #62d3b1; }
@media (prefers-color-scheme: dark) {
  .h { background: #242320; }
  .box { background: rgba(77,191,158,0.12); box-shadow: 0 0 0 9999px rgba(0,0,0,0.34); }
}
`;

  function ensureHost() {
    // 已经建好且还挂在文档里 → 直接复用
    if (state.host && state.host.isConnected && state.shadow && state.shadow.querySelector('.card')) {
      return state;
    }
    // 只使用「我们自己创建的」宿主：绝不 adopt 页面上同 id / 同标记的元素
    // （否则页面可以预先埋一个同名元素把我们骗过去，审计 P1-5）。
    if (state.host && state.host.parentNode) state.host.parentNode.removeChild(state.host);
    const host = document.createElement('div');
    host.id = HOST_ID;
    host.setAttribute('data-miaoyan-clip', 'card');
    host.style.position = 'fixed';
    host.style.inset = '0';
    host.style.zIndex = HOST_Z;
    host.style.pointerEvents = 'none';
    // closed shadow：页面拿不到 host.shadowRoot，读不到卡片里的目录树与标题，
    // 也改不了落盘文件名与目标目录（审计 P1-5）。
    const shadow = host.attachShadow({ mode: 'closed' });
    shadow.innerHTML = `<style>${CSS}</style>
      <div class="layer"></div>
      <div class="rect"><span class="size"></span></div>
      <div class="hint"></div>
      <div class="card">
        <h3><span class="dot"></span><span class="ttl">剪藏</span><span class="x">✕</span></h3>
        <div class="meta"></div>
        <div class="field"><label>标题</label><input type="text" class="title" /></div>
        <div class="field"><label>目标目录</label><select class="folder"></select><div class="folder-note"></div></div>
        <div class="field"><label>标签（逗号分隔）</label><input type="text" class="tags" placeholder="如：技术, 灵感" /></div>
        <div class="actions">
          <button class="btn ghost more">在面板中编辑</button>
          <button class="btn primary save">保存到妙言</button>
        </div>
        <div class="status"></div>
      </div>
      <div class="toast"><span class="msg"></span><button class="again" hidden>继续剪藏</button></div>`;
    if (!host.isConnected) document.documentElement.appendChild(host);
    state.host = host;
    state.shadow = shadow;
    state.layers = {
      layer: shadow.querySelector('.layer'),
      rect: shadow.querySelector('.rect'),
      size: shadow.querySelector('.size'),
      hint: shadow.querySelector('.hint'),
      card: shadow.querySelector('.card'),
      meta: shadow.querySelector('.meta'),
      title: shadow.querySelector('.title'),
      folder: shadow.querySelector('.folder'),
      folderNote: shadow.querySelector('.folder-note'),
      tags: shadow.querySelector('.tags'),
      save: shadow.querySelector('.save'),
      more: shadow.querySelector('.more'),
      status: shadow.querySelector('.status'),
      close: shadow.querySelector('.x'),
      toast: shadow.querySelector('.toast'),
      toastMsg: shadow.querySelector('.toast .msg'),
      toastBtn: shadow.querySelector('.toast .again'),
    };
    bindHostEvents();
    return state;
  }

  function bindHostEvents() {
    const { layer, rect, size, save, more, close } = state.layers;
    layer.addEventListener('mousedown', onMouseDown);
    layer.addEventListener('mousemove', onMouseMove);
    layer.addEventListener('mouseup', onMouseUp);
    save.addEventListener('click', onSave);
    more.addEventListener('click', onMore);
    close.addEventListener('click', hideAll);
    state.layers.toastBtn.addEventListener('click', () => {
      const fn = state.toastAction;
      hideToast();
      if (typeof fn === 'function') fn();
    });
  }

  function showHint(text) {
    ensureHost();
    state.layers.hint.innerHTML = `${text}`;
    state.layers.hint.style.display = 'flex';
  }

  function hideHint() {
    if (state.shadow) state.layers.hint.style.display = 'none';
  }

  function hideAll() {
    hideHint();
    closeFrame();
    if (!state.shadow) return;
    state.layers.layer.style.display = 'none';
    state.layers.rect.style.display = 'none';
    state.layers.card.classList.remove('show');
    state.layers.layer.classList.remove('active');
    state.mode = null;
    // 复位拖动态：上一次拖到一半被关掉时，dragging 会一直停在 true，
    // 导致下一次框选的 mouseup 收不到、矩形留在屏幕上（审计 B-1 的同类问题）
    state.dragging = false;
  }

  function setStatus(text, kind) {
    const el = state.layers.status;
    el.textContent = text;
    // 没有文字时不显示状态条（.status 默认 display:none）
    el.className = text ? `status ${kind || 'info'}` : 'status';
  }

  /**
   * 保存成功后的浮层提示条。
   * 卡片已经自动关掉，这里只留一条会自己消失的提示，
   * 并且可以一键「继续剪藏」（同一个页面还能再剪一篇）。
   */
  function showToast(text, opts = {}) {
    ensureHost();
    const L = state.layers;
    if (!L.toast) return;
    L.toastMsg.textContent = text || '';
    state.toastAction = typeof opts.action === 'function' ? opts.action : null;
    L.toastBtn.hidden = !state.toastAction;
    if (state.toastAction) L.toastBtn.textContent = opts.actionLabel || '继续剪藏';
    L.toast.classList.add('show');
    if (state.toastTimer) clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => hideToast(), opts.duration || 6000);
  }

  function hideToast() {
    if (state.toastTimer) {
      clearTimeout(state.toastTimer);
      state.toastTimer = null;
    }
    state.toastAction = null;
    if (state.shadow && state.layers.toast) state.layers.toast.classList.remove('show');
  }

  // ---------------------------------------------------------------- 框选

  function onMouseDown(ev) {
    if (state.mode !== 'select') return;
    ev.preventDefault();
    state.dragging = true;
    state.startX = ev.clientX;
    state.startY = ev.clientY;
    const rect = state.layers.rect;
    rect.style.display = 'block';
    rect.style.left = `${ev.clientX}px`;
    rect.style.top = `${ev.clientY}px`;
    rect.style.width = '0px';
    rect.style.height = '0px';
  }

  function onMouseMove(ev) {
    if (!state.dragging) return;
    const x = Math.min(ev.clientX, state.startX);
    const y = Math.min(ev.clientY, state.startY);
    const w = Math.abs(ev.clientX - state.startX);
    const h = Math.abs(ev.clientY - state.startY);
    const rect = state.layers.rect;
    rect.style.left = `${x}px`;
    rect.style.top = `${y}px`;
    rect.style.width = `${w}px`;
    rect.style.height = `${h}px`;
    state.layers.size.textContent = `${Math.round(w)} × ${Math.round(h)}`;
  }

  function onMouseUp(ev) {
    if (!state.dragging) return;
    state.dragging = false;
    const box = {
      left: Math.min(ev.clientX, state.startX),
      top: Math.min(ev.clientY, state.startY),
      right: Math.max(ev.clientX, state.startX),
      bottom: Math.max(ev.clientY, state.startY),
    };
    if (box.right - box.left < 6 || box.bottom - box.top < 6) {
      state.layers.rect.style.display = 'none';
      return;
    }
    const el = findElementForRect(box);
    state.layers.rect.style.display = 'none';
    if (!el) {
      showHint('这个区域没识别到正文，试试拖大一点');
      return;
    }
    const { markdown, images } = window.MiaoYanConverter.convert(el, { base: document.baseURI });
    if (!markdown.trim()) {
      showHint('这块区域没有可剪藏的文字内容');
      return;
    }
    buildDraft({
      kind: 'text',
      markdown,
      images,
      title: headingBefore(el) || window.MiaoYanExtractor.pageMeta().title,
    });
  }

  /** 找到「装得下选区」的最深的块级元素 */
  function findElementForRect(box, tolerance = 2) {
    const candidates = [];
    const all = document.querySelectorAll('body *');
    Array.prototype.forEach.call(all, (el) => {
      if (el.closest('#miaoyan-clip-host, #miaoyan-frame-host')) return;
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) return;
      if (r.left > box.right || r.right < box.left || r.top > box.bottom || r.bottom < box.top) return;
      const contains =
        r.left <= box.left + tolerance &&
        r.top <= box.top + tolerance &&
        r.right >= box.right - tolerance &&
        r.bottom >= box.bottom - tolerance;
      if (contains) candidates.push({ el, r });
    });
    if (!candidates.length) {
      // 退化：用四个角点找共同祖先
      const points = [
        [box.left + 2, box.top + 2],
        [box.right - 2, box.top + 2],
        [box.left + 2, box.bottom - 2],
        [box.right - 2, box.bottom - 2],
      ];
      let ancestor = null;
      points.forEach(([x, y]) => {
        const node = document.caretRangeFromPoint ? document.caretRangeFromPoint(x, y) : null;
        if (!node) return;
        ancestor = ancestor ? ancestor.commonAncestorContainer : node.commonAncestorContainer;
      });
      return ancestor && ancestor.nodeType === 1 ? ancestor : document.body;
    }
    // 优先取更深的、且不是超大容器的
    candidates.sort((a, b) => {
      const depth = (el) => {
        let d = 0;
        let n = el;
        while (n && n !== document.body) {
          d += 1;
          n = n.parentElement;
        }
        return d;
      };
      const da = depth(a.el);
      const db = depth(b.el);
      if (da !== db) return db - da;
      return a.r.width * a.r.height - b.r.width * b.r.height;
    });
    const picked = candidates[0].el;
    const text = (picked.textContent || '').length;
    if (text > 40000) {
      const smaller = candidates.find((c) => (c.el.textContent || '').length <= 40000);
      if (smaller) return smaller.el;
    }
    return picked;
  }

  /** 选区上方最近的标题 */
  function headingBefore(el) {
    let node = el;
    while (node && node !== document.body) {
      let prev = node.previousElementSibling;
      while (prev) {
        const h = prev.matches('h1,h2,h3') ? prev : prev.querySelector('h1,h2,h3');
        if (h) {
          const t = (h.textContent || '').trim();
          if (t) return t;
        }
        prev = prev.previousElementSibling;
      }
      node = node.parentElement;
    }
    return '';
  }

  // ---------------------------------------------------------------- 全文范围框

  function findFrameTarget() {
    const frame = state.frame;
    if (!frame) return null;
    if (!frame.adjusted) return frame.element;
    const sx = window.scrollX;
    const sy = window.scrollY;
    const box = {
      left: frame.box.x - sx,
      top: frame.box.y - sy,
      right: frame.box.x - sx + frame.box.w,
      bottom: frame.box.y - sy + frame.box.h,
    };
    return findElementForRect(box, 28);
  }

  const BLOCK_SEL =
    'p, h1, h2, h3, h4, h5, h6, pre, blockquote, table, figure, ul, ol, dl, hr, img, video, audio, iframe, picture';

  function intersectArea(r, box) {
    const w = Math.min(r.right, box.right) - Math.max(r.left, box.left);
    const h = Math.min(r.bottom, box.bottom) - Math.max(r.top, box.top);
    if (w <= 0 || h <= 0) return 0;
    return w * h;
  }

  /** 框内有哪些块级内容（按框与元素的交集算，不是按包含算） */
  function collectBlocksInBox(box) {
    const picked = [];
    Array.prototype.forEach.call(document.querySelectorAll(BLOCK_SEL), (el) => {
      if (el.closest('#miaoyan-clip-host, #miaoyan-frame-host')) return;
      const r = el.getBoundingClientRect();
      if (r.width < 4 && r.height < 4) return;
      const area = Math.max(1, r.width * r.height);
      const inter = intersectArea(r, box);
      if (!inter) return;
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const centerIn = cx >= box.left && cx <= box.right && cy >= box.top && cy <= box.bottom;
      // 命中一半以上，或者中心点在框里，都算「在框内」
      if (inter / area < 0.5 && !centerIn) return;
      picked.push(el);
    });
    // 只留最外层：ul 里被选中的 li、figure 里的 img 都并进祖先
    return picked.filter((el) => !picked.some((p) => p !== el && p.contains(el)));
  }

  function blocksToFragment(blocks, fallback) {
    if (!blocks.length) return fallback;
    const wrap = document.createElement('div');
    blocks.forEach((b) => wrap.appendChild(b.cloneNode(true)));
    return wrap;
  }

  function frameBoxInViewport() {
    const frame = state.frame;
    if (!frame) return null;
    const sx = window.scrollX;
    const sy = window.scrollY;
    return {
      left: frame.box.x - sx,
      top: frame.box.y - sy,
      right: frame.box.x - sx + frame.box.w,
      bottom: frame.box.y - sy + frame.box.h,
    };
  }

  function describeEl(el) {
    if (!el) return '';
    const tag = String(el.tagName || '').toLowerCase();
    const cls = String(el.className || '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .join('.');
    return tag + (cls ? `.${cls}` : '');
  }

  function frameInfoText() {
    const notice = state.iframeNotice || '';
    const frame = state.frame;
    if (!frame) return '正文范围';
    let len = 0;
    let desc = '';
    if (frame.adjusted) {
      // 手工调整过：按框内实际内容算，文案才跟结果对得上
      const blocks = collectBlocksInBox(frameBoxInViewport());
      blocks.forEach((b) => {
        len += (b.textContent || '').replace(/\s+/g, '').length;
      });
      desc = blocks.length ? `${blocks.length} 个内容块` : '空范围';
    } else {
      const el = frame.element;
      len = (el.textContent || '').replace(/\s+/g, '').length;
      desc = describeEl(el);
    }
    const warn = len > 20000 ? '（范围偏大）' : '';
    return `${notice}将剪藏 ${desc} · 约 ${len} 字${warn}`;
  }

  function ensureFrameHost() {
    if (state.frameHost && state.frameHost.isConnected && state.frameShadow) {
      const existing = state.frameShadow.querySelector('.box');
      if (existing) {
        // 宿主还在，直接复用里面的节点
        return {
          box: existing,
          tag: state.frameShadow.querySelector('.tag'),
          bar: state.frameShadow.querySelector('.bar'),
          info: state.frameShadow.querySelector('.info'),
          ok: state.frameShadow.querySelector('.ok'),
          again: state.frameShadow.querySelector('.again'),
          cancel: state.frameShadow.querySelector('.cancel'),
        };
      }
    }
    if (state.frameHost && state.frameHost.parentNode) state.frameHost.parentNode.removeChild(state.frameHost);
    const host = document.createElement('div');
    host.id = FRAME_HOST_ID;
    host.setAttribute('data-miaoyan-clip', 'frame');
    host.style.position = 'absolute';
    host.style.left = '0';
    host.style.top = '0';
    host.style.width = '0';
    host.style.height = '0';
    host.style.zIndex = FRAME_Z;
    host.style.pointerEvents = 'none';
    document.documentElement.appendChild(host);
    // closed shadow：页面看不到范围框的内部结构，也点不到确认按钮（审计 P1-5）
    const shadow = host.attachShadow({ mode: 'closed' });
    state.frameHost = host;
    state.frameShadow = shadow;
    shadow.innerHTML = `<style>${FRAME_CSS}</style>
      <div class="box">
        <div class="tag" title="拖动这块标签可以整体移动范围"></div>
        <span class="h nw" data-dir="nw"></span>
        <span class="h n" data-dir="n"></span>
        <span class="h ne" data-dir="ne"></span>
        <span class="h e" data-dir="e"></span>
        <span class="h se" data-dir="se"></span>
        <span class="h s" data-dir="s"></span>
        <span class="h sw" data-dir="sw"></span>
        <span class="h w" data-dir="w"></span>
      </div>
      <div class="bar">
        <span class="info"></span>
        <span class="tip">拖角调整范围</span>
        <button class="ok">✓ 剪藏这块</button>
        <button class="again">重新识别</button>
        <button class="cancel">取消</button>
      </div>`;
    const L = {
      box: shadow.querySelector('.box'),
      tag: shadow.querySelector('.tag'),
      bar: shadow.querySelector('.bar'),
      info: shadow.querySelector('.info'),
      ok: shadow.querySelector('.ok'),
      again: shadow.querySelector('.again'),
      cancel: shadow.querySelector('.cancel'),
    };
    bindFrameEvents(L);
    return L;
  }

  function bindFrameEvents(L) {
    L.tag.addEventListener('mousedown', (ev) => startFrameDrag(ev, 'move'));
    Array.prototype.forEach.call(L.box.querySelectorAll('.h'), (h) => {
      h.addEventListener('mousedown', (ev) => startFrameDrag(ev, h.getAttribute('data-dir')));
    });
    L.ok.addEventListener('click', confirmFrame);
    L.again.addEventListener('click', () => {
      closeFrame();
      startArticleAdjust();
    });
    L.cancel.addEventListener('click', () => {
      closeFrame();
      hideAll();
    });
  }

  function renderFrame(withInfo = true) {
    if (!state.frame) return;
    const L = state.layers && state.layers.frame;
    if (!L) return;
    const { box } = state.frame;
    L.box.style.left = `${box.x}px`;
    L.box.style.top = `${box.y}px`;
    L.box.style.width = `${box.w}px`;
    L.box.style.height = `${box.h}px`;
    if (withInfo) {
      const text = frameInfoText();
      L.tag.textContent = text;
      L.info.textContent = text;
    }
  }

  function startFrameDrag(ev, dir) {
    if (!state.frame || !dir) return;
    ev.preventDefault();
    ev.stopPropagation();
    state.frameDrag = {
      dir,
      startX: ev.clientX,
      startY: ev.clientY,
      box: { ...state.frame.box },
    };
    if (state.layers.frame) state.layers.frame.box.classList.add('dragging');
    document.addEventListener('mousemove', onFrameDragMove, true);
    document.addEventListener('mouseup', onFrameDragEnd, true);
  }

  const FRAME_MIN_W = 80;
  const FRAME_MIN_H = 60;

  function onFrameDragMove(ev) {
    const drag = state.frameDrag;
    if (!drag || !state.frame) return;
    ev.preventDefault();
    const dx = ev.clientX - drag.startX;
    const dy = ev.clientY - drag.startY;
    const base = drag.box;
    let { x, y, w, h } = base;
    if (drag.dir === 'move') {
      x = base.x + dx;
      y = base.y + dy;
    } else {
      if (drag.dir.includes('w')) {
        w = Math.max(FRAME_MIN_W, base.w - dx);
        x = base.x + base.w - w;
      }
      if (drag.dir.includes('e')) w = Math.max(FRAME_MIN_W, base.w + dx);
      if (drag.dir.includes('n')) {
        h = Math.max(FRAME_MIN_H, base.h - dy);
        y = base.y + base.h - h;
      }
      if (drag.dir.includes('s')) h = Math.max(FRAME_MIN_H, base.h + dy);
    }
    state.frame.box = { x, y, w, h };
    state.frame.adjusted = true;
    renderFrame(false);
  }

  function onFrameDragEnd() {
    document.removeEventListener('mousemove', onFrameDragMove, true);
    document.removeEventListener('mouseup', onFrameDragEnd, true);
    state.frameDrag = null;
    if (state.layers.frame) state.layers.frame.box.classList.remove('dragging');
    if (state.frame) renderFrame();
  }

  function onFrameScroll() {
    const frame = state.frame;
    if (!frame || frame.adjusted || state.frameDrag) return;
    const r = frame.element.getBoundingClientRect();
    frame.box = { x: r.left + window.scrollX, y: r.top + window.scrollY, w: r.width, h: r.height };
    renderFrame(false);
  }

  function onFrameKey(ev) {
    if (!state.frame) return;
    if (ev.key === 'Enter') {
      ev.preventDefault();
      confirmFrame();
    } else if (ev.key === 'Escape') {
      ev.preventDefault();
      closeFrame();
      hideAll();
    }
  }

  function closeFrame() {
    document.removeEventListener('mousemove', onFrameDragMove, true);
    document.removeEventListener('mouseup', onFrameDragEnd, true);
    window.removeEventListener('scroll', onFrameScroll);
    window.removeEventListener('resize', onFrameScroll);
    window.removeEventListener('keydown', onFrameKey, true);
    const host = state.frameHost;
    if (host && host.parentNode) host.parentNode.removeChild(host);
    state.frameHost = null;
    state.frameShadow = null;
    state.frame = null;
    state.frameDrag = null;
    if (state.layers) state.layers.frame = null;
  }

  /**
   * 检测页面里有没有「正文其实在 iframe 里」的情况。
   * 内容脚本只在顶层文档注入（all_frames:false），iframe 里的正文拿不到，
   * 与其静默剪出一篇空的，不如明确告诉用户（审计 P1-7）。
   */
  function findTextIframes() {
    const hits = [];
    const frames = document.querySelectorAll('iframe, frame');
    for (const f of frames) {
      let doc = null;
      try {
        doc = f.contentDocument;
      } catch (err) {
        continue; // 跨域 iframe，读不到
      }
      if (!doc || !doc.body) continue;
      const len = (doc.body.textContent || '').replace(/\s+/g, '').length;
      if (len > 200) hits.push({ src: f.src || '', len });
    }
    return hits;
  }

  /** 全文剪藏：先识别，再把范围框摆到页面上让用户确认/微调 */
  function startArticleAdjust() {
    const el = window.MiaoYanExtractor.findArticle();
    if (!el) {
      showHint('没能识别出正文内容');
      return;
    }
    const r0 = el.getBoundingClientRect();
    const inView = r0.bottom > 8 && r0.top < window.innerHeight - 8;
    if (!inView) {
      try {
        el.scrollIntoView({ block: 'start' });
      } catch (err) {
        /* 忽略 */
      }
    }
    const r = el.getBoundingClientRect();
    state.mode = 'article';
    const iframeHits = findTextIframes();
    state.iframeNotice = iframeHits.length
      ? `注意：页面里有 ${iframeHits.length} 个含文字的 iframe，正文可能在里面，本扩展不会自动进入 iframe。`
      : '';
    state.frame = {
      element: el,
      adjusted: false,
      box: {
        x: r.left + window.scrollX,
        y: r.top + window.scrollY,
        w: Math.max(r.width, FRAME_MIN_W),
        h: Math.max(r.height, FRAME_MIN_H),
      },
    };
    hideHint();
    const L = ensureFrameHost();
    state.layers = state.layers || {};
    state.layers.frame = L;
    renderFrame();
    window.addEventListener('scroll', onFrameScroll, { passive: true });
    window.addEventListener('resize', onFrameScroll);
    window.addEventListener('keydown', onFrameKey, true);
  }

  function confirmFrame() {
    if (!state.frame) return;
    const frame = state.frame;
    let target;
    if (frame.adjusted) {
      const box = frameBoxInViewport();
      const blocks = collectBlocksInBox(box);
      target = blocksToFragment(blocks, findElementForRect(box, 28) || frame.element);
    } else {
      target = frame.element;
    }
    const clean = window.MiaoYanExtractor.cleanArticle(target);
    const { markdown, images } = window.MiaoYanConverter.convert(clean, { base: document.baseURI });
    if (!markdown.trim()) {
      const L = state.layers.frame;
      if (L) L.info.textContent = '这块范围里没有可剪藏的文字，拖大一点';
      return;
    }
    closeFrame();
    buildDraft({
      kind: 'text',
      markdown,
      images,
      title: window.MiaoYanExtractor.pageMeta().title,
    });
  }

  // ---------------------------------------------------------------- 其它剪藏模式

  function captureSelection() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) {
      showHint('没有选中文字，先在页面上划一段再试');
      return;
    }
    const range = sel.getRangeAt(0);
    const { markdown, images } = window.MiaoYanConverter.convertRange(range, { base: document.baseURI });
    if (!markdown.trim()) {
      showHint('选中的内容里没有可剪藏的文字');
      return;
    }
    const startEl =
      range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
    buildDraft({
      kind: 'text',
      markdown,
      images,
      title: headingBefore(startEl) || window.MiaoYanExtractor.pageMeta().title,
    });
  }

  // ---------------------------------------------------------------- 截图裁剪

  function startScreenshotCapture() {
    showHint('正在截取当前页面…');
    chrome.runtime.sendMessage({ type: 'MYCLIP_CAPTURE_TAB' }, (res) => {
      if (chrome.runtime.lastError || !res || !res.dataUrl) {
        showHint('截图失败，可能需要先点击一次扩展图标');
        return;
      }
      state.screenshot = res.dataUrl;
      openScreenshotOverlay(res.dataUrl);
    });
  }

  function openScreenshotOverlay(dataUrl) {
    ensureHost();
    const shadow = state.shadow;
    const shot = document.createElement('div');
    shot.className = 'shot';
    const img = document.createElement('img');
    img.src = dataUrl;
    shot.appendChild(img);
    shadow.appendChild(shot);
    state.layers.shot = shot;
    hideHint();

    const overlayRect = document.createElement('div');
    overlayRect.className = 'rect';
    overlayRect.innerHTML = '<span class="size"></span>';
    shot.appendChild(overlayRect);
    state.layers.rect = overlayRect;
    state.layers.size = overlayRect.querySelector('.size');

    const bar = document.createElement('div');
    bar.className = 'hint';
    bar.innerHTML = '<span>拖拽框选要剪裁的截图区域</span><kbd>Esc</kbd><span>取消</span>';
    shot.appendChild(bar);
    state.layers.hint = bar;

    shot.addEventListener('mousedown', onShotMouseDown);
    shot.addEventListener('mousemove', onShotMouseMove);
    shot.addEventListener('mouseup', onShotMouseUp);
    window.addEventListener('keydown', onShotKey);
  }

  function onShotKey(ev) {
    if (ev.key === 'Escape') {
      cleanupScreenshot();
      hideAll();
    }
  }

  function cleanupScreenshot() {
    if (state.layers.shot) {
      state.layers.shot.remove();
      state.layers.shot = null;
    }
    window.removeEventListener('keydown', onShotKey);
    state.screenshot = null;
  }

  function onShotMouseDown(ev) {
    ev.preventDefault();
    state.dragging = true;
    state.startX = ev.clientX;
    state.startY = ev.clientY;
    const rect = state.layers.rect;
    rect.style.display = 'block';
    rect.style.left = `${ev.clientX}px`;
    rect.style.top = `${ev.clientY}px`;
    rect.style.width = '0px';
    rect.style.height = '0px';
  }

  function onShotMouseMove(ev) {
    if (!state.dragging) return;
    const x = Math.min(ev.clientX, state.startX);
    const y = Math.min(ev.clientY, state.startY);
    const w = Math.abs(ev.clientX - state.startX);
    const h = Math.abs(ev.clientY - state.startY);
    const rect = state.layers.rect;
    rect.style.left = `${x}px`;
    rect.style.top = `${y}px`;
    rect.style.width = `${w}px`;
    rect.style.height = `${h}px`;
    state.layers.size.textContent = `${Math.round(w)} × ${Math.round(h)}`;
  }

  /**
   * 截图统一转成 JPEG 并限制最长边。
   * 整屏 PNG 的 base64 可能十几 MB，塞进 chrome.storage.session 会静默丢失（审计 P1-10）。
   */
  function compressScreenshot(canvas, maxEdge = 1600, quality = 0.85) {
    const scale = Math.min(1, maxEdge / Math.max(canvas.width, canvas.height, 1));
    const w = Math.max(1, Math.round(canvas.width * scale));
    const h = Math.max(1, Math.round(canvas.height * scale));
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const ctx = out.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(canvas, 0, 0, w, h);
    try {
      return out.toDataURL('image/jpeg', quality);
    } catch (err) {
      return canvas.toDataURL('image/png');
    }
  }

  function onShotMouseUp(ev) {
    if (!state.dragging) return;
    state.dragging = false;
    const x = Math.min(ev.clientX, state.startX);
    const y = Math.min(ev.clientY, state.startY);
    const w = Math.abs(ev.clientX - state.startX);
    const h = Math.abs(ev.clientY - state.startY);
    if (w < 8 || h < 8) {
      state.layers.rect.style.display = 'none';
      return;
    }
    const img = state.layers.shot.querySelector('img');
    const scale = img.naturalWidth / window.innerWidth;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, Math.round(x * scale), Math.round(y * scale), canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
    const dataUrl = compressScreenshot(canvas);
    cleanupScreenshot();
    // 截图剪藏的草稿要塞进 chrome.storage.session（10MB 配额），太大就直接说清楚
    if (dataUrl.length > 4 * 1024 * 1024) {
      showHint('截图太大了，换个小一点的区域再试');
      return;
    }
    buildDraft({
      kind: 'image',
      imageDataUrl: dataUrl,
      title: window.MiaoYanExtractor.pageMeta().title,
    });
  }

  // ---------------------------------------------------------------- 草稿与保存

  function buildDraft(partial) {
    const meta = window.MiaoYanExtractor.pageMeta();
    const draft = {
      kind: partial.kind || 'text',
      title: partial.title || meta.title || '未命名剪藏',
      markdown: partial.markdown || '',
      images: partial.images || [],
      imageDataUrl: partial.imageDataUrl || '',
      url: partial.url || meta.url,
      site: meta.site,
      author: meta.author,
      pageTitle: meta.title,
      capturedAt: new Date().toISOString(),
    };
    state.draft = draft;
    showResultCard(draft);
    chrome.runtime.sendMessage({ type: 'MYCLIP_CAPTURED', draft });
  }

  function showResultCard(draft) {
    ensureHost();
    const L = state.layers;
    L.title.value = draft.title;
    L.tags.value = '';
    L.meta.textContent = draft.kind === 'image' ? '截图剪藏 · 图片笔记' : `${draft.url || ''}`;
    L.save.disabled = false;
    setStatus('', 'info');
    L.card.classList.add('show');
    loadFolders();
    prefillTags();
    L.title.focus();
    L.title.select();
  }

  /** 预填上次用过的标签（少打几个字） */
  async function prefillTags() {
    try {
      const st = await chrome.storage.local.get('settings');
      const settings = (st && st.settings) || {};
      if (settings.rememberTags === false) return;
      const tags = Array.isArray(settings.lastTags) ? settings.lastTags.filter(Boolean) : [];
      if (!tags.length) return;
      const L = state.layers;
      if (L && L.tags && !L.tags.value.trim()) L.tags.value = tags.join(', ');
    } catch (err) {
      /* 忽略 */
    }
  }

  function sendMessage(message) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (res) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }
          resolve(res || { ok: false, error: '后台没有响应' });
        });
      } catch (err) {
        resolve({ ok: false, error: String(err && err.message) });
      }
    });
  }

  /**
   * 目标目录列表：
   *  1) 先读扩展页写进 chrome.storage.local 的目录树缓存（最稳，不依赖后台枚举）；
   *  2) 缓存为空再问后台 Service Worker；
   *  3) 都没有就如实提示，不再假装「只有库根目录」。
   */
  async function loadFolders() {
    let folders = [];
    let rootName = '';
    let error = '';

    try {
      const res = await chrome.storage.local.get('folderTree');
      const cache = res && res.folderTree;
      if (cache && (cache.folders || []).length) {
        folders = cache.folders;
        rootName = cache.rootName || '';
      }
    } catch (err) {
      /* 读不到缓存就问后台 */
    }

    if (!folders.length) {
      const res = await sendMessage({ type: 'MYCLIP_FOLDERS' });
      if (res && res.ok) {
        folders = res.folders || [];
        rootName = res.rootName || '';
        error = res.error || '';
      } else {
        error = (res && res.error) || '后台没有响应';
      }
    }

    state.folders = folders;
    const sel = state.layers.folder;
    sel.innerHTML = '';
    const rootOpt = document.createElement('option');
    rootOpt.value = '';
    rootOpt.textContent = rootName ? `（库根目录）${rootName}` : '（库根目录）';
    sel.appendChild(rootOpt);
    folders.forEach((f) => {
      const opt = document.createElement('option');
      opt.value = f.path;
      opt.textContent = f.path;
      sel.appendChild(opt);
    });

    // 默认带出「最近一次保存用的目录」，没有再用设置里的默认目录
    let want = '';
    try {
      const st = await chrome.storage.local.get('settings');
      const settings = (st && st.settings) || {};
      want = settings.lastFolder || settings.defaultFolder || '';
    } catch (err) {
      want = '';
    }
    sel.value = folders.some((f) => f.path === want) ? want : '';

    const note = state.layers.folderNote;
    if (note) {
      if (!folders.length) {
        note.textContent = error
          ? `未读到分类目录：${error}。打开侧栏点「重新授权此目录」。`
          : '未读到分类目录：打开侧栏点「重新授权此目录」。';
        note.style.display = 'block';
      } else {
        note.textContent = '';
        note.style.display = 'none';
      }
    }
    return folders;
  }

  async function onSave() {
    if (!state.draft) return;
    const payload = {
      type: 'MYCLIP_SAVE',
      draft: state.draft,
      folder: state.layers.folder.value || '',
      title: state.layers.title.value.trim() || state.draft.title,
      tags: state.layers.tags.value
        .split(/[,，\s]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    };
    const startedAt = Date.now();
    state.layers.save.disabled = true;
    setStatus('正在保存…', 'info');
    const res = await sendMessage(payload);
    if (!res || !res.ok) {
      if (res && res.code === 'NEEDS_PANEL') {
        // 后台上下文没有目录权限：请求已转交侧栏（扩展页上下文）保存
        setStatus('目录授权需要确认一次，已在侧栏打开：点「重新授权此目录」就会接着保存', 'info');
        chrome.runtime.sendMessage({ type: 'MYCLIP_OPEN_PANEL' });
        // 后台轮询结果，不阻塞浮层：用户还能继续改标题/标签（审计 P2）
        state.layers.save.disabled = false;
        pollSaveResult(startedAt);
        return;
      }
      state.layers.save.disabled = false;
      setStatus(`保存失败：${(res && res.error) || '未知错误'}`, 'err');
      return;
    }
    const where = `${res.folder ? res.folder + '/' : ''}${res.fileName}`;
    const imgNote = res.remoteImages
      ? `（${res.remoteImages} 张图片未下载到本地，已保留原始链接）`
      : '';
    setStatus(`已保存到 ${where}${imgNote}`, 'ok');
    // 保存成功后浮层自动关闭，只留一条会消失的提示（用户点 1：关掉卡片后还能继续剪）
    hideAll();
    showToast(`已保存到 ${where}${imgNote}`, {
      action: () => startArticleAdjust(),
      actionLabel: '继续剪藏',
    });
  }

  /** 转交侧栏保存后，后台等结果并更新状态条（不阻塞界面） */
  async function pollSaveResult(startedAt, timeoutMs = 30000) {
    const final = await waitSaveResult(startedAt, timeoutMs);
    if (final && final.ok) {
      const where = `${final.folder ? final.folder + '/' : ''}${final.fileName}`;
      const imgNote = final.remoteImages
        ? `（${final.remoteImages} 张图片未下载到本地，已保留原始链接）`
        : '';
      setStatus(`已保存到 ${where}${imgNote}`, 'ok');
      hideAll();
      showToast(`已保存到 ${where}${imgNote}`, { action: () => startArticleAdjust(), actionLabel: '继续剪藏' });
      return;
    }
    setStatus(`保存失败：${(final && final.error) || '侧栏没有返回结果'}`, 'err');
  }

  /** 等侧栏把保存做完（侧栏会写 lastSaveResult） */
  async function waitSaveResult(startedAt, timeoutMs = 20000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const res = await sendMessage({ type: 'MYCLIP_SAVE_RESULT' });
      const r = res && res.result;
      if (r && r.at && r.at >= startedAt - 1000) return r;
      await new Promise((resolve) => setTimeout(resolve, 600));
    }
    return null;
  }

  function onMore() {
    chrome.runtime.sendMessage({ type: 'MYCLIP_OPEN_PANEL' });
    hideAll();
  }

  // ---------------------------------------------------------------- 测试钩子
  // 只在内容脚本的**隔离世界**里可见（页面主世界读不到 window.__myClipInternal）。
  // 自动化测试需要访问 closed shadow 内部（页面自己访问不到），靠这个入口。
  window.__myClipInternal = {
    get host() { return state.host; },
    get shadow() { return state.shadow; },
    get frameHost() { return state.frameHost; },
    get frameShadow() { return state.frameShadow; },
    get mode() { return state.mode; },
    get draft() { return state.draft; },
    get folders() { return state.folders; },
  };

  // ---------------------------------------------------------------- 消息入口

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || !msg.type) return undefined;
    if (msg.type === 'MYCLIP_START') {
      const mode = msg.mode;
      try {
        ensureHost();
        state.mode = mode;
        if (mode === 'select') {
          closeFrame(); // 别让范围框和框选遮罩同时挂在页面上
          state.layers.layer.style.display = 'block';
          state.layers.layer.classList.add('active');
          showHint('<span>拖拽框选要剪藏的区域</span><kbd>Esc</kbd><span>取消</span>');
        } else if (mode === 'selection') {
          closeFrame();
          captureSelection();
        } else if (mode === 'article') {
          closeFrame();
          startArticleAdjust();
        } else if (mode === 'screenshot') {
          closeFrame();
          startScreenshotCapture();
        }
        sendResponse({ ok: true });
      } catch (err) {
        sendResponse({ ok: false, error: String(err && err.message) });
      }
      return undefined;
    }
    return undefined;
  });

  // 扩展页（侧栏 / 设置页）枚举出目录后会写缓存，这里跟着刷新一次
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.folderTree) return;
    if (!state.shadow || !state.layers.card.classList.contains('show')) return;
    loadFolders();
  });

  window.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && (state.mode || state.layers.card.classList.contains('show'))) {
      hideAll();
      cleanupScreenshot();
    }
  });
})();
