#!/usr/bin/env bash
# [daoyou-fork] 接口面快照扫描
#
# 用途：上游改了控制器或前端调用路径时，merge 不会报冲突（因为那些行我们没碰），
#       但接口面已经错位。本脚本把「后端已注册路由」与「前端调用路径」各导出一份清单，
#       在同步 workflow 里对上游旧版/新版各跑一次并 diff。
#
# 用法：scan-interface-surface.sh <仓库根目录> [--selftest]
# 输出：stdout 一份人类可读报告（含 UNMATCHED 硬错误）

set -uo pipefail

scan() {
  local root="$1"
  local api_dir="$root/apps/api/src"
  local web_dir="$root/apps/web/src"

  if [ ! -d "$api_dir" ] || [ ! -d "$web_dir" ]; then
    echo "RESULT=UNKNOWN"
    echo "REASON=缺少 apps/api/src 或 apps/web/src，项目结构可能大改"
    return 0
  fi

  local tmp
  tmp=$(mktemp -d)

  # 1) 后端控制器前缀，例如 /api/admin/gm
  grep -rhoE "@Controller\(['\"][^'\"]+['\"]" "$api_dir" --include='*.ts' 2>/dev/null \
    | sed -E "s/^@Controller\(['\"]//; s/['\"]$//" \
    | sed -E 's#^/*#/#' \
    | sort -u > "$tmp/backends.txt"

  # 2) 前端 apiFetch 调用路径（去掉查询串与模板变量）
  grep -rhoE "apiFetch\([[:space:]]*[\`'\"]/api/[^\`'\")]*" "$web_dir" \
    --include='*.ts' --include='*.tsx' 2>/dev/null \
    | sed -E "s/^apiFetch\([[:space:]]*[\`'\"]//" \
    | sed -E 's/\$\{[^}]*\}/*/g' \
    | sed -E 's/[?#].*$//' \
    | sed -E 's#/+$##' \
    | sed -E "s#^/*#/#" \
    | sort -u > "$tmp/frontends.txt"

  local unmatched=0
  local weak=0
  : > "$tmp/unmatched.txt"
  : > "$tmp/weak.txt"
  while IFS= read -r path; do
    [ -z "$path" ] && continue
    local covered=0
    local best=""
    while IFS= read -r prefix; do
      [ -z "$prefix" ] && continue
      case "$path" in
        "$prefix"|"$prefix"/*)
          covered=1
          if [ ${#prefix} -gt ${#best} ]; then best="$prefix"; fi
          ;;
      esac
    done < "$tmp/backends.txt"
    if [ "$covered" -eq 0 ]; then
      echo "$path" >> "$tmp/unmatched.txt"
      unmatched=$((unmatched + 1))
    else
      # 控制器前缀少于 3 段（如 api/admin）覆盖面过宽，命中但单独提示，避免掩盖真实缺口
      local segs
      segs=$(printf '%s' "$best" | awk -F/ '{print NF}')
      if [ "$segs" -lt 3 ]; then
        echo "$path  ->  $best" >> "$tmp/weak.txt"
        weak=$((weak + 1))
      fi
    fi
  done < "$tmp/frontends.txt"

  echo "BACKEND_CONTROLLERS=$tmp/backends.txt"
  echo "FRONTEND_CALLS=$tmp/frontends.txt"
  echo "UNMATCHED_COUNT=$unmatched"
  echo "WEAK_COUNT=$weak"
  if [ "$unmatched" -gt 0 ]; then
    echo "--- 前端调用无对应后端控制器（硬错误） ---"
    cat "$tmp/unmatched.txt"
  fi
  if [ "$weak" -gt 0 ]; then
    echo "--- 仅被宽泛前缀覆盖（建议人工确认） ---"
    cat "$tmp/weak.txt"
  fi
  echo "--- 后端控制器 ---"
  cat "$tmp/backends.txt"
  return 0
}

selftest() {
  local base
  base=$(mktemp -d)
  local fail=0

  # 场景 A：完全匹配 → 期望 UNMATCHED_COUNT=0
  mkdir -p "$base/a/apps/api/src" "$base/a/apps/web/src"
  echo "@Controller('api/admin/gm')" > "$base/a/apps/api/src/gm.controller.ts"
  echo "apiFetch('/api/admin/gm/players?q=x')" > "$base/a/apps/web/src/page.tsx"
  local out_a
  out_a=$(scan "$base/a")
  case "$out_a" in
    *UNMATCHED_COUNT=0*) ;;
    *) echo "FAIL: 场景 A 期望 0 未匹配"; fail=1 ;;
  esac

  # 场景 B：前端调用后端不存在 → 期望 UNMATCHED_COUNT=1
  mkdir -p "$base/b/apps/api/src" "$base/b/apps/web/src"
  echo "@Controller('api/admin/gm')" > "$base/b/apps/api/src/gm.controller.ts"
  echo "apiFetch('/api/admin/ghost/deliver')" > "$base/b/apps/web/src/page.tsx"
  local out_b
  out_b=$(scan "$base/b")
  case "$out_b" in
    *UNMATCHED_COUNT=1*) ;;
    *) echo "FAIL: 场景 B 期望 1 未匹配"; fail=1 ;;
  esac

  # 场景 C：结构缺失 → 期望 UNKNOWN
  mkdir -p "$base/c"
  local out_c
  out_c=$(scan "$base/c")
  case "$out_c" in
    *RESULT=UNKNOWN*) ;;
    *) echo "FAIL: 场景 C 期望 UNKNOWN"; fail=1 ;;
  esac

  rm -rf "$base"
  if [ "$fail" -eq 0 ]; then
    echo "SELFTEST=PASS"
  else
    echo "SELFTEST=FAIL"
    return 1
  fi
}

if [ "${2:-}" = "--selftest" ] || [ "${1:-}" = "--selftest" ]; then
  selftest
  exit $?
fi

if [ -z "${1:-}" ]; then
  echo "用法: $0 <仓库根目录> [--selftest]" >&2
  exit 2
fi

scan "$1"
