---
description: '委托 opsx:apply，按 tasks 实施，完成后自动commit'
---

# Apply

委托给原生 `opsx:apply` 技能实施 tasks，完成后提交本次实施产生的改动（不接审查/worktree 流程——这是范围取舍，不是受任何原则约束）。

```
Skill({ skill: "opsx:apply", args: "$ARGUMENTS" })
```

## 提交实施改动

实施完成后，检查是否有实际文件变动：

```bash
git status --porcelain
```

有变动则提交（`git add -A` 范围限于本次会话实际改动的文件，不做无关文件的批量暂存）：

```bash
git add -- <本次实际改动的文件>
git commit -m "apply: <change-name>"
```

无变动（tasks 本身无产出，或已被上一轮 `/ly:review-code` 审查循环提交）则跳过，不创建空 commit。若 `git commit` 失败，如实报告 Git 返回的原始错误，不中断后续提示。

委托完成后，追加一句不含具体 change 名的通用提示：

```
如需隔离环境可用 /ly:worktree switch <change-name> 或先 /ly:worktree list 查看
```
