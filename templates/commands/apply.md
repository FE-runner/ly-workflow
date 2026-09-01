---
description: '委托 routing.implementer 对应的外部 agent 实施 tasks（单次 agentic 调用）；PASS 后立即 commit apply: <change-name>；FAIL 原样呈报转人工（不重试不兜底）'
---

# Apply

不再由 Claude 自己实施代码。读取 `routing.implementer`（`codex`/`hermes`/`openclaw` 三选一），委托 `codeagent-wrapper --backend <routing.implementer>`（`ROLE_FILE: builder.md`）在**当前工作区**以单次 agentic 调用实施全部 tasks。隔离 worktree 的询问/新建统一收敛到 `/ly:propose` 入口（创建方案前从当前分支切），apply 不再触发任何 worktree 询问、不再调用 `/ly:worktree switch`、不再做隔离检测——不在任何 worktree 内时直接在当前目录实施。Implementer agent 返回 `OVERALL: PASS` 后立即 commit（`apply: <change-name>`），作为 `/ly:review-code` 的审查对象；`OVERALL: FAIL` 或调用本身失败时原样呈报，不重试、不切回 Claude 自己实施。

## 步骤

### 1. 确定目标 change 名

按固定优先级解析：

1. `$ARGUMENTS` 中显式且合法的 change 名。
2. `openspec/changes/` 下唯一未归档的 change。
3. 无法唯一确定 → 直接询问用户。

不使用"当前 worktree 反查"或"固定目标路径匹配"（新模型下 worktree 目录/分支锁定为开发分支名、不等于 change 名，不存在可反查的固定路径映射）。

任一步骤无法唯一确定时，不得继续执行后续步骤。

### 2. 读取 routing.implementer，记录实施前快照

读取项目配置中的 `routing.implementer`（有效值 `codex`/`hermes`/`openclaw`）。若配置值不在这三者之内（例如手改配置文件残留的 `claude` 或其他非法字符串），如实报告"实施后端配置值非法：<值>，必须是 codex/hermes/openclaw 之一"并停止，不静默回退到任何默认值。

实施前先记录一次 `git status --porcelain` 作为快照（用于两个目的：检测本次实施前是否已有预存改动；PASS 后计算"本次 Implementer agent 实际改动的文件"范围）：

```bash
git status --porcelain
```

### 3. 委托 Implementer agent 单次 agentic 调用

```
WORKDIR=$(pwd)
Bash({
  command: "~/.claude/bin/codeagent-wrapper --progress {{LITE_MODE_FLAG}}--backend {{IMPLEMENTER_MODEL}} - \"$WORKDIR\" <<'CODEAGENT_EOF'\nROLE_FILE: ~/.claude/.ly/prompts/{{IMPLEMENTER_MODEL}}/builder.md\n<TASK>阅读 openspec/changes/<change-name>/tasks.md，自主实施全部未完成任务：读取所需上下文文件、编写/修改代码、按 tasks.md 里指定的验证方式逐任务验证。不要询问，遇到歧义按最简方案处理。完成后按 Output Format 输出 Execution Report，末尾给出 OVERALL: PASS 或 OVERALL: FAIL。</TASK>\nOUTPUT: ## Execution Report（逐任务 Status/Files changed/Validation，末尾 OVERALL: [PASS/FAIL]）\nCODEAGENT_EOF",
  run_in_background: true,
  timeout: 1800000,
  description: "委托实施: <change-name>"
})
```

**后端二进制缺失时如实报错**：若 wrapper 报告对应 CLI 不存在于 PATH，如实报告"实施后端 <routing.implementer> 二进制缺失"并停止，不静默切换到其他后端。

### 4. 判定 Execution Report

**调用失败视为独立失败情形**：若本次调用超时、非零退出、返回空响应，直接进入下方"FAIL/失败"处理，不得视为 PASS。

解析返回内容末尾的 `OVERALL: PASS` 或 `OVERALL: FAIL`：

- **无法从返回内容中解析出 `OVERALL: PASS/FAIL`**（Implementer agent 未遵守 builder.md 的 Output Format、输出被截断、或给出未知标记如 `PARTIAL`）：按 FAIL 处理，不得默认当作 PASS。
- **`OVERALL: PASS`** → 进入步骤 5（暂存与提交）。
- **`OVERALL: FAIL`** 或上述调用失败/无法解析的情形 → 原样呈报 Execution Report 的原始内容（或调用失败的原始错误/超时信息），停止执行，**不重试同一次调用、不切换到其他后端、不切回 Claude 自己实施、不执行任何提交**。改动可能已部分落地在工作区（半成品），保留原状，由用户决定后续处理（如手动检查、`git diff` 查看、重跑 `/ly:apply`，或改配置换一个 implementer 后重试）。

### 5. 暂存与提交（仅 PASS 时执行）

1. 用步骤 2 记录的快照对比当前 `git status --porcelain`，得到本次 Implementer agent 实际改动/新增的文件路径清单。
2. 若步骤 2 的快照本身就非空（实施前已存在与本次无关的预存改动，如审查修复残留），`git add` 范围仅限上一步算出的"本次实际改动的文件"，SHALL NOT 将预存改动一并暂存/提交，并在报告中说明"预存改动未被提交"。
3. 有实际文件变动则暂存本次实际改动的文件：
   ```
   git add -- <本次实际改动的文件>
   ```
4. **立即 commit**（不留暂存区持有，不再询问是否提交）：
   ```
   git commit -m "apply: <change-name>"
   ```
   `apply: <change-name>` commit 即 `/ly:review-code` 的审查对象。
5. 无变动（Implementer agent 报告 PASS 但 tasks 本身无产出，或已被上一轮 `/ly:review-code` 审查循环提交）则跳过，不创建空 commit。
6. 若 `git commit` 失败，如实报告 Git 返回的原始错误，不中断后续提示。
