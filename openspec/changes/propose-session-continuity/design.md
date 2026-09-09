## Context

见 proposal.md — Why。现状：`/ly:propose` 步骤 1 在切 worktree 后打印续接命令并结束会话，由用户在新 worktree 里开新会话再调一次 `/ly:propose`。探索阶段的上下文只能浓缩进续接 prompt 文本，断点落在整条流程上下文最丰富的位置。

关键事实（支撑本设计的可行性判断）：

1. **Bash 工具的工作目录在会话内持久**——`cd` 进 worktree 后，后续所有 git/openspec 命令天然作用于 worktree 分支
2. **Read/Edit/Write 用绝对路径**——文件操作不依赖会话工作目录
3. **worktree 从当前分支 HEAD 切出，CLAUDE.md/`.claude/` 配置与主仓库逐字节相同**——"新会话才能加载新项目上下文"不成立，两边内容一致
4. **Claude Code 会话按启动目录分桶存储**（`~/.claude/projects/<编码路径>/`），`claude --resume` 跨目录恢复不被原生支持——续接命令本质上就是"放弃上下文"的交接，不是恢复

## Goals / Non-Goals

**Goals:**
- 切 worktree 后会话不断链：探索/讨论上下文全程存活在同一会话内
- "worktree 先于 change 创建、change 产物 commit 在 worktree 分支上"的既有语义不变
- 会话异常死亡时仍有恢复手段（兜底续接命令）

**Non-Goals:**
- 不做跨目录 `claude --resume` 的 session 文件 hack
- 不改变 worktree 询问的单点位置（仍是创建方案前、全局一次）
- 不改动 `/ly:apply`/`/ly:worktree`/review 循环的任何行为
- 不处理"主仓库与 worktree 并行开发"的冲突协调（现状已由 git worktree 机制保证）

## Decisions

### 决策 1：同会话续跑（cd 进 worktree），而不是保留断点做厚 handoff 或挪断点到 apply 前
- **备选 A（断点后移到 apply 前）**：propose/review-plan 在主仓库跑，apply 前再切 worktree。被否：propose: commit 会落在基线分支（如 main），文档 commit 散在两个分支；且 apply 断点虽上下文损失小，仍是断点。
- **备选 B（保留断点、handoff 加厚）**：探索结论落盘成 handoff 文件。被否：治标不治本，断点仍在。
- **选择（同会话续跑）**：不仅消除断点，还比现状更保真地实现"change 后续在隔离区内生成"——产物 commit 落在 worktree 分支上，与既有 spec 语义完全一致。技术上依赖事实 1/2/3，无新依赖。

### 决策 2：续接命令保留为异常兜底，不是删除
同会话续跑的全部优势建立在"会话存活"上。会话中途崩溃/终端关闭时，上下文优势瞬间蒸发——此时用户需要的正是现状那条续接命令。因此：切换完成后**立即打印**一次兜底续接命令（措辞标注"异常时使用"），正常路径下它不被使用。成本是一行输出，收益是降级路径始终在手。

### 决策 3：baseline 失败分支改写为"仍继续 / 放弃"两选项
现状语义是"默认不打印续接命令，明确选择继续才打印携带失败摘要的续接命令"。新语义下"继续"意味着同会话进入 worktree，因此改写为：仍继续 → cd 进 worktree、失败摘要带入后续流程；放弃 → 保留 worktree/分支不自动清理（用户可能想手工修好 baseline 再用兜底命令续接）、打印携带失败摘要的兜底命令、会话结束。不提供"自动删除 worktree"选项——删除是破坏性动作，且 `/ly:worktree remove` 已存在，交给用户显式操作。

### 决策 4：cwd 纪律写成显式规约而非依赖自觉
cd 进 worktree 后，最大的操作性风险是编排过程中某步操作误回主仓库路径（如用 Read 相对路径解析到主仓库、或某段逻辑硬编码主仓库绝对路径）。spec 里写成硬约束："自 cd 进 worktree 之时起，所有 Git/openspec 命令与文件读写以 worktree 为工作目录，SHALL NOT 回到主仓库路径执行本次 change 的任何产物操作"，并在 propose.md 模板里同样声明。文件操作一律用 worktree 绝对路径。

## Risks / Trade-offs

- **[会话"身份"仍在主仓库：项目级上下文（hooks、权限、memory 目录）按启动目录绑定]** → worktree 从 HEAD 切出，CLAUDE.md/`.claude/` 配置与主仓库逐字节一致，实际行为无差异；memory 本来就按逻辑项目沉淀，worktree 开发也该带上
- **[compaction 后 Bash cwd 是否保留]** → cwd 是 shell 进程状态，compaction 只压上下文不重启进程，cwd 保留；极端情况下若 cwd 意外重置，下一步 git 命令会作用于错误目录——由决策 4 的显式规约兜底（每段编排开始时可用 `pwd` 校验，成本可忽略）
- **[用户误以为切了 worktree 就该"退出等新会话"（旧习惯）]** → 编排在 cd 后明确打印"已进入隔离 worktree，本会话继续"的提示；兜底命令同时在场，两种心智都有出口
- **[续接命令打印时 change 名还不知道]** → 兜底命令沿用现状措辞"继续 /ly:propose <同一需求>"（需求描述占位），不依赖 change 名，与现状一致

## Migration Plan

纯模板/文档改动，随下次发版生效。无存量状态迁移——旧流程没有持久化状态需要转换，已存在的 worktree 不受影响。回滚 = revert 对应 commit。

## Open Questions

（无——探索阶段已收敛：方向选同会话续跑，备选 A/B 均已论证排除。）
