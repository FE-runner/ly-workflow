## 1. propose.md 会话续跑改造

- [ ] 1.1 重写 `templates/commands/propose.md` 步骤 1.7：从"打印续接命令后**本次会话结束**（不调用 opsx:propose，等下一次在 worktree 内的调用）"改为"baseline 通过后当前会话以绝对路径 `cd` 进新 worktree（Bash cwd 持久生效），打印一次兜底续接命令（措辞标注：正常路径不使用，会话异常死亡时恢复用），并在**同一会话内**继续步骤 2（全自动/手动询问）"
- [ ] 1.2 在步骤 1.7 中写明 cwd 纪律硬约束：自 cd 进 worktree 之时起，本次编排所有 Git 操作、openspec 命令与文件读写以 worktree 为工作目录（文件操作用 worktree 绝对路径），SHALL NOT 回到主仓库路径执行本次 change 的任何产物操作
- [ ] 1.3 重写步骤 1.5（baseline 失败分支）：baseline 失败 → 报告失败摘要并询问"仍继续 / 放弃"；仍继续 = 同会话 cd 进 worktree 继续（失败摘要作为已知风险带入后续流程）；放弃 = 保留已创建的 worktree/分支（SHALL NOT 自动清理），打印携带失败摘要的兜底续接命令，会话结束，change 尚未生成
- [ ] 1.4 步骤 1.6 的续接命令措辞同步降级：不再是"提示在新 worktree 中再次调用 /ly:propose"的流程交接文案，改为"会话异常终止时的降级续接命令"文案
- [ ] 1.5 检查 propose.md 其余步骤（2-8）无"新会话/续接"残留表述；确认全自动流水线（步骤 7）与手动路径（步骤 8）在 worktree 场景下的表述不与"同会话续跑"矛盾（两者本就全程无 worktree 询问，仅需确认无隐含"会话已重启"假设）

## 2. 文档同步

- [ ] 2.1 更新根 `CLAUDE.md`：对外接口表 `/ly:propose` 行（"创建方案前问一次 worktree … 打印续接命令后结束会话"改为"… cd 进 worktree 同会话续跑，续接命令为异常兜底"）+ 关键设计决策 1 中对应表述
- [ ] 2.2 更新 `templates/CLAUDE.md` 中 `propose.md` 行描述（若提及会话交接/worktree 编排则同步）
- [ ] 2.3 检查 `README.md` 中 `/ly:propose` 相关描述，有对应表述则同步

## 3. 验证

- [ ] 3.1 一致性检查：propose.md 改后全文与 `specs/worktree-create-before-propose/spec.md`、`specs/ly-propose-flow/spec.md` 两个 delta 的 Requirement/Scenario 逐条对照，确认无矛盾（时序、兜底命令措辞、baseline 失败分支、cwd 纪律一致）
- [ ] 3.2 残留检查：`grep -rn '会话结束\|结束会话' templates/ CLAUDE.md` 确认除"baseline 失败放弃分支"外无旧语义残留
- [ ] 3.3 渲染验证：确认 propose.md 改动未破坏模板变量替换（`{{REVIEWER_MODEL}}` 等）与条件块结构（该模板含 `LY:IF` 条件块，编辑时不得误伤）
- [ ] 3.4 运行 `openspec validate --changes propose-session-continuity` 通过
