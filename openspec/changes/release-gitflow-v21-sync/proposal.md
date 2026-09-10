## Why

`/ly:release` 的内容源 `liyang-gitflow` skill 已在源项目升级 v2.0.0 → v2.1.0（源 commit `92a8e64`），本仓库 `templates/commands/release.md` 同步自 v2.0.0，落后一个版本。需同步三个行为更新：上线合并二选一（新增本地直接合并方式）、主分支名检测规则（master/main 兼容）、三分支同步说明覆盖两种合并方式。

## What Changes

- **`templates/commands/release.md` 重要规则块**：
  - 三分支同步规则的措辞从"release/hotfix 的 PR merge"扩为"PR merge 或本地直接合并"；
  - 新增**主分支名检测规则**：主分支可能是 `master` 也可能是 `main`，执行任何场景前先 `git remote show origin | grep 'HEAD branch'` 检测远端主分支名（附 `git branch -r | grep -E 'origin/(master|main)$'` 兜底），命令示例中的 `master` 一律替换为实际检测到的主分支名，流程逻辑不变。
- **`templates/commands/release.md` release 场景步骤 4**：从"push 后创建 PR 到 master、等 review 后 merge"改为**上线合并二选一**——方式 A 远端 PR 合并（默认，可走 code review）/ 方式 B 本地直接合并（先推送分支留档 → `checkout` 主分支 → `pull` → `merge --no-ff release/<版本号>` → `push`，跳过远端 PR，适合无需 review 的快速上线）；步骤 5 措辞改为"上线合并完成后（无论方式 A 还是 B）"。
- **`templates/commands/release.md` hotfix 场景步骤 4**：同样改为二选一（方式 B 文案为"适合紧急情况快速上线"）；步骤 5 与"注意"行同步覆盖两种方式。
- **文档同步**：根 `CLAUDE.md:173` 与 `README.md:25` 的 `/ly:release` 行补"上线合并二选一（远端 PR / 本地直接合并）+ 主分支名检测（master/main）"。
- **不涉及**：`/ly:changelog`、`/ly:publish`（源更新仅 liyang-gitflow）；`src/` 安装器代码（模板变更，无命令注册变化）；feature/dev-offline 场景（源更新未触及）。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `release-publish-commands`: 新增（ADDED）Requirement 约束 `/ly:release` 的上线合并行为——release/hotfix 场景 SHALL 提供二选一合并方式（远端 PR 默认 / 本地直接合并），并在执行前 SHALL 检测远端主分支名（master/main）；现有 Requirements（命令注册、SemVer 推导、changelog 格式、publish 各项）不波及。

## Impact

- **模板**：`templates/commands/release.md`（重要规则块 + release/hotfix 两处步骤 4 + 配套措辞，约 30 行）。
- **文档**：根 `CLAUDE.md`（命令表 `/ly:release` 行）、`README.md`（命令表 `/ly:release` 行）。
- **不涉及**：npm 依赖、Go wrapper、安装器代码、其他命令模板；已安装用户需重跑 `npx ly-workflow update` 获得新模板。
