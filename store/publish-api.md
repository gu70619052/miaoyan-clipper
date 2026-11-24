# 自动发版：Chrome Web Store API 接入手册

目标：以后更新版本，不用再打开开发者中心手动上传 —— 本机一条命令完成
「打包 → 上传 → 提交审核 → 查状态」。

---

## 一、先说清楚：哪些能做，哪些做不了

| 事情 | 能不能自动 |
| --- | --- |
| 上传新版本 zip | ✅ 能（`items:upload`） |
| 提交审核 / 发布 | ✅ 能（`items:publish`） |
| 查审核状态 | ✅ 能（`items:fetchStatus`） |
| 撤回正在审核的提交 | ✅ 能（`items:cancelSubmission`） |
| **首次创建商品** | ❌ 不能。商店 API 没有「建商品」接口，第一条必须在开发者中心手动建好、填完「商店信息 + 隐私」两个标签页 |
| **跳过审核** | ❌ 不能。API 只是把包推进去，审核照旧要走 |
| **不升版本号就发布** | ❌ 不能。`manifest.json` 的 `version` 必须严格大于已发布的版本，否则上传直接失败 |

另外两个硬性前提（官方要求，不是我们这边的限制）：

1. **Google 账号必须开两步验证（2FA）**，否则发布接口会被拒。
2. **开发者中心手动改过「可见性」设置后，必须先手动发布一次**，之后 API 才能继续接管。

---

## 二、Step 1：Google Cloud 里建服务账号（一次性，5 分钟）

打开 <https://console.cloud.google.com>：

1. 左上角项目选择器 → **新建项目**，名字随便（例如 `miaoyan-clipper`）→ 创建。
2. 顶部搜索框搜 **Chrome Web Store API** → 进入 → 点 **启用 / Enable**。
3. 左侧菜单 **IAM 与管理 → 服务账号** → **创建服务账号**：
   - 名称：`miaoyan-cws`（随便）
   - 权限：**不用加**（官方文档明确说这一步不需要任何角色）
   - 完成后进入这个服务账号 → **密钥** 标签 → **添加密钥 → 创建新密钥 → JSON** → 下载。
4. 下载到的 `.json` 文件里有两个我们需要的字段：`client_email`、`private_key`。
   **这个文件是机密**，不要提交到仓库、不要贴进聊天。

## 三、Step 2：把服务账号加进开发者中心（一次性，1 分钟）

1. 打开 <https://chrome.google.com/webstore/devconsole> → 左侧 **账号 / Account** 页。
2. 找到 **服务账号** 那一栏，把 Step 1 里服务账号的 `client_email`（形如 `miaoyan-cws@xxx.iam.gserviceaccount.com`）填进去。
3. 注意：**每个发布商只能加一个服务账号**（官方限制），加错了要先删旧的。

## 四、Step 3：本机导入密钥 + 填配置（一次性，2 分钟）

```bash
cd "output/miaoyan-clipper"

# 1) 把下载的 JSON 密钥导入钥匙串（服务名 miaoyan-cws-sa），成功后删掉明文文件
./scripts/import-sa-key.sh ~/Downloads/<服务账号密钥>.json

# 2) 填两个「非机密」的 ID —— 直接把开发者中心商品页的地址栏粘进来即可
./scripts/set-ids.sh "https://chrome.google.com/webstore/devconsole/<publisherId>/<itemId>/edit"
#    也可以分开给：./scripts/set-ids.sh <publisherId> <itemId>

# 3) 验证凭据 + 看商品状态
node scripts/cws.mjs token
node scripts/cws.mjs status
```

`token` 打印「✓ 凭据可用」就通了。若报错，对照下面第九节。

> 为什么用钥匙串：JSON 密钥等于发布权限，落盘就等于给了别人发版权限。
> `import-sa-key.sh` 存完会读回校验，再用 `rm -P` 覆写删除原文件。
> 脚本从钥匙串取值、在内存里签 JWT 换 token，全程不落临时文件。

## 五、日常发版（以后每次就这一条）

```bash
cd "output/miaoyan-clipper"
# 先改 manifest.json 的 version，比如 0.6.1
node scripts/cws.mjs release
```

`release` 会依次做：按 `store/listing.md` 的口径打包 `output/miaoyan-clipper-<version>-store.zip`
→ 上传 → 等上传完成（`uploadState` 轮询）→ 提交审核 → 打印当前状态。

其他命令：

| 命令 | 作用 |
| --- | --- |
| `node scripts/cws.mjs status` | 只看状态（已发布版本 / 提交版本 / 上次上传错误），不改任何东西 |
| `node scripts/cws.mjs upload <zip>` | 只上传，不提交审核（想先在后台看一眼素材时用） |
| `node scripts/cws.mjs publish` | 把已上传的版本提交审核 |
| `node scripts/cws.mjs cancel` | 撤回正在审核的提交 |
| `node scripts/cws.mjs release --force` | 上一版还在审核中、仍要强行提交（一般别用） |
| `node scripts/cws.mjs token` | 只验证凭据 |

## 六、状态字段怎么读

`status` 返回里两个关键字段：

- `publishedItemRevisionStatus.state` —— 线上正在跑的版本状态；`PUBLISHED` 表示已上线。
- `submittedItemRevisionStatus.state` —— 刚提交的那版；`PENDING_REVIEW` / `IN_REVIEW` 表示排队或审核中，
  `PUBLISHED` 表示通过并上线，`REJECTED` 表示被拒（被拒的理由只在开发者中心站内信里看得到，API 不给）。

审核一般 1–7 天。这段时间不用反复 `publish`，重复提交会被拒 ——
所以 `release` 会先查一次状态，发现上一版还 `PENDING_REVIEW` / `IN_REVIEW` 就直接停下（要强行发加 `--force`）。

## 七、灰度发布（可选）

`items:setPublishedDeployPercentage` 可以按百分比灰度。**但仅当扩展 7 日活跃用户 > 10,000 时才可用**；
我们早期用不上，先用 100% 全量。

## 八、包体限制

单个 zip 上限 **2 GB**（我们现在 118 KB）。上传要求：`manifest.json` 在 zip 根目录。

## 九、常见报错对照

| 报错 | 原因 / 处理 |
| --- | --- |
| `缺 access token`：`invalid_grant: account not found` | 服务账号邮箱还没加进开发者中心「账号」页，或 Cloud 项目没启用 Chrome Web Store API |
| `403 PERMISSION_DENIED` | 服务账号不是这个商品的发布商成员；确认「账号」页填的就是这个 `client_email` |
| `400 ... version must be greater` | `manifest.json` 的 version 没升（必须严格大于线上版本） |
| publish 报「商店信息不完整」 | 开发者中心「商店信息」「隐私」两个标签页还有必填项没填 |
| publish 报可见性相关错误 | 后台手动改过可见性 → 先在后台手动发布一次，之后 API 才能接管 |
| publish 报 2FA 相关错误 | Google 账号开两步验证 |
| `uploadState: FAILED` + `lastAsyncUploadError` | 看返回里的 `errorCode`，多半是包结构（`manifest.json` 不在根目录）或图标缺失 |

## 十、安全清单

- [ ] JSON 密钥只存在于钥匙串，仓库里没有 `*sa*.json`、没有 `cws.config.json` 之外的凭据文件
- [ ] `scripts/cws.config.json` 只放 `publisherId` / `itemId`（公开信息），不放任何密钥
- [ ] 万一密钥泄漏：Cloud Console 删掉该密钥 → 重新建一个 → 重新跑 `import-sa-key.sh`（旧密钥立即失效）
- [ ] 不用这台机器发版时，记得 `security delete-generic-password -s miaoyan-cws-sa` 清掉

## 十一、审核结果自动提醒（已装好）

不用天天刷后台：本机已经装了定时检查，**只在出结果时发一条 QQ**。

| 项 | 位置 |
| --- | --- |
| 检查脚本 | `~/.dsh/workflows/miaoyan-cws/review-check.mjs`（自包含，无依赖） |
| 启动壳（决定系统里的显示名） | `~/.dsh/workflows/miaoyan-cws/bin/妙言剪藏-审核检查` |
| 配置 | `~/.dsh/workflows/miaoyan-cws/config.json`（publisherId / itemId / 显示名） |
| 状态 | `~/.dsh/state/miaoyan-cws-review.json`（已通知过的结果指纹，防重复发） |
| 日志 | `~/.dsh/logs/miaoyan-cws-review.log` |
| 定时 | `~/Library/LaunchAgents/com.guxueyichen.miaoyan-cws-review.plist`，每 30 分钟 |
| 发送通道 | `~/.dsh/scripts/qq-send`（直连 QQ Bot 官方 API，与本机其它日报同一个通道） |

行为：

- 状态还是 `PENDING_REVIEW` / `IN_REVIEW` → **什么都不发**，日志里只留一行（方便事后查）。
- 出结果 → 发一条：
  - 通过：`✅ 妙言剪藏 v0.6.0 审核通过，已经上线` + 商店页与后台链接；
  - 被拒：`❌ 妙言剪藏 v0.6.0 审核没通过` + 提醒去后台看理由；
  - 被下架 / 政策警告：`🚨 被下架` / `⚠️ 政策警告`，各带一句处理建议。
- 每条结果只发一次；发不出去 → 状态不记账，30 分钟后再试；连续失败 ≥2 次才额外发一条故障告警（冷却 1 小时）。
- 以后提了新版本，会重新进入静默等待，通过后再发一条。

### 去重规则：记「发生过的事件」，不是「当前状态长什么样」

早期版本用「提交版本|提交状态|已发布版本|已发布状态」拼一个指纹去重，有坑：商店在提交成功后会
清空 `submittedItemRevisionStatus`，同一个版本在两次轮询里可能呈现两种指纹，于是**一次上线会发两条 QQ**。

现在改成**事件记账**——记「发生过什么」，跟当前状态长什么样无关：

| 事件 | 事件键 | 什么时候产生 |
| --- | --- | --- |
| 上线 | `live\|<版本>` | 该版本已发布（`PUBLISHED` / `PUBLISHED_TO_TESTERS`；`STAGED` 也算，因为过审待发布时键与上线一致，之后真正发布不会重复报） |
| 被拒 | `rejected\|<版本>\|#n` | 该版本被拒；`n` 是第几次被拒，同一次被拒只报一次，改好后重新提交通过会再发一条「上线」 |
| 被下架 | `takenDown\|<版本>` | 状态位 `takenDown` 刚变 true 的那一轮 |
| 政策警告 | `warned\|<版本>` | 状态位 `warned` 刚变 true 的那一轮 |

规则：

- 已记账的事件键不会重复通知（上限 50 条，超了丢最旧的）。
- 「被下架」「政策警告」是**状态翻转**事件：只在刚出现的那一轮报一次，以后每次发新版本不会把老警告再报一遍。
- 同一轮里既有被拒又有警告，会发两条（两件事分开说更清楚）。
- 老版本的状态文件里存的是旧指纹，加载时会自动迁移成事件键（`?|NONE|0.6.0|PUBLISHED` → `live|0.6.0`），迁移后不会把 v0.6.0 重发一遍。

代码位置：`scripts/review-check.mjs`（`~/.dsh/workflows/miaoyan-cws/review-check.mjs` 是同一份）。

### 这套逻辑有测试

```bash
cd output/miaoyan-clipper
node test/review-check.test.mjs   # 33 项单测：状态解析、版本号比较、事件生成、去重判定
node test/review-check.e2e.mjs    # 25 项离线端到端：假 API + 假 QQ，8 段场景全程演练
```

两个文件都不联网、不发真 QQ：`e2e` 会起一个本地假 API 服务器（按脚本依次返回不同状态），
再用一个假的 `qq-send` 把「消息」写进临时文件，然后逐条断言该发的发了、不该发的一条没发。

覆盖的场景：旧状态首跑不重发 → 审核中不打扰 → 新版本上线发一条 → 同状态再跑不发 →
再下一个版本又发一条 → 被拒发一条且反复查不重发 → 改好后通过再发一条 → API 报错时连续两次才告警。

常用操作：

```bash
# 立刻查一次（只写日志，不发消息）
node ~/.dsh/workflows/miaoyan-cws/review-check.mjs

# 验证 QQ 通道（会真的给你发一条测试消息）
node ~/.dsh/workflows/miaoyan-cws/review-check.mjs --selftest

# 看定时任务状态 / 暂停 / 恢复
launchctl print gui/$UID/com.guxueyichen.miaoyan-cws-review | head -20
launchctl bootout gui/$UID/com.guxueyichen.miaoyan-cws-review
launchctl bootstrap gui/$UID ~/Library/LaunchAgents/com.guxueyichen.miaoyan-cws-review.plist
```

> 为什么不用 DSH 的定时任务：这是纯脚本活（查 API + 发一条消息），交给 launchd 不烧模型；
> 也避开了 DSH Web 端口变化、会话被关掉这两个变数。脚本放在 `~/.dsh/workflows/` 是因为
> launchd 读不到 `~/Documents`（TCC 限制）。
>
> 脚本与 plist 也存了一份在 `scripts/` 下（`review-check.mjs`、`review-check.config.example.json`、
> `com.guxueyichen.miaoyan-cws-review.plist`、`launcher/妙言剪藏-审核检查`），换机器时照抄即可。

### 为什么系统设置里不是「node」

macOS 的「登录项 → 允许在后台」显示的是**可执行文件的名字**（`sfltool dumpbtm` 里的 `Name` 字段），
不是 plist 的 `Label`。直接让 launchd 跑 `/opt/homebrew/bin/node`，那一栏就会显示成 `node`，
和其他脚本混在一起分不清。

所以 `ProgramArguments` 指到一个同名的启动壳：

```sh
#!/bin/sh
/opt/homebrew/bin/node "$HOME/.dsh/workflows/miaoyan-cws/review-check.mjs" "$@"
```

文件名就是显示名（现在是「妙言剪藏-审核检查」）。改显示名 = 改这个文件名 + 改 plist 里那一条路径 +
`launchctl bootout` / `bootstrap` 重载。验证：

```bash
sfltool dumpbtm | grep -B 10 "com.guxueyichen.miaoyan-cws-review" | grep "Name:"
```

## 十二、另一条路（别人已经在用的）

把 `upload`/`publish` 放进 GitHub Actions，密钥放 GitHub Secrets。
适合「打 tag 自动发版」；但密钥就存在 GitHub 那边，且我们现在的发布频率不高，
本机一条命令已经够了。真要做再说。
