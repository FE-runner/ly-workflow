## Why

`/ly:propose` 在用户选择切隔离 worktree 时，打印续接命令后**结束当前会话**，要求在新 worktree 里开新会话续跑。探索阶段（`/ly:explore`）积累的上下文——业务理解、收敛的技术要点、待确认的开放问题——只能靠续接命令里的一段 prompt 文本硬扛，上下文损失发生在整条流程里信息最丰富的位置。而 worktree 本来就是从当前分支 HEAD 切出的（内容与主仓库逐字节一致），同会话跨目录续跑在技术上完全成立，这个断点没有存在的必要。

## What Changes

- **`/ly:propose` 切 worktree 后不再结束会话**：worktree 创建 + 环境文件复制 + baseline 验证完成后，当前会话直接 `cd` 进 worktree（Bash cwd 持久生效），随后在**同一会话内**继续步骤 2（全自动/手动询问）→ `opsx:propose` → 方案自审 → `propose:` commit → 流水线；全程所有 Git/openspec/文件操作以 worktree 为工作目录，SHALL NOT 回到主仓库路径操作
- **续接命令保留但降级为异常兜底**：正常路径用不上；当会话中途意外死亡（崩溃、终端关闭）时，用户仍可凭已打印的续接命令在新会话中恢复——措辞同步调整（不再是"下一步"，而是"异常时续接"）
- **baseline 失败分支语义同步调整**：选择"仍继续" = 同会话 cd 进 worktree 继续（失败摘要带入后续流程）；选择"放弃" = 保留 worktree + 打印兜底续接命令，会话结束
- 不改变的部分：worktree 询问仍是创建方案前的全局单点询问；worktree/分支锁定为开发分支名、不因 change 名重命名；"worktree 先于 change 创建"的时序不变（change 仍生成并 commit 在 worktree 分支上）；`/ly:worktree switch` 仍然不存在

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `worktree-create-before-propose`：核心行为反转——切 worktree 后由"当前会话 SHALL NOT 切换目录、SHALL NOT 继续执行本次 opsx:propose（等下一次调用）"改为"当前会话 SHALL 切换工作目录进 worktree 并在同一会话内继续执行完整 propose 编排"；续接命令从"流程必经的交接手段"降级为"会话异常死亡的降级兜底"；baseline 失败分支的两个选项语义同步改写
- `ly-propose-flow`：全自动/手动询问的时序描述同步——该询问仍在 worktree 询问之后进行，但"用户选择切换 worktree 则本次会话结束、下一次会话再询问"的表述改为"当前会话 cd 进 worktree 后在本会话内继续该询问"

## Impact

- `templates/commands/propose.md`：步骤 1.5/1.6/1.7 重写（baseline 失败分支 + 续接命令降级 + 会话续跑），新增"自此刻起所有操作以 worktree 为工作目录"的显式声明
- 文档同步：根 `CLAUDE.md`（对外接口表 `/ly:propose` 行 + 关键设计决策 1）、`templates/CLAUDE.md`（propose.md 行描述）、`README.md`（`/ly:propose` 命令描述，若有对应表述）
- 不涉及：`src/` 代码、`codeagent-wrapper`、其他命令模板（`/ly:apply`/`/ly:worktree` 不受影响）
- 用户可感知行为变化：选切 worktree 后终端不再"结束等待新会话"，而是同会话继续问全自动/手动并跑完整条流水线——探索上下文全程零丢失
