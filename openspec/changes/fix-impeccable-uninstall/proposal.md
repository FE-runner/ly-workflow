## Why

`ly-workflow init` 里选装的 skill 分类（目前只有 impeccable 前端设计工具，20个 `/ly:polish` `/ly:audit` `/ly:animate` 等命令）只控制**新装**时要不要生成对应命令文件，没有反向清理逻辑。用户第一次装选了Yes（装上20个impeccable命令+skill目录），之后重跑`ly init`/`ly update`改选No，`skipImpeccable=true`只是让`installSkillCommands`跳过生成新文件，旧文件原地不动——用户以为选No就卸载了，实际命令还能用，`~/.claude/commands/ly/`和`~/.claude/skills/ly/impeccable/`里的文件全部残留。

## What Changes

- `installSkillFiles`（`installer.ts:353`）目前不管`skipImpeccable`，无条件`fs.copy`整个`templates/skills/`到`~/.claude/skills/ly/`——即使选跳过impeccable，skill目录还是先被装上，后面靠命令生成那层的"跳过"补救不了。改成`fs.copy`加`filter`选项，被跳过分类对应的模板子目录（如`templates/skills/impeccable/`）从源头就不参与复制
- 同一函数里，安装前先判断：如果本次跳过某分类，且该分类对应的目标目录已存在（历史遗留，不管是不是这次改动上线前装的），直接`fs.remove`整个子目录。**分类标识和模板目录名不是简单同名**——`inferCategory()`现有映射是`tool→tools`、`domain→domains`、`orchestration→orchestration`、`impeccable→impeccable`，需要一份显式的"分类标识→模板/安装目录名"映射表（不能假设字符串相等），这份映射编译期已知，不依赖运行时标记就能处理历史文件——这就解决了"只能清理新装文件"的问题
- `installSkillCommands`（`skill-registry.ts:278`）新增命令清理逻辑：安装前扫描`commandsDir`里文件名匹配"当前模板里该分类下已定义的skill名称"的文件，删除。命名匹配这一层**不依赖生成时标记**，靠的是"该文件名当前仍是某个已知分类的skill名"这个事实——历史文件和新装文件用同一套规则，天然覆盖了历史遗留场景
- 删除前的内容确认不需要新发明一套标记——`generateCommandContent()`（`skill-registry.ts:219`）生成的文件本身就有稳定指纹：固定位置的`# <skill名称>`标题行，加正文里包含该skill的`skillsInstallDir`安装路径子串（如`skills/ly/impeccable/polish/SKILL.md`）。候选删除文件只要同时命中这两个特征（标题行匹配+路径子串匹配），就判定为本工具生成，直接删；命中文件名但内容不含这个路径指纹（比如内容是用户自己写的），跳过删除并记录提示。这个指纹从生成器有史以来的格式就一直存在，不需要新增标记也能覆盖历史文件
- 范围明确：只有交互式`ly init`能更改分类选择；`ly update`固定用`init --skip-prompt`跑，沿用配置文件里已有的`skipImpeccable`值正常执行——**清理逻辑对update同样生效**（只要配置里已经是skip，重跑update照样触发清理），只是update本身不提供"改选"的交互入口。用户要从"已装"切到"跳过"，必须先用交互式`ly init`把配置改过来，之后无论跑init还是update，清理都会执行
- 覆盖范围先只针对`impeccable`这一个当前存在的可选分类，清理机制按`SkillCategory`维度设计成通用形状，但要清楚这不是"零成本"复用——`SkillCategory`目前是闭合联合类型（`'tool' | 'domain' | 'orchestration' | 'impeccable' | 'root'`），`inferCategory()`函数按目录名硬编码识别这几种。未来新增可选分类时，前置条件是先扩展这个联合类型和`inferCategory()`的目录映射，之后才能把新分类标识加进跳过列表复用清理逻辑——本变更把"分类→清理"这条链路做通用，但"新增分类本身"的类型改动不在本变更范围内，需要留一句说明而不是暗示"零改动复用"
- 新增`InstallResult`字段（`removedSkillCommands`、`removedSkillDirectories`、`skippedCleanupFiles`），在`installWorkflows()`的初始`result`对象里同步初始化为空数组（不是只加类型定义），`init.ts`安装总结里展示清理结果

## Capabilities

### New Capabilities
- `cli-skill-category-lifecycle`: `ly-workflow` CLI安装器管理可选skill分类（当前为impeccable）的完整生命周期——装、跳过装、以及从"已装"切换到"跳过"时主动清理残留文件（包括改动上线前就已安装的历史文件）

### Modified Capabilities
（无——现有 `ly-lifecycle-commands`/`ly-review-gates` 两个spec覆盖的是`/ly:*`斜壳命令行为，跟本次改的npm CLI安装器逻辑是两层不同的东西，不涉及）

## Impact

- 受影响文件：`src/utils/installer.ts`（`installSkillFiles`加filter+目录清理）、`src/utils/skill-registry.ts`（`installSkillCommands`命令清理）、`src/types/index.ts`（`InstallResult`新字段）、`src/commands/init.ts`（展示清理结果）
- 行为变更：重装选择跳过某个可选分类，会主动删除该分类下此前已安装的skill目录和命令文件（包含改动上线前的历史安装），非纯新增；`ly update`不提供切换选择的入口，但若配置里已是skip，跑update同样会触发清理——不是"update完全不触发清理"
- 风险：按"文件名是否匹配当前已知skill名单"删除，理论上如果用户手动创建了文件名与某个impeccable skill完全同名的自定义命令，会被误删——这是本设计接受的权衡（见design.md），概率极低但需要在spec场景里写清楚而不是回避
