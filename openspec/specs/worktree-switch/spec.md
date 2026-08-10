## Purpose

让用户以 OpenSpec change 名为唯一输入，一键定位或创建对应的隔离 worktree，并获得续接实施的下一步命令，不用手动想路径和分支名。

## Requirements

### Requirement: 按 change 名切换或创建隔离 worktree
`/ly:worktree switch <change-name>` SHALL 接受一个 OpenSpec change 名作为参数，并将其映射为固定的 worktree 路径 `../.ly/<项目名>/<change-name>` 与同名分支。执行前 SHALL 先判断目标路径是否已是已注册的 worktree：若是，直接定位，跳过下方的分支拓扑校验（该 worktree 已存在即视为其内容已可用，不再要求其历史满足祖先关系）。若目标路径尚未是已注册的 worktree（意味着本次需要从 base ref 新建或挂载分支），则 SHALL 额外校验该 change 的 artifact 最近一次 commit 是目标 base ref（仓库默认分支最新提交）的祖先；不满足时 SHALL 拒绝创建，提示该 change 的提交不在默认分支历史上，需先合并/rebase。同时 SHALL 校验 `openspec/changes/<change-name>/tasks.md` 存在且已提交（与 `proposal.md` 一样纳入"change 必须已存在且已提交"的前置条件）——若只有 `proposal.md` 而没有 `tasks.md`，SHALL 拒绝执行并提示"该 change 尚未生成 tasks.md，请先完成规划（如 `/opsx:propose`）再执行 switch"，不产生任何 worktree/分支。

#### Scenario: change 对应的 worktree 尚不存在
- **WHEN** 用户在主工作区执行 `/ly:worktree switch <change-name>`，且 `../.ly/<项目名>/<change-name>` 不存在，该 change 的 `tasks.md` 已存在且已提交，且 artifact commit 是 base ref 的祖先
- **THEN** 系统创建该 worktree 与同名分支，并运行一次项目 baseline 验证（安装依赖 + 跑测试）

#### Scenario: change 对应的 worktree 已存在，跳过拓扑校验
- **WHEN** 用户执行 `/ly:worktree switch <change-name>`，且对应路径已是已注册的 worktree（即使该 worktree 对应的分支尚未合并到默认分支）
- **THEN** 系统跳过分支拓扑校验，直接定位，进入命令输出步骤

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

### Requirement: 已在隔离环境内时默认不创建，需用户明确确认
系统 SHALL 在执行创建前检测当前会话是否已处于某个 worktree 内（比较 `git rev-parse --git-dir` 与 `--git-common-dir`，并排除子模块导致的误判）。检测到已在 worktree 内时，系统 SHALL 默认不创建新 worktree，需询问用户并获得明确确认后才允许为目标 change 新建独立 worktree。

#### Scenario: 当前已在 worktree 内, 用户确认仍要新建
- **WHEN** 用户在某个 worktree 内执行 `/ly:worktree switch <change-name>`，系统询问后用户明确选择"仍要新建"
- **THEN** 系统继续走"按 change 名切换或创建隔离 worktree"的正常流程，为该 change 新建独立 worktree

#### Scenario: 当前已在 worktree 内, 用户不确认
- **WHEN** 用户在某个 worktree 内执行 `/ly:worktree switch <change-name>`，系统询问后用户未明确确认（包括选择"否"或不回应）
- **THEN** 系统不创建新 worktree，输出当前所在路径与分支，结束执行，不进入命令输出步骤

### Requirement: 输出续接命令但不自动执行；baseline 失败默认阻断输出
创建或定位到目标 worktree 后，系统 SHALL 打印一条可复制的命令，供用户在新终端/会话中手动执行以继续实施，系统本身 SHALL NOT 自动切换目录或启动新会话。若本次触发了 baseline 验证（安装依赖 + 跑测试）且验证失败，系统 SHALL 默认不打印续接命令，而是报告失败摘要并询问用户是否仍要显式继续；仅当用户明确选择继续时才打印续接命令，且该命令的 prompt 文本 SHALL 携带 baseline 失败摘要，并要求新会话先处理环境问题。命中"已注册 worktree 直接定位"的场景 SHALL 跳过 baseline，视为已验证过，直接进入命令输出步骤。

#### Scenario: 命令输出格式（baseline 通过）
- **WHEN** worktree 已就位（新建或已存在），且 baseline 验证通过（或本次跳过了 baseline）
- **THEN** 系统输出形如 `cd ../.ly/<项目名>/<change-name> && claude "继续实施 change: <change-name>，读取 openspec/changes/<change-name>/tasks.md 按任务执行"` 的命令，且当前会话不做进一步动作

#### Scenario: baseline 失败, 默认不输出续接命令
- **WHEN** 新建 worktree 后运行的 baseline 验证失败（如依赖安装报错或测试红）
- **THEN** 系统不打印续接命令，报告 baseline 失败摘要，并询问用户是否仍要显式继续

#### Scenario: baseline 失败, 用户明确选择继续
- **WHEN** 上一 Scenario 中用户明确选择"仍要继续"
- **THEN** 系统打印续接命令，且 prompt 文本中携带 baseline 失败摘要并要求新会话先处理环境问题，再继续实施 tasks

### Requirement: `--auto` 标志只改变续接命令文案，不改变执行方式
`/ly:worktree switch <change-name> --auto` SHALL 在续接命令的 prompt 文本中追加一句要求新会话在实施完 tasks 后自动依次调用 `/ly:review-code`、按其全部终止条件运行（清零/熔断/分歧未决/无法安全修复/验证失败/审查调用失败/达到全局轮数上限，任一命中都停止）的指令；`/ly:review-code` 默认逐轮自动 commit（该轮代码修复完成并通过验证后立即提交），无需在续接指令中额外要求；系统本身 SHALL NOT 因此改变"只打印不自动执行、不跨会话执行"的行为。

#### Scenario: 带 --auto 的续接命令
- **WHEN** 用户执行 `/ly:worktree switch <change-name> --auto`，worktree 已就位，baseline 通过
- **THEN** 系统输出形如 `cd ../.ly/<项目名>/<change-name> && claude "继续实施 change: <change-name>，读取 openspec/changes/<change-name>/tasks.md 按任务执行；实施完成后自动依次调用 /ly:review-code，按其全部终止条件运行，不需要人工确认"` 的命令，仍然只打印、不自动执行

#### Scenario: 不带 --auto 时文案不变
- **WHEN** 用户执行 `/ly:worktree switch <change-name>`（不带 `--auto`）
- **THEN** 系统输出的续接命令维持原文案，不包含自动审查的指令
