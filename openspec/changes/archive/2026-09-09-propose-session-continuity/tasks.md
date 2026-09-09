## 1. propose.md 会话续跑改造

- [x] 1.1 重写 `templates/commands/propose.md` 步骤 1.7：从"打印续接命令后**本次会话结束**（不调用 opsx:propose，等下一次在 worktree 内的调用）"改为"baseline 通过后当前会话以绝对路径 `cd` 进新 worktree（Bash cwd 持久生效），打印一次兜底续接命令（措辞标注：正常路径不使用，会话异常死亡时恢复用），并在**同一会话内**继续步骤 2（全自动/手动询问）"
- [x] 1.2 在步骤 1.7 中写明两条硬约束：① cd 后**立即校验**当前工作目录确为该 worktree（`pwd` 与 worktree 绝对路径比对，或 `git rev-parse --git-dir` 确认位于 worktree 内），cd 失败或校验不通过 → **停止编排、报告原因，不执行后续任何 git/openspec/文件操作**（写成显式步骤，非可选措辞）；② 自 cd 校验通过之时起，本次编排所有 Git 操作、openspec 命令与文件读写以 worktree 为工作目录（文件操作用 worktree 绝对路径），SHALL NOT 回到主仓库路径执行本次 change 的任何产物操作
- [x] 1.3 重写步骤 1.5（baseline 失败分支）：baseline 失败 → 报告失败摘要并询问"仍继续 / 放弃"；仍继续 = 同会话 cd 进 worktree 继续（失败摘要作为已知风险带入后续流程）；放弃 = 保留已创建的 worktree/分支（SHALL NOT 自动清理），打印携带失败摘要的兜底续接命令，会话结束，change 尚未生成
- [x] 1.4 步骤 1.6 的续接命令措辞同步降级：不再是"提示在新 worktree 中再次调用 /ly:propose"的流程交接文案，改为"会话异常终止时的降级续接命令"文案
- [x] 1.5 检查 propose.md 其余步骤（2-8）无"新会话/续接"残留表述；确认全自动流水线（步骤 7）与手动路径（步骤 8）在 worktree 场景下的表述不与"同会话续跑"矛盾（两者本就全程无 worktree 询问，仅需确认无隐含"会话已重启"假设）

## 2. 文档同步

- [x] 2.1 更新根 `CLAUDE.md`：对外接口表 `/ly:propose` 行（"创建方案前问一次 worktree … 打印续接命令后结束会话"改为"… cd 进 worktree 同会话续跑，续接命令为异常兜底"）+ 关键设计决策 1 中对应表述（核对，若无"结束会话/续接"语义表述则按需补充"同会话 cd 进 worktree 续跑"描述）
- [x] 2.2 更新 `templates/CLAUDE.md` 中 `propose.md` 行描述（核对，若提及会话交接/worktree 编排则同步，无对应表述则按需补充）
- [x] 2.3 检查 `README.md` 中 `/ly:propose` 相关描述，有对应表述则同步
- [x] 2.4 新增 changelog 条目：根 `CLAUDE.md` 的"变更记录 (Changelog)"一节 + `CHANGELOG.md` 各加一条（日期/版本遵循现有格式，版本号按发版规则同步 bump）

## 3. 验证

- [x] 3.1 一致性检查：propose.md 改后全文与 `specs/worktree-create-before-propose/spec.md`、`specs/ly-propose-flow/spec.md` 两个 delta 的 Requirement/Scenario 逐条对照，确认无矛盾（时序、兜底命令措辞、baseline 失败分支、cwd 纪律一致）
- [x] 3.2 残留检查：`grep -rn '会话结束\|结束会话' templates/ CLAUDE.md` 确认除"baseline 失败放弃分支"外无旧语义残留
- [x] 3.3 结构验证：确认 propose.md 改动后 frontmatter 描述与正文一致、步骤 1.5/1.6/1.7 序号衔接正确、AskUserQuestion 命令代码块完整（该模板实际不含 `LY:IF` 条件块与 `{{REVIEWER_MODEL}}` 占位符——那些在 apply.md/review-plan.md 中，勿套用）
- [x] 3.4 运行 `openspec validate --changes propose-session-continuity` 通过
