# 妙言剪藏 · MiaoYan Clipper

浏览网页时把**正文、选中文字、框选区域、页面截图**剪藏成 Markdown，直接写进本地妙言笔记库。

妙言（[MiaoYan](https://github.com/tw93/MiaoYan)）是本地的 Markdown 笔记应用，笔记就是文件。
这个扩展把网页内容转成适配妙言的 Markdown（`i/` 附件目录 + `/i/文件名` 引用 + frontmatter 元信息），
用浏览器的 File System Access API 直接写进你的妙言库目录 —— **不经过任何服务器**。

- 隐私政策（本页即隐私政策）：<https://gu70619052.github.io/miaoyan-clipper/>
- Chrome 应用商店：待上架（链接补在这里）

---

## 能做什么

| 方式 | 说明 |
| --- | --- |
| 整篇正文 | 自动识别页面里最重要的那块正文（按段落打分，不是「字最多的块」），先摆出**可拖拽的范围框**让你确认 |
| 选中文字 | 先划选再剪 |
| 框选区域 | 拖一个框，只剪框内的块级内容 |
| 截图剪藏 | 截当前可视区域，拖框裁剪，存成图片笔记 |

发起剪藏有三个入口：点地址栏旁的扩展图标、快捷键（⌘/Ctrl + Shift + S / K / P）、页面右键菜单。

保存时可以在侧边栏改标题、写标签、选目标分类；会带出你最近一次保存用的目录；
保存成功后浮层自动收起并给出「继续剪藏」按钮；剪藏过的页面标签上打 ✓。

广告位、推荐栏、热榜这类噪声会被自动剔除；图片下载到该分类下的 `i/` 目录，正文里用 `/i/文件名` 引用，离线可看。

## 隐私

- **不收集任何数据**：没有统计、没有埋点、没有第三方请求。
- 唯一的对外网络请求是下载你正在剪藏的这张网页里引用的图片（`fetch`，不带 Cookie），默认还拒绝内网地址。
- 笔记只写进你本机的妙言库文件；剪藏草稿存在扩展的临时会话存储里，关闭浏览器即失效。
- 网页脚本读不到浮层内部（closed Shadow DOM + 每次注入随机宿主 id），也拿不到你的目录结构。
- 详见[隐私政策](https://gu70619052.github.io/miaoyan-clipper/)。

## 自己装一份（开发版）

```bash
git clone https://github.com/gu70619052/miaoyan-clipper.git
cd miaoyan-clipper
# Chrome → chrome://extensions → 打开开发者模式 → 「加载已解压的扩展程序」→ 选 extension/ 目录
```

装好后打开扩展设置页，选一次你的妙言笔记库根目录即可（macOS 一般在
`~/Library/Mobile Documents/iCloud~com~tw93~miaoyan/Documents`）。

## 目录结构

```
├── index.html            隐私政策（GitHub Pages 首页）
├── privacy.md            隐私政策 Markdown 版
└── extension/            扩展本体（可直接「加载已解压的扩展程序」）
    ├── manifest.json
    ├── src/              background / content / lib / panel / options
    └── icons/
```

## 许可

个人项目，随意用。第三方代码：`marked` v12（MIT，许可证见 `extension/src/vendor/marked.LICENSE.md`）。
