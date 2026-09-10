## Purpose

Provides three release pipeline slash commands that automate version bumping, changelog generation, and npm package publishing — installed alongside other core ly-workflow commands.

## Requirements

### Requirement: Slash commands for release/publish workflows

The system SHALL provide three slash commands installed to `~/.claude/commands/ly/` and registered in `getWorkflowConfigs()`:

- `/ly:release` — GitFlow branching workflow (feature/release/hotfix/dev-offline)
- `/ly:changelog` — Keep a Changelog generation from conventional commits
- `/ly:publish` — npm package publishing to multiple registry targets

Each command SHALL be encoded as a `.md` template in `templates/commands/` and registered via `cmd()` in `src/utils/installer-data.ts`.

#### Scenario: All three commands appear in installed command list
- **WHEN** `npx ly-workflow init` runs
- **THEN** `~/.claude/commands/ly/` contains `release.md`, `changelog.md`, and `publish.md`
- **AND** `getWorkflowConfigs()` returns 3 additional entries with category `release`

### Requirement: SemVer auto-detection for version bumping

The `/ly:release` and `/ly:publish` commands SHALL analyze commits since the last version boundary (tag or version-file bump commit) and suggest a SemVer bump level (major/minor/patch) based on Conventional Commits prefixes:

- `feat!:` or `BREAKING CHANGE:` → major
- `feat:` (without breaking) → minor
- `fix:` / `docs:` / `chore:` only → patch

The suggestion SHALL be presented to the user for confirmation or override before any version file is modified.

#### Scenario: Feature commits suggest minor bump
- **WHEN** commits since last tag include `feat: add user auth` and `fix: login crash`
- **THEN** the system suggests a minor bump (e.g., 1.2.0 → 1.3.0)
- **AND** asks user to confirm or override

#### Scenario: Only fix commits suggest patch bump
- **WHEN** commits since last tag include only `fix:` and `docs:` commits
- **THEN** the system suggests a patch bump (e.g., 1.2.3 → 1.2.4)

### Requirement: Keep a Changelog formatted output

The `/ly:changelog` command SHALL produce CHANGELOG.md output in [Keep a Changelog](https://keepachangelog.com) format with commits grouped by type:

- `feat:` → `### Added`
- `fix:` → `### Fixed`
- All other prefixes → `### Changed`

Groups with zero commits SHALL be omitted from output. The version header SHALL use `## [X.Y.Z] - YYYY-MM-DD` format.

#### Scenario: Mixed commit types produce grouped changelog
- **WHEN** commits include 2 `feat:`, 1 `fix:`, and 1 `docs:`
- **THEN** output contains `### Added` (2 items), `### Fixed` (1 item), `### Changed` (1 item)

#### Scenario: Only fix commits omit empty groups
- **WHEN** commits include only 3 `fix:` commits
- **THEN** output contains `### Fixed` (3 items) with no `### Added` or `### Changed` sections

### Requirement: Multi-target npm publishing

The `/ly:publish` command SHALL support four publishing targets:

1. bmc private Nexus registry (scope `@bmc`)
2. GitHub Packages (`npm.pkg.github.com`)
3. Public npmjs.org with GitHub Release
4. CI auto-publish (tag push triggers GitHub Actions workflow)

Each scenario SHALL include pre-flight checks (node/pnpm version, git clean state, package.json field validation) before publishing.

#### Scenario: Publishing to bmc Nexus requires scope registry config
- **WHEN** user selects bmc Nexus as target
- **THEN** the system checks `.npmrc` for `@bmc:registry` configuration
- **AND** verifies `npm whoami` against the Nexus registry before proceeding

### Requirement: Publish execution and verification

The `/ly:publish` command SHALL execute build before publish, and SHALL NOT attempt publishing if the build fails or authentication fails.

For local publishing (targets 1-3), the system SHALL:

- Run the project's build script (`pnpm build` or equivalent) before `npm publish`
- Abort and report the failure if `pnpm build` exits non-zero
- After successful publish, verify the new version exists on the target registry via `npm view <pkg>@<version>`
- If the version already exists on the target registry (409 Conflict), SHALL prompt to bump to a new version instead of overwriting

For CI auto-publish (target 4), the system SHALL:

- NOT run `npm publish` locally — only prepare version bump and tag
- Push the tag (`git push --follow-tags`) to trigger the existing GitHub Actions workflow
- Verify that a `.github/workflows/` publish workflow exists before proceeding; if absent, offer to create one
- After push, monitor the CI run status (via `gh run watch` or instruct user to check GitHub Actions)

#### Scenario: Build failure aborts publish
- **WHEN** `/ly:publish` runs `pnpm build` and it exits non-zero
- **THEN** the system SHALL stop and report "build failed" without attempting `npm publish`

#### Scenario: Successful local publish with verification
- **WHEN** `/ly:publish` successfully publishes to a target registry
- **THEN** the system SHALL run `npm view <pkg>@<version> --registry=<url>` to confirm the version is visible

#### Scenario: CI publish with missing workflow
- **WHEN** user selects CI auto-publish but no `.github/workflows/` file has a publish job
- **THEN** the system SHALL offer to create a `.github/workflows/publish.yml` with tag-triggered publish configuration

### Requirement: Changelog generation boundaries and update semantics

The `/ly:changelog` command SHALL determine the commit range from the last version boundary (tag, version.sh bump commit, or package.json version bump — tried in that order) to the current HEAD, excluding `bump version` commits.

The system SHALL insert the new version entry at the top of an existing `CHANGELOG.md` (not overwrite or append). If a version header with the same version number already exists, the system SHALL warn and ask whether to overwrite or skip. If no `CHANGELOG.md` exists, the system SHALL create one with the new entry as the first version. If the commit range is empty (no commits since last version), the system SHALL report the empty range and not create a version section.

#### Scenario: New changelog entry inserted at top
- **WHEN** `CHANGELOG.md` already has entries for v1.0.0 and v0.9.0
- **AND** the new version is v1.1.0
- **THEN** the new `## [1.1.0]` entry SHALL be inserted above `## [1.0.0]`

#### Scenario: Empty commit range prevents empty version section
- **WHEN** no commits exist since the last version boundary
- **THEN** the system SHALL report "no commits since last version" and SHALL NOT generate a version section
### Requirement: release/hotfix 上线合并二选一与主分支名检测
`/ly:release` 的 release 与 hotfix 场景 SHALL 提供两种上线合并方式供用户选择：**方式 A 远端 PR 合并**（默认，push 分支后创建 PR 到主分支，等 code review 通过后 merge）与**方式 B 本地直接合并**（先 push 分支留档 → checkout 主分支 → pull → `merge --no-ff <开发分支>` → push 主分支，跳过远端 PR）。两种方式合并完成后，后续三分支同步步骤 SHALL 以相同流程执行（SHALL NOT 因合并方式不同而分叉）。

主分支名检测规则：主分支可能是 `master` 也可能是 `main`，`/ly:release` 在执行任何场景前 SHALL 先检测远端主分支名（`git remote show origin | grep 'HEAD branch'`；远端不可用或未设置 HEAD 时以 `git branch -r | grep -E 'origin/(master|main)$'` 兜底），命令示例中的 `master` SHALL 替换为实际检测到的主分支名，流程逻辑不变。

#### Scenario: 用户选择本地直接合并方式上线 release
- **WHEN** 用户在 release 场景步骤 4 选择方式 B
- **THEN** 模板执行"push release 分支留档 → checkout 主分支 → pull → merge --no-ff release/<版本号> → push 主分支"，不创建远端 PR，随后照常执行三分支同步

#### Scenario: 用户选择默认远端 PR 方式
- **WHEN** 用户在 release 场景步骤 4 选择方式 A（或不选择、取默认）
- **THEN** 模板按原流程 push 分支并创建 PR，等 review 通过后 merge，随后照常执行三分支同步

#### Scenario: 远端主分支名为 main 时命令替换
- **WHEN** 主分支名检测输出 `HEAD branch: main`
- **THEN** 后续命令示例中的 `master` 全部按 `main` 执行（如 `git checkout main`、`git merge --ff-only origin/main`），流程逻辑不变

#### Scenario: 远端不可用时兜底检测
- **WHEN** `git remote show origin` 不可用或未返回 HEAD branch
- **THEN** 以 `git branch -r | grep -E 'origin/(master|main)$'` 结果确定主分支名后继续

#### Scenario: hotfix 场景同样支持二选一
- **WHEN** 用户执行 hotfix 场景的上线合并步骤
- **THEN** 与 release 场景一致提供方式 A（默认）/方式 B 二选一，合并完成后三分支同步照常执行
