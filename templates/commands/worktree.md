---
description: '管理 Git Worktree：在 ~/.ly/worktrees/项目名/ 目录创建，支持 IDE 集成和内容迁移'
---

# Worktree - Git Worktree 管理

在结构化目录管理 Git worktree，支持智能默认和 IDE 集成。

## 使用方法

```bash
/worktree <add|list|remove|prune|migrate> [options]
```

## 子命令

| 命令 | 说明 |
|------|------|
| `add <path>` | 创建新 worktree |
| `list` | 列出所有 worktree |
| `remove <path>` | 删除指定 worktree |
| `prune` | 清理无效引用 |
| `migrate <target>` | 迁移内容到目标 worktree |

## 选项

| 选项 | 说明 |
|------|------|
| `-b <branch>` | 创建新分支 |
| `-o, --open` | 创建后用 IDE 打开 |
| `--from <source>` | 迁移源路径 |
| `--stash` | 迁移 stash 内容 |
| `--track` | 跟踪远程分支 |
| `--detach` | 分离 HEAD |
| `--lock` | 锁定 worktree |
| `--local` | 强制项目内 `.worktrees/`（默认项目外，避免误 commit 风险） |

---

## 目录结构

默认（用户目录下，跨项目集中管理，IDE 集成友好）：

```
~/.ly/worktrees/            # worktree 管理目录（用户目录下）
└── your-project/
    ├── feature-ui/         # 功能分支
    ├── hotfix/             # 修复分支
    └── debug/              # 调试 worktree

/path/to/your-project/     # 主项目（任意位置）
├── .git/
└── src/
```

项目内（传 `--local` 时启用）：

```
your-project/
├── .git/
├── src/
└── .worktrees/             # 必须已加入 .gitignore
    ├── feature-ui/
    └── hotfix/
```

---

## 执行工作流

### Add - 创建 Worktree

`[模式：创建]`

1. **检测是否已在 worktree 内**：比较 `git rev-parse --git-dir` 与 `--git-common-dir`，不同则已在隔离环境中，跳过创建（提示当前路径与分支）。
   - 用 `git rev-parse --show-superproject-working-tree` 排除子模块误判（子模块也满足 `--git-dir != --git-common-dir`，但不是 worktree）。
2. **确定目录**（优先级从高到低）：
   - 用户本次显式指定路径 → 直接用
   - 传 `--local` → 用项目内 `.worktrees/`（不再靠"目录已存在"自动判断，避免误触发）
   - 默认 `~/.ly/worktrees/项目名/<path>`（用户目录下，见上方目录结构）
3. **`--local` 时必须校验已忽略**：`git check-ignore -q .worktrees`。未忽略则先写入 `.gitignore` 并提交，再继续创建——防止 worktree 内容被误提交进仓库。
4. 创建 worktree（`git worktree add <path> -b <branch>`）
5. 自动复制环境文件（`.env` 等）
6. **验证 baseline**：自动检测并跑项目安装/测试命令（`npm install && npm test` / `cargo build && cargo test` / `pip install -r requirements.txt && pytest` / `go mod download && go test ./...` 等），确认新 worktree 干净可用后才报告完成；测试失败则汇报失败详情，询问是继续还是先排查。
7. 可选：用 IDE 打开
8. **权限失败兜底**：`git worktree add` 因 sandbox 权限被拒时，提示用户已降级为原地工作，不再创建 worktree。

### Migrate - 迁移内容

`[模式：迁移]`

1. 验证源有未提交内容
2. 确保目标干净
3. 显示即将迁移的改动
4. 安全迁移
5. 确认结果

---

## 示例

```bash
# 基本创建
/worktree add feature-ui

# 创建并用 IDE 打开
/worktree add feature-ui -o

# 创建指定分支
/worktree add hotfix -b fix/login -o

# 迁移未提交内容
/worktree migrate feature-ui --from main

# 迁移 stash 内容
/worktree migrate feature-ui --stash

# 管理操作
/worktree list
/worktree remove feature-ui
/worktree prune
```

## 输出示例

```
✅ Worktree created at ~/.ly/worktrees/项目名/feature-ui
✅ 已复制 .env
✅ 已复制 .env.local
📋 已从 .gitignore 复制 2 个环境文件
🖥️ 是否在 IDE 中打开？[y/n]: y
🚀 正在用 VS Code 打开...
```

---

## 智能特性

1. **智能默认** – 未指定分支时使用路径名
2. **IDE 集成** – 自动检测 VS Code / Cursor / WebStorm
3. **环境文件** – 自动复制 `.gitignore` 中的 `.env` 文件
4. **路径安全** – 始终使用绝对路径防止嵌套问题
5. **分支保护** – 验证分支未被其他地方使用
6. **隔离检测** – 创建前先判断是否已在 worktree 内，避免嵌套创建
7. **项目内目录护栏** – `--local` 时强制校验 `.worktrees/` 已加入 `.gitignore`，未忽略先补；默认不走项目内，避免误 commit

## 注意事项

- Worktree 共享 `.git` 目录，节省磁盘空间
- 迁移仅限未提交改动，已提交内容用 `git cherry-pick`
- 支持 Windows、macOS、Linux
- 默认用户目录 `~/.ly/worktrees/` 下创建，不需要 `--local` 时不碰 `.gitignore`
- `--local` 且 `.worktrees/` 未被忽略时会先写 `.gitignore` 并提交，再继续创建
- 创建后会跑一次项目 setup + baseline 测试，确认新 worktree 干净可用
- 隔离 worktree 的创建/切换统一由 `/ly:propose` 在**创建方案前**通过 `git worktree add`（从当前分支 HEAD 切出，目录 `~/.ly/worktrees/<项目名>/<开发分支名>`）触发；worktree 目录/分支锁定为开发分支名，不随 change 名重命名；孤儿 worktree（关联 worktree 已删除/重命名）需人工 `remove`/`prune`
