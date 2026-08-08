## MODIFIED Requirements

### Requirement: Explore/Archive 命令是纯委托；Apply 允许追加通用提示；Propose 是编排入口
`/ly:explore`、`/ly:archive` 必须（SHALL）分别只调用对应的一个原生 OpenSpec 技能（依次为 `opsx:explore`、`opsx:archive`），原样转发 `$ARGUMENTS`，不得包含自定义的多模型分派、环境校验，或超出底层技能本身的输出后处理逻辑。

`/ly:apply` 必须（SHALL）调用 `opsx:apply` 并原样转发 `$ARGUMENTS`；委托完成后允许追加一句**不含具体 change 名**的通用提示（"如需隔离环境可用 `/ly:worktree switch <change-name>` 或先 `/ly:worktree list` 查看"），除此之外不得包含额外编排逻辑或状态查询。

`/ly:propose` SHALL NOT 再是纯委托——它是本能力集里唯一的编排入口：在调用 `opsx:propose` **之前** SHALL 先询问一次自动化总开关（是否走审查循环 + worktree 询问 + 隔离后自动续接实施与审查，只问一次）；委托 `opsx:propose` 完成后 SHALL 无条件对生成的 artifact 执行 commit（不受总开关影响）；当总开关为"是"时 SHALL 依次调用 `/ly:review-plan <change-name> --commit-each-round`，并在该循环以"Critical 清零"结束时询问是否调用 `/ly:worktree switch <change-name> --auto`。

不再要求"四者不得包含自定义编排逻辑"这一统一约束——该约束已随"薄壳不附加自定义逻辑"项目级原则的废止而失效（见 `change-lifecycle-automation` 的 design.md），本条 Requirement 取代原有的统一措辞，对四个命令分别给出各自的边界。

#### Scenario: explore 命令原样转发参数
- **WHEN** 用户运行 `/ly:explore "real-time collaboration"`
- **THEN** 命令以未经改动的参数调用 `opsx:explore` 技能，不附加任何额外步骤

#### Scenario: archive 命令不附加额外行为
- **WHEN** 用户运行 `/ly:archive`
- **THEN** 命令调用 `opsx:archive` 技能，前后不附加任何额外步骤

#### Scenario: apply 命令委托后追加通用提示
- **WHEN** 用户运行 `/ly:apply`
- **THEN** 命令调用 `opsx:apply` 技能完成实施后，追加一句不含具体 change 名的通用 worktree 切换提示，不查询真实 change 名，不新增其他编排逻辑

#### Scenario: propose 命令在委托前先问总开关
- **WHEN** 用户运行 `/ly:propose "add dark mode"`
- **THEN** 命令先询问是否启用自动化收尾流程，再以未经改动的参数 `"add dark mode"` 调用 `opsx:propose` 技能；委托完成后无论总开关选择如何都会提交生成的 artifact

#### Scenario: propose 命令总开关开启时的编排
- **WHEN** 用户运行 `/ly:propose`，总开关选择"是"
- **THEN** 委托并提交后，命令自动调用 `/ly:review-plan --commit-each-round`；该审查-修复循环以 Critical 清零结束时，命令询问是否切换隔离 worktree，选"是"则调用 `/ly:worktree switch --auto`
