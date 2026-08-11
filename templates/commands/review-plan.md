---
description: '读取 OpenSpec change 的 proposal/design/tasks，Codex 分级审查方案合理性，审查-修复循环直到 Critical 清零或触发终止条件'
---

# Review Plan - 方案审查

审查当前 OpenSpec change 的方案是否合理，聚焦遗漏边界、范围不清晰、风险点——不是逐行代码风格。输出 Critical/Warning/Info 分级结果（与 `/ly:review-code` 一致）。若存在 Critical，进入审查-修复循环：Claude 判断是否认可每条 Critical，认可则修改该 change 的 artifact 并自动重新审查，直到清零或触发终止条件。

默认每轮修复+验证通过后立即在循环内部提交；传入 `--no-commit` 时改为"修复后留在工作区，不自动提交"。

## 步骤

### 1. 解析目标 change

按优先级：

1. 若 `$ARGUMENTS` 指定了 change 名称 → 使用该名称
2. 否则枚举 `openspec/changes/` 下的目录，**排除 `archive/` 目录及其内容**
3. 若恰好一个候选 → 直接使用
4. 若多个候选且未指定 → 用 AskUserQuestion 询问用户选哪个
5. 若零个候选 → 询问用户要审查哪个 change，不要猜测

```bash
ls -d openspec/changes/*/ 2>/dev/null | grep -v '/archive/'
```

### 2. 读取工件（每轮都重新读取，不缓存）

读取该 change 目录下的 `proposal.md`、`design.md`、`tasks.md`（存在的部分即可，缺失的容错跳过，不报错），以及该 change 目录下 `specs/**/*.md` 的全部 delta spec 文件（不存在则容错跳过；存在多份时全部读取，按文件路径排序后依次拼接，不只取其中一份）。每一轮审查都重新读取这些文件的**当前内容**（不是 diff）——审查对象是文件当前状态而非变更范围，不需要记录或复用首轮基线，不存在"审查范围漂移"问题。

### 3. 调用 Codex 审查

```
WORKDIR=$(pwd)
Bash({
  command: "~/.claude/bin/codeagent-wrapper --progress --backend codex - \"$WORKDIR\" <<'CODEAGENT_EOF'\nROLE_FILE: ~/.claude/.ly/prompts/codex/plan-reviewer.md\n<TASK>审查以下OpenSpec方案的合理性：遗漏的边界情况、范围是否清晰、风险点、spec 是否覆盖 proposal 的 What Changes。不做逐行代码风格审查，不把'代码库尚未实现该方案条目'当作 Critical。\n\n{proposal.md + design.md + tasks.md + specs/**/*.md 合并内容}\n</TASK>\nOUTPUT: 审查发现，按严重度分级：Critical/Warning/Info，每条含：位置/条目、问题描述、建议\nCODEAGENT_EOF",
  run_in_background: true,
  timeout: 1800000,
  description: "审查方案: <change-name>"
})
```

**审查调用失败视为独立终止条件**：若本次调用超时、非零退出、返回空响应，或返回内容无法解析为 Critical/Warning/Info 格式（也不是明确的"无发现"声明），立即停止循环，报告原始失败信息，**不得**把失败等同于"本轮无 Critical"或视为清零通过。

若本轮 Critical 数为 0 → 跳到步骤 5 输出报告，结束（不进入循环）。
若本轮 Critical > 0 → 进入步骤 4 循环体。

### 4. 审查-修复循环

对本轮全部 Critical，逐条执行：

**4.1 Claude 先判断是否认可该 Critical**（同 `/ly:review-code`）

- **认可**：判断问题确实存在，进入 4.2 修复。
- **不认可**：判断为误报、对上下文理解有误、或建议本身有问题，则不修改任何文件，但必须在本轮报告里写明反驳理由。

**4.2 修复（仅针对认可的 Critical）**

修改该 change 的 `proposal.md`/`design.md`/`tasks.md`/`specs/**/*.md`（该 change 目录下的 delta spec 文件），修复范围为"Critical 直接指向的条目" + "修复它所必需的直接依赖条目"（例如"proposal 与 tasks 范围不一致"这类问题往往需要同步改动多处才能真正修好；"spec 未覆盖 proposal 的 What Changes"这类问题的修复方式就是编辑对应 delta spec 文件）；不得借机改动无关内容。若改动涉及必需依赖条目，本轮报告必须逐项说明关联性。记录本轮实际改动的文件清单（含修改的 delta spec 文件，如适用）。

**4.3 本轮验证**

修复完成后运行一次 `openspec validate --changes <change-name>`。验证失败 → 立即停止循环，不再进行下一轮修复，报告本轮改动的文件清单及 `openspec validate` 的失败信息，说明需要人工介入。

**4.4 提交本轮改动（默认行为，`--no-commit` 时跳过）**

验证通过后，若本轮存在实际改动，立即在循环内部执行一次 commit：仅暂存并提交本轮实际改动的文件，提交信息形如 `fix: review-plan feedback (round N) - <change-name>`。若本轮全部 Critical 都被判定为不认可（没有实际改动），不创建空 commit。**若 commit 本身执行失败**，立即停止循环，不进入下一轮审查，报告 Git 返回的原始错误信息及本轮改动的文件清单。

**4.5 自动触发下一轮审查**

回到步骤 3，重新读取工件当前内容并重新调用 Codex 审查，不要求用户手动重新触发命令。

### 循环终止条件（任一命中即停止，转步骤 5）

复用 `/ly:review-code` 的同一套规则，全局轮数上限同样默认 5 轮（清零优先于轮数上限：本轮先判 Critical 是否清零，仅非清零时才检查是否达到 5 轮）：

1. **正常清零**：某一轮审查 Critical 数为 0
2. **熔断**：同一个 Critical（以"文件路径 + 问题类别 + 定位锚点（artifact 内的具体条目/章节）"三者共同判定为同一问题）在相邻两轮审查中都被判定为存在，且上一轮 Claude 对它是"认可"状态
3. **分歧未决**：Claude 上一轮判断"不认可"（未修改），下一轮 Codex 仍判定同一问题存在
4. **无法安全自动修复**：需要产品/业务决策、依赖当前会话不具备的信息，或 Claude 判断信息不足——不得进行猜测性修改
5. **修复后验证失败**：见 4.3（`openspec validate` 未通过）
6. **审查调用失败**：见步骤 3
7. **提交失败**（默认开启提交时）：见 4.4
8. **达到全局轮数上限**（5 轮）
9. **审查对象类型持续系统性误判**：连续 3 轮（含本轮）审查中，每一轮的全部 Critical 都被 Claude 判定为同一大类系统性误判——即 Codex 反复以"该轮 Critical 所依据的判断类别不属于方案审查范畴"为由被判定不认可（例如连续 3 轮的 Critical 均以"代码库尚未实现该方案条目"作为理由），不要求这 3 轮之间 Critical 的文件/类别/锚点相互匹配，只要求"判定为不认可的理由类别"在这 3 轮中一致

触发条件 2-9 时，立即停止循环，报告中必须明确指出触发的具体条件、涉及的问题（文件/类别/章节/判定依据），并说明需要人工介入。"分歧未决"额外要求并列展示 Codex 每一轮的原始发现与 Claude 每一轮的反驳理由；"审查对象类型持续系统性误判"同样要求并列展示，但展示连续 3 轮（而不是 2 轮）的原始发现与 Claude 每一轮的反驳理由。循环期间的 Warning/Info 不参与终止判定，只在最终报告列出**最后一轮**结果。

### 5. 输出报告

**正常清零结束：**
```
📋 方案审查：<change-name>

## Critical（必须修复）
（本次已自动修复 N 个 Critical，或为空——若曾发现并修复过，必须写明"本次已自动修复 N 个 Critical"，不得用"未发现问题"掩盖）

## Warning（建议修复，最后一轮结果）
1. [proposal.md / design.md / tasks.md / specs/**/*.md] — <问题描述>
   建议: <具体建议>

## Info（供参考，最后一轮结果）
1. [proposal.md / design.md / tasks.md / specs/**/*.md] — <观察/建议>

---
总轮次: [轮数]
总计（最后一轮）: [N] Critical, [M] Warning, [K] Info
```

**熔断/分歧未决/无法安全修复/验证失败/审查调用失败/提交失败/达到轮数上限/审查对象类型持续系统性误判结束：**
```
📋 方案审查：<change-name> — 循环终止：<触发条件>

## 终止详情
<文件/类别/章节/判定依据，或失败的原始信息>

（"分歧未决"额外展示，展示 2 轮）
### Codex 各轮原始发现
第 N 轮：<原文>
### Claude 各轮反驳理由
第 N 轮：<理由>

（"审查对象类型持续系统性误判"额外展示，展示连续 3 轮）
### Codex 各轮原始发现
第 N 轮：<原文>
第 N+1 轮：<原文>
第 N+2 轮：<原文>
### Claude 各轮反驳理由
第 N 轮：<理由>
第 N+1 轮：<理由>
第 N+2 轮：<理由>

## 需要人工介入
<说明>

---
总轮次: [轮数]
本次已自动修复: [N] 个 Critical（若有）
```

如从未出现任何 Critical/Warning/Info，明确说明"方案审查未发现问题"，不要保持沉默。
