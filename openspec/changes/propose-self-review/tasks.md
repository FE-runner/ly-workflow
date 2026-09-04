## 1. propose.md 新增自审步骤

- [ ] 1.1 在 `templates/commands/propose.md` 步骤 4（确定真实 change 名）与步骤 5（暂存并 commit）之间插入"方案自审"步骤：四项检查（正向闭环 / 反向闭环 / 基线波及 / 通用业务维度过网）的执行指引与粒度规则（按 What Change 条目、tasks checkbox、基线 Requirement 粒度逐条映射；design.md 缺失容错跳过；New Capabilities 跳过基线波及）内嵌为 checklist
- [ ] 1.2 在自审步骤中写明发现二分处理规则：机械断链直接改 artifact 不询问；业务判断类列开放问题用 AskUserQuestion 问用户（全自动模式下同样询问，作为流水线人工确认点），按回答更新 artifact 后继续；用户拒绝/取消回答时停止后续编排（不 commit、不启动流水线），artifacts 留工作区转人工
- [ ] 1.3 在自审步骤中写明逐项结论清单硬约束：每个检查子项标注 通过/不适用+理由/已修复/待用户决策 四值结论，禁止"自审通过，无问题"一句带过，silent skip 视为未执行
- [ ] 1.4 同步 `templates/commands/propose.md` 步骤 5 的描述：commit 前含自审环节，自审修复随 `propose: <change-name>` commit 一次干净提交（产物与自审修复同一待提交单元，不产生 commit + 未提交修复的混合状态）

## 2. 文档同步

- [ ] 2.1 更新 `templates/CLAUDE.md` 的 `propose.md` 行描述（补"生成后 commit 前执行方案自审"）
- [ ] 2.2 更新根 `CLAUDE.md` 对外接口表中 `/ly:propose` 描述与"关键设计决策"（若有涉及编排时序的表述需同步）
- [ ] 2.3 更新 `README.md` 中 `/ly:propose` 命令描述（若有对应行）

## 3. 验证

- [ ] 3.1 渲染验证：用 `{{REVIEWER_MODEL}}`/`{{IMPLEMENTER_MODEL}}` 等占位符渲染 `templates/commands/propose.md`，确认新增自审步骤未破坏模板变量替换与条件块结构
- [ ] 3.2 一致性检查：propose.md 新步骤与 `specs/ly-propose-flow/spec.md` delta 的 Requirement 逐条对照，确认无矛盾、无遗漏（时序、询问规则、清单硬约束一致）
- [ ] 3.3 运行 `openspec validate --changes propose-self-review` 通过
