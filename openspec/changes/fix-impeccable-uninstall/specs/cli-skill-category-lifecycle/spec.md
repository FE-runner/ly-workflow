## Purpose

管理 `ly-workflow` CLI 里可选 skill 分类（当前为 impeccable 前端设计工具）在交互式安装流程中的完整生命周期，确保用户切换选择后已安装的产物状态与最新选择一致，不留残留——包括本变更上线前就已安装的历史产物。

## ADDED Requirements

### Requirement: 跳过某可选分类时清理已安装的产物，包括历史安装
当用户在交互式 `ly init` 中把某个可选 skill 分类的安装意愿由"装"改为"跳过"（例如 `skipImpeccable` 从 `false` 变为 `true`），系统必须（SHALL）在本次安装流程中删除该分类对应的整个 skill 目录（`~/.claude/skills/ly/<分类目录>/`）；对 `commandsDir` 中文件名匹配该分类当前已知 skill 名称清单的命令文件，系统必须（SHALL）将其列为清理候选，**候选文件只有通过下方"命令清理"requirement 定义的指纹校验才会被实际删除**——本条只定义"删除整个skill目录"和"筛出命令清理候选"这两件事，候选是否真的被删由指纹校验requirement决定，二者不冲突。清理判据不依赖安装时写入的运行时标记，因此对本变更上线前已存在的历史安装同样生效。

#### Scenario: 已装 impeccable，重装时改选跳过（含本变更上线前的历史安装）
- **WHEN** 用户在本变更上线前就运行过 `ly init` 选择安装 impeccable（20个命令已生成到 `~/.claude/commands/ly/`，skill文件已生成到 `~/.claude/skills/ly/impeccable/`，这些文件不带任何归属标记），随后升级到带本变更的版本，重跑交互式 `ly init` 且选择不再安装 impeccable
- **THEN** 系统删除 `~/.claude/skills/ly/impeccable/` 整个目录；`commandsDir` 中文件名匹配 impeccable 分类已知 skill 名称的命令文件全部通过指纹校验（均为本工具生成），因此全部删除，安装结果里展示删除数量

#### Scenario: 从未安装过该分类，选择跳过
- **WHEN** 用户从未安装过 impeccable 分类，本次安装选择跳过
- **THEN** 系统正常跳过复制与生成，不产生任何删除操作或报错（无残留文件可清理）

### Requirement: skill 目录复制时按分类过滤源
安装时复制 `templates/skills/` 到目标目录，系统必须（SHALL）在复制阶段就排除被跳过分类对应的模板子目录，而不是先整树复制、再靠后置清理弥补——避免复制失败或中途中断导致的不一致中间状态，也避免"先装上又删掉"这种可观察到的多余IO。

#### Scenario: 跳过 impeccable 时的复制行为
- **WHEN** 本次安装选择跳过 impeccable
- **THEN** `templates/skills/impeccable/` 子树不出现在本次复制操作的源文件列表中；复制完成后系统再执行目标目录清理（删除该分类历史遗留的目标目录，若存在）

### Requirement: 命令清理用生成器固有指纹判断来源，避免误删用户自定义内容
清理某个被跳过分类的命令文件时，系统必须（SHALL）优先信任"文件名匹配当前模板已知的skill名称清单"这一判据来筛出候选；对候选文件，系统必须（SHALL）进一步校验内容是否包含`generateCommandContent()`固有的生成指纹——标题行`# <skill名称>`与正文中该skill的安装路径子串（如`skills/ly/impeccable/<name>/SKILL.md`或对应的`run_skill.js`路径）同时命中方可判定为本工具生成，直接删除；命中文件名但指纹校验不通过的，系统必须（SHALL）跳过删除并在安装结果中提示该文件被跳过清理，交由用户自行判断。这个指纹是生成器输出格式本身固有的、并非新引入的运行时标记，因此对历史文件同样适用。

#### Scenario: 用户创建了与某个 impeccable skill 完全同名的自定义命令
- **WHEN** 用户在 `~/.claude/commands/ly/` 下手动创建了一个文件名与某个 impeccable skill 完全相同、但内容不包含该skill安装路径子串的自定义命令，随后重装选择跳过 impeccable
- **THEN** 系统检测到指纹不匹配，跳过删除该文件，并在安装结果中提示"发现同名但非本工具生成的文件，已跳过清理"

#### Scenario: 历史文件命中名称清单和指纹，直接清理
- **WHEN** 某个历史遗留、生成于本变更上线前的命令文件，其文件名匹配当前模板的skill名称清单，内容里的标题行和安装路径子串跟当前生成器格式一致
- **THEN** 系统判定指纹匹配，直接删除，不因为该文件没有额外的运行时标记而跳过

### Requirement: 清理机制对未来新增的可选分类通用，但类型扩展是前置条件
分类清理逻辑必须（SHALL）以分类标识（`SkillCategory`）为维度通用实现，不得写死为 impeccable 专用分支逻辑。系统必须（SHALL）明确：这个通用性建立在`SkillCategory`已经包含该分类标识、`inferCategory()`已经能识别其目录映射的前提上——新增一个此前不存在的可选分类时，扩展类型定义和目录映射是必要的前置改动，不在"零成本复用"的范围内；前置改动完成后，清理逻辑本身不需要为新分类重新编写。

#### Scenario: 未来新增另一个可选分类
- **WHEN** 未来某个新的分类要变为可选安装项，且该分类此前不存在于`SkillCategory`联合类型中
- **THEN** 开发者需要先扩展`SkillCategory`类型和`inferCategory()`的目录映射（这是新增分类本身的必要工作，不算清理机制的缺口），之后只需把该分类标识加进跳过列表，即可直接复用已有的清理逻辑，无需再写清理代码

### Requirement: 选择切换范围限定为交互式 init，但 update 仍执行清理
系统必须（SHALL）明确：切换某可选分类的安装意愿只能通过交互式 `ly init` 完成；`ly update` 不提供切换入口，但会沿用配置文件中既有的选择值运行——若配置里已经是"跳过"，`ly update` 同样会触发本次改动新增的清理逻辑，不是"update完全不执行清理"。

#### Scenario: 用户尝试通过 update 切换选择
- **WHEN** 用户运行 `ly update` 期望借此关闭 impeccable（但配置里当前仍是"已装"）
- **THEN** `ly update` 保持既有 `skipImpeccable` 配置值不变（该命令不提供切换该项的交互），如需切换需改用交互式 `ly init`

#### Scenario: 配置已是跳过，运行 update 触发清理
- **WHEN** 用户此前已通过交互式 `ly init` 把某分类配置改为跳过，随后运行 `ly update`
- **THEN** `ly update` 沿用配置里的跳过设置，正常执行本次改动新增的清理逻辑（删除该分类的历史遗留文件），不需要用户再跑一次 init
