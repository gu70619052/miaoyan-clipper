# 妙言剪藏 · Chrome 扩展

浏览网页时把**正文、选中文字、框选区域、页面截图**剪藏成妙言 Markdown，直接写进本地妙言笔记库；保存时可以选目标目录，图片自动落到分类下的 `i/` 目录。

---

## 一、当前状态（2026-11-24）

| 项目 | 状态 |
| --- | --- |
| 扩展源码（可加载） | `output/miaoyan-clipper/` ✅ |
| 端到端测试 | `output/miaoyan-clipper/test/e2e.mjs`，**113/113 断言通过** ✅ |
| 完整审计（7 个子 agent） | `output/miaoyan-clipper/test/audit/`：186 条用例矩阵 + 4 份专项报告 + 独立复核，**汇总见 `audit/SUMMARY.md`** ✅ |
| 界面截图 | `output/miaoyan-clipper/test/screenshots/`（7 张，含 `06-全文范围框.png`、`07-无语义类名-默认框.png`）✅ |
| 真实妙言库写入 | ⚠️ 需你手动授权一次目录（自动化测试用 OPFS 根句柄替代，代码路径完全相同） |
| Chrome 应用商店上架 | 🟢 **v0.7.0 已过审上线**（2026-11-25 查询 `publishedItemRevisionStatus` = `PUBLISHED`、0.7.0 @ 100%）；**v0.7.1 已打包待提交**（商店同一时间只收一个待审版本，v0.7.0 出结果后即可提交）；商店页：<https://chromewebstore.google.com/detail/妙言剪藏/pbdpebhchbkgmgdgdehnoppglilakiaj>；审核结果由 launchd 每 2 小时检查并通过 QQ 通知（见第九节） |
| GitHub 仓库（源码 + 隐私政策托管） | ✅ <https://github.com/gu70619052/miaoyan-clipper>（公开仓库，Pages 已 built；含 `extension/` 源码、`scripts/` 自动发版与审核监控、`store/` 上架文案与素材、`test/` 监控脚本测试）；Release：<https://github.com/gu70619052/miaoyan-clipper/releases> |
| 版本 | **v0.7.1**（首次体验修复：点图标立刻有反应、授权后第一次保存就能存进去）；线上现行 v0.7.0 |

---

## 二、交付物

```
20261122-miaoyan-clipper/
├── README.md                      ← 本文件
├── output/
│   └── miaoyan-clipper/           ← 扩展本体，直接加载这个目录
│       ├── manifest.json          MV3 清单
│       ├── icons/                 图标（含 make_icons.py 生成脚本）
│       ├── src/
│       │   ├── background/service-worker.js   右键菜单、剪藏调度、落盘兜底
│       │   ├── content/                        页面浮层、正文识别、Markdown 转换
│       │   ├── lib/                            句柄库、设置、目录缓存、妙言写入层
│       │   ├── panel/                          侧边栏（编辑/预览/选目录/保存）
│       │   ├── options/                        设置页
│       │   └── vendor/                         marked v12（本地打包，联网也能跑）
│       └── test/                   e2e 测试 + fixture + 截图
│       └── store/                  商店上架物料（listing.md / privacy.html / 宣传图 / 详情页截图 / submit-checklist.md）
```

线上地址：

| 东西 | 地址 |
| --- | --- |
| 源码仓库（公开） | <https://github.com/gu70619052/miaoyan-clipper> |
| 隐私政策（商店填这个） | <https://gu70619052.github.io/miaoyan-clipper/> |
| 上架包下载（Release） | <https://github.com/gu70619052/miaoyan-clipper/releases/tag/v0.6.0> |
| 商店安装（已上架） | <https://chromewebstore.google.com/detail/妙言剪藏/pbdpebhchbkgmgdgdehnoppglilakiaj> |

---

## 三、安装

1. Chrome 打开 `chrome://extensions`
2. 右上角打开「开发者模式」
3. 点「加载已解压的扩展程序」，选择 `20261122-miaoyan-clipper/output/miaoyan-clipper`
4. 点扩展图标 → 齿轮「设置」→ 「选择目录」，把**妙言笔记库根目录**授权给扩展

本机妙言库默认位置：

```
~/Library/Mobile Documents/iCloud~com~tw93~miaoyan/Documents
```

授权一次长期有效；重启浏览器后失效时点一下「重新授权」即可。

> 要求 Chrome 116+（用到文件系统访问 API 与 Side Panel API）。

---

## 四、使用

### 四种剪藏方式（网页右键菜单）

| 菜单项 | 行为 |
| --- | --- |
| 框选剪藏 | 页面空白处按住拖拽画框 → 自动定位到「能装下选区的最深层正文块」→ 转 Markdown |
| 剪藏选中文字 | 先划选文字再右键 → 只取选区内容 |
| 整篇正文 | 自动识别文章主体（打分：文本长度、段落数、链接密度、语义 class/id）→ **先摆出范围框等你确认**（可拖 8 个手柄或整体移动）→ 只剪框内内容 |
| 截图剪藏 | 抓当前可见页面 → 浮层上再拖框裁剪 → 存成图片笔记 |

剪完后页面上会浮出一张卡片：标题、目标目录下拉、标签输入、「保存到妙言」/「在面板中编辑」。

### 三种发起方式（v0.5.0 起）

| 方式 | 操作 |
| --- | --- |
| **点地址栏旁的扩展图标** | 直接剪当前页（先出范围框，确认后弹卡片）—— 像印象笔记那样一点就剪 |
| **快捷键** | ⌘/Ctrl + `Shift+S` 整篇正文、`Shift+K` 框选、`Shift+P` 截图剪藏 |
| **网页右键菜单** | 整篇正文 / 剪藏选中文字 / 框选剪藏 / 截图剪藏 |

保存成功后：浮层自动收起，底部留一条提示（显示存到哪个文件，带「继续剪藏」按钮）；
剪藏过的页面标签上打 ✓；标签会被记住，下次自动填好。

### 侧边栏（用 Chrome 的侧边栏按钮打开）

- 顶部显示库目录授权状态
- 草稿卡片：**编辑 / 预览** 双 tab（预览用本地 marked 渲染）
- **目标目录**：下拉选已有分类，或点「新建」直接建一个分类目录
- **标签**：逗号分隔，写进 frontmatter
- 「保存到妙言」落盘；「丢弃」清掉草稿
- 空状态里有「剪藏当前页面」按钮；草稿不是当前页时会提示「这是上一次剪藏的内容」

### 设置页（扩展图标旁的齿轮）

- 妙言笔记库授权 / 清除授权
- 默认目标目录（剪藏后自动选中的那个）
- 图片处理：**下载到 i/ 目录**（默认，离线可用）或**保留远程链接**
- 写入 frontmatter 的内容：来源链接 / 站点·作者·剪藏时间 / 标签
- 剪藏完成后自动打开侧边栏
- 图片下载失败时退回远程链接
- **目录与权限诊断**：对比「设置页上下文」与「后台 Service Worker 上下文」读到的目录数、权限状态和报错

---

## 五、关键设计决策

1. **为什么是「插件直写文件」而不是本地服务**
   妙言没有对外 HTTP 接口，也没有插件系统——笔记本质就是库目录里的 Markdown 文件。所以扩展走 Chrome 的 File System Access API 直接写盘：没有常驻进程、不装额外软件、笔记永远在你自己的磁盘上。
   （扩展仍需要一次人工授权：原生目录选择器必须由用户手势触发，无法自动化。）

2. **目录句柄存 IndexedDB**
   `showDirectoryPicker()` 只能在扩展页面的 window 上下文调用，Service Worker 拿不到它、只能用已授权的句柄读写。因此 `src/lib/fsdb.js` 把 `FileSystemDirectoryHandle` 存进 IndexedDB，扩展页负责授权与挑选，后台负责落盘。

2b. **枚举与写盘放在扩展页上下文（v0.2.0 改动）**
   妙言库在 iCloud Drive（File Provider）目录下，后台 Service Worker 上下文里有时读不到句柄或枚举不到子目录，
   于是页内浮层只剩「（库根目录）」、面板保存报「授权已过期」。
   现在：**侧栏 / 设置页直接 import writer.js 做枚举与写盘**（点击「保存」本身就是用户手势，可就地 `requestPermission()` 重新授权），
   枚举成功后把目录树写进 `chrome.storage.local` 的 `folderTree`，**页内浮层直接读这份缓存**；
   后台退化为调度器，写盘失败时把保存请求转交侧栏代存（浮层提示并轮询结果）。

3. **文件名规则沿用本机既有迁移约定**
   妙言的标题取自文件名，所以文件名里不能出现 `/ : * ? " \ | < >`。`src/lib/miaoyan.js` 的 `sanitizeFileName()` 换成全角并按 120 字节截断，规则与 `20261122-wiznote-migration/output/scripts/mdconv.py` 的 `slug_filename()` 一致；重名自动加 ` (2)` 序号。

4. **图片落到笔记所在目录的 `i/`**
   与妙言库既有约定一致：附件放「笔记所在目录」的 `i/` 子目录，正文写 `/i/<文件名>`（相对分类目录，不是库根）。这样同一分类里的附件集中在一处，妙言也能正确解析相对路径。

5. **frontmatter 只写标量 `key: value`**
   MiaoYan 只在 frontmatter 全部是 `key: value` 标量行时才隐藏该块；写成 YAML 数组会被当正文渲染出来。所以标签存成 `标签: "剪藏, 测试"` 这样的标量。键名沿用本机既有迁移笔记的约定：`title` + 中文补充键（`来源`/`站点`/`作者`/`剪藏时间`/`标签`）。

6. **页面内容先消毒再渲染**
   剪藏内容来自任意网页，侧边栏预览前会过一遍白名单消毒（`sanitizeHtml()`），避免把网页里的原始 HTML/脚本带进扩展页。

---

## 六、测试

```bash
cd output/miaoyan-clipper/test
npm install          # 只装 puppeteer-core
node e2e.mjs         # 或 npm test
```

脚本用**本机真实 Chrome** 加载未打包扩展（CDP `Extensions.loadUnpacked`），跑 113 项断言：

| 组 | 内容 | 结果 |
| --- | --- | --- |
| A | 扩展加载、Service Worker 启动 | 2/2 |
| B | 内容脚本与 Markdown 转换（标题、行内样式、相对链接绝对化、列表嵌套、引用、代码块语言、表格、图片占位符、图注、噪音剔除、元信息） | 14/14 |
| C | 剪藏链路（后台触发 → 全文范围框出现 → 确认 → 草稿入库 → 页面浮层卡片 → 面板显示草稿） | 11/11 |
| D | 写盘链路（解析/创建目标目录、写 frontmatter 与正文、图片下载到 `i/` 并改写引用、重名去重） | 7/7 |
| E | 目录树列举、附件目录 `i/` 不出现在目标列表 | 3/3 |
| F | 设置页渲染、授权状态、运行期无 JS 报错 | 3/3 |
| G | v0.2.x 新链路：面板在扩展页上下文直接写盘、目录树写进缓存、页内浮层读到子目录、设置页诊断输出、权限状态查询/重新申请、诊断含权限状态与读探针 | 6/6 |
| H | v0.3.0 全文范围框（框与正文重合、8 手柄与按钮、文案、默认范围内容齐全、广告/推荐/热榜剔除、手柄可拖、拖动后范围变小、调整后只剪框内、Esc 取消） | 9/9 |
| I | v0.3.1 正文识别质量（类名无语义时落在正文列、排除侧栏与评论区、主标题进范围、评论区更长时仍选正文容器、评论不进剪藏） | 5/5 |
| J | v0.3.2 记住最近目录（保存成功后写 `settings.lastFolder`、面板重新打开带出、页内浮层预选） | 3/3 |
| K | v0.4.0 数据完整性（`pendingSave` 只消费一次、12 张图占位符不碰撞、并发同名不覆盖、大小写/Unicode 不覆盖、默认拒绝内网图片、附件名不含空格括号） | 6/6 |
| L | v0.4.0 安全（网页读不到浮层/范围框内部、宿主 id 随机、页面拿不到测试钩子、撤销授权清掉目录缓存） | 4/4 |
| M | v0.4.0 来源地址脱敏（token/签名替换为 `***`，普通参数保留） | 2/2 |
| N | v0.4.0 截图剪藏端到端（无授权时给可读提示、截屏→框选→JPEG 草稿、截图附件写入 `i/`） | 3/3 |
| O | v0.5.0 交互优化（三个快捷键已注册、点图标发起剪藏出范围框、面板「剪藏当前页面」按钮、保存后浮层自动关闭、提示条带「继续剪藏」、✓ 角标、标签记忆与预填、上一篇文章提示条） | 9/9 |
| P | v0.6.0 权限最小化（正式包无 `host_permissions`/`content_scripts`、权限工具函数 pattern 归一与同源免申请、设置页权限卡片可撤销） | 3/3 |
| Q | v0.7.0 新能力（五种数学写法、Defuddle 已加载、`useAsync:false` 且 fetch 零调用、引擎开关两条路径、随机类名页自研兜底、归档规则纯函数、设置页规则表、面板自动归档、插入双链、KaTeX 块级公式、带 `$` 的公式退回代码块、`<` 还原成 `\lt`、库根目录规则有效且裸后缀不劫持全站） | 19/19 |
| R | v0.7.1 首次体验（授权请求在点击时立刻发起、授权卡引导「一次授权并保存」、后台提示显示在状态条、点图标先开侧栏再识别、识别完给出「下一步」提示） | 5/5 |

**D1 真实站点回归**（A1 的验收环节，见 8k.3）：

```bash
cd output/miaoyan-clipper/test
node real-fetch.mjs      # 抓 17 个真实文章页到 site-real/（需联网；HTML 不进 git/商店包）
node real-compare.mjs    # 新旧正文引擎对照表，明细写 real-compare.json
```

另有**审核监控脚本**的独立测试（不联网、不发真 QQ）：

| 文件 | 内容 | 结果 |
| --- | --- | --- |
| `output/miaoyan-clipper/test/review-check.test.mjs` | 状态解析、版本号比较、事件生成（上线/被拒/下架/警告）、去重判定、旧指纹迁移 | **33/33** |
| `output/miaoyan-clipper/test/review-check.e2e.mjs` | 假 API + 假 QQ 的 8 段场景演练：旧状态不重发 → 审核中不打扰 → 新版本上线发一条 → 同状态不发 → 再下一版又发 → 被拒发一次且反复查不重发 → 改好后通过再发 → API 报错连续两次才告警 | **25/25** |

实测产出示例（`title` 键已与既有迁移笔记对齐）：

```markdown
---
title: "测试：标题/带:非法字符"
来源: "http://127.0.0.1:8765/"
站点: "127.0.0.1"
作者: "测试作者"
剪藏时间: "2026-11-22 21:48"
标签: "剪藏, 测试"
---
```

正文里的图片被改写为 `![示意图](/i/img-188fl5.png)`，图片本体 875 字节落在同目录的 `i/` 下。

界面截图可用 `node shots.mjs` 重新生成（输出到 `test/screenshots/`）。
调正文识别时用 `node probe-find.mjs`：它只跑 `findArticle()`，打印每个测试页选中的容器（tag/class/尺寸/字数）与参考元素的尺寸，改动打分逻辑前后对比一眼就能看出差别。

---

## 七、已知限制

1. **目录授权无法自动化**：原生目录选择器必须用户手势触发。自动化测试改用 OPFS 根句柄当「库目录」，写入代码路径（`resolveFolder → getDirectoryHandle → i/ 附件 → 写 .md`）与真实库完全一致，但**首次在真实妙言库上使用仍需要你手动点一次授权**。
2. **截图剪藏只截当前可见区域**（`chrome.tabs.captureVisibleTab`），滚到屏幕外的内容截不到；跨屏内容请用框选剪藏。
3. **整篇正文识别是启发式打分**（v0.3.1 起按段落权重 + 类名语义 + 主标题锚点，见八b），多栏排版、无限滚动、整站 SPA 这类复杂页面仍可能抓偏；抓偏时可以直接**拖范围框**修正，或改用「框选剪藏」兜底。识别质量只在 5 个自建测试页上验证过，真实站点未逐一手测。
4. **图片下载受目标站限制**：需要登录或 Referer 校验的图会下载失败，此时按设置退回远程链接（正文保留原始图片地址）。
5. **依赖 Chrome 116+**，未做 Firefox / Safari 兼容。
6. **已上架 Chrome 应用商店**（v0.6.0 已审核通过并上线）：<https://chromewebstore.google.com/detail/妙言剪藏/pbdpebhchbkgmgdgdehnoppglilakiaj>；源码与上架物料仍在 `output/miaoyan-clipper/store/`，后续版本可用 `scripts/cws.mjs` 自动发版。
7. 扩展不参与 iCloud 同步冲突处理——库在 iCloud 时，文件冲突交给 MiaoYan 与系统同步处理。
8. **iCloud 目录的上下文差异**（v0.2.0 已处理）：后台 Service Worker 里可能读不到 iCloud 目录句柄/子目录，
   现已改为扩展页上下文枚举 + 写盘，并加了目录缓存；若某次仍异常，去设置页点「刷新目录列表」→「运行诊断」，把报告发回来即可定位。

---

## 八、v0.3.0 新功能：全文范围框 + 广告/推荐清理

用户反馈：「执行全文剪藏时容易把页面的广告、推荐栏也识别进去。能否选择全文时根据识别范围在页面显示范围框，
并且支持用户手工调整范围」。

### 8.1 交互

「整篇正文」不再一步剪完，而是先摆范围框：

| 操作 | 行为 |
| --- | --- |
| 8 个手柄（四角 + 四边） | 缩放范围框；框外区域被深色遮罩压暗，表示「不剪」 |
| 拖框顶的说明条 | 整体移动范围 |
| `Enter` / 「✓ 剪藏这块」 | 按当前范围剪 |
| `Esc` / 「取消」 | 放弃，什么都不存 |
| 「重新识别」 | 重新跑一次自动识别，重摆默认范围 |

说明条实时显示将剪什么：未调整时是 `将剪藏 article.post-content · 约 239 字`（直接复用识别到的元素），
拖动后变成 `将剪藏 7 个内容块 · 约 180 字`（**按框内实际内容算**，避免文案和结果对不上）。

### 8.2 两种剪藏语义

- **没调整过范围** → 直接用 `findArticle()` 识别到的元素（保留原有的高保真路径：完整结构、图注、代码块语言）
- **调整过范围** → 改按**交集**取内容：`collectBlocksInBox(box)` 收集 `BLOCK_SEL`
  （`p, h1..h6, pre, blockquote, table, figure, ul, ol, dl, hr, img, video, audio, iframe, picture`）里
  「与框的交集 ≥50% 面积，或中心点落在框内」的块，去掉被已选中祖先包含的（`ul` 里被选中的 `li` 并进 `ul`），
  克隆进一个临时 `div` 再走原有的 `cleanArticle → convert` 管线
- 框太小 / 一块都没命中时，退回 `findElementForRect(box, 28)`（框选剪藏那套「最贴合的选择器」逻辑）

这条「交集」规则是刻意的：如果按「包含」算，把框缩到文章下半部分时最深的包含元素仍然是整个 `<article>`，
剪出来跟没调整一样——范围框就变成了纯装饰。

### 8.3 自动识别先滤噪声（不依赖手工调整）

`src/content/extractor.js` 在原有 `JUNK_SELECTORS` 清理之后加两轮，都带「相对正文足够小」的护栏
（`isSmallRelative(node, root)`：`own <= max(300, root 文本长度 × 0.35)`），避免把正文本身误删：

1. `class` / `id` 命中 `AD_KEY_PATTERN`（`advert|adsense|adsbygoogle|ad-slot|promo|sponsor|recommend|related|hot-list|rank-list|广告|推荐|热榜|热文` 等）的块
2. `section/div/aside/figure` 内部有 `h1..h6`、标题文字 ≤24 字且命中 `NOISE_HEADING`
   （`相关阅读|猜你喜欢|热门排行|更多阅读|延伸阅读|评论区|关注我们|版权声明|…`）的整块

实测用例 `test/site/article-noise.html`：侧栏「热门推荐」、正文里的 `.ad-slot`「广告位：限时特惠」、
`section.guess`「猜你喜欢」、`.hot-list`「热门排行」全部剔除，5 段正文一段不少；对 `index.html` 的旧输出无回归。

### 8.4 顺带修掉的真实 bug

全文范围框一开始拖不动。排查发现页内浮层的 `.layer`（铺满视口的透明事件层，`z-index: 2147483647`）
**默认是显示的**，把手柄的鼠标事件全吃掉了，顺带也让「卡片开着时页面本身点不动」。
修法：`.layer` 的 CSS 加 `display: none`，只在「框选剪藏」模式里显式 `display: block`。

### 8.5 未实测 / 已知边界

- 真实站点上的**自适应布局**（同一篇文章在不同宽度下换行不同）拖动后「交集」判定会跟着变，属于预期行为，但没有在真实站点上逐一手测
- 无限滚动 / 虚拟列表页面里，视口外还没渲染的块不在 DOM 里，框拖过去也不会被收进来
- iframe 里的正文拿不到（跨域），框住也没内容

---

## 八b、v0.3.1 正文识别改造：默认框落在正文，而不是「字最多的块」

**需求（用户原话）**：「全文识别时，建议提高识别智能性，默认框选在最重要的正文部分，并在此基础上支持用户修改，减少人工操作频率。」

### 8b.1 先量了旧实现的短板

写了 `test/probe-find.mjs`，在内容脚本的隔离世界里直接调 `findArticle()`，打印每个测试页选中的容器：

| 测试页 | 旧实现选中 | 问题 |
| --- | --- | --- |
| `index.html` | `article.post-content` | 正常 |
| `article-noise.html` | `article.post-content` | 正常 |
| `hard-comments.html` | `div.post-content` | 正常（评论区更长但没抢到） |
| `hard-sidebar.html` | `main.reading` | 正常 |
| `hard-generic.html` | **`body`（整页 1200×888）** | 类名全是 `a9/b7/c3/d5`，白名单 `CANDIDATE_SELECTORS` 一个都不命中 |

根因：旧实现只在「类名/标签看起来像正文」的候选里挑，**没有语义类名的站点直接退化成整页**。

### 8b.2 改成按段落给容器打分（Readability 的思路，但更轻）

`src/content/extractor.js` 新增：

- `PARA_SELECTOR = 'p, pre, blockquote, td, dd'`；每个段落按 `1 + min(len/100, 3) + min(标点数, 24) × 0.4` 计权重，再乘 `1 − 链接密度`
- `scoreByParagraphs()`：段落权重**全量记给父容器、半量记给祖父容器** → 不依赖 class 语义也能定位正文层
- `contentScore(el, paraScores, useFallback, h1)`：段落分 × 链接密度 × `JUNK_PATTERN`(×0.12) / `GOOD_PATTERN`(×1.35) × 标签语义（`article`×1.3、`main`×1.15、`body`×0.45）× 紧致度 × **主标题锚点（含主 h1 的容器 ×1.8）**
- `primaryHeading()`：取与 `document.title` / `og:title` 对得上的 `h1`（`H1_JUNK` 只跳过站点外壳，**不跳过 `<article><header><h1>`**）
- `expandToTitle()`：正文容器本身不含标题、而旁边是标题块时，上探一层把标题带进范围
- `useFallback`：只有整页一个可用段落都没有时，才退回「字数 + 段落数」口径

### 8b.3 两个真实 bug（改了才发现）

1. **兜底口径反噬**：一开始对所有「没有段落分」的容器也走 `log(len) × 6 + 段落数 × 3`，结果 `body` 因为它字多反超正文容器 —— `index.html` 直接从 `article.post-content` 退回 `BODY`。改用 `useFallback` 参数后修正。
2. **静默替换**：插入 `primaryHeading()` 时用的锚点字符串已被前一次改动改掉，`str.replace` 什么也没做、也不报错，直到运行时抛 `primaryHeading is not defined` 才暴露。此后每处替换都加 `assert s.count(anchor) == 1`。

### 8b.4 改造后实测

| 测试页 | 选中容器 | 尺寸 | 备注 |
| --- | --- | --- | --- |
| `index.html` | `ARTICLE.post-content` | 1184×704 | 不变 |
| `article-noise.html` | `ARTICLE.post-content` | 640×780 | 不变 |
| `hard-comments.html` | `DIV.post-content` | 660×487 | 评论区 540 字 > 正文 425 字，仍选正文 |
| `hard-sidebar.html` | `MAIN.reading` | 620×539 | 侧栏全链接列表被排除 |
| `hard-generic.html` | `DIV.a9` | 640×459 | **从整页改到正文列**，评论与侧栏都在范围外 |

新增 3 个 fixture（`hard-comments.html` / `hard-sidebar.html` / `hard-generic.html`）与 I 组 5 项断言，全量 **60/60 通过**（v0.3.2 又加 J 组 3 项，现为 63/63）。

`test/screenshots/07-无语义类名-默认框.png` 就是 `hard-generic.html` 的对照图：默认框正好落在正文列（标题 + 5 段），右侧「热门文章」、下方「读者讨论」、页脚都在框外。

---

## 八c、v0.3.2 修复：保存不再反复要授权 + 记住最近目录

用户反馈（原话）：「1.每次保存时都提示目录授权过期 2.建议优化：参考目录带出最近选择的一个，不要每次重新选」。

### 8c.1 为什么「每次」都要授权

旧实现 `writer.saveDraft()` 的第一步是 `ensurePermission(root, 'readwrite', requestPermission)`：
**先查权限，查不到就直接返回 `PERMISSION_REQUIRED`**。而页内浮层的保存链路是

```
浮层 → Service Worker（无用户手势）→ 写盘失败 → pendingSave 转交侧栏
     → 侧栏 handlePendingSave（由 storage.onChanged 触发，同样无手势）
     → requestPermission() 抛 NotAllowedError → 依然 PERMISSION_REQUIRED
```

Chrome 只允许在**用户手势**里弹授权框，这条链路上没有任何一次手势，于是每次都停在「授权过期」——
而且永远不会真正拿到授权，下一次保存重复同一轮。

### 8c.2 改成先写、写不动再申请

| 环节 | 旧 | 新 |
| --- | --- | --- |
| 写盘入口 | 先 `ensurePermission` 否决 | 直接写（`writeOnce`），只在抛 `NotAllowedError`/`SecurityError` 时才认为缺权限 |
| 申请授权 | 前置查询时申请（多数场景没有手势） | 写失败后在**当前手势里** `requestPermissionNow()`，成功则原地重试一次 |
| 无手势场景 | 直接报「授权过期」 | 返回 `NEED_CONFIRM`，侧栏授权卡按钮变「确认授权并保存」，点一次即可 |
| 面板打开时 | 权限非 granted 就弹授权卡、藏起草稿卡 | 只显示「待确认授权」状态，不抢界面；草稿照常可编辑，真正失败时才弹卡 |

`listFolders()` 同样去掉了前置权限判断——直接枚举，真的读不动才报错并给出原因。

### 8c.3 记住最近用过的目录

保存成功后 `saveDraft()` 把本次分类写进 `settings.lastFolder`；侧栏与页内浮层的「目标目录」都按
`lastFolder → defaultFolder → 库根目录` 的顺序预选。设置页的「默认目标目录」只作为兜底。

### 8c.4 验证

新增 J 组 3 项断言（保存后 `settings.lastFolder === '测试/资料'`、面板重开带出、浮层预选），全量 **63/63 通过**。
**未实测**：真实 iCloud 目录下「权限退回 prompt → 点一次确认 → 长期有效」的完整人工路径，
自动化用的是 OPFS 句柄（`queryPermission` 恒为 `granted`），无法复现 Chrome 的授权弹框。

## 八d、v0.3.2 完整审计（7 个子 agent · 186 条用例）

用户要求：「拉几个子 agent 做一次完整测试，包含写测试用例，执行测试、测试结果审查；功能测试 + 真实场景（连续保存多篇、目录为本地/iCloud/NAS）+ 隐私安全 + 按 Chrome 商店要求测试」。

### 8d.1 怎么做的

四阶段、7 个 agent：静态合规与隐私代码审计（2 个并行）→ 用例设计（1 个，写 `test/audit/TEST-CASES.md`）→ 三组并行实测（连续保存与目录形态 / 边界鲁棒性 / 隐私安全）→ 独立复核（1 个，逐条复验并给发布阻断清单）。

产物全在 `output/miaoyan-clipper/test/audit/`：`SUMMARY.md`（汇总）、`TEST-CASES.md`（186 条矩阵）、
`static/`、`security/`（含 `dynamic/` 运行时实测）、`continuous/`、`robust/`、`matrix/`、`REVIEW.md`（复核）、`review/`（复核探针）。

### 8d.2 主要结论

- **商店红线全绿**：零远程代码、零混淆、零埋点、零 CDN；`marked` 本地打包带 MIT 许可；唯一网络出口是下载文章里的图片（`credentials:'omit'`）；单一用途成立；打包 zip 已备好（85KB，已排除 `test/`）。
- **4 条 P0 数据完整性缺陷（阻塞上架，macOS 默认盘上必现）**：
  1. `pendingSave` 只写不删 → 每开一次侧栏重复生成一篇笔记；
  2. `myimg://N` 占位符前缀碰撞 → ≥11 张图时丢图且链接错位；
  3. 并发同名保存静默覆盖，双方都报「已保存」；
  4. 大小写 / Unicode 归一化不敏感的盘上直接覆盖已有笔记。
- **P1 安全与体验 12 条**：最重的一条是网页脚本能读剪藏浮层（`open` shadow root）**并能代你点保存、把笔记写进它指定的目录**；其余含图片下载不拦内网、iframe 正文静默丢失、截图整屏 base64 撑爆 `storage.session` 配额等。
- **P2 建议修**：死代码 5 处、emoji 标题截断出 `U+FFFD`、`file://` 静默失败、浮层状态复位等。
- **已确认的正面结论**：不外发任何数据；页面拿不到扩展；密码框/隐藏域/表单值不进笔记；预览经白名单消毒无执行；路径穿越被 `getDirectoryHandle` 挡住；写盘 `swap+rename` 在本地/iCloud/SMB 三种形态下均无半截文件。
- **一处纠错**：初版静态审计建议「删 `activeTab`」是**错的**——截图剪藏只能靠 `activeTab` 授权，删了必坏。
- **覆盖空白**：截图剪藏在发布版 manifest 下从未端到端跑通（必须真人右键菜单手势），上架前需人工补测留证。

### 8d.3 待办

P0 修复、P1 修复、上架物料（隐私政策 URL、权限理由、截图规格、版本说明）**都还没做**，等排期。
完整清单与验收标准见 `output/miaoyan-clipper/test/audit/SUMMARY.md`。

---

## 八e、v0.4.0 修复轮：按审计清单 P0 → P1 → P2 顺序修完

审计（八d）共报 4 条 P0、12 条 P1、9 条 P2，全部按顺序修完，并给每条补了回归断言。

### 8e.1 P0 数据完整性（4 条，全部是「会伤到你的笔记」）

| 编号 | 问题 | 修法 | 回归断言 |
| --- | --- | --- | --- |
| P0-1 | `pendingSave` 只写不删 → 每开一次侧栏多生成一篇 `标题 (2).md` | 面板消费时立刻 `chrome.storage.session.remove('pendingSave')`，并用 `handledPending` 按时间戳去重（onChanged 与 init 不会各存一次） | K1 |
| P0-2 | 图片占位符 `myimg://1` 用 `split` 替换 → 会连带命中 `myimg://10`、`myimg://11`，11 张以上丢图且链接错位 | 改成带完整序号的正则 `IMAGE_MARKDOWN_RE` / `IMAGE_PLACEHOLDER_RE`，先算出全部替换值再整体替换 | K2 |
| P0-3 | 并发保存同名 → 两边都报「已保存」，实际后者覆盖前者 | `withSaveLock()` 用 Web Locks（`navigator.locks.request('miaoyan-save:'+key)`）把「列目录→取名→写入」串行化 | K3 |
| P0-4 | 大小写/Unicode 归一化不敏感的盘上直接覆盖同名笔记 | 新增 `nameKey()`（NFC + 小写）用于比较，`pickUniqueName` / `uniqueFileName` 全部改用它 | K4 |

补充一条实测教训：`createWritable({exclusive: true})` 在 OPFS 上**拦不住**第二个写者（第二个写者读到 size=0 会以为文件不存在），所以并发必须靠锁，不能靠独占写。

### 8e.2 P1 安全与体验（12 条）

| 编号 | 问题 | 修法 |
| --- | --- | --- |
| P1-5 | 浮层 `mode:'open'` shadow root + 固定 id → 网页能读你的目录树、还能替你点保存 | 改成 `closed` shadow root + 每次注入随机宿主 id + `data-miaoyan-clip` 标记；页面主世界读不到任何内部内容 | 
| P1-6 | `isHidden` 只认内联样式 → `.d-none`、`sr-only`、未展开 `<details>` 的内容被剪进笔记 | 三层判断：属性/内联/隐藏类名 → 未展开 details（按 DOM 结构判断）→ `getComputedStyle`（只对带 class/id 的元素读，WeakMap 缓存） |
| P1-7 | 正文在 iframe 里时静默丢失 | 检测含文字的 iframe，范围框上直接提示「正文可能在 iframe 里，本扩展不会自动进入」 |
| P1-8 | 图片下载无超时/上限/私网拒绝 | `isPrivateUrl()` 拒绝内网地址（默认）、15 秒超时、10MB 上限、只收 `image/*`、重定向后再查一次；下载失败改成 `（图片下载失败：alt）`，不再产出畸形链接 |
| P1-9 | 目录列举失败被当成空集合继续写盘 | 列举失败直接返回 `code:'LIST_FAILED'`，不再冒险写 |
| P1-10 | 整屏截图 base64 存 session（可达 95MB，超 10MB 配额后被静默吞） | 截图统一转 JPEG 并限制最长边 1600，裁剪后超过 4MB 直接提示；session 写失败会回错误而不是静默丢 |
| P1-11 | `scripting` 权限零使用 | 从 manifest 删除 |
| P1-12 | 截图剪藏从未端到端跑通 | 补了 N 组：截屏→框选→JPEG 草稿→附件落盘（见 8e.4 的说明） |
| P1-13 | 缺上架物料 | 新增 `store/listing.md`、`store/privacy.html`、`PRIVACY.md`、宣传图与 5 张详情页截图 |

### 8e.3 P2 建议修（9 条）

死代码 5 处（`MYCLIP_TRIGGER` / `captureArticle` / `MYCLIP_CANCEL` / `textToMarkdown` / `clearFolderTree` 最后一个已改用在「清除授权」里）、`.row[hidden]{display:none}`、文件名截断改按 Unicode 码点（emoji 不再被劈成半个代理项）、`file://` 与 `chrome://` 右键剪藏不再静默失败（角标 `!` 提示）、`escapeText` 补 `& < >` 转义、`safeUrl` 拒掉协议相对地址 `//evil.com`、浮层状态复位（`hideAll()` 里 `dragging=false`，下次框选不会被上一次残留卡住）、来源地址里的 token/签名脱敏、`waitSaveResult` 改后台轮询（保存按钮立刻恢复可用）。

### 8e.4 验证与「未实测」的边界

- 端到端测试从 63 项加到 **78 项全绿**（K/L/M/N 四组覆盖本轮修复）。
- **未实测**：截图剪藏的 `activeTab` 授权路径。`chrome.tabs.captureVisibleTab` 需要用户手势授予的 activeTab 或 `<all_urls>` 主机权限，自动化环境模拟不出扩展图标/右键菜单的点击。所以 N2 组是用一份 `host_permissions=<all_urls>` 的**临时副本**跑通代码链路的；发布版 manifest 下的真实手势路径**需要你人工点一次扩展图标验证**。N1 组验证了没有授权时不会静默失败，而是提示「截图失败，可能需要先点击一次扩展图标」。
- **未实测**：Chrome 116 的最低版本冒烟（本机是 158）；Firefox/Safari 兼容；多窗口、隐身窗口、扩展升级迁移。
- `isHidden` 的性能代价在本机合成 DOM 上量过（36000 元素中位 10.8ms，无 class 时 0 次 `getComputedStyle`），真实站点未用 DevTools 性能面板量。

## 八f、v0.5.0 交互优化：像印象笔记那样「一点就剪」

用户反馈的四条（m02105 原文）：保存后浮层该自动关；点扩展图标看到的还是上一篇预览；
剪藏只能从右键发起，不符合印象笔记的习惯；请调研主流剪藏插件还有哪些能提升体验。

### 8f.1 先做了调研（主流剪藏插件都怎么做）

| 插件 | 值得抄的地方 |
| --- | --- |
| [Evernote Web Clipper](https://evernote.com/en-us/learn/how-to-use-evernote-web-clipper) | **点工具栏图标就能发起剪藏**；全文/片段/书签/截图多模式；可自定义快捷键；范围可用 +/- 与方向键微调 |
| [Obsidian Web Clipper](https://www.makeuseof.com/how-to-use-obsidian-web-clipper/) | 保存时可选「高亮 / 链接 / 作者 / 标签 / 选中文本」；模板化 frontmatter；高亮后的 Clip behavior 可配置 |
| [Readwise Reader](https://blakecrosley.com/guides/design/readwise-reader) | 偏阅读与高亮导出，交互围绕「读 → 高亮 → 导出」 |
| [Notion Web Clipper](https://www.notion.com/zh-cn/help/web-clipper) | 截图 / 选中文本 / URL 三种入口；支持属性与标签 |

本轮采纳的：**工具栏图标发起剪藏**、**快捷键**、**保存后 toast + 继续剪藏**、**标签记忆**、**已剪藏页面角标**。

### 8f.2 落地清单

| 反馈 / 调研结论 | 落法 |
| --- | --- |
| ① 保存成功后浮窗应自动关闭 | `onSave()` 成功分支改为 `hideAll()` + `showToast('已保存到 …', {action: 继续剪藏})`；面板代存路径（`pollSaveResult`）同样处理 |
| ② 点图标看到的还是上一篇预览 | 面板按后台记的 `lastActiveUrl`（切标签页 / 当前页换网址都会更新）比对草稿来源；不是当前页就显示「这是上一次剪藏的内容（URL）」+「剪藏当前页面」按钮 |
| ③ 只能右键发起，不像印象笔记 | `chrome.action.onClicked` 直接发起整篇剪藏（**必须先 `sidePanel.setPanelBehavior({openPanelOnActionClick:false})`，否则 action 点击永远不触发**）；再补 3 组快捷键；侧边栏空状态也给「剪藏当前页面」 |
| ④ 调研结论（印象笔记/Obsidian/Notion） | 保存后 toast 带「继续剪藏」；标签记忆并预填；剪藏过的页面打 ✓ 角标；面板空状态/旧草稿提示条都能直接剪当前页 |

### 8f.3 两个真实的坑

1. **Chrome 每个扩展最多 4 个建议快捷键**，超了扩展直接加载失败：
   `Extensions.loadUnpacked` 报 `Too many shortcuts specified for 'commands': The maximum is 4.`
2. **与浏览器保留键冲突的快捷键会被静默丢弃**（`chrome.commands.getAll()` 里 shortcut 为空，不报错）。
   原本给框选选了 `⌘+Shift+A`，实测被 Chrome 占用（macOS 上 A/B/C/D/F/G/H/J/L/M/N/R 全被占）；
   写了个探针 `test/probe-shortcuts.mjs` 逐个试，改用 `⌘+Shift+K`（框选）与 `⌘+Shift+P`（截图）。

### 8f.4 验证

- 端到端测试从 78 项加到 **87 项全绿**，新增 O 组 9 项：快捷键已注册、点图标发起剪藏出范围框、
  面板「剪藏当前页面」按钮、保存后浮层自动关闭、提示条带「继续剪藏」、✓ 角标、标签记忆、
  下次剪藏预填标签、上一篇草稿提示条。
- 商店素材同步更新：`store/make_store_assets.py` 可从 `test/screenshots/` 重新合成 5 张详情页截图与 2 张宣传图
  （界面改动后跑 `node test/shots.mjs && python3 store/make_store_assets.py`）。
- **未实测**：真实点击扩展图标的手感（自动化只能走 `MYCLIP_START_ACTIVE` 等价路径）、快捷键在用户键盘布局上的实际触发、
  Chrome 快捷键设置页里改键后的行为。

## 八g、数据使用声明口径更正（2026-11-23，上架前自查）

**上一轮我给的「四项全选『不收集』」是错的，这里更正。**

依据 Chrome 官方《[User Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)》：

- 第 2 问把「**Clipping or scraping content from a website that the user visits, such as taking screenshots or capturing data from a web page**」
  直接列为「处理用户数据」的例子 —— 本扩展正是干这个的；
- 第 3 问：**「Yes. Extensions are required to disclose how they handle user data, even when data is processed or stored locally
  on a user's device and is not transmitted to external servers or third parties.」**
  → 「只在本机处理」**也要如实披露**，不披露按「披露与实际行为不一致」处理（官方明确：可导致下架、停用用户群、封禁开发者）。

**正确勾法**（第一组 9 项）：

| 披露项 | 勾 | 本扩展的事实 |
| --- | --- | --- |
| 网站内容 | ✅ | 剪藏时读取当前页可见文字与图片；截图剪藏截取可视区域；本机转 Markdown 写进你的妙言库 |
| 网络记录 / 浏览活动 | ✅ | 记录被剪藏页面的网址与剪藏时间（写进 frontmatter）；会话内留一个「最近活动标签页网址」用于提示草稿是否当前页；不留浏览历史、不上传 |
| 用户活动 | ✅ | 保存你在侧边栏输入的标题与标签（写进笔记）、剪藏过的标签页 ✓ 角标（仅会话内）；不记录网页上的点击/滚动/击键 |
| 个人身份信息 / 健康信息 / 财务和付款 / 身份验证信息 / 个人通讯 / 位置 | ❌ | 不涉及；不读密码框、隐藏元素、Cookie、表单值 |

**第二组「有限使用认证」全部勾上**（不出售、不向第三方传输、不用于单一用途之外、符合隐私实践政策等）。

**一致性要求**（官方 FAQ 末条：后台披露、隐私政策、扩展行为三者不一致即违规）→ 已同步改写：

- `output/miaoyan-clipper/PRIVACY.md` 与 `store/privacy.html`：新增「一、数据使用披露」表格，
  结论句改为「只在你自己的电脑上处理三类数据（网站内容、浏览活动、用户输入的标题与标签），不上传、不共享、不出售」；
- `store/submit-checklist.md` §3.5 重写为 9 项逐项勾法 + 认证组清单；`store/listing.md` 与本 README 的旧措辞同步修正；
- `test/audit/SUMMARY.md` 的「不收集、不外发」结论加更正注（那是「不外发」的事实结论，不是商店表单的勾法）。

已重新打包 `output/miaoyan-clipper-0.5.0-store.zip`（含新 `PRIVACY.md`，32 文件）、更新 GitHub Release v0.5.0 附件，
并把新隐私政策推上线：<https://gu70619052.github.io/miaoyan-clipper/>（已验证 HTTP 200 且含「数据使用披露」章节）。

## 八h、商标与版权：结论是要声明，声明放哪、怎么写（2026-11-23）

用户问：「这个插件只是基于妙言 App 开发的，与 App 本身无关，要不要在简介里声明？」——**要声明**。

**依据**

| 来源 | 原文要点 |
| --- | --- |
| 商店《Impersonation & Intellectual Property》第 1 条 | 「Don't pretend to be someone else, and don't represent that your product is authorized by, endorsed by, or produced by another company or organization, if that is not the case.」 |
| 同政策第 5 条 | 不得侵犯他人专利、商标、商业秘密、著作权等权利 |
| `tw93/MiaoYan` 的 LICENSE | **MIT License, Copyright (c) 2022 Tw93** —— 允许再分发，但**要求保留版权与许可声明** |

**评估结论**

1. 名称里的「妙言」属于**指示性合理使用**（用他人商标指明兼容对象），本身不侵权；
   风险点不是「用了名字」，而是**是否让人以为有授权/背书**。
2. 扩展图标取自妙言 App：法律上可用（MIT 允许再分发），但必须**保留版权与许可声明** →
   已在简介、审核备注、隐私政策、扩展设置页四处写明图标来源与 MIT 许可。
3. 未使用妙言任何源代码，只使用其公开的**文件格式约定**（Markdown + frontmatter + `i/` 附件目录），
   格式与方法不受著作权保护。
4. **绝对不能出现的措辞**：「妙言官方插件」「由妙言团队开发」「官方出品」「受妙言官方推荐」「妙言授权」。

**已落地**

- `manifest.json`：新增 `author: gu70619052`、`homepage_url: https://github.com/gu70619052/miaoyan-clipper`
  （后者同时满足商店「有限使用声明须挂在扩展自有网站」的要求），`description` 末尾加「（第三方开发的非官方插件）」。
- `store/listing.md`：名称/简短说明/详细说明首句都加了非官方声明；新增「4b. 关于商标与版权」评估表；详细说明末尾加「致谢与许可」。
- `store/submit-checklist.md`：§3.2 简短说明改写；§3.4.4 审核备注加中文非官方声明 + 图标来源 + **英文版声明**（全球审核员先看英文）。
- `PRIVACY.md` 与 `store/privacy.html`：新增「七、商标、致谢与许可」，并附商店要求的有限使用肯定式声明原句
  （*The use of information received from Google APIs will adhere to the Chrome Web Store User Data Policy, including the Limited Use requirements.*）。
- 扩展内：`src/options/options.html` 底部加一行非官方声明 + `src/options/options.css` 加 `.legal` 样式；扩展 `README.md` 加「致谢与许可」。
- 回归：改动后 e2e **87/87 全绿**；商店 zip 重打包；GitHub 仓库与 Pages 同步更新。

**保守备选**：如果不想在名字里带「妙言」，可把应用名称改成 `妙言剪藏（非官方）· 网页存笔记`（≤45 字符），
代价是搜索命中率下降；本轮默认保留「妙言剪藏」+ 简介声明。

## 九、v0.2.1 修复记录（诊断报告定位出的真正根因）

**v0.2.0 的根因判断有错，这里更正。** v0.2.0 推测是「后台 Service Worker 与扩展页上下文对 iCloud 目录表现不一致」，
所以把枚举和写盘都挪到了扩展页。用户按 v0.2.0 实测仍报错，并贴回了设置页的「运行诊断」报告：

```json
【设置页上下文】 "hasHandle": true, "rootName": "Documents",
                 "readPerm": false, "readwritePerm": false, "folders": 0,
                 "listError": "妙言库目录权限已失效，请重新授权"
【后台 Service Worker 上下文】 完全相同的读数（readPerm/readwritePerm 都是 false）
```

两个上下文**读数一致**，说明问题不在上下文差异，而是**目录句柄的权限状态本身不是 granted**
（句柄还在、`rootName` 仍是 `Documents`，但 `queryPermission()` 返回 `prompt` 或 `denied`）。
浏览器重启、扩展重载、iCloud 目录重新挂载都会造成这种「退回待确认」状态。

| 用户反馈 | 真实根因 | 修法 |
| --- | --- | --- |
| 悬浮窗保存依旧报「授权已过期」 | 句柄权限状态是 `prompt`（不是上下文问题）；保存流程里没有用户手势，Chrome 不会弹授权框，所以永远拿不到权限 | 新增「**重新授权此目录**」按钮：在点击手势里对**已有句柄**调用 `handle.requestPermission()`（不用重新选目录）；授权成功后自动续存之前失败的草稿 |

同时补的观测能力（因为这次是靠诊断报告才定位到根因）：

- 诊断输出新增 `permissionState.read / permissionState.readwrite`（原始的 `granted|prompt|denied` 字符串，而不是布尔值）
- 诊断输出新增 `readProbe`（对句柄做一次轻量 `values()` 枚举，捕获错误名）——用来区分「权限没给」和「目录本身读不到（例如系统层面被拦）」
- 侧栏 chip 按状态显示：`已授权` / `需重新授权` / `权限被拒绝`；面板授权卡文案随状态变化，只有 `prompt` 才推荐「重新授权此目录」

**未实测的部分**：自动化测试用的是 OPFS 句柄，它的 `queryPermission()` 恒为 `granted`，
所以 `prompt → 点击按钮 → Chrome 弹框` 这条真人交互路径只能在真实 iCloud 目录上验证；测试只覆盖了
`queryPermissionState` / `requestPermissionNow` 两个函数与「granted 时按钮隐藏」。

---

## 九b、v0.2.0 修复记录（用户实测反馈的三个问题）

| 用户反馈 | 根因 | 修法 |
| --- | --- | --- |
| 授权后网页浮层的目标目录只有「（库根目录）」 | 浮层通过后台 Service Worker 枚举 iCloud 目录，后台上下文枚举不到子目录 | 目录枚举改到扩展页上下文 + 目录树缓存（`folderTree`）供浮层直读；浮层读不到时如实报错而不是假装只有库根 |
| 面板里能选子目录，保存却报「授权已过期」 | 落盘跑在后台上下文，iCloud 句柄权限/可用性不一致 | 写盘改到扩展页上下文（点击保存即用户手势，可重新授权）；后台失败时转交侧栏代存，浮层自动轮询结果 |
| 扩展图标与 UI 风格和妙言 app 不一致 | 自绘橙红图标 + 蓝强调色 | 图标改为妙言 app 图标（`app.icns` → 16/32/48/128）；面板/设置页/浮层统一妙言配色（青绿 `#4DBF9E` 强调色 + 暖色深浅两套），并修好 logo 图片路径 |

## 八i、v0.6.0 权限最小化：安装不申请任何网站访问权

**你的判断**（m02674）：「声明主机权限会减慢审核速度，我建议是先按需注入权限」。按此执行。

### 8i.1 改了什么

| 项 | v0.5.0 及以前 | v0.6.0 |
| --- | --- | --- |
| `host_permissions` | `http://*/*`、`https://*/*`（装完就能读所有网站） | **删掉**；只在 `optional_host_permissions` 里声明，用户用到才给 |
| `content_scripts` | 静态注入到所有 http/https 页面 | **删掉**；用户手势 → `activeTab` → `chrome.scripting.executeScript` 按需注入 |
| 新增权限 | — | `scripting`（注入用）、`tabs`（读当前页标题/网址，判断能否剪藏与写来源） |
| 图片下载 | 直接 fetch（有全站权限） | 跨站图片按站点申请可选权限；拒绝则保留原始链接，笔记照常保存 |
| 设置页 | 无权限视图 | 新增「网站访问权限」卡片：列出保留的站点、一键全部撤销 |

### 8i.2 实现要点

- `src/lib/permissions.js`（新）：`originPattern(url)`、`getGrantedOrigins()`、`hasOriginPermission(url)`、
  `requestOriginPermissions(urls)`（必须在用户手势里）、`removeOriginPermissions()`、
  `pendingImageOrigins(draft)`（同源图片免申请 —— activeTab 已覆盖，只有跨站 CDN 图才算缺权）。
- `service-worker.js`：`ensureContent(tabId)` 注入三个脚本；`startClipOnTab()` 改成 async 并返回 `{ok,error}`，
  注入失败（无权限/不可访问页）→ 角标 `!` + 打开侧栏提示；`MYCLIP_START_ACTIVE` 支持带 `tabId`。
- `panel.js`：`clipActiveTab()` 先查站点权限，缺则在点击手势里申请；`save()` 保存前按需申请图片站点权限，
  被拒则以 `forceRemoteImages: true` 继续保存。
- `writer.js`：`writeOnce()` 支持 `opts.forceRemoteImages`；失败时判断是不是缺站点权限并回报
  `remoteImages` / `imagePermissionNeeded`，界面据此提示「N 张图片未下载到本地」。
- 内容脚本 `content.js` 顶部本来就有 `window.__miaoyanClipLoaded` 幂等守卫，按需注入重复执行不会重复注册监听器。

### 8i.3 测试怎么跑（重要）

自动化**模拟不出「点扩展图标」这个用户手势**，所以 `test/e2e.mjs` 里 `cloneExtension()` 会把扩展复制到临时目录、
给副本补上 `host_permissions` + `content_scripts`（仅本机测试端口），用来触发剪藏。
正式包的最小权限由 **P1 断言**守护：读 `manifest.json` 断言它既没有 `host_permissions`、也没有 `content_scripts`，
并且 `activeTab`/`scripting` 在 `permissions` 里、`optional_host_permissions` 恰好两项。

### 8i.4 验证

- 端到端测试 **90/90 全绿**（A2/B14/C11/D7/E3/F3/G6/H9/I5/J3/K6/L4/M2/N3/O9 之外，新增 P 组 3 项：
  P1 正式包权限最小、P2 权限工具函数（pattern 归一 / 同源免申请 / 跨站算缺权）、P3 设置页权限卡片可撤销）。
- **未实测**：真实点图标的 activeTab 授权链路（只能人工验）、用户在权限弹窗点「允许/拒绝」两种走向的真实 UI 反馈
  （自动化里 `chrome.permissions.request` 无弹出时会挂住，已在探针里确认）。

---

## 八j、审核监控加固：从「状态指纹」改成「事件记账」（2026-11-24）

**背景**：v0.6.0 已过审上线，launchd 定时检查按预期在 12:33 发了一条 QQ 通知。
你的要求：「用于以后每次迭代的上架通知」——所以要确认它**下次发版时还会再发**，而且**只发一次**。

### 8j.1 原方案的真实缺陷

旧版用「提交版本\|提交状态\|已发布版本\|已发布状态」拼一个指纹去重。问题出在商店的 `fetchStatus` 语义上：
**提交成功后 `submittedItemRevisionStatus` 会被清空**。同一个版本在两次轮询里可能呈现两种指纹——

| 轮次 | API 返回 | 旧指纹 |
| --- | --- | --- |
| T1（刚过审） | `submitted=PUBLISHED(0.6.1)`、`published=PUBLISHED(0.6.0)` | `0.6.1\|PUBLISHED\|0.6.0\|PUBLISHED` |
| T2（半小时后） | `submitted=NONE`、`published=PUBLISHED(0.6.1)` | `?\|NONE\|0.6.1\|PUBLISHED` |

两个指纹不同 → **一次上线会发两条 QQ**。旧版还漏掉了 `STAGED`（过审待发布）、`PUBLISHED_TO_TESTERS`、
`CANCELLED`，以及 API 顶层两个布尔位 `takenDown`（被下架）、`warned`（政策警告）。

### 8j.2 现在的模型：记「发生过什么事件」，不是「当前状态长什么样」

| 事件 | 事件键 | 什么时候产生 |
| --- | --- | --- |
| 上线 | `live\|<版本>` | `PUBLISHED` / `PUBLISHED_TO_TESTERS`；`STAGED` 也算（键与上线一致，之后真正发布不会重复报） |
| 被拒 | `rejected\|<版本>\|#n` | 该版本被拒；`n` 是第几次被拒，同一次只报一次，改好后通过会再发一条「上线」 |
| 被下架 | `takenDown\|<版本>` | `takenDown` 刚变 true 的那一轮 |
| 政策警告 | `warned\|<版本>` | `warned` 刚变 true 的那一轮 |

- 优先级 `takenDown > rejected > warned > live`；同一轮里既有被拒又有警告会发两条（两件事分开说）。
- 已记账的事件键不重复通知（上限 50 条）；老状态文件里的旧指纹会在加载时自动迁移成事件键
  （`?|NONE|0.6.0|PUBLISHED` → `live|0.6.0`），**迁移后不会把 v0.6.0 重发一遍**（已实测）。
- QQ 发成功才记账；发失败不记账也不更新快照，下轮重试，不丢结果。

### 8j.3 顺带修掉的两个隐患

- **fetch 没有超时**：原来 API 挂住会无限等待（演练时真的卡死了）。现在 token 与 fetchStatus 两处都加了
  `AbortSignal.timeout(20_000)`。
- **查询失败仍返回 0**：launchd 看不到失败。现在失败时 `process.exitCode = 1`。

### 8j.4 测试

```bash
cd output/miaoyan-clipper
node test/review-check.test.mjs   # 33/33 单测
node test/review-check.e2e.mjs    # 25/25 离线端到端
```

`e2e` 起一个本地假 API 服务器（按脚本依次返回不同状态）+ 一个假 `qq-send`（把消息写进临时文件），
跑完 8 段场景：旧状态首跑不重发 → 审核中不打扰 → 新版本上线发一条 → 同状态再跑不发 → 再下一版又发一条 →
被拒发一条且反复查不重发 → 改好后通过再发一条 → API 报错时连续两次才告警且退出码非 0。

### 8j.5 现在的实际状态

- launchd 任务 `com.guxueyichen.miaoyan-cws-review` 每 **2 小时**跑一次（`StartInterval = 7200`，2026-11-24 按你的要求从 30 分钟调低），最近一次 `last exit code = 0`。
- 状态文件 `~/.dsh/state/miaoyan-cws-review.json` 现有 `live|0.6.0`（v0.6.0 已报过，不会再报）。
- 下次提 v0.6.1 并过审 → 会再发一条「✅ 妙言剪藏 v0.6.1 审核通过，已经上线」。

---

## 八k、v0.7.0 剪藏质量：正文识别换引擎 + 公式保真 + 归档提效（2026-11-24）

**你的拍板**（m04403）：竞品调研后选 A1（Defuddle 正文识别）+ A2（数学公式保真）+
B2（按域名自动归档，你补了一句「b2建议可选关闭」）+ C1（双链插入器），一次发 v0.7.0 走完整流程。

### 8k.1 四项改动

| 项 | 做法 | 你能感觉到什么 |
| --- | --- | --- |
| A1 正文识别 | 引入开源提取器 **Defuddle 0.19.13**（MIT，Obsidian 官方剪藏器同款），完整打包进扩展本地运行；自研打分保留做校验与兜底 | MDN / 文档站 / 结构复杂的博客，默认框落得更准 |
| A2 数学公式 | `converter.js` 新增 MathML / KaTeX / MathJax / `<script type="math/tex">` 四种来源的 LaTeX 提取 | 公式变成 `$…$` / `$$…$$`，在妙言里直接渲染 |
| B2 域名归档 | `src/lib/autofolder.js`（新）+ 设置页规则表 + 站点黑名单 | 打开后「哪个网站存哪个分类」自动选好，**默认关闭** |
| C1 双链 | `src/lib/notes.js`（新）枚举库里 `.md` 标题 + 侧边栏「插入双链」浮层 | 光标处一键插入 `[[已有笔记标题]]` |

### 8k.2 A1 的关键取舍：只信 Defuddle 的「同步模式」

Defuddle 有个 `useAsync` 选项（**默认 true**），打开后它会把页面内容交给第三方服务
（FxTwitter 之类）异步取回。**这与「除图片下载外不发任何请求」的隐私承诺和商店数据声明直接冲突**，
所以：

- `src/content/extractor.js` 里 `DEFUDDLE_OPTIONS.useAsync = false` 写死，`includeReplies: false`；
- 测试 **Q7** 除了断言这个常量为 `false`，还把页面里的 `window.fetch` 打桩，
  跑一次完整剪藏后断言 `fetchCalls === 0`；
- 只用 `new Defuddle(document, opts).parse()` 这条同步路径，不引 `defuddle/full`
  （那份多带 temml/turndown/linkedom，体积翻倍且我们不需要）。

### 8k.3 D1 回归：先证明它真的更准，才敢切

按你定的验收口径，抓了 **17 个真实文章页**存成离线 fixture（`test/site-real/`，
`node test/real-fetch.mjs` 可重抓；这些 HTML 是第三方内容，不进 git、不进商店包），
用 `node test/real-compare.mjs` 跑新旧两套识别对照，结果存 `test/real-compare.json`。

实测暴露了第一版交叉校验的错误做法：原本「Defuddle 选中 `<body>` 就一律换回自研」太粗暴 ——
css-tricks 上 Defuddle 选 `div.article-content`（32992 字，正确），自研只选到文章里的
一列 `div.wp-block-column`（17655 字），按分数比反而选了自研的窄块。
**改成数据支持的窄口径**：默认听 Defuddle，只有它退回整页 `<body>`/`<html>`、
**且**自研挑出的块文字量小于整页的 0.8 倍时，才换成自研（典型场景：类名全是随机串的页面）。

| 页面 | 自研选中 | Defuddle 选中 | 采用 |
| --- | --- | --- | --- |
| css-tricks 网格指南 | `div.wp-block-column`（文章里的一列） | `div.article-content` | Defuddle |
| MDN CSS 网格 | `div.code-example`（一段示例） | `main#content.layout__content` | Defuddle |
| Python 中文教程 | `section`（单个小节） | `div.body`（整节文档） | Defuddle |
| 维基百科 | `section` | `main#content.mw-body` | Defuddle |
| Vue 指南 / Go blog / Rust blog / GitHub README | 与 Defuddle 一致或更差 | 一致 | Defuddle |
| hard-generic（测试页：类名随机串） | `div.a9`（正文列，正确） | `<body>`（整页） | **自研兜底** |

17 个真实页面全部采用 Defuddle 容器；`test/site/hard-generic.html` 仍由自研兜底 —— 两条路径都有断言。

### 8k.4 A2 踩到的真 bug（MathML 的 tagName 是小写）

HTML 文档里的 `<math>` 属于 MathML 命名空间，`el.tagName` 返回**小写 `'math'`**，
所以 `tag === 'MATH'` 永远不成立，所有公式被当普通文字输出（`x²+y²=z²` 变成 `x`、`a+b` 变成 `a+ba + b`）。
修法：`isMathElement` / `mathLatex` / `mathIsDisplay` 统一 `String(el.tagName||'').toUpperCase()`，
并在 `renderInlineNode` 开头先拦数学节点（`switch (tag)` 里加 `case 'MATH'` 匹配不到）。

另一个坑：Defuddle 会把与文章标题重复的首个 `<h1>` 删掉，且它的噪声过滤认不出中文站的
「猜你喜欢 / 热门排行 / 广告位」→ `markdownFromDefuddle()` 现在会再过一遍我们自己的
`cleanArticle()` 与垃圾过滤，并在开头补回 `# 标题`。

### 8k.5 测试

`node test/e2e.mjs` → **108/108 全绿**（A2/B14/C11/D7/E3/F3/G6/H9/I5/J3/K6/L4/M2/N3/O9/P3/Q19）。
新增 Q 组 19 项覆盖：五种数学写法、Defuddle 已加载、`useAsync:false` + fetch 零调用、
引擎开关两条路径、随机类名页兜底、归档规则纯函数、设置页规则表、面板自动归档、插入双链，
以及审计后补的 4 项（KaTeX 块级、带 `$` 的公式退回代码块、`<` 还原成 `\lt`、库根目录规则 + 裸后缀不劫持全站）。
`node test/real-compare.mjs` → 17 个真实页面仍全部采用 Defuddle 容器，自研兜底 0 个。

### 8k.5.1 子 agent 审计：2 个 P1 + 14 个 P2，修完再发

这一轮专门拉了一个子 agent（`FallbacksChain/chain-1`，推理档位 `max`）做代码审计，
它按 8 条清单逐项查：**隐私红线、注入安全、XSS、路径穿越、权限模型、回退健壮性、
默认值一致性、妙言格式约定**。

结论：**没有 P0** —— 隐私红线（同步 parse 全程不进 fetch，vendor 里没有 XHR / sendBeacon /
WebSocket / analytics；全仓只有图片下载一处 fetch）、权限模型（没有 host_permissions、
没有 content_scripts、没有 web_accessible_resources）、注入安全（DOMParser 文档从不 append 回真实页面）、
XSS、路径穿越、妙言格式，全部核查通过。

它找出 **2 个 P1**（都在 A2 数学上，之前测试没覆盖到）：

| 编号 | 问题 | 修法 |
| --- | --- | --- |
| P1-1 | `cleanArticle()` 无条件删掉所有 `<script>`，而 Defuddle 特意保留 `<script type="math/tex">` → MathJax 2 页面的公式整段丢失 | 删除选择器改成 `script:not([type^="math/"]), …` |
| P1-2 | 真实 KaTeX 块级 DOM 是 `<span class="katex-display"><span class="katex">`，我们命中内层 `.katex`，只看自身 class → 块级公式被降级成行内 `$…$` | `mathIsDisplay()` 连父级一起看：`closest('.katex-display')` |

14 个 P2 也一并修完（摘要）：强制 `useAsync:false` 不被调用方覆盖、规则目录失效时把目录选择器清空、
自动归档关闭时不再全量扫目录树、「库根目录」算有效规则目标、裸后缀 `com`/`cn` 不再劫持全站、
双链列表加枚举上限、「正文来源」与「框的位置」解耦（Defuddle 选择器在克隆文档上算，真实文档偶尔定位不到时正文不丢）、
公式含 `$` 时退回 ```math 代码块、`<`/`>` 还原成 `\lt`/`\gt`、双链标题消毒、
子目录同名笔记显示「标题（目录）」、`useDefuddle` 读取防空、版本号升到 0.7.0。

其中「正文来源与框的位置解耦」这条值得单独说：
`planArticle()` 现在返回 `contentFrom`（正文从哪来）与 `engine`（框画在哪）两个字段 ——
Defuddle 选出来的元素在真实 DOM 里偶尔定位不到时，框会退回自研容器，
但**正文仍然用 Defuddle 清洗好的那份**，不至于整篇丢失；反过来，
如果我们主动换成自研容器（Defuddle 退回整页），正文必须跟着换，否则框和内容对不上。

### 8k.6 权限与声明：一个字都没变

`permissions` 仍是 `activeTab / scripting / tabs / storage / contextMenus / sidePanel`，
`optional_host_permissions` 仍是两项，**没有新增权限、没有新增对外请求**；
商店「数据使用声明」与隐私政策的勾选口径不变，只在隐私政策里补了
「Defuddle 本地打包、异步模式已关闭、有测试断言」这一段（`PRIVACY.md` §三 与 `store/privacy.html`）。

---

## 八l、v0.7.1 首次体验修复：点了有反应，第一次就存得进去（2026-11-25）

用户实测反馈两条：**① 初次安装后点工具栏图标无反应**（实际要去右键进选项授权）；
**② 授权后第一次保存仍提示需要授权**，再次授权并点「永久允许」后才正常。

### 8l.1 两个根因（读码 + 实测定位）

**根因一：剪藏成功时侧栏不开，失败只有一个 6 秒的角标。**
`chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:false})` 是 v0.5.0 为了让
`chrome.action.onClicked` 能触发而关掉的 —— 于是「点图标」既不开侧栏，也只在失败时给个角标。
更关键的是：点图标后要先 `chrome.scripting.executeScript` 注入内容脚本、再跑一遍 Defuddle 识别正文，
这些 `await` 之后**用户手势（transient activation）就过期了**，此时再调 `chrome.sidePanel.open()`
会被 Chrome 拒绝 → 「点了完全没反应」。

**根因二：目录授权请求被排在了用户手势之外。**
Chrome 的 `FileSystemHandle.requestPermission()` 依赖瞬时用户激活。原来的 `save()` 顺序是
「读设置 → 申请跨站图片权限（可能弹一次 Chrome 权限框，耗时数秒）→ 才写盘」，
等轮到目录授权时激活已经过期 → `NotAllowedError` → 被映射成 `needgesture` → 报「需要再点一次」；
用户再点「重新授权」时，又是「先 await 一次 IndexedDB 拿句柄 → 再申请」，
**中间隔了一个 await，激活又废了** → 于是变成「授权 → 再授权 → 点永久允许」的三段式。

### 8l.2 改法

| 位置 | 改动 |
| --- | --- |
| `src/background/service-worker.js` | `chrome.action.onClicked` / `chrome.commands.onCommand` **先开侧栏、再发起识别**（抓住手势）；新增 `setPanelNotice()` 把「正在识别…」/失败原因写进 `chrome.storage.session`，侧栏状态条直接显示 |
| `src/panel/panel.js` | 新增 `kickPermission(handle)`：在点击处理里**同步**发起 `requestPermission()`，返回 Promise；`save()` 在所有 `await` 之前先 `kickPermission(rootHandle)`，跨站图片授权改成「先 await 它再申请」；`regrant()` 同样先 `kickPermission`，并把结果作为 `permissionPromise` 带进续存 |
| `src/lib/writer.js` | `saveDraft()` 新增 `opts.permissionPromise`：优先用它；`state !== 'granted'` 就申请（不再跳过 `unknown`）；`needgesture` 直接回 `NEED_CONFIRM` |
| `src/panel/panel.js` | `handlePendingSave()` **先查目录权限**：权限不是 granted 时不再「先闪一次正在保存再闪红」，直接摆出「授权并保存（一次完成）」按钮，用户点一下 = 授权 + 把刚才那篇一起存进去 |
| `src/content/content.js` | 整篇识别完正文后显示提示条「已识别正文，拖动边框可微调范围（Esc 取消）」 |
| `src/background/service-worker.js` | 页面右键菜单新增「妙言剪藏：设置…」（扩展图标右键是 Chrome 自带菜单，contextMenus 加不了项，只能从页面右键进） |

### 8l.3 测试

新增 R 组 5 项断言（`test/e2e.mjs`）：

| 断言 | 内容 |
| --- | --- |
| R1 | `kickPermission` 对假句柄的映射：resolve→`granted`、reject `NotAllowedError`→`needgesture`、无方法→`null` |
| R2 | 授权卡文案含「授权并保存」；有待存草稿时按钮变「授权并保存（一次完成）」 |
| R3 | 后台写进 `storage.session` 的 `panelNotice` 会显示在面板状态条上 |
| R4 | 静态断言：`chrome.action.onClicked` 里 `openPanel(` 出现在 `startClipOnTab(` **之前** |
| R5 | 整篇识别后浮层提示条包含「已识别正文」 |

**回归：113/113 全绿**（原 108 项 + R 组 5 项）。
`node --check` 全部通过；**权限模型一个字没动**（`activeTab / scripting / tabs / storage / contextMenus / sidePanel`，无 `host_permissions`、无 `content_scripts`）。

### 8l.4 还没做的部分

v0.7.1 **只改了代码与测试，尚未提交商店审核**：v0.7.0 还在 PENDING_REVIEW，
商店同一时间只收一个待审版本，所以等 v0.7.0 出结果后再发 v0.7.1。

---

## 十、后续可做（未做，等你决定）

**v0.6.0 已上架并通过审核**（2026-11-24）→ <https://chromewebstore.google.com/detail/妙言剪藏/pbdpebhchbkgmgdgdehnoppglilakiaj>
**v0.7.0 已提交审核**（2026-11-24，`PENDING_REVIEW`）→ 出结果会自动 QQ 通知你。
下面这段保留作为「下一次改动要做的事」的清单：

1. ~~把 `output/miaoyan-clipper/store/privacy.html` 托管到公开地址~~ ✅ 已完成：<https://gu70619052.github.io/miaoyan-clipper/>，商店后台填的就是这个地址
2. ~~按 `store/listing.md` 打包 zip~~ ✅ 已完成：`output/miaoyan-clipper-0.7.0-store.zip`（37 文件 226 KB），挂到 Release v0.7.0
3. ~~上传商店后台素材与文案~~ ✅ 已完成并过审（v0.6.0，2026-11-24）
4. **v0.7.0 仍待人工做一件事**：商店后台的「详细说明 / 版本说明」无法用 API 改（Chrome Web Store API 没有改 listing 的接口），
   要把 `output/miaoyan-clipper/store/listing.md` 里的 v0.7.0 文案手动粘进去；不改也能过审，只是商店页文案还是 0.6.0 那版。
5. **仍待人工做一次**：点一次扩展图标，验证「截图剪藏」这条 activeTab 路径（自动化跑不了，见 8e.4）

**以后怎么发新版（已经接好，见 `output/miaoyan-clipper/store/publish-api.md`）**

- 一次性：Cloud Console 建服务账号 → 开发者中心「账号」页加它的 email → `scripts/import-sa-key.sh` 把 JSON 密钥存进钥匙串 → 填 `scripts/cws.config.json` 的 `publisherId`/`itemId`（**已完成**）
- 每次：改 `manifest.json` 的 version → `node scripts/cws.mjs release`（打包 + 上传 + 提交审核 + 查状态）
- 只读：`node scripts/cws.mjs status`；撤回：`cancel`
- 审核结果自动提醒（已装好）：launchd 每 2 小时查一次，**只在出结果时发一条 QQ**，平时静默；脚本 `~/.dsh/workflows/miaoyan-cws/review-check.mjs`，见 `store/publish-api.md` §十一
- 不可自动化：首次建商品、跳过审核、不升版本号发版；另需账号开 2FA

**功能侧可选**

- 批量剪藏 / 剪藏历史列表
- ~~按规则自动归档（域名 → 分类）~~ ✅ v0.7.0 已做（默认关闭，设置页可开）
- 剪藏时保留原网页 HTML（ENML 风格）与「阅读原文」跳转
- 真正的 iframe 正文支持（现在只提示，不进去）
- ~~识别质量在真实站点上的抽样回归~~ ✅ v0.7.0 已做（17 个真实页面 fixture 对照）
