---
description: '读取 OpenSpec change 的 proposal/design/tasks，{{REVIEWER_MODEL}} 分级审查方案合理性，审查-修复循环直到 Critical 清零或触发终止条件'
---

# Review Plan - 方案审查

审查当前 OpenSpec change 的方案是否合理，聚焦遗漏边界、范围不清晰、风险点——不是逐行代码风格。输出 Critical/Warning/Info 分级结果（与 `/ly:review-code` 一致）。若存在 Critical，进入审查-修复循环：Claude 判断是否认可每条 Critical，认可则修改该 change 的 artifact 并自动重新审查，直到清零或触发终止条件。

循环执行期间默认不提交；仅当循环以"正常清零"结束时，才对审查目标全部文件（该 change 的 artifact 与 delta spec，含编排方已暂存的产物与循环修复）统一提交一次（见步骤 5）。传入 `--no-commit` 时，连这次最终的统一提交也不做。

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

审查对象是目标 change 的 artifact 与 delta spec 文件的**当前状态**（`git diff HEAD` 覆盖的未提交改动，或已提交内容），这些文件在循环开始前可能已被编排方（`/ly:propose`）暂存、也可能未暂存，均为正常状态，不需要记录循环开始前的文件状态，也不存在"循环开始前已脏需隔离"的情形。

### 2. 枚举工件路径（仅首轮执行一次；不读取内容）

枚举该 change 目录下的 `proposal.md`、`design.md`、`tasks.md`（存在的部分即可，缺失的容错跳过，不报错）以及 `specs/**/*.md` 的全部 delta spec 文件路径（存在多份时全部枚举，不只取其中一份）。这一步只确定路径，不读取文件内容拼接成字符串——{{REVIEWER_MODEL}} backend 具备在 `WORKDIR` 下自主读取文件的能力。

**基线 spec 引用检测**：检查每份 delta spec 文件是否有显式文字引用了基线 spec 中未被本次修改的既有 Requirement（例如"见……'某 Requirement 名'"这类指代，无论出现在 `## MODIFIED Requirements` 内还是外）。若有，额外把该基线能力对应的 `openspec/specs/<capability>/spec.md` 路径也纳入路径清单，并在 TASK 中说明该文件仅作审查上下文（用于核实引用是否准确），不属于修复对象。

### 3. 调用 {{REVIEWER_MODEL}} 审查（首轮）

```
WORKDIR=$(pwd)
Bash({
  command: "~/.claude/bin/codeagent-wrapper --progress {{LITE_MODE_FLAG}}--backend {{REVIEWER_MODEL}} - \"$WORKDIR\" <<'CODEAGENT_EOF'\nROLE_FILE: ~/.claude/.ly/prompts/{{REVIEWER_MODEL}}/plan-reviewer.md\n<TASK>审查以下OpenSpec方案的合理性：遗漏的边界情况、范围是否清晰、风险点、spec 是否覆盖 proposal 的 What Changes。不做逐行代码风格审查，不把'代码库尚未实现该方案条目'当作 Critical。\n\nchange 目录：openspec/changes/<change-name>/\n请自行读取以下路径的当前内容后再审查：<proposal.md/design.md/tasks.md/全部 delta spec 文件的相对路径清单，逐一列出，不要用\"读取 specs 目录\"这种模糊指代>\n<若步骤 2 检测到基线引用：额外说明\"以下路径仅作审查上下文，不属于本次修复对象：<基线 spec 路径>\">\n</TASK>\nOUTPUT: 审查发现，按严重度分级：Critical/Warning/Info，每条含：位置/条目（含可解析的文件相对路径）、问题描述、建议\nCODEAGENT_EOF",
  run_in_background: true,
  timeout: 1800000,
  description: "审查方案: <change-name>"
})
```

**审查调用失败视为独立终止条件**：若本次调用超时、非零退出、返回空响应，或返回内容无法解析为 Critical/Warning/Info 格式（也不是明确的"无发现"声明），立即停止循环，报告原始失败信息，**不得**把失败等同于"本轮无 Critical"或视为清零通过。

本轮结束后，无论是否有 Critical，都先生成"本轮执行日志"（见"逐轮执行日志"一节），再判定：

若本轮 Critical 数为 0 → 跳到步骤 5 输出报告，结束（不进入循环）。
若本轮 Critical > 0 → 进入步骤 4 循环体。

### 4. 审查-修复循环

对本轮全部 Critical，逐条执行：

**4.1 Claude 先判断是否认可该 Critical**（同 `/ly:review-code`）

- **认可**：判断问题确实存在，进入 4.2 修复。
- **不认可**：判断为误报、对上下文理解有误、或建议本身有问题，则不修改任何文件，但必须在本轮报告里写明反驳理由。

**4.2 修复（仅针对认可的 Critical）**

修改该 change 的 `proposal.md`/`design.md`/`tasks.md`/`specs/**/*.md`（该 change 目录下的 delta spec 文件），修复范围为"Critical 直接指向的条目" + "修复它所必需的直接依赖条目"（例如"proposal 与 tasks 范围不一致"这类问题往往需要同步改动多处才能真正修好；"spec 未覆盖 proposal 的 What Changes"这类问题的修复方式就是编辑对应 delta spec 文件）；不得借机改动无关内容。若改动涉及必需依赖条目，本轮报告必须逐项说明关联性。

**4.3 本轮验证**

修复完成后运行一次 `openspec validate --changes <change-name>`。验证失败 → 立即停止循环，不再进行下一轮修复，报告本轮改动的文件清单及 `openspec validate` 的失败信息，说明需要人工介入。

**4.4 记录本轮改动文件清单（不提交）**

验证通过后，把本轮实际改动的 artifact/delta spec 文件相对路径清单写入本轮报告——供 4.5 步构造下一轮增量 TASK 直接复用，不得靠"运行时的 git 状态"反推（后续轮次还会继续修改文件，仅凭某个时间点的 git 状态无法可靠还原"本轮具体改了什么"）。本轮不执行任何 git commit——提交只发生在循环以正常清零结束之后（见步骤 5）。

**4.5 自动触发下一轮审查（增量传递 + 轮间续聊）**

从第 2 轮起，TASK SHALL NOT 重新传整份 proposal/design/tasks/specs 内容；改为仅包含：

1. 上一轮 {{REVIEWER_MODEL}} 报告的全部 Critical 原文（逐字，不经改写，包含被判定"不认可"的条目）。
2. 路径清单，必须覆盖"本轮实际改动的 artifact/delta spec 文件"（4.4 记录的清单）∪"上一轮全部 Critical 各自指向的 artifact/delta spec 文件"（即使未被修改）。若上一轮某条 Critical 指向的文件已被删除或重命名，路径清单改用新路径（若有）并说明状态变化。

路径清单之外的文件不重新整段传入。若某条上一轮 Critical 的位置字段缺失可解析路径，命令保守处理：将该 change 目录下全部 artifact/delta spec 路径纳入下一轮路径清单，并在报告中说明该情况（不得静默丢弃该 Critical）。

**第 2 轮起的调用方式改为 resume 续聊**：首轮 wrapper 输出末尾的 `SESSION_ID: <id>` 是本流程审查会话的 session_id；从第 2 轮起，把 Bash 调用从 `--backend {{REVIEWER_MODEL}} -` 改为 `--backend {{REVIEWER_MODEL}} resume <session_id> -`（stdin 仍传增量 TASK）。这样审查 agent 在同一会话上下文中复用上一轮记忆（它给的 Critical、已做的修改），无需在 TASK 里整段重传基线——增量传递规则不变，会话记忆提供连续性。若首轮未取得 session_id，后续轮次退化为独立调用，并在本轮报告中如实说明"未启用轮间续聊"。每轮的 SESSION_ID 都以本流程首轮的为准，不因 resume 而更换。

回到步骤 3 的调用方式（只是 TASK 内容换成上述增量内容，且以 resume 续聊），重新调用审查后端，不要求用户手动重新触发命令。生成本轮执行日志后再判定 Critical 是否清零。

### 循环终止条件（任一命中即停止，转步骤 5）

复用 `/ly:review-code` 的同一套规则，全局轮数上限同样默认 5 轮（清零优先于轮数上限：本轮先判 Critical 是否清零，仅非清零时才检查是否达到 5 轮）：

1. **正常清零**：某一轮审查 Critical 数为 0
2. **熔断**：同一个 Critical（以"文件路径 + 问题类别 + 定位锚点（artifact 内的具体条目/章节）"三者共同判定为同一问题）在相邻两轮审查中都被判定为存在，且上一轮 Claude 对它是"认可"状态
3. **无法安全自动修复**：需要产品/业务决策、依赖当前会话不具备的信息，或 Claude 判断信息不足——不得进行猜测性修改
4. **修复后验证失败**：见 4.3（`openspec validate` 未通过）
5. **分歧未决**：Claude 上一轮判断"不认可"（未修改），下一轮 {{REVIEWER_MODEL}} 仍判定同一问题存在
6. **审查对象类型持续系统性误判**：连续 3 轮（含本轮）审查中，每一轮的全部 Critical 都被 Claude 判定为同一大类系统性误判——即 {{REVIEWER_MODEL}} 反复以"该轮 Critical 所依据的判断类别不属于方案审查范畴"为由被判定不认可（例如连续 3 轮的 Critical 均以"代码库尚未实现该方案条目"作为理由），不要求这 3 轮之间 Critical 的文件/类别/锚点相互匹配，只要求"判定为不认可的理由类别"在这 3 轮中一致
7. **达到全局轮数上限**（5 轮，独立于上面 1-6 的判定）

触发条件 2-6（或达到全局轮数上限）时，立即停止循环，不执行任何提交（改动留在工作区），报告中必须明确指出触发的具体条件、涉及的问题（文件/类别/章节/判定依据），并说明需要人工介入。"分歧未决"额外要求并列展示 {{REVIEWER_MODEL}} 每一轮的原始发现与 Claude 每一轮的反驳理由；"审查对象类型持续系统性误判"同样要求并列展示，但展示连续 3 轮（而不是 2 轮）的原始发现与 Claude 每一轮的反驳理由。循环期间的 Warning/Info 不参与终止判定，只在最终报告列出**最后一轮**结果。

### 逐轮执行日志

每一轮 {{REVIEWER_MODEL}} 调用完成后（包括首轮 Critical 为 0、直接结束的情况），都要在报告中包含一个独立区块，逐字展示该轮 {{REVIEWER_MODEL}} 返回的原始 Critical/Warning/Info 内容（不经概括、改写或合并），与 Claude 对该轮每条 Critical 的认可/不认可判定并排列出（若该轮无 Critical，只展示原文）。这个区块在该轮 {{REVIEWER_MODEL}} 调用返回之后即可呈现，不是流式展示。这是给需要核实细节的人看的补充材料；最终报告的主体是人话摘要（见步骤 5），二者并存，不互相替代。

### 5. 输出报告

**正常清零结束：**

先执行统一提交：先 `git add` 该 change 目录下的 `proposal.md`/`design.md`/`tasks.md` 及全部 delta spec 文件（审查目标全部文件——编排方（`/ly:propose`）已暂存的产物与循环期间修复的改动一并暂存；若产物此前已在暂存区则保持，修复改动由本次 `git add` 覆盖进 index），再执行一次统一 commit（仅暂存并提交这些文件，不做范围外的 `git add`），提交信息形如 `fix: review-plan feedback (经 N 轮修复) - <change-name>`。**不存在"循环开始前已脏文件的隔离跳过"**——该 change 目录下的 artifact 与 delta spec 是合法审查对象，产物与修复是同一个待提交单元，全部一并提交；用户手工之前编辑过但未提交的内容同属审查目标，一并提交。若循环期间修改的文件全部属于待提交单元（正常情形），也一并提交，不存在需单独列出的被跳过文件。若循环全程没有任何 Critical 被认可修复（从未发生实际改动），不创建空 commit。若统一提交本身执行失败，在报告中如实说明该失败，视为"清零但提交失败"的独立结果——不重新进入循环（已经清零），但要指出还需要人工手动完成这次提交。若传入 `--no-commit`，跳过这次统一提交，修复结果留给调用方或用户自行处理。

```
📋 方案审查：<change-name>

## Critical（必须修复）
（本次已自动修复 N 个 Critical，或为空——若曾发现并修复过，必须写明"本次已自动修复 N 个 Critical"，不得用"未发现问题"掩盖。每条用非技术人员能看懂的人话概括问题和已做的改动）

## Warning（建议修复，最后一轮结果）
1. [proposal.md / design.md / tasks.md / specs/**/*.md] — <问题描述，人话>
   建议: <具体建议>

## Info（供参考，最后一轮结果）
1. [proposal.md / design.md / tasks.md / specs/**/*.md] — <观察/建议，人话>

## 逐轮执行日志
（见"逐轮执行日志"一节，按轮次顺序列出每轮的 {{REVIEWER_MODEL}} 原文 + Claude 判定，作为补充材料）

---
总轮次: [轮数]
总计（最后一轮）: [N] Critical, [M] Warning, [K] Info
提交: [已提交 <commit信息> / 未提交（--no-commit） / 无可提交内容 / 提交失败：<原始错误>]
```

**熔断/分歧未决/无法安全修复/验证失败/审查调用失败/达到轮数上限/审查对象类型持续系统性误判结束：**

不执行任何提交，改动留在工作区。

```
📋 方案审查：<change-name> — 循环终止：<触发条件>

## 终止详情
<用人话说清楚发现了什么问题、卡在哪、涉及哪些文件/章节>

（"分歧未决"额外展示，展示 2 轮）
### {{REVIEWER_MODEL}} 各轮原始发现
第 N 轮：<原文>
### Claude 各轮反驳理由
第 N 轮：<理由>

（"审查对象类型持续系统性误判"额外展示，展示连续 3 轮）
### {{REVIEWER_MODEL}} 各轮原始发现
第 N 轮：<原文>
第 N+1 轮：<原文>
第 N+2 轮：<原文>
### Claude 各轮反驳理由
第 N 轮：<理由>
第 N+1 轮：<理由>
第 N+2 轮：<理由>

## 逐轮执行日志
（同上）

## 需要人工介入
<人话说明，改动都留在工作区未提交，可用 git diff 查看>

---
总轮次: [轮数]
本次未提交任何改动
```

如从未出现任何 Critical/Warning/Info，明确说明"方案审查未发现问题"，不要保持沉默。
