/**
 * 妙言剪藏 · 正文识别
 *
 * 思路：给候选容器打分（正文长度、段落数、链接密度、class/id 语义），
 * 选出最像「文章主体」的容器，再把导航/广告/评论/分享等噪音清掉。
 */
(function () {
  if (window.MiaoYanExtractor) return;

  const CANDIDATE_SELECTORS = [
    'article',
    'main',
    '[role="main"]',
    '.article-content',
    '.articleContent',
    '.article-body',
    '.post-content',
    '.post-body',
    '.entry-content',
    '.markdown-body',
    '.rich_media_content',
    '.theme-content',
    '.content-body',
    '#article',
    '#content',
    '.content',
    '.article',
    '.post',
    '.entry',
    'body',
  ];

  const JUNK_SELECTORS = [
    'nav', 'aside', 'footer', 'header', 'form', 'button', 'input', 'select', 'textarea',
    'iframe', 'svg', 'canvas', 'video', 'audio', 'object', 'embed',
    '[role="navigation"]', '[role="banner"]', '[role="complementary"]',
    '.comment', '.comments', '.comment-list', '.reply', '.replies', '.disqus',
    '.related', '.related-posts', '.recommend', '.recommendations', '.sidebar',
    '.breadcrumb', '.pagination', '.share', '.social', '.social-share',
    '.advert', '.advertisement', '.ads', '.ad', '.adsbygoogle', '.sponsor',
    '.newsletter', '.subscribe', '.newsletter-signup', '.subscription',
    '.toc', '.table-of-contents', '.breadcrumb-nav', '.author-box', '.author-card',
    '.site-header', '.site-footer', '.site-nav', '.page-header', '.page-footer',
    '.toolbar', '.cookie', '.cookie-banner', '.popup', '.modal', '.back-to-top',
  ];

  const JUNK_PATTERN =
    /(comment|reply|related|recommend|sidebar|side-bar|breadcrumb|pagination|share|social|advert|\bads?\b|sponsor|newsletter|subscribe|promo|banner|popup|modal|cookie|toolbar|copyright|footer|header|nav|menu|widget|meta-|byline|author-box|tags?-list|comment-)/i;

  // 广告位 / 推荐位 / 热榜 之类的 class/id 特征（命中且块不大就整块删掉）
  const AD_KEY_PATTERN =
    /(advert|adsense|adsbygoogle|ad-slot|ad-container|ad-wrap|ad-box|ads-|_ads?\b|guanggao|tuiguang|promo|sponsor|recommend|tuijian|related|xiangguan|hot-?list|rank-?list|top-?list|more-?list|side-?hot|广告|推荐|热榜|热文)/i;

  // 以这些标题开头的小块，通常是「相关阅读 / 猜你喜欢 / 广告」附录
  const NOISE_HEADING =
    /^(相关阅读|相关推荐|相关文章|推荐文章|推荐阅读|为你推荐|猜你喜欢|你可能(还)?(喜欢|感兴趣)|热门(文章|推荐|阅读|排行)?|最新(文章|发布|更新)|更多(阅读|文章|推荐)|延伸阅读|往期(回顾|推荐)|精彩推荐|精选(文章|推荐)|广告|赞助(内容)?|推广|评论区?|网友评论|分享到?|扫一?扫|关注我们|订阅(我们|专栏)?|版权声明|免责声明|本文链接|转载请)/;

  function isSmallRelative(node, root) {
    const total = textOf(root).length;
    const own = textOf(node).length;
    if (!own) return true;
    return own <= Math.max(300, total * 0.35);
  }

  const GOOD_PATTERN = /(article|articlebody|post-content|entry-content|content-body|markdown|rich_media|main-content|theme-content|story|detail|blog|text|body|post|entry|content|main)/i;

  function textOf(el) {
    return (el.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function linkTextLength(el) {
    let total = 0;
    Array.prototype.forEach.call(el.querySelectorAll('a'), (a) => {
      total += (a.textContent || '').replace(/\s+/g, ' ').trim().length;
    });
    return total;
  }

  function paragraphCount(el) {
    let count = 0;
    Array.prototype.forEach.call(el.querySelectorAll('p, li, blockquote, td'), (n) => {
      if (textOf(n).length >= 30) count += 1;
    });
    return count;
  }

  function semanticScore(el) {
    const key = `${el.className || ''} ${el.id || ''}`;
    let score = 0;
    if (GOOD_PATTERN.test(key)) score += 40;
    if (JUNK_PATTERN.test(key)) score -= 120;
    const tag = el.tagName;
    if (tag === 'ARTICLE') score += 60;
    if (tag === 'MAIN') score += 40;
    if (el.getAttribute && el.getAttribute('role') === 'main') score += 30;
    if (tag === 'BODY') score -= 10;
    return score;
  }

  function score(el) {
    const text = textOf(el);
    const len = text.length;
    if (!len) return -Infinity;
    const linkLen = linkTextLength(el);
    const linkDensity = linkLen / len;
    const paras = paragraphCount(el);
    let score = Math.log(len + 1) * 12 + paras * 6 + semanticScore(el);
    if (linkDensity > 0.5) score -= 60 * linkDensity;
    else if (linkDensity > 0.25) score -= 20;
    return score;
  }

  function collectCandidates() {
    const seen = new Set();
    const out = [];
    CANDIDATE_SELECTORS.forEach((sel) => {
      let nodes = [];
      try {
        nodes = Array.prototype.slice.call(document.querySelectorAll(sel));
      } catch (err) {
        nodes = [];
      }
      nodes.forEach((n) => {
        if (!seen.has(n)) {
          seen.add(n);
          out.push(n);
        }
      });
    });
    return out;
  }

  /**
   * 段落级打分：给每个「像样子的段落」打分，分数记到父容器（满额）与祖父容器（半额）。
   * 这样包着正文的那一层得分最高，包住整页的外层容器只拿到一半的间接分，
   * 也不依赖 class 有没有语义（类名全是乱码的站点同样能命中）。
   */
  const PARA_SELECTOR = 'p, pre, blockquote, td, dd';

  function paragraphWeight(p) {
    const t = textOf(p);
    const len = t.length;
    if (len < 25) return 0;
    const punct = (t.match(/[，,。．.、；;：:！!？?…「」『』（）()"'"']/g) || []).length;
    const linkDensity = linkTextLength(p) / Math.max(1, len);
    let w = 1 + Math.min(len / 100, 3) + Math.min(punct, 24) * 0.4;
    // 整段都是链接的（导航、标签云、目录）几乎不算正文
    w *= 1 - Math.min(linkDensity, 0.95);
    return w;
  }

  function scoreByParagraphs() {
    const scores = new Map();
    const junkSel = JUNK_SELECTORS.join(',');
    const add = (el, v) => {
      if (!el || el.nodeType !== 1 || el.tagName === 'HTML') return;
      scores.set(el, (scores.get(el) || 0) + v);
    };
    Array.prototype.forEach.call(document.querySelectorAll(PARA_SELECTOR), (p) => {
      if (p.closest('#miaoyan-clip-host, #miaoyan-frame-host')) return;
      if (p.closest(junkSel)) return;
      const w = paragraphWeight(p);
      if (!w) return;
      const parent = p.parentElement;
      if (!parent || parent === document.documentElement) return;
      add(parent, w);
      add(parent.parentElement, w / 2);
    });
    return scores;
  }

  // 找页面主标题时只跳过明确的站点外壳，不跳过 <article><header><h1>（很多站点标题就放在 header 里）
  const H1_JUNK =
    'nav, aside, footer, form, .site-header, .site-footer, .site-nav, .page-header, .page-footer, .navbar, .nav-bar, .top-bar, .header-bar, .toolbar';

  /** 页面主标题：优先与 document.title / og:title 对得上的那个 h1 */
  function primaryHeading() {
    const list = Array.prototype.slice.call(document.querySelectorAll('h1'));
    if (!list.length) return null;
    const norm = (v) => String(v || '').replace(/\s+/g, '').toLowerCase();
    const meta = document.querySelector('meta[property="og:title"]');
    const targets = [norm(document.title), norm(meta && meta.content)].filter(Boolean);
    let best = null;
    let bestScore = -Infinity;
    list.forEach((h1, i) => {
      if (h1.closest(H1_JUNK)) return;
      if (h1.closest('#miaoyan-clip-host, #miaoyan-frame-host')) return;
      const t = norm(textOf(h1));
      if (!t) return;
      let sc = 0;
      targets.forEach((tg) => {
        if (tg && (tg === t || tg.includes(t) || t.includes(tg))) sc += 2;
      });
      sc += 1 / (1 + i * 0.4);
      if (sc > bestScore) {
        bestScore = sc;
        best = h1;
      }
    });
    return best;
  }

  /**
   * 综合评分：段落分 × 链接密度 × class/id 语义 × 标签语义 × 紧致度
   * useFallback 只在整页都没有可用段落时才为 true（那时改用「字数 + 段落数」口径）。
   * 有段落信号时，没有段落分的容器（比如 body）直接记 0，不能靠「字多」反超正文容器。
   */
  function contentScore(el, paraScores, useFallback, h1) {
    const text = textOf(el);
    const len = text.length;
    if (!len) return -Infinity;
    let s = paraScores.get(el) || 0;
    if (s <= 0) {
      if (!useFallback) return 0;
      s = Math.log(len + 1) * 6 + paragraphCount(el) * 3;
    }
    const linkDensity = linkTextLength(el) / len;
    s *= 1 - Math.min(linkDensity, 0.95);
    const key = `${el.className || ''} ${el.id || ''}`;
    if (JUNK_PATTERN.test(key)) s *= 0.12;
    if (GOOD_PATTERN.test(key)) s *= 1.35;
    const tag = el.tagName;
    if (tag === 'ARTICLE') s *= 1.3;
    else if (tag === 'MAIN') s *= 1.15;
    if (el.getAttribute && el.getAttribute('role') === 'main') s *= 1.12;
    if (tag === 'BODY') s *= 0.45;
    // 紧致度：包住整页的大容器折价，正文通常远小于整页文字
    s *= 1 - Math.min(len / 40000, 0.3);
    // 主标题锚点：正文容器通常包着页面主标题；评论/推荐区通常不包
    if (h1 && el !== h1 && el.contains(h1)) s *= 1.8;
    return s;
  }

  /** 正文容器不含标题、而父容器里正好有同级 h1 时，上探一层把标题带上 */
  function expandToTitle(node) {
    if (node.querySelector('h1')) return node;
    const parent = node.parentElement;
    if (!parent || parent === document.body || parent === document.documentElement) return node;
    const siblings = Array.prototype.slice.call(parent.children);
    // 兄弟节点里只要有一个「带 h1 且很短」的（标题块 / <header><h1></header>），就把范围上探一层
    const titleBlock = siblings.find(
      (c) =>
        c !== node &&
        c.tagName !== 'SCRIPT' &&
        c.querySelector &&
        c.querySelector('h1') &&
        textOf(c).length <= 140
    );
    if (!titleBlock) return node;
    const selfLen = textOf(node).length;
    const parentLen = textOf(parent).length;
    if (selfLen && parentLen / selfLen <= 1.5) return parent;
    return node;
  }

  /** 找出最像正文的容器 */
  function findArticle() {
    const paraScores = scoreByParagraphs();
    const useFallback = paraScores.size === 0;
    const h1 = primaryHeading();
    const candidates = new Set(collectCandidates());
    paraScores.forEach((_v, el) => candidates.add(el));
    let best = null;
    let bestScore = -Infinity;
    candidates.forEach((el) => {
      const s = contentScore(el, paraScores, useFallback, h1);
      if (s > bestScore) {
        bestScore = s;
        best = el;
      }
    });
    if (!best) return document.body;
    if (textOf(best).length < 200) {
      // 候选都不够长，退回 body
      const bodyScore = contentScore(document.body, paraScores, useFallback, h1);
      if (bodyScore > bestScore) return document.body;
    }
    return expandToTitle(best);
  }

  function isJunkNode(el) {
    const key = `${el.className || ''} ${el.id || ''}`;
    if (JUNK_PATTERN.test(key)) return true;
    const text = textOf(el);
    const len = text.length;
    if (len > 0 && len < 60 && linkTextLength(el) / len > 0.6) return true;
    return false;
  }

  /** 清理容器：删掉噪音节点，返回克隆 */
  function cleanArticle(el) {
    const clone = el.cloneNode(true);
    // 去掉 script/style 之类。
    // 注意：script[type^="math/"] 是 MathJax 2 存放 TeX 源码的地方，
    // Defuddle 自己也特意保留它（stripUnsafeElements 只删非 math/ 的 script），
    // 这里必须跟着保留，否则公式会在转换前就被丢掉。
    Array.prototype.forEach.call(
      clone.querySelectorAll('script:not([type^="math/"]), style, noscript, template, iframe, object, embed, canvas, svg'),
      (n) => n.remove()
    );
    // 命中 JUNK_SELECTORS 的节点
    Array.prototype.forEach.call(clone.querySelectorAll(JUNK_SELECTORS.join(',')), (n) => {
      if (n.parentNode) n.parentNode.removeChild(n);
    });
    // class/id 语义像噪音的
    Array.prototype.slice.call(clone.querySelectorAll('*')).forEach((n) => {
      if (n.parentNode && isJunkNode(n)) n.parentNode.removeChild(n);
    });
    // 广告位 / 推荐位 / 热榜：class/id 命中特征，且相对整篇不算大
    Array.prototype.slice.call(clone.querySelectorAll('[class], [id]')).forEach((n) => {
      if (!n.parentNode || n === clone) return;
      const key = `${n.className || ''} ${n.id || ''}`;
      if (!AD_KEY_PATTERN.test(key)) return;
      if (isSmallRelative(n, clone)) n.parentNode.removeChild(n);
    });
    // 以「相关阅读 / 猜你喜欢 / 广告」这类标题开头的小节整块删掉
    Array.prototype.slice.call(clone.querySelectorAll('section, div, aside, figure')).forEach((n) => {
      if (!n.parentNode || n === clone) return;
      if (!isSmallRelative(n, clone)) return;
      const heading = n.querySelector('h1, h2, h3, h4, h5, h6');
      if (!heading) return;
      const text = textOf(heading).replace(/[\s:：|·]+$/, '');
      if (text && text.length <= 24 && NOISE_HEADING.test(text)) n.parentNode.removeChild(n);
    });
    // 空节点（媒体元素本身没有文字，不能当空节点删掉，否则图片会被吃掉）
    const KEEP_EMPTY = new Set([
      'IMG', 'VIDEO', 'AUDIO', 'SOURCE', 'PICTURE', 'CANVAS', 'SVG', 'IFRAME',
      'BR', 'HR', 'INPUT', 'TD', 'TH', 'TR', 'THEAD', 'TBODY', 'TABLE', 'COLGROUP',
    ]);
    Array.prototype.slice.call(clone.querySelectorAll('*')).forEach((n) => {
      if (!n.parentNode) return;
      if (KEEP_EMPTY.has(n.tagName)) return;
      if (!n.textContent.trim() && !n.querySelector('img,video,audio,svg,canvas,table,picture,iframe')) {
        n.parentNode.removeChild(n);
      }
    });
    return clone;
  }

  /** 读取页面元信息 */
  function pageMeta() {
    const meta = (name, attr = 'content') => {
      const el = document.querySelector(`meta[${attr}="${name}"], meta[name="${name}"], meta[property="${name}"]`);
      return el ? (el.getAttribute(attr) || el.getAttribute('content') || '').trim() : '';
    };
    // 标题：og > 正文容器里的 h1 > 干净的 h1 > document.title
    // （正文容器里的 h1 优先，避免拿到站点 logo 那种 h1）
    const scope = document.querySelector(
      'article, main, [role="main"], .post-content, .article-content, .article-body, .entry-content, .markdown-body, .rich_media_content, .theme-content'
    );
    const h1InScope = scope ? scope.querySelector('h1') : null;
    const h1Clean = (() => {
      const list = Array.prototype.slice.call(document.querySelectorAll('h1'));
      const clean = list.filter((el) => !el.closest(JUNK_SELECTORS.join(',')));
      return clean[0] || null;
    })();
    const title =
      meta('og:title') ||
      meta('twitter:title') ||
      (h1InScope ? textOf(h1InScope) : '') ||
      (h1Clean ? textOf(h1Clean) : '') ||
      document.title ||
      '';
    const author =
      meta('author') ||
      meta('article:author') ||
      (() => {
        const el = document.querySelector('[rel="author"], .author-name, .post-author, .byline .name');
        return el ? textOf(el) : '';
      })();
    const site =
      meta('og:site_name') ||
      meta('application-name') ||
      location.hostname.replace(/^www\./, '');
    const date =
      meta('article:published_time', 'content') ||
      meta('datePublished') ||
      (() => {
        const t = document.querySelector('time[datetime]');
        return t ? (t.getAttribute('datetime') || '').trim() : '';
      })();
    return {
      title: title.replace(/\s+/g, ' ').trim(),
      author: author.replace(/\s+/g, ' ').trim(),
      site: site.trim(),
      date,
      url: location.href,
      lang: document.documentElement.getAttribute('lang') || '',
    };
  }

  // --------------------------------------------------------------
  // Defuddle 正文识别（v0.7.0）
  //
  // Defuddle 是 Obsidian 官方剪藏器在用的开源正文提取器（MIT），
  // 我们把它的浏览器构建 vendor 进来，只用它做「找出正文并清洗」，
  // Markdown 输出仍然走我们自己的转换器（这样才能输出妙言要的格式）。
  // --------------------------------------------------------------

  /**
   * Defuddle 的调用选项。
   *
   * useAsync 必须保持 false：Defuddle 的异步模式会去第三方站点抓内容
   * （例如 FxTwitter），那会破坏本扩展「不向外部服务器发送任何数据」的承诺，
   * 也会和 Chrome 应用商店里的数据使用声明冲突。
   */
  const DEFUDDLE_OPTIONS = {
    markdown: false,
    separateMarkdown: false,
    useAsync: false,
    includeReplies: false, // 评论不要
    removeHiddenElements: true,
    removeLowScoring: true,
    removeSmallImages: true,
    standardize: true,
    debug: true, // 为了拿 contentSelector
  };

  /** 当前页面能不能用 Defuddle（vendor 没注入 / 页面上没有全局对象） */
  function defuddleAvailable() {
    return typeof window.Defuddle === 'function';
  }

  /**
   * 跑一次 Defuddle 解析（同步）。
   * @param {object} [options] 覆盖默认选项
   * @returns {object|null} Defuddle 响应；不可用 / 抛错 / 内容太空时返回 null
   */
  function defuddleExtract(options = {}) {
    if (!defuddleAvailable()) return null;
    const opts = Object.assign({}, DEFUDDLE_OPTIONS, options || {});
    // 隐私红线：useAsync / includeReplies 必须在合并之后强制关掉，
    // 否则调用方传参就能打开（那两项会让 Defuddle 把页面内容发给第三方服务）。
    opts.useAsync = false;
    opts.includeReplies = false;
    if (!opts.url) opts.url = location.href;
    const origLog = console.log;
    let res = null;
    try {
      // Defuddle 在 debug 模式下会往控制台刷调试日志，剪藏时不需要，屏蔽掉。
      // parse() 是同步的，期间不会有别的页面代码运行，屏蔽是安全的。
      console.log = () => {};
      res = new window.Defuddle(document, opts).parse();
    } catch (err) {
      res = null;
    } finally {
      console.log = origLog;
    }
    if (!res || !res.content || !String(res.content).trim()) return null;
    // 文字太少的多半是选错了容器（登录页、错误页、纯导航页），当作失败处理
    if (typeof res.wordCount === 'number' && res.wordCount < 30) return null;
    return res;
  }

  /**
   * 把 Defuddle 选中的容器定位回真实 DOM 元素。
   * 这样「调整范围」的框画在哪里，保存下来的就是哪一块。
   */
  function defuddleElement(res) {
    const sel = res && res.debug && res.debug.contentSelector;
    if (!sel) return null;
    let el = null;
    try {
      el = document.querySelector(sel);
    } catch (err) {
      el = null;
    }
    if (!el) return null;
    const text = textOf(el);
    if (!text || text.length < 40) return null;
    return el;
  }

  /**
   * Defuddle 选中的容器和自研打分选中的容器，挑更像「正文」的那个。
   *
   * 依据是 D1 真实站点回归（test/site-real，14 个真实页面，见 test/real-compare.json）：
   *   - 类名有语义时两者选的常是同一个容器；
   *   - Defuddle 在 css-tricks / MDN / python 文档 / wiki / vue 上比自研选得更完整、更准；
   *   - 唯一稳定的失败模式是「Defuddle 退回整页 body」
   *     （hard-generic.html：类名全是随机串的页面，它选了 body，
   *      而自研能挑出正文列）—— 只有这一种情况我们改用自研容器。
   * 所以规则是：默认听 Defuddle 的，只有它退回整页、而自研挑出了一个
   * 明显比整页小的块时，才换成自研的结果。
   */
  function pickContainer(defEl, legacyEl) {
    if (!defEl) return legacyEl;
    if (!legacyEl) return defEl;
    if (defEl === legacyEl) return defEl;
    const tag = String(defEl.tagName || '').toUpperCase();
    if (tag === 'BODY' || tag === 'HTML') {
      const dLen = textOf(defEl).length;
      const lLen = textOf(legacyEl).length;
      // 自研选的块比整页小两成以上，说明它真的找到了正文列
      if (lLen && lLen < dLen * 0.8) return legacyEl;
    }
    return defEl;
  }

  /**
   * 规划一次「整篇正文」剪藏。
   * 优先用 Defuddle 的正文容器，失败（或页面不支持）时回退到自研提取器。
   *
   * engine 说明「框画在哪」，contentFrom 说明「正文从哪来」——
   * 两者分开是因为：Defuddle 的选择器是在克隆文档上算的，在真实文档里
   * 偶尔定位不到元素（动态页面），这时它的正文内容其实还是好的，
   * 不该因为框没画准就把整篇正文丢掉。
   * @returns {{element: Element|null, defuddle: object|null, engine: 'defuddle'|'legacy',
   *            contentFrom: 'defuddle'|'legacy', matched: boolean}}
   */
  function planArticle(options = {}) {
    // 用户在设置里关掉了「用 Defuddle 识别正文」时，完全走回原来的自研打分逻辑
    if (options.useDefuddle === false) {
      return { element: findArticle(), defuddle: null, engine: 'legacy', contentFrom: 'legacy', matched: false };
    }
    const res = defuddleExtract(options);
    if (res) {
      const defEl = defuddleElement(res);
      const legacyEl = findArticle();
      const chosen = pickContainer(defEl, legacyEl);
      const usedDefuddle = !!defEl && chosen === defEl;
      return {
        element: chosen || legacyEl,
        defuddle: res,
        engine: usedDefuddle ? 'defuddle' : 'legacy',
        // 框定位失败（defEl 为 null）时，Defuddle 的正文仍然可用；
        // 但如果是我们主动换用了自研容器（Defuddle 退回整页），正文必须跟着换。
        contentFrom: res && (usedDefuddle || !defEl) ? 'defuddle' : 'legacy',
        matched: !!defEl,
      };
    }
    return { element: findArticle(), defuddle: null, engine: 'legacy', contentFrom: 'legacy', matched: false };
  }

  /**
   * 把 Defuddle 清洗好的 HTML 转成 Markdown（仍然用我们自己的转换器）。
   *
   * 两件事要在这里补上：
   * 1. 再过一遍我们自己的垃圾过滤（cleanArticle）——Defuddle 的过滤规则和我们的
   *    不一样，中文站的「猜你喜欢 / 热门排行 / 广告位」这类小节它认不出来，
   *    交给我们的规则处理更稳；
   * 2. 把被 Defuddle 删掉的首个标题补回来 ——Defuddle 会把与文章标题重复的
   *    第一个标题删掉，但我们的笔记正文里一直保留它（和 v0.6.0 的行为一致）。
   * @returns {{markdown:string, images:Array}|null}
   */
  function markdownFromDefuddle(res, base, element) {
    if (!res || !res.content) return null;
    const converter = window.MiaoYanConverter;
    if (!converter || typeof converter.convert !== 'function') return null;
    let doc = null;
    try {
      doc = new DOMParser().parseFromString(String(res.content), 'text/html');
    } catch (err) {
      return null;
    }
    const body = doc && doc.body;
    if (!body) return null;
    const cleaned = cleanArticle(body);
    const out = converter.convert(cleaned, { base: base || location.href });
    let markdown = (out && out.markdown) || '';
    const images = (out && out.images) || [];
    if (element && element.querySelector) {
      const h1 = element.querySelector('h1');
      const h1Text = h1 ? textOf(h1).trim() : '';
      if (h1Text && !/^#{1,3}\s/.test(markdown.trim())) {
        markdown = `# ${h1Text}\n\n${markdown.trim()}`;
      }
    }
    return { markdown, images };
  }

  /**
   * 把 Defuddle 读到的元信息补进我们的 pageMeta。
   * 我们自己读到的（og:title 等）优先，Defuddle 只补空缺。
   */
  function mergeMeta(meta, res) {
    const out = Object.assign({}, meta || {});
    if (!res) return out;
    const fill = (key, value) => {
      if (!out[key] && value) out[key] = String(value).trim();
    };
    fill('title', res.title);
    fill('author', res.author);
    fill('date', res.published);
    fill('description', res.description);
    fill('lang', res.language);
    if (res.favicon) out.favicon = String(res.favicon).trim();
    if (res.wordCount) out.wordCount = res.wordCount;
    return out;
  }

  window.MiaoYanExtractor = {
    findArticle,
    scoreByParagraphs,
    contentScore,
    primaryHeading,
    cleanArticle,
    pageMeta,
    textOf,
    isSmallRelative,
    // v0.7.0：Defuddle 正文识别
    defuddleAvailable,
    defuddleExtract,
    defuddleElement,
    planArticle,
    markdownFromDefuddle,
    mergeMeta,
    DEFUDDLE_OPTIONS,
  };
})();
