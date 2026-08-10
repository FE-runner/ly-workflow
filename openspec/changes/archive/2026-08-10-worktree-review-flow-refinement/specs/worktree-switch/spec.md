## MODIFIED Requirements

### Requirement: 按 change 名切换或创建隔离 worktree
`/ly:worktree switch <change-name>` SHALL 接受一个 OpenSpec change 名作为参数，并将其映射为固定的 worktree 路径 `../.ly/<项目名>/<change-name>` 与同名分支；该路径 SHALL 以 `git rev-parse --git-common-dir` 解析出的公共 Git 目录反推主仓库所在位置为基准计算（`<项目名>` 取主仓库目录名），SHALL NOT 依据命令执行时当前所处 worktree 的相对路径推导，保证从主工作区或从任意其他 worktree 调用时，对同一个 change 算出的目标路径一致。执行前 SHALL 先判断目标路径是否已是已注册的 worktree：若是，SHALL 额外校验该路径当前注册的分支名是否严格等于 `<change-name>`——严格等于才直接定位，跳过下方的分支拓扑校验（该 worktree 已存在即视为其内容已可用，不再要求其历史满足祖先关系）；不等于则 SHALL 拒绝执行，报错提示"目标路径已注册但对应分支非 `<change-name>`（当前为 `<实际分支名>`），请手动处理后重试"，SHALL NOT 直接定位、SHALL NOT 输出续接命令。若目标路径尚未是已注册的 worktree（意味着本次需要从 base ref 新建或挂载分支），则 SHALL 额外校验该 change 的 artifact 最近一次 commit 是目标 base ref（仓库默认分支最新提交）的祖先；不满足时 SHALL 拒绝创建，提示该 change 的提交不在默认分支历史上，需先合并/rebase。同时 SHALL 校验 `openspec/changes/<change-name>/tasks.md` 存在且已提交（与 `proposal.md` 一样纳入"change 必须已存在且已提交"的前置条件）——若只有 `proposal.md` 而没有 `tasks.md`，SHALL 拒绝执行并提示"该 change 尚未生成 tasks.md，请先完成规划（如 `/opsx:propose`）再执行 switch"，不产生任何 worktree/分支。

#### Scenario: change 对应的 worktree 尚不存在
- **WHEN** 用户在主工作区执行 `/ly:worktree switch <change-name>`，且 `../.ly/<项目名>/<change-name>` 不存在，该 change 的 `tasks.md` 已存在且已提交，且 artifact commit 是 base ref 的祖先
- **THEN** 系统创建该 worktree 与同名分支，并运行一次项目 baseline 验证（安装依赖 + 跑测试）

#### Scenario: change 对应的 worktree 已存在且分支匹配，跳过拓扑校验
- **WHEN** 用户执行 `/ly:worktree switch <change-name>`，且对应路径已是已注册的 worktree，该路径当前注册的分支严格等于 `<change-name>`（即使该分支尚未合并到默认分支）
- **THEN** 系统跳过分支拓扑校验，直接定位，进入命令输出步骤

#### Scenario: 目标路径已注册但分支不匹配，拒绝定位
- **WHEN** 用户执行 `/ly:worktree switch <change-name>`，`../.ly/<项目名>/<change-name>` 已是已注册的 worktree，但该路径当前注册的分支不是 `<change-name>`（例如被其他分支占用，或曾用于另一个 change 后未清理）
- **THEN** 系统拒绝执行，报错提示"目标路径已注册但对应分支非 `<change-name>`（当前为 `<实际分支名>`），请手动处理后重试"，SHALL NOT 直接定位，SHALL NOT 输出续接命令

#### Scenario: 从另一个 worktree 内调用 switch，目标路径解析仍与主工作区一致
- **WHEN** 用户当前处于某个已切换的隔离 worktree 内，执行 `/ly:worktree switch <another-change-name>`
- **THEN** 系统基于 `git rev-parse --git-common-dir` 反推的主仓库位置计算目标路径，得到与在主工作区直接执行时完全相同的 `../.ly/<项目名>/<another-change-name>`，不会因为当前所处路径不同而算出错误或嵌套的路径

#### Scenario: change 的提交不在默认分支历史上（需要新建场景）
- **WHEN** 用户执行 `/ly:worktree switch <change-name>`，目标路径尚未是已注册的 worktree，该 change 的 artifact commit 位于当前 feature 分支而非默认分支历史上
- **THEN** 系统拒绝创建，报错提示"该 change 的提交不在默认分支历史上，请先合并或 rebase 到默认分支后重试"，不产生任何 worktree/分支

#### Scenario: change 只有 proposal.md, 没有 tasks.md
- **WHEN** 用户执行 `/ly:worktree switch <change-name>`，该 change 目录下只有 `proposal.md`，`tasks.md` 尚不存在
- **THEN** 系统拒绝执行，提示"该 change 尚未生成 tasks.md，请先完成规划再执行 switch"，不产生任何 worktree/分支

#### Scenario: 目标路径存在但不是已注册的 worktree
- **WHEN** 用户执行 `/ly:worktree switch <change-name>`，`../.ly/<项目名>/<change-name>` 路径已存在但不是 Git 已注册的 worktree
- **THEN** 系统报错拒绝，提示"目标路径已存在但不是 Git worktree，请手动处理后重试"，不覆盖、不删除该路径

#### Scenario: 目标分支已存在但被其他 worktree 检出
- **WHEN** 用户执行 `/ly:worktree switch <change-name>`，目标路径不存在，但同名分支已存在且已被另一个 worktree 检出
- **THEN** 系统报错拒绝，提示分支已被占用及占用该分支的 worktree 路径，不创建新 worktree、不移动已占用的分支
