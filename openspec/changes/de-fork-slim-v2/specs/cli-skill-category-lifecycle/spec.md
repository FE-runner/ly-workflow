## REMOVED Requirements

### Requirement: 跳过某可选分类时清理已安装的产物，包括历史安装
**Reason**: 可选 skill 分类（impeccable 等）随 de-fork-slim-v2 整体退役——瘦身后的 ly-workflow 不再安装任何可选 skill 分类（domains/impeccable/scrapling/orchestration/tools 均移除），"跳过某分类"不再是一个可发生的状态，按分类过滤安装/清理的行为随之失去存在前提。
**Migration**: 用户机器上历史安装的分类产物的回收由新能力 `upstream-legacy-cleanup` 承接（update/uninstall 路径统一清理，不再依赖"重装时改选跳过"来触发清理）。

### Requirement: skill 目录复制时按分类过滤源
**Reason**: `templates/skills/` 目录随瘦身整体移除，安装器不再存在"skill 目录复制"这一动作，按分类过滤源无对象可过滤。
**Migration**: 无——安装产物收敛为命令模板、prompts 角色词与 ly-wrapper，不含任何 skill 目录。

### Requirement: 命令清理用生成器固有指纹判断来源，避免误删用户自定义内容
**Reason**: 该需求服务于"按分类清理已装 skill 命令"的行为，分类机制退役后无对应行为；且指纹清理机制的保护对象（可选分类命令文件）不再由本安装器生成。
**Migration**: 清理行为由 `upstream-legacy-cleanup` 承接，其"不误删用户自定义内容"约束以"仅清理指向 ly-workflow 已删除产物的注册项/由 LY 管理区块标识的文件"的方式表达。

### Requirement: 清理机制对未来新增的可选分类通用，但类型扩展是前置条件
**Reason**: 可选分类机制整体退役，"未来新增可选分类"不再是本项目的扩展方向。
**Migration**: 无。

### Requirement: 选择切换范围限定为交互式 init，但 update 仍执行清理
**Reason**: "分类选择切换"这一状态不复存在（没有可选分类可选），对应的选择切换/清理触发语义随之作废；update 的清理职责改由 `upstream-legacy-cleanup` 的遗产清理承担。
**Migration**: update 路径的清理行为见 `upstream-legacy-cleanup` 能力。
