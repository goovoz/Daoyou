#!/usr/bin/env bash
# [daoyou-fork L0] 同步交接哨兵：发现「同步需要人判」就入队，不做任何修复。
#
# 判定（任一成立即入队）：
#   1. sync/upstream 的 head commit message 含「合并产生冲突」（CI 冲突时的固定写法）
#   2. 有 head=sync/upstream 的 open PR，且标题含「需人工」
#   3. 该 PR 的 mergeable_state=dirty（真冲突）
#
# 幂等：fingerprint = head sha，同一个 head 只入队一次。
# 只读 + 入队：不改仓库、不 dispatch、不推送、不调用任何模型。
#
# 用法：
#   sync-handoff-watch.sh            # 正常：需要时入队
#   sync-handoff-watch.sh --dry-run  # 只打印判定
#
# 部署：
#   install -m 755 scripts/sync-handoff-watch.sh /usr/local/bin/daoyou-sync-handoff-watch.sh
#   install -m 755 scripts/dsh-handoff.py      /usr/local/bin/daoyou-dsh-handoff.py
#   install -m 644 scripts/systemd/daoyou-sync-handoff.{service,timer} /etc/systemd/system/
#   systemctl daemon-reload && systemctl enable --now daoyou-sync-handoff.timer
set -uo pipefail

REPO="goovoz/Daoyou"
BRANCH="sync/upstream"
CONFIG_DIR="${DAOYOU_WATCH_CONFIG:-/root/.config/daoyou}"
PATFILE="$CONFIG_DIR/pat"
HANDOFF="${DAOYOU_HANDOFF_BIN:-/usr/local/bin/daoyou-dsh-handoff.py}"

DRY=0
[ "${1:-}" = "--dry-run" ] && DRY=1

log() { echo "$(date -u '+%F %T') $*"; }

[ -r "$PATFILE" ] || { log "缺少 PAT 文件：$PATFILE"; exit 1; }
PAT="$(tr -d '\r\n' < "$PATFILE")"
[ -n "$PAT" ] || { log "PAT 文件为空：$PATFILE"; exit 1; }

api() { curl -fsS -H "Authorization: Bearer $PAT" -H "Accept: application/vnd.github+json" "$1"; }

# 自检用：设置 DAOYOU_FAKE_BRANCH_JSON / DAOYOU_FAKE_PR_JSON 指向本地 JSON 就不再走网络，
# 这样「没冲突 / 冲突提交 / PR 标了需人工」三种判定都能离线验一遍（见 --selftest）。
if [ -n "${DAOYOU_FAKE_BRANCH_JSON:-}" ]; then
  BR_JSON="$(cat "${DAOYOU_FAKE_BRANCH_JSON}")"
else
  BR_JSON="$(api "https://api.github.com/repos/$REPO/branches/$BRANCH")" || {
    log "读不到分支 $BRANCH（可能已被清理），本轮跳过"
    exit 0
  }
fi
SHA="$(printf '%s' "$BR_JSON" | jq -r '.commit.sha')"
MSG="$(printf '%s' "$BR_JSON" | jq -r '.commit.commit.message' | head -1)"

if [ -n "${DAOYOU_FAKE_PR_JSON:-}" ]; then
  PR_JSON="$(cat "${DAOYOU_FAKE_PR_JSON}")"
else
  PR_JSON="$(api "https://api.github.com/repos/$REPO/pulls?state=open&head=goovoz:$BRANCH")" || PR_JSON="[]"
fi
PR_N="$(printf '%s' "$PR_JSON" | jq 'length' 2>/dev/null || echo 0)"
PR_NUM=""; PR_URL=""; PR_TITLE=""; PR_STATE=""

REASON=""
case "$MSG" in
  *合并产生冲突*) REASON="head commit 标记为冲突提交" ;;
esac

if [ "${PR_N:-0}" -gt 0 ] 2>/dev/null; then
  PR_NUM="$(printf '%s' "$PR_JSON" | jq -r '.[0].number')"
  PR_URL="$(printf '%s' "$PR_JSON" | jq -r '.[0].html_url')"
  PR_TITLE="$(printf '%s' "$PR_JSON" | jq -r '.[0].title')"
  PR_STATE="$(printf '%s' "$PR_JSON" | jq -r '.[0].mergeable_state // ""')"
  case "$PR_TITLE" in
    *需人工*) REASON="${REASON:+$REASON；}PR 标题标了[需人工]" ;;
  esac
  if [ "$PR_STATE" = "dirty" ]; then
    REASON="${REASON:+$REASON；}PR mergeable_state=dirty"
  fi
fi

if [ -z "$REASON" ]; then
  log "无需人工：head=${SHA:0:8} pr=${PR_NUM:-无} 说明=${MSG:0:40}"
  exit 0
fi

TASK="$(jq -n \
  --arg repo "$REPO" \
  --arg branch "$BRANCH" \
  --arg sha "$SHA" \
  --arg msg "$MSG" \
  --arg reason "$REASON" \
  --arg pr_num "$PR_NUM" \
  --arg pr_url "$PR_URL" \
  --arg pr_title "$PR_TITLE" \
  --arg pr_state "$PR_STATE" \
  '{
    kind: "sync-conflict",
    repo: $repo,
    upstream: "ChurchTao/Daoyou",
    branch: $branch,
    head_sha: $sha,
    head_message: $msg,
    pr_number: ($pr_num | tonumber? // null),
    pr_url: $pr_url,
    pr_title: $pr_title,
    mergeable_state: $pr_state,
    reason: $reason,
    work_dir: "/root/work/daoyou-sync",
    hint: "clone/work 副本 /root/work/daoyou-sync；取 origin/sync/upstream 复现 merge，按「两边都保留」逐处判定，pnpm run typecheck 后 force-with-lease 推回 sync/upstream，再合 PR"
  }')"

log "需要人工：${REASON}（head=${SHA:0:8} pr=${PR_NUM:-无}）"

if [ "$DRY" = "1" ]; then
  echo "--- dry-run，任务 JSON ---"
  printf '%s\n' "$TASK"
  echo "--- dry-run，不入队 ---"
  exit 0
fi

printf '%s' "$TASK" | python3 "$HANDOFF" enqueue --kind sync-conflict --fingerprint "$SHA" --priority 5
