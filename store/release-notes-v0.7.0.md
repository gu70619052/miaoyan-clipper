## v0.7.0（2026-11-24）

剪藏质量提了一档，四件事：

### 1. 正文识别换引擎（Defuddle）
打包了开源提取器 [Defuddle](https://github.com/kepano/defuddle) 0.19.13（MIT，与 Obsidian 官方剪藏器同款），完整放进扩展本地运行。MDN / 文档站 / 结构复杂的博客，默认框落得更准。

**只用同步解析模式**：`useAsync` 写死为 `false`。Defuddle 的异步模式会把页面内容交给第三方服务取回，和本扩展「除图片下载外不发任何请求」的承诺冲突，所以关掉，并在测试里把 `window.fetch` 打桩断言零调用。认不出正文时会退回自研打分，两条路径都有测试覆盖。

### 2. 数学公式保真
支持四种来源：MathML（`data-latex` / `annotation`）、KaTeX、MathJax、`<script type="math/tex">`。剪藏后是妙言能直接渲染的 `$…$` / `$$…$$`。公式里带 `$` 时退回 math 代码块，`<` / `>` 还原成 `\lt` / `\gt`。

### 3. 按域名自动归档（默认关闭）
设置页可开，配「域名 → 目录」规则：打开 `news.example.com` 自动选到「参考资料」。也可一键「此站点不再自动归档」。**默认关闭**，行为与 0.6.0 一致。

### 4. 侧边栏插入双链
列出你库里的笔记标题，光标处一键插入 `[[已有笔记标题]]`。

### 其它
- 版本号 0.7.0
- 权限模型**一个字节都没变**：没有新增权限、没有新增对外请求，数据使用声明口径不变
- 端到端测试 108/108 通过；另用 17 个真实文章页做了新旧引擎对照

### 安装
商店页：https://chromewebstore.google.com/detail/妙言剪藏/pbdpebhchbkgmgdgdehnoppglilakiaj

### 隐私政策
https://gu70619052.github.io/miaoyan-clipper/
