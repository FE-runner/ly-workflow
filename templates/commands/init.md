---
description: '生成 CLAUDE.md，初始化 OpenSpec 目录结构'
---

# Init - 项目初始化

两步初始化：生成/更新项目的 CLAUDE.md 上下文文档，并搭建 OpenSpec 目录结构。

## 使用方法

```bash
/init <项目摘要或名称>
```

## 步骤

### 步骤 1：生成 CLAUDE.md

调用原生 `init` 技能，传入项目摘要（如有）：

```
Skill({ skill: "init", args: "$ARGUMENTS" })
```

### 步骤 2：初始化 OpenSpec

1. **检测 OpenSpec CLI**：
   ```bash
   openspec --version
   ```
2. **未安装则全局安装**：
   ```bash
   npm install -g @fission-ai/openspec@latest
   ```
3. **检查是否已初始化**：
   ```bash
   ls -la openspec/ 2>/dev/null || echo "Not initialized"
   ```
4. **未初始化则运行**（当前工作目录下执行，禁止 `cd` 到其他路径；不确定当前目录先 `pwd` 确认）——用 `--tools claude` 非交互指定 AI 工具为 Claude Code，避免卡在交互式选择上：
   ```bash
   openspec init --tools claude
   ```

### 步骤 3：提交初始化产物

```bash
git add -- CLAUDE.md openspec/
git commit -m "chore: init CLAUDE.md + openspec structure"
```

仅暂存本次初始化产生的文件（`CLAUDE.md`、`openspec/`），不用 `git add -A`。若无可提交内容（两者均已存在且未变化）或 `git commit` 失败，跳过提交，在汇总中如实报告，不中断步骤 4。

### 步骤 4：汇总

```
📋 初始化结果
  CLAUDE.md    ✓/✗
  openspec/    ✓/✗

接下来可以：
  /propose "描述你要做什么"   — 起一个change
  /explore                    — 想清楚再动手
```
