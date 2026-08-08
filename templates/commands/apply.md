---
description: '委托 opsx:apply，按 tasks 实施'
---

# Apply

薄壳命令，委托给原生 `opsx:apply` 技能，不附加自定义编排逻辑（不查询真实 change 名，不接审查/worktree 流程——这是范围取舍，不是受任何原则约束）。

```
Skill({ skill: "opsx:apply", args: "$ARGUMENTS" })
```

委托完成后，追加一句不含具体 change 名的通用提示：

```
如需隔离环境可用 /ly:worktree switch <change-name> 或先 /ly:worktree list 查看
```
