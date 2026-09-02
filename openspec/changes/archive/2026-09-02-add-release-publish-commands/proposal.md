## Why

ly-workflow 目前包含 11 个命令（init/explore/propose/apply/archive/review-plan/review-code/commit/rollback/clean-branches/worktree），覆盖了开发-审查-归档闭环和 Git 工具，但缺少**日常高频操作**——发版确认版本号、写 changelog、发包到 registry。这三步每次都要手动执行 git 命令、查规范、写 CHANGELOG 格式，过程繁琐且容易出错（漏 bump 版本号导致 CI/CD 失败、changelog 格式不统一、npm publish 忘了先构建）。

基于已升级到 v2.0.0 的 liyang-gitflow/liyang-changelog/liyang-npm-publish 三个 skill（均已支持 SemVer 自动推导 + Keep a Changelog 标准格式），将其实体化为 ly-workflow 的三个内置 slash command。

## What Changes

- **新增 `/ly:release`**：GitFlow 发版命令，覆盖 feature 分支创建、release 发版、hotfix 紧急修复、dev-offline 同步四个场景；版本号按 SemVer + Conventional Commits 自动推导建议，用户确认后执行
- **新增 `/ly:changelog`**：Keep a Changelog 格式 CHANGELOG.md 生成命令，按 commit 前缀自动分组（feat→Added、fix→Fixed、其余→Changed），无对应提交的分组自动省略
- **新增 `/ly:publish`**：npm 包发布命令，覆盖 bmc 私域 Nexus、GitHub Packages、npmjs.org + GitHub Release、CI 自动发布（tag push 触发）四个场景；发布前走前置检查→版本号自动推导→构建→发布→验证完整流程
- **`src/utils/installer-data.ts`** 注册 3 个新命令（category: `release`），与现有核心命令一样全量安装
- 更新 CLAUDE.md、templates/CLAUDE.md 的命令数（11→14）与索引

## Capabilities

### New Capabilities

- `release-publish-commands`: 三个发布管线 slash command——版本号自动推导、changelog 自动生成、npm 包发布到多种 registry——统一安装到 `~/.claude/commands/ly/`，与其他核心命令一样全量安装

### Modified Capabilities

（无——这是新增命令，不修改现有 spec 级行为）

## Impact

- **新增文件**：`templates/commands/release.md`、`templates/commands/changelog.md`、`templates/commands/publish.md`
- **修改文件**：`src/utils/installer-data.ts`（`CommandCategory` union + 3 条 `cmd()` 注册）、`src/utils/__tests__/installer.test.ts`（命令数断言 11→14，新增 category 断言）、`CLAUDE.md`（根目录变更记录+命令表）、`templates/CLAUDE.md`（模板索引）
- **不影响**：installer.ts（自动从 templates/ 目录发现）、menu.ts（help 从 getWorkflowConfigs() 动态读取）、init.ts、types、i18n、codeagent-wrapper