## 1. review-code.md：审查-修复循环

- [ ] 1.1 把原"步骤3 调用 Codex 审查"改写为循环入口：首轮调用 Codex 审查后，若 Critical=0 直接跳到步骤4输出报告；若 Critical>0 进入循环
- [ ] 1.2 循环体加入"Claude 先判断是否认可"说明：对每条 Critical 先判断认可与否；认可才进入修复动作（范围为 Critical 直接指向的文件/条目 + 修复它所必需的直接依赖条目，改动必需依赖条目时报告须说明关联性）；不认可则不修复，报告写明反驳理由
- [ ] 1.3 循环体加入自动重新调用 Codex 审查的说明，明确不需要用户手动重新触发命令
- [ ] 1.4 加入熔断判定说明：用"文件路径 + 问题类别 + 定位锚点（函数名/路由/调用点）"三者共同判定是否为相邻两轮的同一个 Critical，不要求文字完全一致；若上一轮 Claude 对该 Critical 是"不认可"（未修复），相邻两轮再次出现不判定为熔断，走"分歧未决"（见 1.5b）
- [ ] 1.5 加入两个额外停止条件说明：无法安全自动修复（需业务决策/缺凭据/改公开契约/信息不足）、修复后验证（测试/类型检查/构建）失败
- [ ] 1.5b 加入"分歧未决"停止条件说明：Claude 判断某条 Critical 不认可、未修复，下一轮 Codex 仍判定同一问题存在，立即停止循环，报告需并列展示 Codex 各轮原始发现与 Claude 各轮反驳理由，转人工裁决
- [ ] 1.5c 加入审查调用失败停止条件说明：`codeagent-wrapper` 超时/非零退出/空响应/返回格式无法解析，都视为独立终止条件，不得等同于"本轮无 Critical"
- [ ] 1.5d 加入全局轮数上限说明：设一个宽松上限（默认 20 轮），达到即无条件停止转人工，不作为正常场景的主终止信号
- [ ] 1.6 加入循环终止条件汇总说明：Critical=0 正常结束；熔断；分歧未决；无法安全修复；验证失败；审查调用失败；达到全局轮数上限——以上情况都要终止循环
- [ ] 1.7 加入首轮基线记录说明：首轮确定的审查范围基线（commit-ish，或零 commit 场景下的稳定快照）必须记录并在后续轮次复用，不重新走"判定审查范围"分支选择逻辑，避免工作区变脏后审查范围收缩
- [ ] 1.7b 零 commit 场景基线改为稳定快照：覆盖 staged/unstaged/untracked 三类状态的合并视图，不单纯依赖 `git diff --cached`，确保已暂存文件被直接修改（变为未暂存）后仍能在复审中看到修复
- [ ] 1.8 新增 `--commit-each-round` 标志说明：传入时每轮修复+验证通过后立即在循环内部提交（`git add` 精确限定本轮改动文件），提交信息含 `fix:` 前缀与轮次；若本轮无实际改动不建空 commit；commit 本身失败（hook拒绝/身份未配置/锁冲突等）视为独立终止条件，立即停止不进入下一轮；不传时维持现状，不自动提交

## 2. review-code.md：输出报告

- [ ] 2.1 补充"熔断/分歧未决/无法安全修复/验证失败/审查调用失败/达到轮数上限"结束时的报告格式：明确指出触发的具体条件、涉及问题（文件/类别/锚点/判定依据），并说明需要人工介入；"分歧未决"额外要求并列展示 Codex 与 Claude 各轮的论点
- [ ] 2.2 补充"清零结束"时的报告格式：保持原有 Critical/Warning/Info 分级列表结构，Critical 部分为空或不再出现；若循环中曾发现并修复过 Critical，必须写明"本次已自动修复 N 个 Critical"，不得用"未发现问题"掩盖
- [ ] 2.3 确认 Warning/Info 不参与循环终止判定，只在最终报告列出最后一轮结果，不跨轮次合并
- [ ] 2.4 报告补充：总轮次、每轮改动文件清单

## 3. review-plan.md：新增分级 + 审查-修复循环

- [ ] 3.1 把当前"步骤4 输出报告"的不分级"问题清单"格式，改为 Critical/Warning/Info 三级（对齐 review-code.md 的报告结构）
- [ ] 3.2 把"步骤3 调用 Codex 审查"改写为循环入口：首轮调用后 Critical=0 直接输出报告；Critical>0 进入循环
- [ ] 3.3 循环体加入"Claude 先判断是否认可"说明（同 1.2）：认可才修改该 change 的 `proposal.md`/`design.md`/`tasks.md`，范围为直接指向的条目 + 必需的直接依赖条目（跨 artifact 的一致性问题需说明关联性）；不认可则不修改，报告写明反驳理由
- [ ] 3.4 循环体加入自动重新调用 Codex 审查的说明；每轮审查都重新读取三份文件的**当前内容**（不是 diff），不需要基线记录逻辑
- [ ] 3.5 每轮修复后加入运行 `openspec validate --changes <change-name>` 的说明，验证失败视为"修复后验证失败"停止条件
- [ ] 3.6 复用 review-code.md 的熔断判定说明，定位锚点改为"artifact 内的具体条目/章节"；复用"无法安全自动修复""分歧未决""审查调用失败""全局轮数上限"四个停止条件
- [ ] 3.7 补充报告格式：熔断/分歧未决/无法安全修复/验证失败/审查调用失败/达到轮数上限时的报告（同 review-code.md 结构）；清零结束时的 Critical/Warning/Info 分级报告；总轮次、每轮改动文件清单
- [ ] 3.8 新增 `--commit-each-round` 标志说明（同 1.8）：传入时每轮修复+`openspec validate`通过后立即提交，提交信息含 `fix:` 前缀、change 名与轮次；无实际改动不建空commit；commit失败视为独立终止条件；不传时不自动提交

## 4. worktree.md：新增 switch 子命令

- [ ] 4.1 在子命令表新增 `switch <change-name> [--auto]` 一行
- [ ] 4.2 新增前置校验说明：change 必须已存在（`openspec/changes/<change-name>/proposal.md` **与 `tasks.md` 均存在**）且已提交（`git status --porcelain -- openspec/changes/<change-name>/` 为空），任一不满足直接报错并给出修复建议（只有 proposal.md 没有 tasks.md 时提示"请先完成规划再执行 switch"）
- [ ] 4.2b 新增分支拓扑校验说明：**先判断目标路径是否已是已注册的 worktree——是则直接定位，跳过本条**；否则（本次需要从 base ref 新建）该 change 的 artifact 最近一次 commit 必须是目标 base ref 的祖先（`git merge-base --is-ancestor`），不满足直接报错，提示先合并/rebase 到默认分支，不创建 worktree
- [ ] 4.3 新增命名合法性校验说明：`<change-name>` 必须匹配 `^[a-z0-9]+(-[a-z0-9]+)*$`，分支名额外过 `git check-ref-format --branch`，不匹配直接报错
- [ ] 4.4 新增"Switch - 按 change 切换/创建 worktree"执行工作流小节：隔离检测（复用 Add 逻辑，已在 worktree 内时默认不创建，询问后用户明确确认才新建；不确认则输出当前路径/分支后结束）→ 前置校验（4.2/4.3）→ **先判断目标路径是否已是已注册的 worktree**：是则直接定位跳过分支拓扑校验与创建、直接进入 baseline 跳过与命令输出；否则执行分支拓扑校验（4.2b）→ 用 `git worktree list --porcelain` + `git branch --list` 探测目标状态，按矩阵（路径存在非 worktree / 分支未检出 / 分支已被占用）分别处理 → 分支基线从默认分支（`origin/HEAD` 解析，回退 `main`/`master`）最新提交切出，输出实际 base ref → 创建/挂载后跑 baseline 验证 → baseline 失败时默认不打印续接命令，报告失败摘要并询问是否显式继续 → 打印续接命令（绝对路径 + shell 转义，按 4.7 的模板，依 `--auto` 是否传入选择文案；若 baseline 失败且用户选择继续，命令 prompt 需携带失败摘要）
- [ ] 4.5 在"示例"小节补充用法示例，含一个带 `--auto` 的示例、一个"change 未提交"报错示例、一个"提交不在默认分支历史上"报错示例、一个"缺少 tasks.md"报错示例
- [ ] 4.6 在"注意事项"补充：`switch` 只打印命令不自动执行/不自动切会话（`--auto` 不改变这一点，只改变打印文案）；worktree 不带未提交内容，需先提交；change 需已有 tasks.md；新建场景要求 change 已合并到默认分支历史，已注册 worktree 场景不受此限制；孤儿 worktree 需人工清理
- [ ] 4.7 定义续接命令模板两个变体：不带 `--auto` 时 ``cd <绝对路径，shell 转义> && claude "继续实施 change: <change-name>，读取 openspec/changes/<change-name>/tasks.md 按任务执行"``；带 `--auto` 时在 prompt 末尾追加"实施完成后自动依次调用 /ly:review-code --commit-each-round，按其全部终止条件运行（清零/熔断/分歧未决/无法安全修复/验证失败/审查调用失败/达到全局轮数上限），不需要人工确认"
- [ ] 4.8 定义 baseline 结果与创建结果分开报告的输出格式（两行：创建/定位结果；baseline 结果，失败附摘要，且失败时默认不含续接命令）
- [ ] 4.9 在 spec 对应的 Scenario 基础上，确认 worktree.md 文档同时覆盖"路径存在但非注册 worktree"与"分支已存在被占用"两种报错场景（不只在 design.md 出现）

## 5. propose.md：收尾编排重写

- [ ] 5.1 在委托 `Skill({ skill: "opsx:propose", args: "$ARGUMENTS" })` **之前**加入总开关询问："本次要不要走自动化收尾流程（审查循环 + worktree 询问 + 隔离后自动续接实施与审查）？"，只问这一次，后续步骤不重复询问
- [ ] 5.2 加入前后快照比对确定真实 change 名的说明：委托前记录一次 `openspec list --json` 候选集合，委托完成后再查一次，取新增的一条作为 change 名；新增不唯一或无新增时直接询问用户，不猜测
- [ ] 5.3 加入精确暂存提交说明：先检查整个 Git index（`git diff --cached --name-only`），若存在该 change 目录外的已暂存内容则停止并要求用户先处理；确认干净后 `git add -- openspec/changes/<change-name>/`，再 commit，提交信息形如 `propose: <change-name>`；提交后用 `git show --name-only --format=` 校验实际文件集合严格属于该目录；无内容可提交、提交失败或范围超出，则停止后续自动化并报告原因——此步骤无论总开关选是否都执行
- [ ] 5.4 加入总开关分支说明：选"否"时 commit 后直接结束，不调用 `/ly:review-plan`，不询问 worktree；选"是"时才继续 5.5-5.7
- [ ] 5.5 加入自动调用 `/ly:review-plan <change-name> --commit-each-round` 的说明，明确其走第 3 节新增的审查-修复循环，且逐轮提交由 review-plan 自身完成，propose 不拦截中间轮次状态
- [ ] 5.6 加入询问 worktree 的说明：**仅当审查循环终止原因为"Critical 清零"时**才询问是否切换隔离 worktree；其余全部终止原因（熔断、分歧未决、无法安全修复、验证失败、审查调用失败、达到全局轮数上限）都不询问，直接输出对应终止报告
- [ ] 5.7 加入调用 `/ly:worktree switch <change-name> --auto` 的说明（用户选"是"时，必须带 `--auto`，因为总开关已确认要端到端自动化）；选"否"时说明流程直接结束，change 留在当前工作区

## 6. apply.md：追加通用提示

- [ ] 6.1 在委托 `opsx:apply` 完成后的输出里追加一句**不含具体 change 名**的通用提示——"如需隔离环境可用 `/ly:worktree switch <change-name>` 或先 `/ly:worktree list` 查看"，不改变委托逻辑本身，不查询真实 change 名（与 propose.md 的编排方式不同，是范围取舍，不是原则约束，见 design.md Decision 21 的范围声明）

## 7. 文档同步

- [ ] 7.1 更新根 `CLAUDE.md` 变更记录，补充本次新增的 `/ly:worktree switch [--auto]` 能力、`/ly:review-code`/`/ly:review-plan` 的审查-修复循环（含分歧未决、审查失败兜底、全局轮数上限、`--commit-each-round`）、`/ly:propose` 的总开关 + 收尾编排
- [ ] 7.2 删除根 `CLAUDE.md`"关键设计决策"第 1 条"委托而非重新封装"的原文表述（该原则本次废止，见 design.md Decision 20），改为客观描述现状：`propose.md` 已包含总开关/commit/审查/worktree 编排逻辑，`apply.md`/`archive.md`/`explore.md` 目前仍是薄壳但不再受任何原则约束，后续可按需增加编排

## 8. 验证

- [ ] 8.1 review-code：无 Critical 场景，确认行为与改动前完全一致，不进入循环
- [ ] 8.2 review-code：一轮修复后 Critical 清零场景，确认循环正常结束并生成正确报告
- [ ] 8.3 review-code：熔断场景（同文件+同类别+同锚点连续两轮未解决，且两轮均为"认可"状态），确认立即停止并给出人工介入提示
- [ ] 8.3b review-code/review-plan：分歧未决场景（Claude 判断某 Critical 不认可未修复，下一轮 Codex 仍提出同一问题），确认触发"分歧未决"而非"熔断"，报告并列展示双方论点
- [ ] 8.3c review-code/review-plan：审查调用失败场景（模拟超时/空响应/格式不符），确认停止循环并报告失败信息，不误判为清零
- [ ] 8.3d review-code/review-plan：全局轮数上限场景（模拟连续 20 轮都出现新问题），确认在第 20 轮后停止并报告轮次轨迹
- [ ] 8.4 review-plan：无 Critical 场景，确认输出 Critical/Warning/Info 分级报告（即使全为空）
- [ ] 8.5 review-plan：一轮修复后 Critical 清零场景，确认循环正常结束，修改的是 proposal/design/tasks 而非应用代码，且该轮 `openspec validate` 通过
- [ ] 8.6 review-plan：熔断场景，确认立即停止并给出人工介入提示
- [ ] 8.6b review-plan：`openspec validate` 失败场景，确认作为"修复后验证失败"停止条件
- [ ] 8.7 worktree switch：change 已存在且已提交、提交在默认分支历史上、无关联 worktree 场景，确认创建路径（绝对路径）、分支名、base ref、baseline 验证均符合预期
- [ ] 8.7b worktree switch：change 的提交不在默认分支历史上（位于其他 feature 分支）场景，确认报错拒绝，不创建 worktree
- [ ] 8.8 worktree switch：change 有未提交内容 / change 不存在 / 非法 change 名（含 `../`、空格、引号）三种场景，分别确认对应报错，不产生副作用
- [ ] 8.9 worktree switch：已在 worktree 内（分别测试确认新建与不确认两种分支） / 目标已是注册 worktree / 分支已被其他 worktree 占用 / 在另一 feature worktree 内执行，几种场景分别确认矩阵处理正确
- [ ] 8.9b worktree switch：baseline 失败场景，确认默认不输出续接命令并询问；用户选择继续后确认续接命令携带失败摘要
- [ ] 8.10 worktree switch：带 `--auto` 与不带 `--auto` 两种调用，确认续接命令文案分别符合 4.7 定义的两个模板，`--auto` 版本包含 `--commit-each-round`
- [ ] 8.10b review-code/review-plan：带 `--commit-each-round` 与不带两种调用，确认逐轮提交行为分别符合预期；模拟 commit 本身失败（如 hook 拒绝），确认作为独立终止条件立即停止；模拟某轮无实际改动，确认不产生空 commit
- [ ] 8.11 propose 编排：总开关选"否"场景，确认只 commit 一次即结束（先检查整个 index 无目录外暂存内容，再精确暂存），不调用 review-plan、不询问 worktree
- [ ] 8.11b propose 编排：commit 前 index 中存在该 change 目录之外的已暂存内容，确认停止并要求用户先处理，不执行 commit
- [ ] 8.12 propose 编排：总开关选"是"，完整走一遍"生成方案 → commit → review-plan 循环（含至少一轮修复）→ 清零后询问 → 选是切换 worktree"，确认每个节点都有对应 commit，提交后校验文件集合严格属于该目录，且调用 switch 时带了 `--auto`
- [ ] 8.13 propose 编排：总开关选"是"但 review-plan 循环以熔断/分歧未决/无法安全修复/验证失败/审查调用失败/达到轮数上限**中任一原因**停止，确认都不询问 worktree、不调用 switch，直接输出对应终止报告
- [ ] 8.14 propose 编排：总开关选"是"，审查清零后询问阶段选"否"，确认 change 留在当前工作区，流程正常结束
- [ ] 8.15 propose 编排：change 名快照比对场景——生成过程中模拟并行会话改动其他 change，确认仍能正确识别新增的目标 change；模拟新增条目不唯一/无新增，确认直接询问用户而不是猜测
- [ ] 8.16 worktree switch：change 只有 `proposal.md` 没有 `tasks.md` 场景，确认报错拒绝，提示先完成规划
- [ ] 8.17 worktree switch：目标路径已是注册 worktree、但对应分支尚未合并到默认分支历史场景，确认跳过拓扑校验直接定位（不因为"未合并"而报错）
