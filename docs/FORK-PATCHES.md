# Fork 补丁清单

本仓库是 [`ChurchTao/Daoyou`](https://github.com/ChurchTao/Daoyou) 的 fork，用于维护**不打算提 PR** 的 GM 后台补丁。

## 机制一页说明

```
master = 上游 master + 若干带「Fork-Patch: <id>」trailer 的提交
```

- 同步方式：**merge 上游**（不用 rebase）。因为 `master` 是公开分支且已被 clone，rebase 必须 force push。
- 补丁识别：只看 commit message 的 trailer，不看 SHA（同步后 SHA 会变）。
- 锚点：每处对上游文件的改动都有 `[daoyou-fork L1] fork-patch: <id>` 注释。
- 探测器：`.github/scripts/detect-gm-panel.sh` 判定上游是否已自行实现该能力，命中则归档退役。

## 补丁登记

| id | 状态 | 说明 | 探测器 |
| --- | --- | --- | --- |
| `gm-panel` | active | 管理员 GM 面板：定向发货 + 批量兑换码（公开/定向）+ 审计 | `detect-gm-panel.sh` |

机器可读清单见 [`.github/fork-patches.json`](../.github/fork-patches.json)。

## 改动分层

### L0 —— 新增文件（零冲突）

| 路径 | 作用 |
| --- | --- |
| `apps/api/src/admin/gm/` | GM 模块：控制器、服务、输入协议、审计写入 |
| `apps/web/src/routes/admin/gm/` | 定向发货页 + 角色选择器 |
| `apps/web/src/routes/admin/audit/` | GM 审计页 |
| `apps/web/src/routes/admin/redeem-codes/batch/` | 批量生成兑换码页 |
| `drizzle/0067_gm_panel.sql` | 迁移：兑换码定向列 + 审计表 |
| `.github/scripts/scan-interface-surface.sh` | 接口面快照扫描 |
| `.github/scripts/detect-gm-panel.sh` | 上游是否已实现 GM 的探测器 |
| `.github/workflows/sync-upstream.yml` | 每日同步 |

### L1 —— 对上游文件的最小追加（共 6 处）

| 文件 | 改动 |
| --- | --- |
| `apps/api/src/lib/drizzle/schema.ts` | `redeemCodes` 加 4 列 + 2 索引；新增 `gmAuditLogs` 表 |
| `apps/api/src/admin/admin.module.ts` | 注册 `GmModule` |
| `apps/api/src/admin/application/RedeemCodeApplicationService.ts` | 领取时校验定向绑定；导出 `isBoundRedeemCode` |
| `apps/api/src/cultivator/profile.service.ts` | 定向码跳过「炼气后期」公开兑换门槛 |
| `apps/web/src/route-definitions/admin.tsx` | 注册 3 条路由 |
| `apps/web/src/routes/admin/_config/nav.ts` | 加 2 个导航项 |

> 6 处已超出「3–4 处」的常见阈值，但每处都是单行级追加，且都带锚点。
> 再增加 L1 前请先考虑能否放进 L0。

### L2 —— 禁止改动

`apps/api/src/dev-tools/**`、`app.module.ts`、`ResourceEventCommitter`、库存与战斗领域层。
这些一改，上游每次重构都要手工解冲突。

## 同步流程

`.github/workflows/sync-upstream.yml`，每日 03:17 UTC，也可手动触发（`report` / `pr` / `direct`）：

1. fetch 上游，SHA 未变则直接退出（省 CI 分钟数）
2. 更新 `upstream-dev` 镜像分支
3. 接口面扫描：对上游旧版/新版各跑一次 `scan-interface-surface.sh`，diff 写进 job summary
4. 风险扫描：上游本次改动的文件 ∩ 补丁 `touches` → 命中则 PR 标题加「补丁文件受影响」；`LICENSE` 被改单独告警
5. 探测上游是否已实现 GM 面板 → 结果写进 summary
6. `checkout -B sync/<日期> origin/master` + `git merge 上游`
   - 无冲突 → 推分支 + 开 PR（`direct` 模式直接推 master）
   - 有冲突 → **不硬来**，把冲突标记原样提交，推分支并开 `[需人工]` PR

## 探测信号（为什么这样设计）

跑在**上游代码**上，四个正交信号：

| 信号 | 含义 | 判定 |
| --- | --- | --- |
| `route` | 上游有 `apps/api/src/admin/gm/` | 能力出现 |
| `column` | schema 有 `bound_user_id` | 数据模型支持定向码 |
| `audit` | schema 有 `gm_audit_logs` | 有审计 |
| `ui` | 上游有 `routes/admin/gm/` | 有后台入口 |

- `route` + `column` 同时命中 → `IMPLEMENTED`，可自动退役
- 单一信号 → `SUSPECT`，仍重放，但要求人工复核
- 全无 → `NEEDED`（当前基线）
- schema 结构大改 → `UNKNOWN`，停止自动处理

自检：`bash .github/scripts/detect-gm-panel.sh --selftest`
基线校验：`bash .github/scripts/detect-gm-panel.sh <上游树>` 当前应为 `NEEDED`。

## 退役记录

（由同步流程人工确认后追加）

| 日期 | 补丁 | 原因 | 归档分支 |
| --- | --- | --- | --- |
| — | — | — | — |
