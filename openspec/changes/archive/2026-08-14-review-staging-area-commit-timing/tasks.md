## 1. review-code 模板改造

- [x] 1.1 `templates/commands/review-code.md` 步骤 1：审查范围判定改为两级——有未提交变更 → `git diff HEAD`；零 commit 仓库 → 三条固定命令组合（`git diff --cached` + `git diff` + `??` 清单）；工作区干净 → 直接报"无变更可审查"并结束；**删除** `HEAD~1` / `git show HEAD` 兜底分支及步骤 1 中"判定审查范围分支逻辑"的对应描述
- [x] 1.2 `templates/commands/review-code.md` 步骤 4 正常清零段：统一提交从"仅暂存并提交循环期间实际改动的文件"改为"先 `git add` 审查范围内的全部文件（原始改动+循环修复一并暂存），再执行一次 commit"；同步更新对应的提交说明与"原始改动与修复是同一待提交单元"的表述

## 2. review-plan 模板改造

- [x] 2.1 `templates/commands/review-plan.md` 删除步骤 1.5"记录循环开始前的文件状态"及其在步骤 5 统一提交中的"跳过循环开始前已脏文件"隔离逻辑——产物现在是合法审查对象，全部 `git add` 一并提交
- [x] 2.2 `templates/commands/review-plan.md` 步骤 5 正常清零段：统一提交改为"先 `git add` 该 change 目录全部 artifact 与 delta spec 文件，再 commit"；删除"循环开始前已脏文件被跳过"的场景说明；同步更新提交信息示例

## 3. propose 模板改造

- [x] 3.1 `templates/commands/propose.md` 步骤 4：从"无条件 commit"改为"检查 index 干净后 `git add -- openspec/changes/<change-name>/`，按模式分支处理提交时机——全自动：不提交，直接进步骤 6a；手动：不提交，进步骤 6b"，删除"再执行 commit"步骤；保留 index 外已暂存内容检查
- [x] 3.2 `templates/commands/propose.md` 步骤 6b 手动路径："选否（不跑审查）"分支新增询问"是否提交产物"，选是则 commit（`propose: <change-name>`，`git show` 校验文件集合）后结束，选否则产物留暂存区结束；"循环非清零终止"分支（6b.4）新增询问"是否提交"（产物+修复一并提交，如实提醒未经完全验证），再按原有 worktree 询问继续
- [x] 3.3 `templates/commands/propose.md` 顶部 description 与正文对"commit 无条件执行"的表述同步更新为"暂存区持有 + 按模式询问提交"

## 4. apply 模板改造

- [x] 4.1 `templates/commands/apply.md` 顶部 description 更新（"完成后自动commit" → "产物暂存区持有，跳过 review-code 时才询问提交"）
- [x] 4.2 `templates/commands/apply.md` 步骤 5：从"有变动则提交"改为"有变动则 `git add` 本次实际改动文件、不立即 commit；用户明确跳过 review-code 审查时询问是否提交，选是则 commit（`apply: <change-name>`），选否则留暂存区；无变动跳过"

## 5. 文档同步

- [x] 5.1 `templates/CLAUDE.md` 命令表 update 涉及 apply/propose 两行的描述；变更记录新增本 change 条目（含 commit 原则变更说明）
- [x] 5.2 `CHANGELOG.md` 顶部新增本 change 条目（含"propose/apply 不再无条件 commit、产物暂存区持有、审查后提交"等要点）
- [x] 5.3 `templates/CLAUDE.md`/`CHANGELOG.md` 中若存在"auto 续接文案（自动 commit）"、review-plan 提交隔离、review-code 兜底分支等相关描述，一并同步清理

## 6. 验证

- [x] 6.1 `pnpm typecheck && pnpm build && pnpm test` 全绿
- [x] 6.2 检查 `openspec validate --changes review-staging-area-commit-timing` 通过