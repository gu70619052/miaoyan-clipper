# Defuddle

本目录下的 `defuddle.min.js` 是 [Defuddle](https://github.com/kepano/defuddle) 的浏览器构建产物
（npm 包 `defuddle@0.19.13`，`dist/index.js`，350,058 bytes，UMD/IIFE，全局 `Defuddle`）。

妙言剪藏用它做「正文识别」：在用户主动剪藏时，从当前页面里找出正文容器并清洗成干净的 HTML，
再交给我们自己的 Markdown 转换器输出。Defuddle 是 MIT 许可，原始版权声明如下。

- 上游项目：https://github.com/kepano/defuddle
- npm 包：https://www.npmjs.com/package/defuddle
- 版本：0.19.13

## 我们的使用约定

1. **只调用同步的 `parse()`**，并且显式传 `useAsync: false`。
   Defuddle 的异步模式会去第三方站点（例如 FxTwitter）抓取内容，
   那会破坏本扩展「不向外部服务器发送任何数据」的承诺，也会与 Chrome 应用商店的数据使用声明冲突。
2. 不使用 `defuddle/full`（带 temml / turndown / linkedom 的更大构建），只用浏览器版。
3. 页面正文识别失败时自动回退到我们自研的提取器，用户永远有兜底路径。

## MIT License

Copyright (c) 2025 Steph Ango (@kepano)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
