#!/usr/bin/env bash
# [daoyou-fork] 探测器：上游是否已经自己实现了 GM 面板
#
# 输出契约：
#   RESULT=IMPLEMENTED | SUSPECT | NEEDED | UNKNOWN
#   REASON=<带实际取值的证据串>
#
# 信号设计（必须跑在「上游代码」上，不能跑自己的树）：
#   route  = 后端存在 admin/gm 控制器目录          —— 能力是否出现
#   column = schema 里有 redeem_codes.bound_user_id —— 数据模型是否支持定向码
#   audit  = schema 里有 gm_audit_logs              —— 是否有 GM 审计
#   ui     = 前端有 routes/admin/gm 页面            —— 是否有后台入口
#
# route + column 同时命中判 IMPLEMENTED（自动退役）；单信号判 SUSPECT（仍重放，但要人工看）。

set -uo pipefail

detect() {
  local tree="$1"
  local schema="$tree/apps/api/src/lib/drizzle/schema.ts"

  if [ ! -f "$schema" ]; then
    echo "RESULT=UNKNOWN"
    echo "REASON=schema.ts 不存在，上游结构可能大改"
    return 0
  fi

  local route=0 column=0 audit=0 ui=0
  [ -d "$tree/apps/api/src/admin/gm" ] && route=1
  grep -qF "bound_user_id" "$schema" && column=1
  grep -qF "gm_audit_logs" "$schema" && audit=1
  [ -d "$tree/apps/web/src/routes/admin/gm" ] && ui=1

  local evidence="route=$route column=$column audit=$audit ui=$ui"

  if [ "$route" = 1 ] && [ "$column" = 1 ]; then
    echo "RESULT=IMPLEMENTED"
    echo "REASON=上游已有 admin/gm 控制器与定向码列（$evidence）"
    return 0
  fi

  if [ "$route" = 1 ] || [ "$column" = 1 ] || [ "$audit" = 1 ] || [ "$ui" = 1 ]; then
    echo "RESULT=SUSPECT"
    echo "REASON=出现部分 GM 痕迹，证据不足以自动退役（$evidence）"
    return 0
  fi

  echo "RESULT=NEEDED"
  echo "REASON=上游没有 GM 面板相关痕迹（$evidence）"
  return 0
}

selftest() {
  local base fail=0
  base=$(mktemp -d)

  seed() {
    local dir="$1"
    mkdir -p "$dir/apps/api/src/lib/drizzle" "$dir/apps/api/src/admin" "$dir/apps/web/src/routes/admin"
    echo "export const redeemCodes = {};" > "$dir/apps/api/src/lib/drizzle/schema.ts"
  }

  # 基线：无任何痕迹 → NEEDED
  seed "$base/needed"
  case "$(detect "$base/needed")" in
    *RESULT=NEEDED*) ;;
    *) echo "FAIL: 基线应判 NEEDED"; fail=1 ;;
  esac

  # 只有路由 → SUSPECT
  seed "$base/suspect"
  mkdir -p "$base/suspect/apps/api/src/admin/gm"
  case "$(detect "$base/suspect")" in
    *RESULT=SUSPECT*) ;;
    *) echo "FAIL: 单信号应判 SUSPECT"; fail=1 ;;
  esac

  # 路由 + 定向码列 → IMPLEMENTED
  seed "$base/implemented"
  mkdir -p "$base/implemented/apps/api/src/admin/gm"
  echo "bound_user_id uuid" >> "$base/implemented/apps/api/src/lib/drizzle/schema.ts"
  case "$(detect "$base/implemented")" in
    *RESULT=IMPLEMENTED*) ;;
    *) echo "FAIL: 双信号应判 IMPLEMENTED"; fail=1 ;;
  esac

  # 结构缺失 → UNKNOWN
  mkdir -p "$base/unknown"
  case "$(detect "$base/unknown")" in
    *RESULT=UNKNOWN*) ;;
    *) echo "FAIL: 缺 schema 应判 UNKNOWN"; fail=1 ;;
  esac

  rm -rf "$base"
  if [ "$fail" -eq 0 ]; then
    echo "SELFTEST=PASS"
  else
    echo "SELFTEST=FAIL"
    return 1
  fi
}

if [ "${1:-}" = "--selftest" ]; then
  selftest
  exit $?
fi

if [ -z "${1:-}" ]; then
  echo "用法: $0 <上游代码树> [--selftest]" >&2
  exit 2
fi

detect "$1"
