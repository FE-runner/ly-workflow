---
description: '委托 opsx:apply，执行前先做隔离检测+worktree询问，按 tasks 实施，产物暂存区持有；用户明确跳过 review-code 审查时才询问提交'
---

# Apply

调用 `opsx:apply` 前先做一次隔离检测：已在该 change 的受控目标 worktree 内直接实施；不在或不匹配则先问一次要不要切换。实施完成后提交本次实施产生的改动。

## 步骤

### 1. 确定目标 change 名

按固定优先级解析：

1. `$ARGUMENTS` 中显式且合法的 change 名。
2. 当前 worktree 反查出的受控 change：枚举 `openspec/changes/` 下未归档的 change，逐一计算其"固定目标路径"（见步骤 2 定义），检查是否等于当前 `git rev-parse --show-toplevel`；恰好一个匹配才采用，零个或多个视为反查失败，进入下一优先级。
3. `openspec/changes/` 下唯一未归档的 change。
4. 无法唯一确定 → 直接询问用户。

任一步骤无法唯一确定时，不得继续调用 `switch` 或执行 `opsx:apply`。

### 2. 隔离检测

复用 `/ly:worktree` Add 步骤 1 的判定逻辑判断"是否在任意 worktree 内"（比较 `git rev-parse --git-dir` 与 `--git-common-dir`，并用 `--show-superproject-working-tree` 排除子模块误判）。

**该 change 的固定目标路径** = `<主仓库上级目录>/.ly/<主仓库目录名>/<change-name>`（`/ly:worktree switch` 的默认路径）。主仓库以 `git rev-parse --git-common-dir` 解析出的公共 Git 目录反推——先把该输出转成绝对路径再取父目录，不依赖当前调用所处 worktree 的相对路径；后续所有路径比较前都做 canonicalize（解析符号链接、规整 `..`/`.`），保证从任意 worktree 或从主仓库子目录调用时算出的路径一致。本次不承认 `--local` 项目内路径为受控目标路径（`switch` 未定义过 `--local` 用法）。

**已在某个 worktree 内**：判定"匹配"需同时满足两个条件——（1）当前 worktree 根路径（`git rev-parse --show-toplevel`）严格等于该 change 的固定目标路径；（2）`git worktree list --porcelain` 中该固定路径下注册的分支名严格等于 `<change-name>`。每次独立读取当前路径与该命令输出完成判定，不依赖、不假设本次会话之前是否调用过 `/ly:worktree switch`。任一条件不满足（含分支名相等但不在固定目标路径下、路径相等但注册分支不对、或 detached HEAD 无法读取分支名），均视为不匹配——不允许"无法判断就默认跳过"，也不允许仅凭"当前路径是某个已注册 worktree 的路径"判定匹配：

```
AskUserQuestion: "当前不在该 change 对应的 worktree 中，是否仍在此继续实施，还是先切换到该 change 的 worktree？"
```

- **仍在此继续** → 按已匹配处理，直接进入步骤 4。
- **先切换** → 走步骤 3（与"当前不在任何 worktree 内、选择切换"完全一致）。

两个条件都满足 → 直接跳过、不询问，进入步骤 4。

**当前不在任何 worktree 内**：

```
AskUserQuestion: "要不要先切换到隔离 worktree？"
```

- **否** → 继续步骤 4。
- **是** → 走步骤 3。

**范围边界**：本条判定只防误操作（正常使用路径下不会误写错分支），不校验目标分支 `HEAD` 是否真的包含该 change 当前的 artifact，不防用户故意手工 reset 分支这类破坏本地 git 状态的操作。

### 3. 调用 switch 并按结果处理

调用 `/ly:worktree switch <change-name>`。结果按"是否最终输出续接命令"判定：

- **输出了续接命令**：视为目标 worktree 已就位，追加提示"新 worktree 中运行 `/ly:apply` 继续"（若续接命令携带 baseline 失败摘要，改为"处理完 baseline 失败问题后，新 worktree 中运行 `/ly:apply` 继续"）并**直接结束**，不执行本次 `opsx:apply`。
- **未输出续接命令**，覆盖以下三种情况，均如实转述/报告对应原因并结束，不输出上述续接提示，不自动回退到"继续在当前工作区实施"：
  1. 分支拓扑校验或"目标路径已注册但分支不匹配"等前置校验拒绝——转述 `switch` 返回的原始错误；
  2. baseline 失败且用户在 `switch` 内部询问中选择不继续——报告 baseline 失败摘要；
  3. `switch` 自身隔离检测触发的"是否仍要新建独立 worktree"询问被用户选择不创建——如实说明仍留在原 worktree、未发生切换。

### 4. 实施

```
Skill({ skill: "opsx:apply", args: "$ARGUMENTS" })
```

### 5. 实施改动的暂存与提交

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
