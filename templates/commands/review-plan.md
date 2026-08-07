---
description: '读取 OpenSpec change 的 proposal/design/tasks，Codex 审查方案合理性'
---

# Review Plan - 方案审查

审查当前 OpenSpec change 的方案是否合理，聚焦遗漏边界、范围不清晰、风险点——不是逐行代码风格。

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

### 2. 读取工件

读取该 change 目录下的 `proposal.md`、`design.md`、`tasks.md`（存在的部分即可，缺失的容错跳过，不报错）。

### 3. 调用 Codex 审查

```
WORKDIR=$(pwd)
Bash({
  command: "~/.claude/bin/codeagent-wrapper --progress --backend codex - \"$WORKDIR\" <<'CODEAGENT_EOF'\nROLE_FILE: ~/.claude/.ly/prompts/codex/reviewer.md\n<TASK>审查以下OpenSpec方案的合理性：遗漏的边界情况、范围是否清晰、风险点。不做逐行代码风格审查。\n\n{proposal.md + design.md + tasks.md 合并内容}\n</TASK>\nOUTPUT: 问题清单（每条含：位置/条目、问题描述、建议）\nCODEAGENT_EOF",
  run_in_background: true,
  timeout: 1800000,
  description: "审查方案: <change-name>"
})
```

### 4. 输出报告

```
📋 方案审查：<change-name>

## 问题清单
1. [proposal.md / design.md / tasks.md] — <问题描述>
   建议: <具体建议>
...

---
如无发现，明确说明："方案审查未发现问题"
```
