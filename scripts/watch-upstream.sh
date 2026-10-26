#!/usr/bin/env bash
# [daoyou-fork L0] 上游更新哨兵：发现 upstream HEAD 变化就 dispatch 一次同步
#
# 为什么不在 GitHub Actions 里加密 cron：
#   定时任务粒度有限且会被延迟（实测 03:17 被延到 08:34），高频还有被限用的风险；
#   而空跑虽然在公开仓库免费，但会在 Actions 里堆噪声记录。
#   放在常开的机器上轮询，每 5 分钟只花 2 个 API 请求，且只在真有变化时才起 CI。
#
# 判定依据：upstream 的 HEAD 与我们的 upstream-dev（= 上次同步到的上游提交）是否相同。
#
# 用法：
#   watch-upstream.sh            # 正常：需要时 dispatch
#   watch-upstream.sh --dry-run  # 只打印判定，不 dispatch
#
# 部署：
#   install -m 755 scripts/watch-upstream.sh /usr/local/bin/watch-daoyou-upstream.sh
#   install -m 644 scripts/systemd/daoyou-upstream-watch.{service,timer} /etc/systemd/system/
#   mkdir -p /root/.config/daoyou && printf '%s' '<PAT>' > /root/.config/daoyou/pat
#   chmod 600 /root/.config/daoyou/pat
#   systemctl daemon-reload && systemctl enable --now daoyou-upstream-watch.timer
#
# PAT 只需 actions:write + contents:read（调用 dispatch 与读取分支）。
set -euo pipefail

REPO="goovoz/Daoyou"
UPSTREAM="ChurchTao/Daoyou"
WORKFLOW="sync-upstream.yml"
CONFIG_DIR="${DAOYOU_WATCH_CONFIG:-/root/.config/daoyou}"
STATE="$CONFIG_DIR/watch-state"
PATFILE="$CONFIG_DIR/pat"
DEBOUNCE_MIN=10 # 距上次 dispatch 不足这么多分钟就跳过，避免同步还在跑时重复派发

DRY=0
[ "${1:-}" = "--dry-run" ] && DRY=1

[ -r "$PATFILE" ] || { echo "缺少 PAT 文件：$PATFILE" >&2; exit 1; }
PAT="$(tr -d '\r\n' < "$PATFILE")"
[ -n "$PAT" ] || { echo "PAT 文件为空：$PATFILE" >&2; exit 1; }

api() { curl -fsS -H "Authorization: Bearer $PAT" -H "Accept: application/vnd.github+json" "$1"; }

UP_SHA="$(api "https://api.github.com/repos/$UPSTREAM/commits/master" | jq -r '.sha')"
OUR_SHA="$(api "https://api.github.com/repos/$REPO/branches/upstream-dev" | jq -r '.commit.sha')"

echo "upstream=${UP_SHA:0:8}  synced=${OUR_SHA:0:8}"

if [ "$UP_SHA" = "$OUR_SHA" ]; then
  echo "无变化，跳过。"
  exit 0
fi

if [ -f "$STATE" ]; then
  LAST_SHA="$(cut -d' ' -f1 "$STATE" 2>/dev/null || echo '')"
  LAST_TS="$(cut -d' ' -f2 "$STATE" 2>/dev/null || echo 0)"
  NOW="$(date +%s)"
  if [ "$LAST_SHA" = "$UP_SHA" ] && [ $((NOW - LAST_TS)) -lt $((DEBOUNCE_MIN * 60)) ]; then
    echo "上游 ${UP_SHA:0:8} 已在 $(( (NOW - LAST_TS) / 60 )) 分钟前派发过，跳过（可能仍在运行）。"
    exit 0
  fi
fi

if [ "$DRY" = "1" ]; then
  echo "[dry-run] 将 dispatch $WORKFLOW（mode=auto）"
  exit 0
fi

CODE="$(curl -s -o /dev/null -w '%{http_code}' -X POST \
  -H "Authorization: Bearer $PAT" -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/$REPO/actions/workflows/$WORKFLOW/dispatches" \
  -d '{"ref":"master","inputs":{"mode":"auto"}}')"

echo "dispatch -> HTTP $CODE"
if [ "$CODE" = "204" ]; then
  mkdir -p "$CONFIG_DIR"
  printf '%s %s\n' "$UP_SHA" "$(date +%s)" > "$STATE"
else
  echo "派发失败（HTTP $CODE），下次轮询会自动重试。" >&2
  exit 1
fi
