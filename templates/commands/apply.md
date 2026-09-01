---
description: '委托 opsx:apply 实施 tasks；实施完成立即 commit apply: <change-name>；不再询问 worktree / 不再暂存区持有（隔离在 /ly:propose 创建方案前决定）'
---

# Apply

调用 `opsx:apply` 在**当前工作区**按 tasks 实施。隔离 worktree 的询问/新建统一收敛到 `/ly:propose` 入口（创建方案前从当前分支切），apply 不再触发任何 worktree 询问、不再调用 `/ly:worktree switch`、不再做隔离检测——不在任何 worktree 内时直接在当前目录实施。实施完成后立即 commit（`apply: <change-name>`），作为 `/ly:review-code` 的审查对象。

## 步骤

### 1. 确定目标 change 名

按固定优先级解析：

1. `$ARGUMENTS` 中显式且合法的 change 名。
2. `openspec/changes/` 下唯一未归档的 change。
3. 无法唯一确定 → 直接询问用户。

不使用"当前 worktree 反查"或"固定目标路径匹配"（新模型下 worktree 目录/分支锁定为开发分支名、不等于 change 名，不存在可反查的固定路径映射）。

任一步骤无法唯一确定时，不得继续执行 `opsx:apply`。

### 2. 实施

```
Skill({ skill: "opsx:apply", args: "$ARGUMENTS" })
```

### 3. 实施改动的暂存与提交（立即 commit）

1. 实施完成后，先检查工作区是否有**与本次实施无关的预存改动**（`git status --porcelain`）：
   - 存在预存改动（如审查修复残留）时，`git add` 范围仅限**本次 `opsx:apply` 实际改动的文件**，SHALL NOT 将预存改动一并暂存/提交，并在报告中说明"预存改动未被提交"。
2. 有实际文件变动则暂存本次实际改动的文件（暂存范围限于本次会话实际改动的文件，不做无关文件的批量暂存）：
   ```
   git add -- <本次实际改动的文件>
   ```
3. **立即 commit**（不留暂存区持有，不再询问是否提交）：
   ```
   git commit -m "apply: <change-name>"
   ```
   `apply: <change-name>` commit 即 `/ly:review-code` 的审查对象。
4. 无变动（tasks 本身无产出，或已被上一轮 `/ly:review-code` 审查循环提交）则跳过，不创建空 commit。
5. 若 `git commit` 失败，如实报告 Git 返回的原始错误，不中断后续提示。