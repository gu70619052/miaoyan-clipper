# 上架 Chrome 应用商店 · 逐项操作清单

> **状态更新（2026-11-24）：v0.6.0 已审核通过并上线；v0.7.0 已提交审核（PENDING_REVIEW）** → 商店页 <https://chromewebstore.google.com/detail/妙言剪藏/pbdpebhchbkgmgdgdehnoppglilakiaj>
>
> v0.7.0 用一条命令完成的上传与提交：`node scripts/cws.mjs release`（自动打包 → 上传 → 提交审核 → 查状态）。
> 审核结果由 launchd 每 2 小时查一次，**只在出结果时发一条 QQ**，平时静默。
>
> **v0.7.0 还剩一件人工事**：Chrome Web Store API **没有修改商店文案的接口**，
> 所以「详细说明 / 版本说明」要在后台手动粘一次（新文案在 `store/listing.md` 第 2 节与第 7 节）。
> 不改也能过审，只是商店页文案还是 0.6.0 那版。
>
> 这份清单保留下来有两个用处：① 记录首版是怎么过的审；② **以后再发新版本不用重走这一遍**——
> 直接用 `scripts/cws.mjs release` 自动上传并发布（见 `store/publish-api.md`），
> 商店后台只需要填「商店信息 / 隐私政策」这类一次性字段的增量。
>
> 商店后台地址：<https://chrome.google.com/webstore/devconsole>

---

## 0. 一次性准备（v0.6.0 已全部完成）

| # | 事项 | 状态 |
| --- | --- | --- |
| 1 | 注册 Chrome 商店开发者账号 | ✅ 已完成（你付了注册费，账号 `gu70619052`） |
| 2 | 隐私政策托管到公网 | ✅ **已完成并验证可访问（HTTP 200）**：<https://gu70619052.github.io/miaoyan-clipper/> （GitHub Pages，仓库 <https://github.com/gu70619052/miaoyan-clipper>） |
| 3 | 扩展包 | ✅ **已打包并上架**：`../miaoyan-clipper-0.7.1-store.zip`（37 文件，226 KB，`manifest.json` 在根目录）；v0.6.0 的包挂在 Release <https://github.com/gu70619052/miaoyan-clipper/releases/tag/v0.6.0>，v0.7.0 的包挂在 <https://github.com/gu70619052/miaoyan-clipper/releases/tag/v0.7.0> |
| 4 | 图标 / 宣传图 / 详情页截图 | ✅ **已做好并已提交**：`store/icon-128.png`、`store/promo-440x280.png`、`store/promo-920x680.png`、`store/shot-1..5-1280x800.png` |
| 5 | 文案（名称、简介、详细说明、权限理由、数据声明、版本说明） | ✅ **已填并已过审**（v0.6.0）；🟡 v0.7.0 的详细说明/版本说明待手动粘贴（见 `store/listing.md`） |

---

## 1. 建条目（首版只能你做，商店不支持用 API 新建）

> 首版已完成。留在这里记录当时怎么做的；**以后发新版本不用重走**，直接 `node scripts/cws.mjs release`。

1. 打开 <https://chrome.google.com/webstore/devconsole>
2. 首次进入会让你付注册费 → 选「Individual（个人）」即可
3. 点「Add new item / 添加新商品」
4. 上传 `output/miaoyan-clipper-0.6.0-store.zip`
5. 版本号会显示 **0.6.0**，确认无误

> 上传后**先不要点发布**，先把第 3 节的文案填完再一次性提交，省得来回改。

---

## 2. 必填素材（本地路径，全部现成）

| 商店字段 | 规格 | 本地文件 |
| --- | --- | --- |
| 商店图标 | 128×128 PNG | `store/icon-128.png` |
| 小宣传图 | 440×280 PNG | `store/promo-440x280.png` |
| 大宣传图（可选） | 920×680 PNG | `store/promo-920x680.png` |
| 详情页截图 | 1280×800 PNG，1–5 张 | `store/shot-1-1280x800.png` … `store/shot-5-1280x800.png` |
| 隐私政策 URL | 公网可访问 | <https://gu70619052.github.io/miaoyan-clipper/> |
| 扩展包 | zip | `output/miaoyan-clipper-0.6.0-store.zip` |

---

## 3. 文案（照抄，字符数已按商店上限核对）

### 3.1 名称（上限 45 字符）

```
妙言剪藏：把网页正文存进本地妙言笔记
```

### 3.2 简短说明（上限 132 字符）

```
第三方开发的非官方插件：浏览网页时把正文、选段、框选区域和截图一键存成妙言笔记，图片离线保存到你的妙言库目录，数据不出本机。
```

### 3.3 详细说明（上限 16000 字符）

见 `store/listing.md` 的「详细说明」一节，可整段复制。

### 3.4 权限理由（商店会逐条问为什么需要）

| 权限 | 填的理由 |
| --- | --- |
| `storage` | 仅在本机保存扩展设置（默认目录、是否下载图片等）与临时剪藏草稿，不上传、不共享。 |
| `contextMenus` | 为剪藏提供右键菜单入口：整篇正文 / 选中文字 / 框选区域 / 截图剪藏。 |
| `sidePanel` | 在浏览器侧边栏里展示剪藏结果，让你在保存前修改标题、填写标签、选择目标目录。 |
| `activeTab` | 用户主动触发剪藏（点图标 / 右键菜单 / 快捷键）后，扩展才临时获得当前这一个标签页的访问权；没有手势就不会碰任何页面。截图剪藏也依赖这次授权。 |
| `scripting` | 剪藏脚本按需注入：只有用户触发剪藏的那一刻，才把 `extractor/converter/content` 三个脚本注入当前标签页（v0.6.0 起不再静态注入到所有网页）。 |
| `tabs` | 需要读取当前标签页的标题与网址：①判断是不是 http/https 页面（`file://`、`chrome://` 不可剪）；②给笔记写来源链接；③在面板提示「这是上一次剪藏的内容」。不读取页面内容。 |
| 可选主机权限 `http://*/*`、`https://*/*`（`optional_host_permissions`） | **安装时不申请**，默认关闭。只在你要把「正文里引用的跨站图片」下载到本地时，按站点弹一次授权；拒绝则图片保留原始链接，功能照常。见下方 3.4.1。 |

#### 3.4.1 主机权限理由（可选主机权限，安装时不申请）

v0.6.0 起**安装时不再申请任何主机权限**（`manifest.json` 里没有 `host_permissions`，也没有 `content_scripts`）。
商店后台的「权限理由」里如果出现可选主机权限这一行，把下面中文版整段粘进去：

```
妙言剪藏是一个网页剪藏工具，安装时不申请任何主机权限，也不静态注入内容脚本。用户主动触发剪藏（点扩展图标、右键菜单或快捷键）时，Chrome 通过 activeTab 临时授予当前这一个标签页的访问权，扩展随即用 chrome.scripting 按需注入剪藏脚本，读取该页 DOM，把正文转成 Markdown，写入用户自己授权的本机妙言笔记库。没有这次用户手势，扩展不会访问任何网页。

可选主机权限 http://*/* 与 https://*/* 只用于一件事：把正文里引用的图片下载到笔记目录的 i/ 附件目录。网页正文的图片常常放在别的域名（CDN、图床）上，跨站下载需要该站点的权限，所以扩展在你点「保存」时按站点申请一次；你也可以拒绝 —— 拒绝后图片会保留原始链接，笔记照常保存。下载使用 credentials:'omit'（不携带 Cookie），默认拒绝内网地址（localhost、127.x、192.168.x、10.x、169.254.x 等），单个文件上限 10MB 且 15 秒超时，只接受 image/* 响应。

扩展没有服务器、没有统计、没有埋点、没有远程代码，所有代码都打包在扩展内；剪藏内容只写入用户本机的妙言库文件，不发送到任何地方。
```

审核员（全球团队）看英文更顺，备一份英文版：

```
MiaoYan Clipper turns web pages into Markdown notes for the local MiaoYan note app. It requests NO host permissions at install time and does NOT statically inject content scripts. When the user explicitly starts a clip (toolbar icon, right-click menu or keyboard shortcut), Chrome grants activeTab for that single tab, and the extension then injects its clipping scripts on demand via chrome.scripting, reads that page, converts it to Markdown and writes it to the note folder the user authorized. Without that user gesture the extension never touches any page.

The optional host permissions http://*/* and https://*/* serve exactly one purpose: downloading images referenced by the clipped article into the note folder's i/ directory. Article images are often hosted on other origins (CDNs, image hosts), so a per-site permission is requested when the user clicks Save. If the user declines, images simply keep their original remote URLs and the note is still saved. Downloads use credentials:'omit' (no cookies), refuse loopback and private-network addresses by default, cap each file at 10MB with a 15s timeout, and accept only image/* responses.

No server, no analytics, no tracking, no remote code - all code ships inside the extension. Clipped content is written only to local note files, never sent anywhere.
```

#### 3.4.2 单一用途（Single purpose）

```
把当前网页的正文、选中文字、框选区域或截图剪藏成 Markdown 笔记，写入用户本机的妙言（MiaoYan）笔记库。
```

#### 3.4.3 远程代码（Remote code）

选 **「No, I am not using remote code.」** —— 全部代码打包在扩展内（`marked.min.js` 是本地打包的 MIT 开源渲染库）。

#### 3.4.4 审核备注（Review notes，审核员会看）

```
本扩展的全部源代码公开可查：https://github.com/gu70619052/miaoyan-clipper
便于核对以下三点：1) 无远程代码（扩展不加载任何远程脚本，marked.min.js 为本地打包并附 MIT 许可证）；2) 无统计/埋点（除下载网页配图外不发起任何网络请求）；3) 无数据外发（剪藏内容只写入用户本机的妙言库文件）。
隐私政策：https://gu70619052.github.io/miaoyan-clipper/
扩展注册了 3 个键盘快捷键（⌘/Ctrl + Shift + S / K / P）；Chrome 允许每个扩展最多 4 个建议快捷键。
非官方声明：本扩展是第三方开发者独立开发的非官方插件，与妙言（MiaoYan）App 及其作者 tw93 无隶属、授权或合作关系；「妙言」一词仅用于指明兼容关系，妙言的商标与著作权归其所有者所有。
图标来源：扩展图标取自妙言 App（tw93/MiaoYan，MIT License, Copyright (c) 2022 Tw93），仅用于表明兼容关系；本扩展未使用妙言的源代码，只按其公开的 Markdown 文件格式与 i/ 附件目录约定写入文件。
人工测试步骤（供审核员）：安装后打开任意一篇普通网页 → 点击地址栏旁的扩展图标 → 页面上会出现带 8 个手柄的范围框，拖动可调整范围 → 点「剪藏这块」→ 右侧栏出现 Markdown 预览，可改标题/标签/目录 → 点保存 → 笔记出现在你授权的妙言库目录里。
```

英文版（全球审核员可能先看这段）：

```
This extension is an independent third-party project; it is NOT affiliated with, authorized by, or endorsed by the MiaoYan app or its author. The name "MiaoYan" is used only to indicate which app the clipped notes are compatible with. All trademarks remain the property of their respective owners.
The extension icon is taken from the MiaoYan app (tw93/MiaoYan, MIT License, Copyright (c) 2022 Tw93) and is used only to indicate compatibility; no MiaoYan source code is used. The extension only reads the page you explicitly clip and writes Markdown files into the folder you authorize on your own machine.
Full source code: https://github.com/gu70619052/miaoyan-clipper
Privacy policy: https://gu70619052.github.io/miaoyan-clipper/
```

### 3.5 数据使用声明（9 项逐项勾，别选「不收集」）

⚠️ 之前我给的「四项全选不收集」是错的，这里更正。Chrome 官方《User Data FAQ》第 3 问写得很明确：

> **Yes. Extensions are required to disclose how they handle user data, even when data is processed or stored locally on a user's device and is not transmitted to external servers or third parties.**

同一份 FAQ 第 2 问把「**Clipping or scraping content from a website that the user visits, such as taking screenshots or capturing data from a web page**」直接列为「处理用户数据」的例子——本扩展就是干这个的。
所以「只在本机处理」**也要如实披露**。不披露反而是违规（商店会按「披露与实际行为不一致」处理）。

**第一组：数据类型（9 项）**

| 商店里的勾选项 | 怎么选 | 依据 |
| --- | --- | --- |
| 网站内容（文字、图片、声音、视频、超链接） | ✅ **勾上** | 剪藏时读取当前页面的可见文字与图片；截图剪藏时截取当前标签页可视区域。本机转 Markdown 写入你的妙言库 |
| 网络记录 / 浏览活动（访问过的网页及相关数据，如网页标题与访问时间） | ✅ **勾上** | 记录你正在剪藏的页面网址与剪藏时间（写进笔记 frontmatter）；浏览器会话里保留「最近活动标签页的网址」，只用于侧边栏提示「这篇草稿不是当前页」。**不保留浏览历史列表，不上传** |
| 用户活动（点击、滚屏、击键等操作记录） | ✅ **勾上** | 保存你在侧边栏输入的标题与标签（写进笔记），以及剪藏过的标签页上的 ✓ 角标（仅当前浏览器会话）。扩展**不记录**你在网页上的点击 / 滚动 / 击键 |
| 个人身份信息 | ❌ 不勾 | 不读取姓名、邮箱、地址、身份证号。网页正文里若含作者名，属于「网站内容」，只做原样搬运 |
| 健康信息 | ❌ 不勾 | 不涉及 |
| 财务和付款信息 | ❌ 不勾 | 不涉及 |
| 身份验证信息（密码、凭证、PIN） | ❌ 不勾 | 不读取密码框、Cookie、表单值 |
| 个人通讯（邮件、短信、聊天） | ❌ 不勾 | 不涉及 |
| 位置（区域、IP 地址、GPS） | ❌ 不勾 | 不采集位置；图片下载请求不带任何身份信息 |

**第二组：有限使用认证（全部勾上）**

- ☑ 我披露的数据使用方式符合 Chrome 应用商店的「有限使用（Limited Use）」政策
- ☑ 我不出售用户数据
- ☑ 除获批用途外，我不向第三方传输用户数据
- ☑ 我不把用户数据用于单一用途（网页剪藏）以外的目的
- ☑ 我遵守 Chrome 应用商店的隐私实践政策

**唯一的信息核对点**：商店后台披露、隐私政策、扩展实际行为三者必须一致。
隐私政策已按上面的口径改写（新增「一、数据使用披露」表格）：<https://gu70619052.github.io/miaoyan-clipper/>

唯一的对外网络请求是**下载网页正文里的图片**（`fetch`，不带 Cookie），目标地址来自你正在剪藏的那张网页；
默认还拒绝内网地址（`localhost` / `127.x` / `192.168.x` / `10.x` 等），可在设置页手动打开。
数据不出你的设备 → 没有第三方接收方，因此不存在加密传输环节。

### 3.6 版本说明（0.7.1 / 0.7.0 / 0.6.0）

**0.7.1（当前待发布，v0.7.0 审核通过后再提交）**：

```
首次体验修复：
· 点地址栏旁的扩展图标会立刻打开侧边栏并显示「正在识别正文…」，
  正文识别完自动填进编辑区——不再出现「点了没反应」
· 识别完正文会给出明确提示：「已识别正文，拖动边框可微调范围（Esc 取消）」
· 授权妙言库目录后，第一次保存就能存进去：授权请求改为在你点击「保存」的
  那一刻发起，不必再点一次「重新授权」，也不必再点「永久允许」
· 从页内浮层保存时若目录授权待确认，侧栏会直接给出「授权并保存（一次完成）」，
  点一下即授权并把刚才那篇一起存进去
· 页面右键菜单新增「妙言剪藏：设置…」
· 权限没有任何变化，也不新增任何对外请求
```

**0.7.0（审核中）**：

```
剪藏质量与归档效率：
· 整篇正文识别改用开源提取器 Defuddle，认不出正文时自动退回自研打分
· 数学公式保真：KaTeX / MathJax / MathML 公式还原成 $…$ 与 $$…$$
· 新增「按域名自动归档」（默认关闭）与「插入双链」
· 权限没有任何变化，Defuddle 完整打包在扩展内本地运行
```

**0.6.0**：

```
权限最小化：安装时不再申请任何主机权限。
· 剪藏改为「点图标 / 右键 / 快捷键」时才由 Chrome 临时授权当前标签页（activeTab），
  随后按需注入剪藏脚本；不再提前、也不静态注入到所有网页
· 只有把正文里的跨站图片下载到本地时，才会按站点弹一次授权；
  拒绝也能正常保存，图片保留原始链接
· 设置页新增「网站访问权限」：能看到保留了哪些站点、可一键全部撤销
· 未授权站点的图片会在保存结果里明确提示「N 张图片未下载到本地，已保留原始链接」
```

上一版（0.5.0）的说明留档：

```
交互优化（参照印象笔记、Obsidian Web Clipper、Notion Web Clipper 的做法）：
· 点地址栏旁的扩展图标即可剪藏当前页，不再只能从网页右键发起
· 新增快捷键：⌘/Ctrl + Shift + S 整篇、+ K 框选、+ P 截图
· 保存成功后浮层自动收起，底部提示条可直接「继续剪藏」下一篇
· 记住上次用的标签，下次剪藏自动填好
· 剪藏过的页面在标签上打 ✓ 角标
· 侧边栏空状态与「上一篇文章」提示条都提供「剪藏当前页面」按钮
· 切换标签页或在当前页换网址时，侧边栏能正确判断草稿是不是当前页的
```

---

## 4. 提交

1. 「Publish / 发布」→ 选「Publish now（立即发布）」或「Schedule」
2. 提交后 Chrome 审核通常 1–7 天；被拒的话把审核意见发我，我按意见改完重新打包上传
3. 通过后扩展会出现在 Chrome 网上应用店，URL 形如
   `https://chromewebstore.google.com/detail/<你的扩展 id>`

---

## 5. 以后更新版本：可以让我代劳

商店条目建好之后，**后续版本发布可以走 Chrome Web Store API 自动完成**（我打包 → 上传 → 提交审核）。
需要你做一次性的授权：

1. 在 <https://console.cloud.google.com/> 建一个 OAuth 客户端（类型选「Chrome 应用」或「桌面应用」都行）
2. 把 client id / client secret 放进 macOS 钥匙串（**不要贴在聊天里**）：
   ```bash
   security add-generic-password -a "$USER" -s miaoyan-cws-oauth -w '<client_secret>'
   ```
3. 告诉我一声，我跑一次授权流程拿到 refresh token（同样只存钥匙串），以后每次更新我直接发版

---

## 6. 一次性自检清单（提交前扫一眼）

- [ ] 上传的 zip 是 `miaoyan-clipper-0.6.0-store.zip`（不是 0.3.2 / 0.4.0 / 0.5.0 的旧包）
- [ ] 版本号显示 0.5.0
- [ ] 隐私政策 URL 能打开（<https://gu70619052.github.io/miaoyan-clipper/>）
- [ ] 数据使用声明已按 §3.5 勾好（网站内容 / 浏览活动 / 用户活动 ✅，其余六项 ❌，有限使用认证全 ✅）
- [ ] 截图里没有真实用户名、真实笔记内容、私人目录名
- [ ] 权限理由逐条都填了（留空会被拒）
