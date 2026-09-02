---
description: 'npm 包发布：bmc 私域 Nexus / GitHub Packages / npmjs + GitHub Release / CI 自动发布 四场景'
---

# Publish - npm 包发布

覆盖四个发布场景：bmc 私域 Nexus、GitHub Packages、公开 npmjs.org + GitHub Release、CI 自动发布（tag push 触发）。发布前走前置检查 → 版本号自动推导 → 构建 → 发布 → 验证完整流程。

## 使用方法

```bash
/publish <场景描述>
```

**🔴 CHECKPOINT：先确认发布目标，问用户，别猜。**

- **bmc 私域**：发到公司 Nexus 私有 registry（scope 通常是 `@bmc`）
- **GitHub**：三种情况之一，需要用户明确
  - A. GitHub Packages npm registry（`npm.pkg.github.com`，需要 GitHub 账号/组织权限）
  - B. 公开发到 npmjs.org，再在 GitHub 建 Release/Tag（开源包常见做法）
  - C. **CI 自动发布**：本地只 push commit/tag，实际 `npm publish` 由 GitHub Actions workflow 执行（团队协作/避免本地手动发布出错的常见做法）

确认后按对应场景执行。

---

## 前置检查（所有场景通用）

```bash
# Node/pnpm 版本
node -v
pnpm -v 2>/dev/null || npm -v

# Git 工作目录是否干净
git status --porcelain
# 有未提交改动先询问用户是否继续，别自动 commit

# 当前分支
git branch --show-current
# 建议从 master/main 发布，非主分支要提醒用户
```

检查 `package.json` 必备字段：

```bash
cat package.json | grep -E '"name"|"version"|"files"|"main"|"exports"|"publishConfig"'
```

- `files` 字段要包含实际产物目录（如 `dist`），漏了会导致发布出去的包缺文件
- 有 `prepublishOnly` / `build` 脚本的，发布前必须先跑一遍构建

**🔴 检测项目是否已有自定义发布脚本：**

```bash
cat package.json | grep -iE '"(publish|release)[a-z:-]*"\s*:'
ls scripts/*publish* scripts/*release* 2>/dev/null
```

- **有** → 先读脚本内容确认它做了什么（是否已封装 registry 检查/构建/版本 bump/tag）。**🔴 CHECKPOINT：优先问用户是否直接用现有脚本**，不要绕过去重新走下面的通用流程——现有脚本往往已经绑定了正确的 registry 地址和内部约定，重新手搓一遍容易和它冲突或重复发布
- **没有** → 按下面场景的通用步骤走

---

## 版本号确定规则（SemVer + Conventional Commits 自动推导）

**不要直接问用户「patch 还是 minor」，先分析 commit 历史给出建议，再让用户确认/覆盖。**（与 `/ly:release` 共享同一套规则）

### 自动分析步骤

```bash
# 1. 确定上一次 bump 的边界（优先 tag → package.json 历史 commit）
PREV_TAG=$(git describe --tags --abbrev=0 HEAD 2>/dev/null || echo "")
PREV_BUMP=$(git log -2 -p --format=%H -- package.json | grep -B5 '"version"' | grep '^[0-9a-f]\{40\}$' | tail -1)
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

- **同意建议**：直接按建议执行 `npm version <patch|minor|major>`
- **覆盖**：按用户输入的档位执行
- **不存在以往的 commit**：回退到直接询问版本号

若已装 `/ly:changelog`，version bump 后触发它更新 CHANGELOG，再补一次 commit；没装则询问用户要不要更新日志。

---

## 场景一：发布到 bmc 私域 Nexus

**触发词：** "发私域"、"发到bmc"、"内网发布"、"发到nexus"

### 1. 确认 `.npmrc` scope 配置

```bash
cat .npmrc 2>/dev/null | grep registry
```

应包含（scope 按实际包名调整，如 `@bmc`）：

```
@bmc:registry=https://nexus-office.domob-inc.cn/repository/bfm_npm_hosted/
```

没有就先创建 `.npmrc`（询问用户具体 Nexus 地址，不要瞎填）。

### 2. 登录检查

```bash
REGISTRY_URL=$(grep "@bmc:registry" .npmrc | cut -d'=' -f2 | tr -d ' ')
npm whoami --registry="$REGISTRY_URL"
```

未登录：

```bash
npm login --registry="$REGISTRY_URL"
```

### 3. 构建与检查

```bash
pnpm build          # 或对应包的 build 脚本
pnpm type-check      # 有则跑
pnpm lint            # 有则跑，失败先询问是否继续
```

### 4. 版本号（🔴 SemVer 自动推导 + 用户确认，非直接问 patch/minor/major）

按上方「版本号确定规则」执行：
- 分析上次 bump 以来的 commit 列表
- 按 feat/fix/BREAKING 推导建议档位
- 将建议展示给用户确认/覆盖
- 确认后执行 `npm version <patch|minor|major>`（会自动更新 package.json + 打 git tag + commit）

若项目已装 `/ly:changelog`，version bump 后触发它更新 CHANGELOG，再补一次 commit；没装则询问用户要不要更新日志。

### 5. 发布

```bash
# 注意 scope 私有包默认 restricted，要标注 access
npm publish --registry="$REGISTRY_URL" --access restricted
```

### 6. 推送 tag 并验证

```bash
git push --follow-tags

# 验证：发布后确认新版本已出现在目标 registry
npm view <包名>@<新版本号> --registry="$REGISTRY_URL"
```

---

## 场景二：发布到 GitHub Packages（`npm.pkg.github.com`）

**触发词：** "发到github packages"、"github registry"

### 1. `.npmrc` 配置

scope 必须对应 GitHub 用户名/组织（大小写敏感）：

```
@<github用户名或组织>:registry=https://npm.pkg.github.com
```

### 2. 认证

需要一个具备 `write:packages`（发布）+ `read:packages` 权限的 GitHub Personal Access Token：

```bash
# 方式一：npm login 交互式
npm login --scope=@<github用户名或组织> --registry=https://npm.pkg.github.com

# 方式二：环境变量 + .npmrc 直接写 token（本地测试可用，别提交含 token 的 .npmrc）
echo "//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}" >> ~/.npmrc
```

**注意：** 千万别把带 token 的 `.npmrc` commit 进仓库——检查 `.gitignore` 是否已排除本地 `.npmrc`（若项目里 `.npmrc` 本身要提交作为团队共享配置，token 必须走环境变量而非硬编码）。

### 3. package.json 需要 `publishConfig` 指向该 registry

```json
{
  "publishConfig": {
    "registry": "https://npm.pkg.github.com"
  }
}
```

### 4. 构建、版本号步骤同场景一（版本号按上方「版本号确定规则」自动推导 + 确认），发布命令：

```bash
npm publish
```

---

## 场景三：公开发到 npmjs.org + GitHub Release（开源包常见流程）

**触发词：** "发到npm官方"、"发public包"、"发github release"、"开源发布"

### 1. 确认无 scope registry 覆盖

```bash
cat .npmrc 2>/dev/null
# 若有 registry 指向私有源，临时用 --registry 覆盖，别改动 .npmrc 影响其他包
```

### 2. 登录 npmjs.org

```bash
npm whoami
# 未登录：
npm login
```

### 3. 构建、版本号步骤同场景一（版本号按上方「版本号确定规则」自动推导 + 确认）

### 4. 发布

```bash
npm publish --access public   # 首次发布 scoped 公共包必须加 --access public
```

### 5. GitHub Release

```bash
# 确认 tag 已推送（npm version 已打好 tag）
git push --follow-tags

# 用 gh cli 建 release，标题/说明取自 CHANGELOG 对应版本段落
gh release create v<新版本号> --title "v<新版本号>" --notes-file <(sed -n '/## \[<新版本号>\]/,/## \[/p' CHANGELOG.md | sed '$d')
```

没装 `gh` 的话提示用户去 GitHub 网页手动创建 Release，附上对应 CHANGELOG 片段。

---

## 场景四：推送 GitHub 触发 CI 自动发布（GitHub Actions）

**触发词：** "用CI发布"、"github actions发包"、"推tag自动发布"、"CI自动发npm"

本地不跑 `npm publish`，只负责构建前的版本号/tag 准备，真正的发布动作在 CI 里跑。

### 1. 确认触发方式（🔴 CHECKPOINT：问用户，别猜）

- **打 tag 触发**（最常见）：workflow 监听 `push: tags: ['v*']`
- **push 到 release 分支触发**：workflow 监听 `push: branches: [main/master]`
- **手动触发**：workflow 监听 `workflow_dispatch`

```bash
cat .github/workflows/*.yml 2>/dev/null | grep -A3 "^on:"
```

没有 workflow 文件就先帮用户写一个（`.github/workflows/publish.yml`），核心结构：

```yaml
name: Publish
on:
  push:
    tags: ['v*']
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          registry-url: 'https://registry.npmjs.org'   # 私域改成 Nexus 地址；@scope 需在 .npmrc 里配好
      - run: npm ci
      - run: npm run build
      - run: npm publish --access public   # 私有包用 --access restricted
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### 2. 配置发布用的 Secret（GitHub 仓库设置里做，本地只提醒）

- npmjs.org / GitHub Packages：在仓库 `Settings → Secrets and variables → Actions` 添加 `NPM_TOKEN`（npm 官网生成的 Automation Token，或 GitHub PAT）
- bmc 私域 Nexus：CI runner 需能访问内网 Nexus 地址——若 GitHub Actions 是公网 runner，先确认 Nexus 是否对公网开放/走 self-hosted runner，不确定就提醒用户先确认网络可达性，别假设能连上
- **注意：** Token 只存在 Secrets 里，绝不写进 workflow 文件或 commit

### 3. 本地准备工作（触发 CI 前要做的）

```bash
# 构建、类型检查照场景一跑一遍（确保能过，CI 里挂了排查更麻烦）
pnpm build
pnpm type-check

# 版本号 bump（按上方「版本号确定规则」自动推导 + 确认）
npm version <patch|minor|major>

# 若装了 /ly:changelog，此时更新 CHANGELOG 并补 commit；没装则询问用户
```

### 4. 推送触发

```bash
git push --follow-tags
# 或按 workflow 触发条件，push 到对应分支
```

### 5. 验证

```bash
# 查看 workflow 运行状态
gh run list --limit 5
gh run watch          # 实时看当前发布 workflow 的日志

# CI 跑完后确认包已上线
npm view <包名> versions --registry=<对应registry>
```

没装 `gh` 就提示用户去仓库 Actions 页面看运行结果。

**🔴 CHECKPOINT：** 本地绝不要在 CI 已接管发布的项目里再手动跑一遍 `npm publish`——会导致版本号冲突或重复发布。先确认这次是走 CI 还是走本地手动，别两条路一起跑。

---

## 发布前自检清单（任何场景都建议过一遍）

```bash
# 预览实际会打进包里的文件，检查是否缺文件/夹带不该发的文件
npm pack --dry-run
```

- `dist`/构建产物是否已生成且是最新的（避免发的是旧代码）
- `README.md`、`LICENSE` 是否存在且会被 `files` 字段包含
- `version` 是否已经存在于目标 registry（避免 409 冲突，`npm view <包名>@<版本号>` 可查）
- 私有包 `access` 是否为 `restricted`，公开包是否为 `public`

## `npm publish` 常见报错处理

| 报错 | 触发条件 | 处理 |
|---|---|---|
| `403 Forbidden` / `You must be logged in` | 未登录或 token 过期 | 重新 `npm login --registry=<对应地址>`；GitHub Packages/CI 场景检查 token 权限是否含 `write:packages` 或 Secret 是否过期 |
| `409 Conflict` / `You cannot publish over the previously published version` | 版本号已存在 | 先 `npm view <包名>@<版本号> --registry=<对应地址>` 确认；确实冲突则重新 `npm version patch/minor/major` 打一个新版本号，不要改已发布版本 |
| `402 Payment Required` / 需要 `--access public` | 首次发布 scoped 公共包没加 `--access public` | 补上 `--access public` 重试；私有包保持 `--access restricted` 别改 |
| 构建脚本报错 / `prepublishOnly` 失败 | 代码本身有问题，或依赖没装齐 | 别绕过直接强发（`npm publish` 会先跑 `prepublishOnly`，失败会自动中止，不用手动加 `--ignore-scripts` 硬闯）；先定位报错原因修好代码再重试 |
| CI 里 `npm publish` 卡住或失败但本地能发 | CI runner 网络不通私域 Nexus，或 Secret 没配对 | 检查该 workflow 是否为 self-hosted runner、Secret 名字是否与 workflow 里 `secrets.XXX` 一致；不确定就让用户去 Actions 页面看具体报错，不要瞎猜重试 |

---

## 发布后验证

```bash
npm view <包名> versions --registry=<对应registry>   # 确认新版本已出现
```

新开一个临时目录 `npm install`/`pnpm add` 装一下，跑通基本 import，确认没有漏文件。

---

**注意：** 版本号 bump（`npm version`）、tag、push 若项目已装 `/ly:release` 和 `/ly:changelog`，优先复用那两个命令的规则，避免重复定义流程；本命令专注 registry 认证配置 + `npm publish` 本身这一环。不引入 changesets。