#!/bin/bash
# 妙言剪藏 · 写入 publisherId / itemId（两个都是公开信息，不是机密）
#
# 用法（最省事：直接把开发者中心那个商品页的地址栏粘进来）：
#   scripts/set-ids.sh "https://chrome.google.com/webstore/devconsole/<PUB>/<ITEM>/edit"
#
# 也可以分开给：
#   scripts/set-ids.sh <publisherId> <itemId>
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG="$HERE/cws.config.json"

usage() {
  cat <<'EOF'
用法：
  scripts/set-ids.sh "https://chrome.google.com/webstore/devconsole/<PUB>/<ITEM>/edit"
  scripts/set-ids.sh <publisherId> <itemId>
EOF
  exit 1
}

[ $# -ge 1 ] || usage

if [ $# -eq 1 ]; then
  ARG="$1"
  case "$ARG" in
    http*devconsole*)
      # 取出 /devconsole/ 之后的部分：<publisherId>/<itemId>/...
      REST="${ARG#*devconsole/}"
      PUB="${REST%%/*}"
      REST="${REST#*/}"
      ITEM="${REST%%/*}"
      ;;
    *)
      echo "✗ 只给一个参数时，请给开发者中心的完整网址（要含 devconsole）" >&2
      usage
      ;;
  esac
else
  PUB="$1"
  ITEM="$2"
fi

# 去掉可能的查询串/锚点
ITEM="${ITEM%%\?*}"
ITEM="${ITEM%%#*}"

if [ -z "$PUB" ] || [ -z "$ITEM" ]; then
  echo "✗ 没能从网址里解析出 publisherId / itemId，请检查网址形如：" >&2
  echo "  https://chrome.google.com/webstore/devconsole/<publisherId>/<itemId>/edit" >&2
  exit 1
fi

echo "publisherId : $PUB"
echo "itemId      : $ITEM"

if ! printf '%s' "$ITEM" | grep -Eq '^[a-p]{32}$'; then
  echo
  echo "⚠ itemId 不是标准的 32 位扩展 ID（只含 a–p）。" >&2
  echo "  常见原因：把「商品详情」页当成「编辑」页了，或者网址里那段是别的东西。" >&2
  echo "  仍要继续写入吗？(y/N)"
  read -r ANS
  [ "$ANS" = "y" ] || exit 1
fi

cat > "$CONFIG" <<EOF
{
  "publisherId": "$PUB",
  "itemId": "$ITEM"
}
EOF

echo
echo "✓ 已写入 $CONFIG"
echo
echo "下一步："
echo "  node scripts/cws.mjs token    # 验证凭据"
echo "  node scripts/cws.mjs status   # 看商品当前状态"
