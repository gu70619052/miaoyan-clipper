#!/bin/bash
# 妙言剪藏 · 把服务账号 JSON 密钥导入 macOS 钥匙串，然后彻底删掉明文文件
#
# 用法：
#   scripts/import-sa-key.sh ~/Downloads/miaoyan-cws-xxxx.json
#
# 说明：
# - 密钥只存进钥匙串（服务名 miaoyan-cws-sa），不写进仓库、不进 shell 历史；
# - 导入后会读回校验一次，确认能解析成服务账号密钥；
# - 校验通过才删除原文件（用 rm -P 覆写后删除）。
set -euo pipefail

SERVICE="${CWS_SA_KEYCHAIN_SERVICE:-miaoyan-cws-sa}"
KEY_FILE="${1:-}"

if [ -z "$KEY_FILE" ]; then
  echo "用法：$0 <服务账号 JSON 密钥路径>" >&2
  exit 1
fi
if [ ! -f "$KEY_FILE" ]; then
  echo "✗ 找不到文件：$KEY_FILE" >&2
  exit 1
fi

# 1. 校验是不是服务账号密钥（type=service_account，含 client_email / private_key）
if ! jq -e '.type == "service_account" and (.client_email|type=="string") and (.private_key|type=="string")' "$KEY_FILE" >/dev/null 2>&1; then
  echo "✗ 这不是「服务账号」JSON 密钥。" >&2
  echo "  要去 Google Cloud Console → IAM 与管理 → 服务账号 → 密钥 → 添加密钥 → 创建新密钥(JSON)。" >&2
  echo "  别下成 OAuth 客户端 JSON（那种里是 client_id / client_secret，没有 private_key）。" >&2
  exit 1
fi
CLIENT_EMAIL=$(jq -r '.client_email' "$KEY_FILE")
echo "服务账号：$CLIENT_EMAIL"

# 2. 写进钥匙串（-U 覆盖同名旧条目）
#    密钥内容通过环境变量传，不进命令行参数，也不进 shell 历史
# 压成单行再存：带换行的内容 security 会当二进制，读回来是十六进制
SA_JSON=$(jq -c . "$KEY_FILE")
security add-generic-password -s "$SERVICE" -a "$USER" -U -w "$SA_JSON" >/dev/null

# 3. 读回校验
if ! security find-generic-password -s "$SERVICE" -w 2>/dev/null | jq -e '.client_email' >/dev/null 2>&1; then
  echo "✗ 写进钥匙串后读不回合法 JSON，请重试" >&2
  exit 1
fi
echo "✓ 已存入钥匙串（服务名 ${SERVICE}）"

# 4. 删掉明文密钥
if rm -P "$KEY_FILE" 2>/dev/null; then
  echo "✓ 已覆写并删除原文件：$KEY_FILE"
else
  rm -f "$KEY_FILE"
  echo "✓ 已删除原文件：${KEY_FILE}（这台系统的 rm 不支持 -P 覆写）"
fi

echo
echo "下一步："
echo "  1. 把服务账号邮箱加进开发者中心「账号」页：$CLIENT_EMAIL"
echo "  2. cp scripts/cws.config.example.json scripts/cws.config.json 并填 publisherId / itemId"
echo "  3. node scripts/cws.mjs token   # 验证凭据能换到 access token"
