---
description: '管理 Git Worktree：在 ~/.ly/worktrees/项目名/ 目录创建，支持 IDE 集成和内容迁移'
---

# Worktree - Git Worktree 管理

在结构化目录管理 Git worktree，支持智能默认和 IDE 集成。

## 使用方法

```bash
/worktree <add|list|remove|prune|migrate|switch> [options]
```

## 子命令

| 命令 | 说明 |
|------|------|
| `add <path>` | 创建新 worktree |
| `list` | 列出所有 worktree |
| `remove <path>` | 删除指定 worktree |
| `prune` | 清理无效引用 |
| `migrate <target>` | 迁移内容到目标 worktree |
| `switch <change-name> [--auto]` | 按 OpenSpec change 名一键定位或创建隔离 worktree，输出续接实施的命令 |

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
| `--auto`（仅 `switch`） | 续接命令追加"实施完成后自动依次调用 `/ly:review-code`，按其全部终止条件运行"的指令 |

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

### Switch - 按 change 切换/创建 worktree

`[模式：切换]`

面向已存在、已提交的 OpenSpec change，一键定位或创建对应的隔离 worktree，输出续接实施的命令，不自动执行、不自动切会话。

1. **隔离检测**（复用 Add 步骤 1）：已在 worktree 内时**默认不创建**，提示当前所在路径/分支并询问是否仍要为目标 change 新建独立 worktree（默认否）。用户不确认 → 输出当前路径/分支，直接结束，不进入后续步骤。用户明确确认 → 继续。
2. **前置校验**：
   - `openspec/changes/<change-name>/proposal.md` **与 `tasks.md` 均必须存在**——只有 `proposal.md` 没有 `tasks.md` 时报错并提示"该 change 尚未生成 tasks.md，请先完成规划（如 `/opsx:propose`）再执行 switch"。
   - `git status --porcelain -- openspec/changes/<change-name>/` 必须为空（无未提交/未跟踪内容），否则报错提示先 commit（worktree 不会带入未提交文件，不做自动迁移；需要迁移用 `migrate`）。
   - `<change-name>` 必须匹配 `^[a-z0-9]+(-[a-z0-9]+)*$`，分支名额外过 `git check-ref-format --branch`，不匹配直接报错，不做任何猜测式纠正。
3. **判断目标路径是否已是已注册的 worktree**（`git worktree list --porcelain`；目标路径以 `git rev-parse --git-common-dir` 反推的主仓库位置为基准计算——取该位置的目录名作为 `<项目名>`，拼接为 `~/.ly/worktrees/<项目名>/<change-name>`，不依赖当前调用所处 worktree 的相对路径，保证从主工作区或从任意其他 worktree 调用时算出的路径一致；所有路径比较前均 canonicalize）：
   - **是** → 额外校验该路径当前注册的分支名是否严格等于 `<change-name>`：
     - **严格等于** → 直接定位，跳过下面的分支拓扑校验与创建/baseline，展示路径/分支，进入步骤 6 输出续接命令。
     - **不等于** → 拒绝执行，报错提示"目标路径已注册但对应分支非 `<change-name>`（当前为 `<实际分支名>`），请手动处理后重试"，不直接定位、不进入步骤 6 输出续接命令。
   - **否**（本次需要从 base ref 新建或挂载分支）→ 继续步骤 4。
4. **分支拓扑校验**（仅"否"分支适用）：确认该 change 目录下 artifact 的最近一次 commit 是目标 base ref（仓库默认分支最新提交）的祖先（`git merge-base --is-ancestor <artifact-commit> <base-ref>`）。不满足 → 报错拒绝，提示"该 change 的提交不在默认分支历史上，请先合并或 rebase 到默认分支，再执行 switch"，不创建任何 worktree/分支。
5. **确定性处理矩阵**（用 `git worktree list --porcelain` + `git branch --list <name>` 探测）：

   | 目标路径状态 | 分支状态 | 处理 |
   |---|---|---|
   | 路径存在但非注册 worktree | 任意 | 报错拒绝："目标路径已存在但不是 Git worktree，请手动处理后重试"，不覆盖、不删除 |
   | 路径不存在 | 分支不存在 | 分支基线从默认分支（`origin/HEAD` 解析，回退 `main`/`master`）最新提交切出：`git worktree add -b <branch> <path> <base-ref>`，输出实际使用的 base ref |
   | 路径不存在 | 分支存在，未被其他 worktree 检出 | 直接挂载：`git worktree add <path> <branch>`（不加 `-b`） |
   | 路径不存在 | 分支存在，已被其他 worktree 检出 | 报错拒绝，提示分支已被占用及占用该分支的 worktree 路径 |

   创建/挂载后跑一次 baseline 验证（复用 Add 步骤 6）。
6. **baseline 结果与创建结果分开报告**；baseline 失败时**默认不打印续接命令**，报告失败摘要并询问用户是否仍要显式继续（默认否）；仅当用户明确选择继续，才打印续接命令，且 prompt 文本携带失败摘要、要求新会话先处理环境问题。命中"已注册 worktree 直接定位"时跳过 baseline。
7. **打印续接命令**（绝对路径 + shell 安全转义，不带 `--auto`）：
   ```
   cd <绝对路径> && claude "继续实施 change: <change-name>，读取 openspec/changes/<change-name>/tasks.md 按任务执行"
   ```
   传了 `--auto` 时，追加一句：
   ```
   实施完成后自动依次调用 /ly:review-code，按其全部终止条件运行（清零/熔断/分歧未决/无法安全修复/验证失败/审查调用失败/达到全局轮数上限），不需要人工确认
   ```
   两种情况下命令本身都只是打印文本，当前会话不做进一步动作（不自动 `cd`、不自动启动新会话）。

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

# 按 change 切换/创建隔离 worktree
/worktree switch add-user-auth

# 带自动续接实施+审查
/worktree switch add-user-auth --auto

# change 未提交时报错
# > 该 change 有未提交内容，请先 commit 后重试

# change 提交不在默认分支历史上时报错
# > 该 change 的提交不在默认分支历史上，请先合并或 rebase 到默认分支，再执行 switch

# 目标路径已注册但分支不匹配时报错
# > 目标路径已注册但对应分支非 add-user-auth（当前为 hotfix），请手动处理后重试

# change 缺少 tasks.md 时报错
# > 该 change 尚未生成 tasks.md，请先完成规划（如 /opsx:propose）再执行 switch
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
- `switch` 只打印续接命令，不自动执行、不自动切会话（`--auto` 不改变这一点，只改变打印文案）；要求目标 change 已有 `proposal.md` 与 `tasks.md` 且已提交；新建场景要求该 change 的提交在默认分支历史上，已注册 worktree 场景不受此限制；孤儿 worktree（关联 change 已删除/重命名）需人工 `remove`/`prune`
