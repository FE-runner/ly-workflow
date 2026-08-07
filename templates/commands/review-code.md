---
description: '读取 git diff，Codex 审查代码变更，分级输出 Critical/Warning/Info'
---

# Review Code - 代码审查

审查当前代码变更，Codex 单模型审查，输出 Critical/Warning/Info 分级结果。

## 步骤

### 1. 判定审查范围

按优先级：

1. 有未提交变更 → `git diff HEAD`（覆盖已跟踪修改+已暂存新增）
2. 无未提交变更但有历史提交 → `git diff HEAD~1`
3. 无未提交变更且仅一个commit（无`HEAD~1`） → `git show HEAD`
4. 仓库零commit（`git rev-parse HEAD`失败） → `git diff --cached`

**无论哪种情况**，额外用 `git status --porcelain` 抓取 `??` 开头的未跟踪文件，把文件内容并入审查上下文——避免新建但未 `git add` 的文件被漏审。

```bash
git rev-parse HEAD >/dev/null 2>&1 && echo has_head || echo no_head
git diff HEAD
git status --porcelain | grep '^??'
```

### 2. 调用 Codex 审查

```
WORKDIR=$(pwd)
Bash({
  command: "~/.claude/bin/codeagent-wrapper --progress --backend codex - \"$WORKDIR\" <<'CODEAGENT_EOF'\nROLE_FILE: ~/.claude/.ly/prompts/codex/reviewer.md\n<TASK>审查以下代码变更（含未跟踪文件内容）</TASK>\nOUTPUT: 审查发现，按严重度分级：Critical/Warning/Info，每条含：位置、问题、建议\nCODEAGENT_EOF",
  run_in_background: true,
  timeout: 1800000,
  description: "审查代码变更"
})
```

### 3. 输出报告

```
📋 代码审查报告

## Critical（必须修复）
1. [file:line] — <问题描述>
   建议: <具体修复建议>

## Warning（建议修复）
1. [file:line] — <问题描述>
   建议: <具体修复建议>

## Info（供参考）
1. [file:line] — <观察/建议>

---
总计: [N] Critical, [M] Warning, [K] Info
```

如无发现，明确说明"未发现问题"，不要保持沉默。
