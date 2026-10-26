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
| `drizzle/fork/001_gm_panel.sql` | fork 自有迁移：兑换码定向列 + 审计表（**刻意不放进 drizzle 编号序列**，见「迁移编号隔离」） |
| `scripts/apply-fork-migrations.sh` | fork 迁移执行器：`__fork_migrations` 记账、幂等、支持 `--baseline` |
| `.github/scripts/scan-interface-surface.sh` | 接口面快照扫描 |
| `.github/scripts/detect-gm-panel.sh` | 上游是否已实现 GM 的探测器 |
| `.github/workflows/sync-upstream.yml` | 每日同步 |

### L1 —— 对上游文件的最小追加（共 13 处，均为单行/单块级追加）

| 文件 | 改动 |
| --- | --- |
| `apps/api/src/lib/drizzle/schema.ts` | `redeemCodes` 加 4 列 + 2 索引；新增 `gmAuditLogs` 表 |
| `apps/api/src/admin/admin.module.ts` | 注册 `GmModule`、LLM 配置控制器与服务 |
| `apps/api/src/lib/repositories/app-settings-config.ts` | 加 `runtime_llm_config_v1` 键 |
| `apps/api/src/utils/aiClient.ts` | `resolveModel` 前置「本地接口」分支 |
| `apps/api/src/admin/reward-items.service.ts` | 道装属性覆盖 + 选项目录透出 |
| `apps/api/src/admin/reward-items.controller.ts` | 加 `GET equipment-options` |
| `packages/contracts/src/adminItemGeneration.ts` | equipment 分支放开 baseStats/element/attributeBonuses/essenceIds/artId/formationInscriptions |
| `apps/api/src/admin/application/RedeemCodeApplicationService.ts` | 领取时校验定向绑定；导出 `isBoundRedeemCode` |
| `apps/api/src/cultivator/profile.service.ts` | 定向码跳过「炼气后期」公开兑换门槛 |
| `apps/web/src/route-definitions/admin.tsx` | 注册 5 条路由 |
| `apps/web/src/routes/admin/_config/nav.ts` | 加 3 个导航项 |
| `apps/web/src/routes/admin/_components/RewardItemPicker.tsx` | 道装属性编辑区 |
| `apps/web/index.html` | 非安全上下文的 `crypto.randomUUID` polyfill |

> 13 处已远超「3–4 处」的常见阈值，但每处都是单行/单块级追加，且都带锚点。
> 再增加 L1 前请先考虑能否放进 L0。完整清单以 `.github/fork-patches.json` 的 `touches` 为准。

### L2 —— 禁止改动

`apps/api/src/dev-tools/**`、`app.module.ts`、`ResourceEventCommitter`、库存与战斗领域层。
这些一改，上游每次重构都要手工解冲突。

## 同步流程

`.github/workflows/sync-upstream.yml`，每日 4 次（UTC 01/07/13/19，即北京时间 09/15/21/03），
也可手动触发（`report` / `pr` / `direct`）：

1. fetch 上游，SHA 未变则直接退出（省 CI 分钟数）；同时把 fork 自身的 `fork_sha` 写进 output
2. 更新 `upstream-dev` 镜像分支 —— **只推引用，不检出**：
   `git push origin <sha>:refs/heads/upstream-dev --force`
3. 接口面扫描：对上游旧版/新版各跑一次 `scan-interface-surface.sh`，diff 写进 job summary
4. 风险扫描：上游本次改动的文件 ∩ 补丁 `touches` → 命中则 PR 标题加「补丁文件受影响」；`LICENSE` 被改单独告警
5. 探测上游是否已实现 GM 面板 → 结果写进 summary
6. `checkout -B sync/<日期> origin/master` + `git merge 上游`
   - 推 sync 分支（始终推，便于回滚）
   - 无冲突则继续跑 `pnpm install --frozen-lockfile` + `pnpm run typecheck`
   - 按下面的落库策略决定「直推 master」还是「开 PR」

### 落库策略

| 触发方式 | 直推 master 的条件 | 否则 |
| --- | --- | --- |
| 定时（`mode` 为空，按 `auto` 处理） | 无冲突 **且** 类型检查通过 **且** 补丁锚点完整 | 推 sync 分支 + 开 PR |
| 手动 `direct` | 无冲突 **且** 类型检查通过 | 推 sync 分支 + 开 PR |
| 手动 `pr` | 永不直推 | 开 PR |
| 手动 `report` | 不合并、不推分支 | 只写 summary |

PR 标题会带原因：`[需人工] …（存在冲突 / 类型检查未通过 / 补丁锚点丢失）`。
类型检查失败时，最后 30 行输出会写进 job summary，便于判断是代码问题还是环境问题。

**「补丁锚点完整」取代了原来的「上游没碰过补丁文件」**。原因：按文件粒度拦截太保守——
`schema.ts` 这类追加式改动 git 能自动合并，但上游 300 个提交里改了 16 次，
按文件拦等于每三次上游批次就废掉一次自动合并，最后表现为「永远落后」。
现在改为在上游碰过的补丁文件里检查 `daoyou-fork` 锚点是否还在，丢了才拦。

### 为什么第 2 步绝不能 `git checkout`

这是 2026-10-24 修掉的一个真实故障，形态是「上游一有提交，同步就失败」：

```
Error: Cannot find module './.github/fork-patches.json'
```

原来的写法是 `git checkout -B upstream-dev <上游sha>`，它会把工作区整个切成**上游的树**。
而 `.github/fork-patches.json`、`.github/scripts/*` 是 fork 独有文件，上游树里没有，
于是紧随其后的风险扫描 `require('./.github/fork-patches.json')` 直接崩。

它只在「上游真的有新提交」时触发：没有新提交时第 2 步被跳过，工作区还是 fork 的树，
所以历史记录里成功与失败交替出现，看起来像偶发。修复后三步都不再依赖工作区状态：

- 更新分支改成只推引用
- 风险扫描 / 探测器脚本改成 `git show "$FORK_SHA:<path>"`，从 git 对象读
- 接口面扫描同样从对象取；并检查两侧输出是否都为空（空 = 脚本没跑起来，不是「无变化」），
  否则 `|| true` 会把故障伪装成「无变化」

### 用 GITHUB_TOKEN 推的 commit 不触发构建

`direct` / `auto` 模式合并后由 CI 推送 master，这个推送用的是 `GITHUB_TOKEN`，
**不会触发 `on: push` 的 `docker-publish`**。所以同步步骤末尾显式：

```bash
gh workflow run docker-publish.yml --ref master --repo "${{ github.repository }}"
```

两个坑都踩过：

- **必须带 `--repo`**。本 workflow 前面执行了 `git remote add upstream https://github.com/ChurchTao/Daoyou.git`，
  `gh` 按 remote 推断仓库时会选到**上游**，报 `HTTP 404: workflow docker-publish.yml not found`
  （URL 里能看到 `ChurchTao/Daoyou`），而步骤本身因为 `set -uo pipefail`（无 `-e`）不会失败，
  只打 warning——看起来一切正常，实际没有构建。
- 触发后要确认 `Publish images` 真的出现了 `workflow_dispatch` 记录，不能只看步骤结论。

## 分支策略

| 分支 | 性质 | 谁写 | 保留策略 |
| --- | --- | --- | --- |
| `master` | 唯一主线 | 人 + CI | 永久 |
| `upstream-dev` | 上游镜像指针，供同步比对「上次同步到哪」 | CI | 永久 |
| `sync/upstream` | 同步候选合并结果（PR 用） | 仅 CI（`--force` 覆盖） | 永久一条，不新建 |
| `archive/sync-YYYYMMDD` | tag，删分支前的快照 | 人工 | 永久（可回滚） |

**不要再按日期建分支。** 旧实现用 `sync/$(date +%Y%m%d)`，每次同步新建一个、用完没人删，
两个月就堆出若干条（2026-10-26 清了 3 个，其中一个还留着旧的冲突提交）。
固定名 `sync/upstream` 还有个附带好处：PR 开着时再同步，force-push 会更新同一个 PR，不会开新 PR。

**两道自动兜底**：

- 仓库设置 `delete_branch_on_merge = true` —— PR 合并后自动删分支。
- `.github/workflows/prune-branches.yml` —— 每周一 04:23 UTC 扫 `sync/*`：
  `ahead_by == 0` 的删除；仍有未合并提交的**保留并在 job summary 点名**，
  避免「同步烂在某条分支上没人管」。手动触发默认 dry-run。

**删分支前先打归档 tag**（可回滚）：

```bash
gh api repos/<owner>/<repo>/git/refs -f ref=refs/tags/archive/sync-YYYYMMDD -f sha=<branch sha>
gh api -X DELETE repos/<owner>/<repo>/git/refs/heads/sync/YYYYMMDD
```

## 镜像构建触发规则

每次 push master 都会重建 app / web 两个镜像（实测单次 2–3 分钟）。为了不让纯文档提交
白白重建，`docker-publish.yml` 用 `paths-ignore` 排除了 12 类路径：

| 类别 | 路径 |
| --- | --- |
| 文档 | `**/*.md`、`docs/**`、`LICENSE` |
| 仓库配置 | `.gitignore`、`.editorconfig`、`.github/FUNDING.yml`、`.github/ISSUE_TEMPLATE/**` |
| 补丁清单与同步机制 | `.github/fork-paths.txt`、`.github/fork-patches.json`、`.github/scripts/**`、`.github/workflows/sync-upstream.yml` |
| 赞助素材 | `sponsorkit/**` |

依据：`docker/Dockerfile.app` 虽然 `COPY . .`，但产物只取决于 `apps/**`、`packages/**`
与依赖清单（`package.json` / `pnpm-lock.yaml` / `pnpm-workspace.yaml`）。

两条边界，改的时候别踩：

- **不忽略 `docker-publish.yml` 自身** —— 否则改 workflow 时，改动是否合法就无从验证。
- **路径过滤只对分支推送生效**，推 `v*` tag 仍然会构建。

需要强制重建（比如镜像缓存出问题）：Actions 里手动 `workflow_dispatch`，它带 `push` 开关。

## 迁移编号隔离（根治同步冲突）

**问题数据**（2026-10-26 实测，上游近 300 个提交）：

| 文件 | 上游改动次数 | 是否真冲突 |
| --- | --- | --- |
| `drizzle/meta/_journal.json` | **123** | 每次上游加迁移都冲突（idx 撞号） |
| `drizzle/meta/00NN_snapshot.json` | 每次加迁移一次 | `add/add` 冲突 |
| `apps/api/src/lib/drizzle/schema.ts` | 16 | **自动合并，不冲突** |

结论：同步冲突**几乎 100% 来自「fork 迁移占用了上游的编号序列」**，
与我们改的业务代码无关。把迁移顺延到下一个号只能撑到上游再排到那个号——治标。

### 做法：fork 迁移退出编号空间

```
drizzle/              上游的迁移与 meta，我们不改（merge 冲突时一律取 upstream）
drizzle/fork/         fork 自有迁移，编号自排：001_gm_panel.sql、002_xxx.sql…
```

- **记账表** `__fork_migrations(hash, name, applied_at)`，`hash = sha256(SQL 文件内容)`，
  与 drizzle 的 `__drizzle_migrations` 完全独立。
- **执行** `bash scripts/apply-fork-migrations.sh`；SQL 与记账在同一个事务里（`psql -1 -f ... -c insert`），
  要么都成要么都回滚。
- **已有数据的库首次接入**：`bash scripts/apply-fork-migrations.sh --baseline`
  （只记账不执行，避免把已存在的列再 ADD 一遍）。
- **`drizzle/meta/_journal.json` 一旦冲突，直接 `git checkout --theirs`** ——
  我们的版本里不该有 fork 条目，取上游的永远正确。

### 新增一个 fork 迁移

1. 写 `drizzle/fork/00N_描述.sql`（**不要** `drizzle-kit generate`，不要碰 journal）
2. 部署后执行 `bash scripts/apply-fork-migrations.sh`
3. 登记到 `.github/fork-paths.txt`（目录已登记则无需逐文件）

### 副作用与代价

- 生产镜像不含 `drizzle-kit`，迁移本来就靠外部执行，所以这个改动不增加部署复杂度。
- `drizzle-kit generate` 只反映上游 schema，不会看到 fork 迁移——这是刻意的：
  fork 的 schema 变更手工写 SQL，换来的是同步永不因迁移冲突。
- **记得跑脚本**，否则新环境会缺列。部署流程里应包含这一步。

## 迁移编号冲突流程（0067 撞车实录）

> **历史存档（2026-10-26）**：本节做法（顺延编号 + 线上补记账）已不再使用。
> fork 迁移已迁出 drizzle 编号空间（见上一节），此流程只在上游之外的场景才需要参考。

fork 的迁移编号和上游**独立递增**，两边都会自然用到同一个号。2026-10-22 同步时，
上游 `0067_sponsorship_order_recipients`（when `1792637821975`）撞上了我们的
`0067_gm_panel`（when `1792642834412`）。按下面流程处理，下次照做即可。

### 第 0 步：先搞清 drizzle 凭什么决定「跑不跑」

这是最容易踩的坑，**不是看编号，是看时间戳**：

```
journal 里该条迁移的 "when"  <  库里 __drizzle_migrations 最后一条 created_at
    →  drizzle 认为「已经处理过」，永久跳过，且不报错
```

后果：编号顺延后，上游那条时间戳更早的迁移会被**静默跳过**，代码却在用它的新字段，
运行期才炸。所以「改完编号就完事」是错的，必须额外补库。

### 第 1 步：确认是否真的撞车

```bash
git merge --no-commit --no-ff upstream/master      # 先试合并
git diff --name-only --diff-filter=U               # 只看冲突文件
grep -n '"tag"' drizzle/meta/_journal.json | tail -8
```

冲突只出现在 `drizzle/meta/_journal.json` 与 `drizzle/meta/0067_snapshot.json` 时，
`schema.ts` 通常能自动合并（两边改的是不同区块）。

### 第 2 步：编号处置规则

| 项 | 规则 |
| --- | --- |
| 上游迁移 | **保持原号**，SQL 与 `when` 一律不动 |
| 我们的迁移 | 顺延到下一个空号，**SQL 内容一个字节不改** |
| 我们的 `when` | **保持原值**（天然晚于上游，顺序自动正确） |
| 我们的 snapshot | 另存为新号，并把 `prevId` 改指上游新的 snapshot `id` |
| `_journal.json` | 按 `when` 升序排列两条，`idx` 连续 |

> 顺延只改文件名和 journal 的 `tag`，不改 SQL —— 因为线上库已经按旧哈希记过账（见第 4 步）。

### 第 3 步：解冲突

```bash
git checkout --theirs drizzle/meta/0067_snapshot.json      # 上游的 0067 快照
git mv drizzle/0067_gm_panel.sql drizzle/0068_gm_panel.sql
git mv drizzle/meta/0067_snapshot.json drizzle/meta/0068_snapshot.json
# 手改 0068_snapshot.json 的 prevId → 上游 0067 snapshot 的 id
# 手改 _journal.json：上游 0067 保留，我们的改成 0068 且 when 不变
```

### 第 4 步：线上库补跑（关键，不可省）

drizzle 判断「已应用」用的是 `hash = sha256(SQL 文件原始内容)`。我们的迁移内容没变，
哈希不变，所以顺延后**不会被重复执行**；但上游那条被 `when` 规则跳过了，必须手工补：

```bash
# 1) 直接执行上游 SQL
docker exec -i <pg容器> psql -U <user> -d <db> < drizzle/0067_xxx.sql

# 2) 按上游原 when 补一条记账行
HASH=$(sha256sum drizzle/0067_xxx.sql | cut -d' ' -f1)
docker exec -i <pg容器> psql -U <user> -d <db> -c \
  "insert into drizzle.__drizzle_migrations (hash, created_at) values ('$HASH', <上游 when>);"
```

想先验证哈希算法是否就是「文件内容的 sha256」：拿一条**已经应用过**的迁移反推，
算出来的值应与库里 `hash` 完全一致。

### 第 5 步：验收清单

| 检查 | 期望 |
| --- | --- |
| `select count(*) from information_schema.tables where table_schema='public'` | 与迁移总数相符（本次 82） |
| `select count(*) from drizzle.__drizzle_migrations` | 主库 +1 条（本次 69） |
| `\d <上游新表>` | 上游新字段/新表都在 |
| `pnpm run typecheck` | 14/14 |
| 上游新能力接口 | 200 |

### 踩坑备忘

- **`*.sql` 别改名后忘了 `_journal.json`**：两者必须一致，否则 drizzle 找不到文件。
- **`git mv` 掉的旧文件名会留在 history 里**，不要试图重写历史，`_journal.json` 说清楚就行。
- **本地 clone 可能没配 `upstream` remote**，同步前先 `git remote add upstream <URL>` 并
  `git fetch upstream`，否则 `git merge upstream/master` 直接报错。
- **顺延后不要重跑 `drizzle-kit generate`**，它只会又生成一个重复的 0068。

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
