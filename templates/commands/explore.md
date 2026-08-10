---
description: '委托 opsx:explore，想清楚再动手；讨论收敛到落地方案时引导走 /ly:propose'
---

# Explore

委托给原生 `opsx:explore` 技能，保持其纯讨论态，不接管 artifact 创建。

```
Skill({ skill: "opsx:explore", args: "$ARGUMENTS" })
```

`opsx:explore` 原生支持在讨论中直接创建 proposal/design/spec，但这样会跳过 `/ly:propose` 的编排（总开关询问、commit、review-plan 审查循环、worktree 询问）。当讨论收敛到"要落地方案"这一步时，不要直接创建 artifact，改为提示用户：

```
讨论已收敛，建议用 /ly:propose 落地方案（走完整的审查+commit 流程）
```

由用户决定是否切换到 `/ly:propose`。
