---
description: '委托 opsx:archive，完成后归档并commit'
---

# Archive

委托给原生 `opsx:archive` 技能归档，完成后提交归档产生的文件移动。

```
Skill({ skill: "opsx:archive", args: "$ARGUMENTS" })
```

## 提交归档改动

归档会把 `openspec/changes/<change-name>/` 移动到 `openspec/changes/archive/`，并可能同步更新 `openspec/specs/`。提交涉及的全部文件：

```bash
git add -- openspec/
git commit -m "archive: <change-name>"
```

若无可提交内容或 `git commit` 失败，跳过提交，如实报告原始错误，不视为归档失败。
