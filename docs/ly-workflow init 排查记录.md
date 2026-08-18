# ly-workflow init 排查记录

> 日期：2026-08-18
> 项目：`/Users/ly/codes/projects/ly-workflow`（v1.5.0）
> 关联现象：重跑 init「没生效」、`--force` 后 Hermes 生效但不静默（明明选了不要 web）

---

## 一、现象

1. **重跑 `ly init` 像是没生效**：仓库源码已是 v1.5.0，但 `~/.claude/commands/ly/*.md` 等安装产物仍是旧版本内容（硬编码 `--backend codex`，不见 `{{REVIEWER_MODEL}}`、resume 续聊等 v1.5.0 特性）。
2. **加 `--force` 重装后**：`reviewer` 确实变成了 Hermes（审查生效了），**但运行时不是静默的**——选择了"不要 web"（lite 模式）后，调用仍然拉起了 web server，且一次 `review-plan` 调用还伴随 `codex exited with status 1` / `Web UI: http://localhost:52562` 的异常现象。

---

## 二、根因一：重跑 init「没生效」——installer 默认不覆盖已存在文件

### 证据

```bash
# 已安装的命令文件（实际运行用的）—— 依旧是 8-13 旧版
~/.claude/commands/ly/review-plan.md   8-13 19:47   → --backend codex         (v1.4.x)
~/.claude/commands/ly/review-code.md   8-13 19:47   → --backend codex         (v1.4.x)

# 仓库模板 —— 已是 v1.5.0 新版
templates/commands/review-plan.md       8-18 10:06   → --backend {{REVIEWER_MODEL}}
```

### 机制

`src/utils/installer.ts:200`（命令文件写入）与 `:234`（slash command 写入）都是同一语义：

```ts
if (ctx.force || !(await fs.pathExists(destFile))) {
  // 只有当「传了 --force」或「目标文件尚不存在」时才会写入
}
```

即：**目标文件已存在 → 默认跳过、不覆盖**。从 v1.4.x 升到 v1.5.0 时，`~/.claude/commands/ly/*.md` 均已存在，所以新版模板一个都没写进去。

### 附带隐患：`bin/ly.mjs` 跑的是旧的 `dist/`

`bin/ly.mjs` 只有一行 `import '../dist/cli.mjs'`。本地 `dist/` 构建于 **8-14**，不含 v1.5.0 内容（`grep REVIEWER_MODEL / HermesBackend / openclaw dist/cli.mjs` 命中 0）。若用本地 `node bin/ly.mjs` / `pnpm start` 跑 init，即使 `--force` 走的也是旧逻辑——必须先 `pnpm build`。

### 修复

```bash
cd /Users/ly/codes/projects/ly-workflow
pnpm build                                    # 本地跑：先把 dist 更新到 v1.5.0
npx ly-workflow@latest init --force           # 关键：--force 才会覆盖旧产物
```

验证：

```bash
grep -n "REVIEWER_MODEL" ~/.claude/commands/ly/review-plan.md   # 应见 {{REVIEWER_MODEL}}
```

---

## 三、根因二：`--force` 后 Hermes 生效但不静默——`review-plan` 模板缺 `{{LITE_MODE_FLAG}}` 占位符

### 证据

`--force` 重装后的实际命令行：

```
已安装 review-code:  codeagent-wrapper --progress --lite --backend hermes -   ← 有 --lite ✅
已安装 review-plan:  codeagent-wrapper --progress        --backend hermes -   ← 没有 --lite ❌
```

模板占位符对比：

| 模板文件 | `{{LITE_MODE_FLAG}}` | 说明 |
|---|---|---|
| `templates/commands/review-code.md` | **有** | `--progress {{LITE_MODE_FLAG}}--backend {{REVIEWER_MODEL}} ...` |
| `templates/commands/review-plan.md` | **无**（0 处） | 缺占位符，注入无处替换 |

### 机制

installed 注入逻辑 `src/utils/installer-template.ts:81`：

```ts
const liteModeFlag = config.liteMode ? '--lite ' : ''
processed = processed.replace(/\{\{LITE_MODE_FLAG\}\}/g, liteModeFlag)
```

`review-plan.md` 模板里没有 `{{LITE_MODE_FLAG}}` 占位符 → 无处替换 → 安装出来的 review-plan 命令行**永远不带 `--lite`**。wrapper 端 `main.go` / `executor.go` 的 `liteMode` 判定：

```go
// main.go:38
var liteMode = os.Getenv("CODEAGENT_LITE_MODE") == "true"

// executor.go:873（liteMode 关闭时拉起 web server）
if !liteMode && globalWebServer == nil { startWebServer(...) }
```

于是：虽然 init 里选了 lite / "不要 web"，`review-code` 虽然静默，但 **`review-plan` 因模板缺占位符而没有传递 `--lite`，运行时 `liteMode=false` → web server 被拉起**。本次 review-plan 调用失败日志里的 `Web UI: http://localhost:52562` 正是它。

### 修复

给 `templates/commands/review-plan.md` 的 command 行补上与 review-code 一致的占位符：

```diff
-  command: "~/.claude/bin/codeagent-wrapper --progress --backend {{REVIEW_BACKEND}} - \"$WORKDIR\" ...
+  command: "~/.claude/bin/codeagent-wrapper --progress {{LITE_MODE_FLAG}}--backend {{REVIEW_BACKEND}} - \"$WORKDIR\" ...
```

（注：当前模板中的占位符名统一为 `{{REVIEW_BACKEND}}`，此处按模板实际情况替换，重点是 `--progress` 后补 `{{LITE_MODE_FLAG}}`。）

改完重新执行：

```bash
cd /Users/ly/codes/projects/ly-workflow
pnpm build
npx ly-workflow@latest init --force
```

验证（应看到 `--lite`）：

```bash
grep -o "codeagent-wrapper [^\"]*" ~/.claude/commands/ly/review-plan.md | head -1
# 期望：codeagent-wrapper --progress --lite --backend hermes -
```

---

## 四、结论速览

| # | 问题 | 根因 | 修复 |
|---|---|---|---|
| 1 | 重跑 init「没生效」 | installer 已存在文件默认不覆盖（`force || !exists`）；本地 dist 为 8/18 前旧构建 | `pnpm build` + `init --force` |
| 2 | Hermes 生效但不静默、仍开 web | `review-plan.md` 模板缺 `{{LITE_MODE_FLAG}}` 占位符，`--lite` 未被注入 | **✅ 已修复**（commit `8e5b1c9`）：模板补占位符 → `pnpm build` + `init --force --skip-prompt` |

**注意**：`init --force` 会覆盖 `~/.claude/CLAUDE.md`、rules、commands 等全局配置；若这些文件有本地改动，建议先备份再执行。

---

## 五、修复落地（2026-08-18）

根因二已修复并验证：

1. **源码**：`templates/commands/review-plan.md:40` 的 command 行补上与 review-code 一致的 `{{LITE_MODE_FLAG}}` 占位符 → commit `8e5b1c9`（`dist/` 已被 gitignore，build 产物不入库）。
2. **重装**：`pnpm build` 后用本地构建 `node bin/ly.mjs init --force --skip-prompt`（`--skip-prompt` 保留现有 config：`reviewer=hermes`、`liteMode=true`），全程非交互。
3. **验证**（重装后）：

   ```bash
   grep -o "codeagent-wrapper [^\"]*" ~/.claude/commands/ly/review-plan.md | head -1
   # review-plan: codeagent-wrapper --progress --lite --backend hermes -   ✅ 此前无 --lite
   ```
   `~/.claude/CLAUDE.md`、`rules/` 与备份 diff 均为空，`config.toml` 仅 `createdAt` 更新。

> 全程无交互建议：避坑，本地跑 init 用 `--force --skip-prompt`，而不是裸 `init --force`（后者会拉起交互向导，非 TTY 下直接 `ExitPromptError`）。