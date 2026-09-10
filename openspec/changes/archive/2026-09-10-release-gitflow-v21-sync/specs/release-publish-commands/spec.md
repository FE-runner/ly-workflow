## ADDED Requirements

### Requirement: release/hotfix 上线合并二选一与主分支名检测
`/ly:release` 的 release 与 hotfix 场景 SHALL 提供两种上线合并方式供用户选择：**方式 A 远端 PR 合并**（默认，push 分支后创建 PR 到主分支，等 code review 通过后 merge）与**方式 B 本地直接合并**（先 push 分支留档 → checkout 主分支 → pull → `merge --no-ff <开发分支>` → push 主分支，跳过远端 PR）。两种方式合并完成后，后续三分支同步步骤 SHALL 以相同流程执行（SHALL NOT 因合并方式不同而分叉）。

主分支名检测规则：主分支可能是 `master` 也可能是 `main`，`/ly:release` 在执行任何场景前 SHALL 先检测远端主分支名（`git remote show origin | grep 'HEAD branch'`；远端不可用或未设置 HEAD 时以 `git branch -r | grep -E 'origin/(master|main)$'` 兜底），命令示例中的 `master` SHALL 替换为实际检测到的主分支名，流程逻辑不变。

#### Scenario: 用户选择本地直接合并方式上线 release
- **WHEN** 用户在 release 场景步骤 4 选择方式 B
- **THEN** 模板执行"push release 分支留档 → checkout 主分支 → pull → merge --no-ff release/<版本号> → push 主分支"，不创建远端 PR，随后照常执行三分支同步

#### Scenario: 用户选择默认远端 PR 方式
- **WHEN** 用户在 release 场景步骤 4 选择方式 A（或不选择、取默认）
- **THEN** 模板按原流程 push 分支并创建 PR，等 review 通过后 merge，随后照常执行三分支同步

#### Scenario: 远端主分支名为 main 时命令替换
- **WHEN** 主分支名检测输出 `HEAD branch: main`
- **THEN** 后续命令示例中的 `master` 全部按 `main` 执行（如 `git checkout main`、`git merge --ff-only origin/main`），流程逻辑不变

#### Scenario: 远端不可用时兜底检测
- **WHEN** `git remote show origin` 不可用或未返回 HEAD branch
- **THEN** 以 `git branch -r | grep -E 'origin/(master|main)$'` 结果确定主分支名后继续

#### Scenario: hotfix 场景同样支持二选一
- **WHEN** 用户执行 hotfix 场景的上线合并步骤
- **THEN** 与 release 场景一致提供方式 A（默认）/方式 B 二选一，合并完成后三分支同步照常执行
