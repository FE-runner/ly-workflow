---
description: '委托 opsx:apply 实施 tasks，产物暂存区持有；用户明确跳过 review-code 审查时才询问提交（worktree 询问统一收敛到 /ly:propose）'
---

# Apply

调用 `opsx:apply` 在**当前工作区**按 tasks 实施。隔离 worktree 的询问/新建统一收敛到 `/ly:propose` 编排入口，apply 不再触发任何 worktree 询问——不在目标 worktree 内时直接在当前目录实施（需要隔离先自行 `/ly:worktree switch <change-name>`，切换后重跑 apply）。实施完成后按下方规则暂存与提交。

## 步骤

### 1. 确定目标 change 名

按固定优先级解析：

1. `$ARGUMENTS` 中显式且合法的 change 名。
2. 当前 worktree 反查出的受控 change：枚举 `openspec/changes/` 下未归档的 change，逐一计算"固定目标路径"（`<主仓库上级目录>/.ly/<主仓库目录名>/<change-name>`，主仓库以 `git rev-parse --git-common-dir` 反推并 canonicalize），检查是否等于当前 `git rev-parse --show-toplevel`；恰好一个匹配才采用，零个或多个视为反查失败，进入下一优先级。
3. `openspec/changes/` 下唯一未归档的 change。
4. 无法唯一确定 → 直接询问用户。

任一步骤无法唯一确定时，不得继续执行 `opsx:apply`。

### 2. 实施

```
Skill({ skill: "opsx:apply", args: "$ARGUMENTS" })
```

### 3. 实施改动的暂存与提交

实施完成后，检查是否有实际文件变动：

```bash
git status --porcelain
```

有变动则暂存本次实际改动的文件（暂存范围限于本次会话实际改动的文件，不做无关文件的批量暂存）：

```bash
git add -- <本次实际改动的文件>
```

**默认不立即 commit**——产物以暂存区状态存在，作为后续 `/ly:review-code` 的审查对象（见 `/ly:review-code` 的审查范围判定：`git diff HEAD` 覆盖已暂存+未暂存，`??` 清单补未跟踪文件）。产物进入暂存区后，仅当**用户明确表示跳过 review-code 审查**（例如直接回复不跑审查、或上层编排中确认不需要审查）时，才询问是否提交实施产物：

```
AskUserQuestion: "不跑 review-code 审查了，是否提交本次实施产物？"
```

- **是** → `git commit -m "apply: <change-name>"`。
- **否** → 产物留在暂存区，不提交。

若后续衔接 review-code 审查，则提交发生在该审查循环（手动模式下连同"跳过审查/非清零终止"询问一并处理），apply 本身只到"暂存区持有"为止。无变动（tasks 本身无产出，或已被上一轮 `/ly:review-code` 审查循环提交）则跳过，不创建空 commit。若 `git commit` 失败，如实报告 Git 返回的原始错误，不中断后续提示。

委托完成后，追加一句不含具体 change 名的通用提示：

```
如需隔离环境可用 /ly:worktree switch <change-name> 或先 /ly:worktree list 查看
```

若产物仍留在暂存区未提交，提示中追加说明"实施产物当前在暂存区（未提交），可运行 `/ly:review-code` 审查后确认提交"。已完成提交则无需追加。