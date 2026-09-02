---
description: 'Keep a Changelog 格式生成 CHANGELOG.md：按 commit 前缀自动分组（Added/Fixed/Changed）'
---

# Changelog - 生成 CHANGELOG.md

按 [Keep a Changelog](https://keepachangelog.com) 规范生成/更新 CHANGELOG.md，按 commit 类型分组而非简单罗列 commit message。

## 使用方法

```bash
/changelog
```

告诉 Claude 要为哪次更新生成 changelog（通常是发版时），自动执行以下步骤。

---

## 步骤一：检查 CHANGELOG 是否存在

```bash
ls CHANGELOG* 2>/dev/null
```

- **不存在**：询问用户是否需要创建。需要则新建 `CHANGELOG.md`，按下方格式写入首条记录。
- **存在**：进入步骤二，追加到顶部（保留已有内容，不覆盖历史记录）。

---

## 步骤二：确定上一版本边界

优先级从高到低尝试，找到即用，不需要全部执行：

**方式 A：git tag**

```bash
PREV_TAG=$(git describe --tags --abbrev=0 HEAD^ 2>/dev/null || echo "")
```

**方式 B：找上一次改动 `version.sh` 中 VERSION 的 commit**（项目无 tag 时常见）

```bash
PREV_COMMIT=$(git log -2 --format=%H -- version.sh | tail -1)
```

**方式 C：找上一次改动 `package.json` 中 version 字段的 commit**（Node 项目）

```bash
PREV_COMMIT=$(git log -2 -p --format=%H -- package.json | grep -B5 '"version"' | grep '^[0-9a-f]\{40\}$' | tail -1)
```

三种方式取到的边界二选一（哪个存在用哪个，version.sh/package.json 优先于 tag，因为 tag 可能未及时打；实际在方式 A 中 `HEAD^` 已保证取到的是上一个 tag）：

```bash
BASE_REF=${PREV_TAG:-${PREV_COMMIT:-}}
```

---

## 步骤三：收集并分类本次更新的 commit

```bash
# 有边界：收集区间内 commit
if [ -n "$BASE_REF" ]; then
  RAW=$(git log ${BASE_REF}..HEAD --oneline --no-merges -- | grep -v "bump version")
else
  RAW=$(git log HEAD --oneline --no-merges -- | grep -v "bump version")
fi
```

### 分类规则（Conventional Commits → Keep a Changelog 分组）

| commit 前缀 | 分组 |
|---|---|
| `feat:`（非 `feat!:`） | **Added** |
| `fix:` | **Fixed** |
| `feat!:` 或 body 含 `BREAKING CHANGE:` | **Changed**（标 BREAKING） |
| `docs:` | **Changed** |
| `refactor:` / `perf:` / `style:` | **Changed** |
| `chore:` / `ci:` / `build:` | **Changed** |
| `revert:` | **Changed** |
| `test:` | **Changed** |
| 其他 / 无法识别 | **Changed** |

### 分组收集命令

```bash
# Added：feat: 开头的 commit（排除 feat!:）
echo "$RAW" | grep "^[a-f0-9]* feat" | grep -v "feat!:" | grep -v "BREAKING" || true

# Fixed：fix: 开头的 commit
echo "$RAW" | grep "^[a-f0-9]* fix" || true

# Changed：其余所有 commit
echo "$RAW" | grep -v "^[a-f0-9]* feat" | grep -v "^[a-f0-9]* fix" || true
```

---

## 步骤四：写入 CHANGELOG.md（Keep a Changelog 格式）

在文件顶部插入（保留已有内容，不覆盖历史记录）：

```markdown
## [<版本号>] - <日期>

### Added
- <feat commit 摘要 1>
- <feat commit 摘要 2>

### Fixed
- <fix commit 摘要 1>

### Changed
- <其他 commit 摘要 1>
```

**格式约定：**

- 版本号：`[X.Y.Z]` 方括号包裹，与本次发版的版本号一致
- 日期：`YYYY-MM-DD`
- 分组标题按 Keep a Changelog 规范：`Added`（新增功能）、`Fixed`（修复）、`Changed`（其他变更）
- 没有对应 commit 的分组**省略不写**（如本次无 `feat:` 则不出 `### Added` 段落）
- 每条去掉 hash，仅保留 message 原文（不改写内容，只分组）
- 含 `BREAKING CHANGE:` 的条目末尾标注 `**BREAKING**`

### 边界处理

- **commit 区间为空**（上次 bump 后无 commit）：报告 "no commits since last version"，不生成版本段落
- **同一版本号已存在**：警告并询问是覆盖还是跳过
- **无 CHANGELOG.md**：创建新文件，新条目作为首个版本

### 示例输出

```markdown
## [2.0.0] - 2026-09-02

### Added
- 新增 SemVer 自动推导版本号规则
- 版本号确认改为建议+确认模式

### Fixed
- 修复 hotfix 场景下版本号漏 bump 的问题

### Changed
- docs: 更新 CLAUDE.md 发版规则说明
- refactor: 统一版本号读取逻辑
```

---

## 步骤五：提交变更

```bash
git add CHANGELOG.md
git commit -m "docs: update CHANGELOG for v<版本号>"
```

---

**注意：** 本命令只负责生成/更新 CHANGELOG 内容，不负责版本号修改、分支操作、PR 创建——那些属于 `/ly:release` 的职责。发版流程中，先由 release 完成版本号 bump commit，再触发本命令生成 CHANGELOG。