#!/usr/bin/env bash
# [daoyou-fork L0] fork 自有数据库迁移的执行器
#
# 为什么 fork 的迁移不在 drizzle/meta/_journal.json 里：
#   上游每次新增迁移都会修改该文件（近 300 个提交里改了 123 次），
#   fork 的迁移一旦占用同一编号序列，每次同步上游都必然冲突：
#     - drizzle/meta/_journal.json     内容冲突（idx 撞号）
#     - drizzle/meta/00NN_snapshot.json add/add 冲突
#   所以 fork 的迁移放在 drizzle/fork/，用独立的 __fork_migrations 表记账，
#   与上游的编号空间完全隔离。代价是要单独执行本脚本（生产镜像不含 drizzle-kit）。
#
# 用法：
#   bash scripts/apply-fork-migrations.sh              # 应用尚未应用的 fork 迁移
#   bash scripts/apply-fork-migrations.sh --baseline   # 只记账不执行（用于已有数据的库首次接入）
#   bash scripts/apply-fork-migrations.sh --list       # 只看状态
#
# 连接信息：设 DATABASE_URL，或直接用 psql 的标准环境变量（PGHOST/PGUSER/PGDATABASE）。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIR="$ROOT/drizzle/fork"
MODE="${1:-apply}"

if [ ! -d "$DIR" ]; then
  echo "没有 drizzle/fork 目录，无需执行。" >&2
  exit 0
fi

if [ -n "${DATABASE_URL:-}" ]; then
  PSQL=(psql "$DATABASE_URL")
else
  PSQL=(psql)
fi

"${PSQL[@]}" -v ON_ERROR_STOP=1 -q -c "
create table if not exists __fork_migrations (
  hash       text primary key,
  name       text not null,
  applied_at timestamptz not null default now()
);"

shopt -s nullglob
files=("$DIR"/*.sql)
if [ ${#files[@]} -eq 0 ]; then
  echo "drizzle/fork 下没有 .sql。" >&2
  exit 0
fi

applied=0
skipped=0
for f in "${files[@]}"; do
  name="$(basename "$f")"
  hash="$(sha256sum "$f" | cut -d' ' -f1)"
  hit="$("${PSQL[@]}" -tAc "select 1 from __fork_migrations where hash = '${hash}'" || true)"

  if [ "$hit" = "1" ]; then
    echo "  skip    $name"
    skipped=$((skipped + 1))
    continue
  fi

  case "$MODE" in
    --list)
      echo "  pending $name"
      ;;
    --baseline)
      "${PSQL[@]}" -v ON_ERROR_STOP=1 -q -c \
        "insert into __fork_migrations (hash, name) values ('${hash}', '${name}') on conflict do nothing"
      echo "  baseline $name"
      applied=$((applied + 1))
      ;;
    *)
      # -1 让 SQL 与记账写在同一个事务里：要么都成，要么都回滚
      "${PSQL[@]}" -v ON_ERROR_STOP=1 -q -1 \
        -f "$f" \
        -c "insert into __fork_migrations (hash, name) values ('${hash}', '${name}')"
      echo "  apply   $name"
      applied=$((applied + 1))
      ;;
  esac
done

echo "完成：处理 ${applied} 个，跳过 ${skipped} 个（模式 ${MODE}）。"
