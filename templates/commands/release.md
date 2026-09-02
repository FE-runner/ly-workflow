---
description: 'GitFlow 发版流程：feature/release/hotfix/dev-offline 四场景，SemVer 自动推导版本号'
---

# Release - GitFlow 发版

按场景执行 GitFlow 分支操作，版本号按 SemVer + Conventional Commits 自动推导建议，用户确认后执行。

## 使用方法

```bash
/release <场景描述>
```

直接告诉 Claude 要做什么，例如："开始新功能"、"准备发版"、"线上有 bug 要 hotfix"、"发到线下"。

## 重要规则

> **任何合并到 master 的改动都必须更新 `version.sh` 中的版本号，否则 CI/CD 部署会失败。**
>
> - release 流程：在 release 分支上更新版本号
> - hotfix 流程：**也必须**在 hotfix 分支上更新版本号，不能跳过
>
> **分支基准规则：`master` 是唯一的分支 base**——feature、release、hotfix 分支**一律从 master 拉出**；`develop` 是主开发分支，只接收合并（所有开发成果汇入 develop），**任何时候不作为创建分支的 base**。
>
> **线上合并后必须三分支同步：** 任何改动合并到 master（含 feature 方式 C 直上线、release/hotfix 的 PR merge）后，都要把 `master`、`develop`、`dev-offline` 三个分支同步一遍，**以远端 `origin/master` 为基准**——同步前先 `git fetch origin master` 保证 `origin/master` 是线上最新状态，再 `git merge origin/master`，确保本地三个分支与线上保持一致。

---

## 版本号确定规则（SemVer + Conventional Commits 自动推导）

**不要直接问用户「patch 还是 minor」，先分析 commit 历史给出建议，再让用户确认/覆盖。**

### 自动分析步骤

```bash
# 1. 确定上一次 bump 的边界（优先 tag → version.sh 历史 commit）
PREV_TAG=$(git describe --tags --abbrev=0 HEAD 2>/dev/null || echo "")
PREV_BUMP=$(git log --format=%H -- version.sh | head -2 | tail -1)
BASE_REF=${PREV_TAG:-${PREV_BUMP:-}}

# 2. 收集本次发版的 commit（排除 bump version 本身）
if [ -n "$BASE_REF" ]; then
  COMMITS=$(git log ${BASE_REF}..HEAD --oneline --no-merges -- | grep -v "bump version")
else
  COMMITS=$(git log HEAD --oneline --no-merges -- | grep -v "bump version")
fi

# 3. 按 Conventional Commits 分类统计
echo "$COMMITS" | grep -c "^[a-f0-9]* feat" || true     # 新功能数量
echo "$COMMITS" | grep -c "^[a-f0-9]* fix" || true      # 修复数量
echo "$COMMITS" | grep -i "BREAKING CHANGE" || true      # 破坏性变更
```

### 推导规则

| 条件 | 建议档位 | 示例 |
|------|---------|------|
| 含 `BREAKING CHANGE` 或 `feat!:` | **major** | 1.6.1 → 2.0.0 |
| 无 BREAKING CHANGE，有 `feat:` | **minor** | 1.6.1 → 1.7.0 |
| 仅 `fix:` / `docs:` / `chore:` | **patch** | 1.6.1 → 1.6.2 |
| 首次发版 / 无历史 | 问用户 | — |

### 询问模板

```
分析发现本次改动：
- 新增功能 X 个，修复 Y 个，无破坏性变更
→ 建议 bump minor：1.6.1 → 1.7.0

是否使用此建议？可以改为 patch（1.6.1 → 1.6.2）或 major（1.6.1 → 2.0.0）
```

- **同意建议**：直接按建议执行
- **覆盖**：按用户输入的档位执行，不改建议逻辑（记录偏好不持久化）
- **不存在以往的 commit**：回退到直接询问版本号

---

## 场景一：开始新功能（feature）

**触发词：** "开始新功能"、"新feature"、"feature分支"

```bash
# 1. 确保 master 是最新的
git checkout master
git pull origin master

# 2. 创建 feature 分支（功能名用英文小写+连字符，如 user-login）
git checkout -b feature/<功能名>

# 3. 开发完成后，确认本次功能发到哪个环境，选择对应合并方式：
#
# 方式 A：合入主开发分支 develop（常规集成，后续统一走发版流程）
git checkout develop
git pull origin develop          # 再次拉取；feature 基于 master 拉出，merge 前确认 develop 上没有冲突
git merge --no-ff feature/<功能名>
git push origin develop
#
# 方式 B：直接发线下测试环境 dev-offline
git checkout dev-offline
git pull origin dev-offline
git merge --no-ff feature/<功能名>
git push origin dev-offline
#
# 方式 C：直接上线 master
git checkout master
git pull origin master
git merge --no-ff feature/<功能名>

# 合并后必须先更新版本号（凡合入 master 都必须 bump，否则 CI/CD 部署失败）
# 读取当前版本：grep -oP 'VERSION=\K[^ ]+' version.sh
# 按上方「版本号确定规则」分析 commit 历史，给出建议档位，询问用户确认
# 编辑 version.sh 将 VERSION=x.x.x 改为确认的版本号，再执行：
git add version.sh
git commit -m "chore: bump version to <确认的版本号>"
git push origin master

# 方式 C 上线合并完成后，三分支同步（以远端 origin/master 为基准）：
git fetch origin master          # 关键：先把 origin/master 引用刷新到线上最新
git checkout master
git merge --ff-only origin/master
git push origin master
git checkout develop
git pull origin develop
git merge origin/master
git push origin develop
git checkout dev-offline
git pull origin dev-offline
git merge origin/master
git push origin dev-offline

# 4. 删除 feature 分支
git branch -d feature/<功能名>
git push origin --delete feature/<功能名>
```

**注意：** `--no-ff` 会产生一个合并提交，保留分支历史，便于后续追溯。

---

## 场景二：发布版本（release）

**触发词：** "发版"、"release"、"准备上线"

> **发版范围（单功能带发模式）：** release 从 master 拉出，天然只包含已合入 master 的功能。
> 本次要发的功能需提前合入 master（feature 完成时走场景一「方式 C」直接上线，或先 merge feature 分支到 master）；
> 若功能尚未合入 master，先按下方步骤 1 创建 release 分支后，再执行
> `git merge feature/<功能名>` 或 cherry-pick 对应 commit 带入本次发版。

```bash
# 1. 从 master 创建 release 分支
git checkout master
git pull origin master
git checkout -b release/<版本号>   # 例如 release/1.4.0

# 2. 确定版本号（SemVer 自动推导 + 用户确认）
# 读取当前版本：grep -oP 'VERSION=\K[^ ]+' version.sh
# 按上方「版本号确定规则」执行：
#   a. 自动分析上次 bump 以来的 commit 列表
#   b. 按 feat/fix/BREAKING 推导建议档位
#   c. 将建议展示给用户：「建议 bump X → Y，是否确认？（可改为 Z）」
#   d. 用户确认后，编辑 version.sh 将 VERSION=x.x.x 改为确认的版本号
git add version.sh
git commit -m "chore: bump version to <确认的版本号>"

# 3. 更新 CHANGELOG（如有）
# 若已安装 /ly:changelog：直接触发它生成/更新 CHANGELOG.md 并提交
# 若未安装，按以下步骤手动执行：
#
# 检查项目根目录是否存在 CHANGELOG.md（或 CHANGELOG、CHANGELOG.txt）：
#   ls CHANGELOG* 2>/dev/null
#
# 【如果不存在 CHANGELOG】：询问用户是否需要创建，如果需要则按 Keep a Changelog 格式建立（见 /ly:changelog）
# 【如果存在 CHANGELOG】：以本次 version.sh 的更新 commit 为节点，收集 commit 并按类型分组（Added/Fixed/Changed）写入
#
# 提交 CHANGELOG 变更：
git add CHANGELOG.md   # 如果文件存在
git commit -m "docs: update CHANGELOG for v<确认的版本号>"

# 4. push release 分支，创建 PR 到 master
git push origin release/<版本号>
# 在 GitHub/GitLab 创建 PR：release/<版本号> → master
# 标题示例：Release v<版本号>
# 等待 code review 通过后 merge

# 5. PR merge 后，以远端 origin/master 为基准同步 develop 和 dev-offline（带回版本号、CHANGELOG、修复）
git fetch origin master          # 先把 origin/master 引用刷新到线上最新
git checkout master
git merge --ff-only origin/master
git push origin master
git checkout develop
git pull origin develop
git merge origin/master
git push origin develop
git checkout dev-offline
git pull origin dev-offline
git merge origin/master
git push origin dev-offline

# 6. 删除 release 分支
git branch -d release/<版本号>
git push origin --delete release/<版本号>
```

**注意：** 版本号文件在根目录 `version.sh`，格式为 `export VERSION=x.x.x`，直接修改该行即可。

---

## 场景三：紧急修复（hotfix）

**触发词：** "hotfix"、"紧急修复"、"线上 bug"

```bash
# 1. 从 master 创建 hotfix 分支
git checkout master
git pull origin master
git checkout -b hotfix/<问题描述>   # 例如 hotfix/login-crash

# 2. 修复 bug，提交
git add .
git commit -m "fix: <问题描述>"

# 3. 确定版本号并 bump（必须！否则部署会失败）
# 读取当前版本：grep -oP 'VERSION=\K[^ ]+' version.sh
# hotfix 场景下通常只包含 fix: 类型 commit，自动推导结果为 patch（如 1.6.1 → 1.6.2）
# 按上方「版本号确定规则」展示推导结果给用户确认，确认后：
# 编辑 version.sh 将 VERSION=x.x.x 改为确认的版本号
git add version.sh
git commit -m "chore: bump version to <确认的版本号>"

# 4. push hotfix 分支，创建 PR 到 master
git push origin hotfix/<问题描述>
# 在 GitHub/GitLab 创建 PR：hotfix/<问题描述> → master
# 标题示例：Hotfix: <问题描述>
# 等待 code review 通过后 merge

# 5. PR merge 后，以远端 origin/master 为基准同步 develop 和 dev-offline（三个分支对齐）
git fetch origin master          # 先把 origin/master 引用刷新到线上最新
git checkout master
git merge --ff-only origin/master
git push origin master
git checkout develop
git pull origin develop
git merge origin/master
git push origin develop
git checkout dev-offline
git pull origin dev-offline
git merge origin/master
git push origin dev-offline

# 6. 删除 hotfix 分支
git branch -d hotfix/<问题描述>
git push origin --delete hotfix/<问题描述>
```

**注意：** hotfix PR merge 后必须同步到 develop 和 dev-offline 两个分支，缺一不可。

---

## 场景四：同步到线下环境（dev-offline）

**触发词：** "同步线下"、"dev-offline"、"发到线下"

先确认同步方式：

**方式 A：全量同步 develop 到 dev-offline**

```bash
git checkout dev-offline
git pull origin dev-offline
git merge --no-ff develop
git push origin dev-offline
```

**方式 B：仅同步指定 commit（cherry-pick）**

```bash
git checkout dev-offline
git pull origin dev-offline
git cherry-pick <commit-hash>   # 多个 commit 空格分隔，如：abc1234 def5678
git push origin dev-offline
```

**注意：** dev-offline 是线下测试环境专用分支，merge 前确认不会覆盖该分支上的线下专属配置。如有冲突，以 dev-offline 上的配置为准。