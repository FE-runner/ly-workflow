## Context

`templates/commands/release.md`（284 行）同步自 liyang-gitflow skill v2.0.0；源项目已升级 v2.1.0（commit `92a8e64`）。本次是内容源到模板的单向同步，模板结构与源 SKILL.md 一一对应（重要规则块 → 场景一 feature / 场景二 release / 场景三 hotfix / 场景四 dev-offline）。

## Goals / Non-Goals

**Goals:**
- release.md 与源 v2.1.0 三个变化点对齐（合并二选一、主分支检测、同步措辞）
- 根 CLAUDE.md / README 的 `/ly:release` 行同步

**Non-Goals:**
- 不动 `/ly:changelog`/`/ly:publish`、安装器代码、feature/dev-offline 场景
- 不重新设计 release.md 结构（保持与源 SKILL.md 的对应关系，便于后续同步）

## Decisions

### 决策 1：逐段对拷源 SKILL.md 的对应改动，不自行改写
源 commit 的三处 diff（重要规则块、release 步骤 4、hotfix 步骤 4）按原文搬到 release.md 对应位置，仅调整场景编号/分支名等上下文差异。

- 理由：release.md 的定位是源 skill 的命令化镜像，保持对拷可让下次同步仍是纯 diff 对齐；自行改写会造成源与模板漂移。
- 备选（否决）：借机重写/精简 release.md——会造成漂移，下次同步成本更高。

### 决策 2：spec 层面用 ADDED 而非 MODIFIED
基线 `release-publish-commands` 对合并方式与主分支名无既有 Requirement（现有 6 个 Requirement 全部不波及），新行为以 ADDED Requirement 落入该 capability。

- 理由：无基线可改，ADDED 语义准确；MODIFIED 需逐字复制基线块，此处不适用。

### 决策 3：合并方式选择的交互形态沿用源 skill 文本（命令注释内二选一说明），不强制 AskUserQuestion
源 v2.1.0 在步骤 4 用注释块写出两种方式与"二选一"标注，由执行时 Claude 按用户意向选择。

- 理由：与源保持一致；发版流程已有版本号确认等交互点，合并方式在此粒度（注释指引 + 执行时确认）够用，不为它单独加一次结构化询问。
- 备选（否决）：改成 AskUserQuestion 结构化询问——偏离源文本，且源语义是"默认方式 A、可走 B"的软选择。

## Risks / Trade-offs

- [主分支检测命令在无远端/离线环境下失败] → 模板已含 `git branch -r` 兜底；均失败时如实报错转人工（模板通用纪律）。
- [方式 B 绕过 review 上线] → 源 skill 明示该取舍（"适合无需 review 的快速上线"/"紧急情况"），模板如实搬运；默认仍是方式 A。
- [文档行描述过短无法体现细节] → 命令表行只需点出"二选一 + 主分支检测"关键词，细节在模板与 spec。

## Migration Plan

纯模板/文档变更。发版后用户重跑 `npx ly-workflow update` 即得新模板；回滚 = revert commit。

## Open Questions

（无——同步范围与源 diff 一一对应，无业务判断类分歧。）
