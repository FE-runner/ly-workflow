## 1. `/ly:review-code`/`/ly:review-plan` 全局轮数上限 20→5

- [x] 1.1 `templates/commands/review-plan.md`：全局轮数上限文案与判定值改为 5 轮
- [x] 1.2 `templates/commands/review-code.md`：全局轮数上限文案与判定值改为 5 轮（含"20 轮是刻意设得很宽松"这句措辞同步调整为符合 5 轮的表述）
- [x] 1.3 `openspec/specs/ly-review-gates/spec.md`：Requirement"全局轮数上限作为最后兜底"及其两个 Scenario 里的 20 轮同步改为 5 轮
- [x] 1.4 全仓库检索确认没有遗漏的 "20 轮"/"20轮" 引用（历史 CHANGELOG.md 条目除外，那是过去状态的记录，不应改写）
- [ ] 1.5 `openspec/specs/ly-review-gates/spec.md` delta：显式补充"清零优先于轮数上限"的判定顺序说明——若第 N 轮（含第 5 轮）审查结果本身是 Critical 清零，按正常清零处理，不因为恰好命中轮数上限而报告为"达到上限"；轮数上限的检查发生在"本轮审查结果非清零"之后
- [ ] 1.6 `templates/commands/review-plan.md`、`templates/commands/review-code.md`：同步调整轮数上限判定顺序的措辞——把"达到即无条件停止，不管其余信号是否已触发"改为先说明"本轮先判 Critical 是否清零，清零则正常结束；仅在非清零时才检查是否达到 5 轮上限"，避免文字上仍暗示"命中上限就无条件停止，不看这一轮是否已经清零"

## 2. `/ly:propose` 重写：总开关改为全自动/手动两条路径

- [ ] 2.1 步骤 1 询问文案改为"本次收尾走全自动，还是手动逐步确认"，说明两条路径的区别（全自动=自动审查+清零后问一次worktree+隔离后自动续接；手动=每一步都问），且明确 commit 不受该选择影响
- [ ] 2.2 步骤 4（commit，无条件执行）保持不变
- [ ] 2.3 新增步骤 6a"全自动路径"：调用 `/ly:review-plan <change-name>` → 终止原因为清零时问 worktree（是则 `switch --auto`）→ 终止原因为其余任一种时复用循环已产出的终止报告再问 worktree（是则 `switch`，不带 `--auto`）；两种情况下 `switch` 的结果均按"switch 结果统一判定规则"（见 2.7）处理
- [ ] 2.4 新增步骤 6b"手动路径"：commit 后先问是否切 worktree（是则 `switch`（不带 `--auto`）并按统一判定规则处理结果，成功则直接结束）→ 否则问是否要跑 review-plan → 否则结束 → 是则调用 `/ly:review-plan <change-name>` → 终止原因为清零时问 worktree（不带 `--auto`）→ 终止原因为其余任一种时复用循环已产出的终止报告再问 worktree（不带 `--auto`）；`switch` 结果的处理同 2.3
- [ ] 2.5 核对文件内不再残留旧的"总开关=是/否"二元措辞，统一替换为"全自动/手动"
- [ ] 2.6 明确"先输出终止报告"指的是复用 `/ly:review-plan` 循环本身已经产出的终止报告，`/ly:propose` 不重新生成或重复一份，只在其后追加一次 worktree 询问，避免同一次终止出现两份报告文本
- [ ] 2.7 **switch 结果统一判定规则**（propose/apply 共用，实现时抽成一段可复用的说明文字）：以 `switch` 是否最终输出续接命令为唯一判定依据。输出了续接命令即视为目标 worktree 已就位，直接结束；续接提示按四种组合确定，不拆成并列的多条提示——不带 `--auto`/无失败摘要：追加"运行 `/ly:apply` 继续"；不带 `--auto`/有失败摘要：改为"处理完 baseline 失败问题后运行 `/ly:apply` 继续"；带 `--auto`/无失败摘要：改写为"运行 `/ly:apply` 继续实施（自动 commit），完成后自动依次调用 `/ly:review-code`"；带 `--auto`/有失败摘要：两个约束都保留，改写为"处理完 baseline 失败问题后，运行 `/ly:apply` 继续实施（自动 commit）；完成后自动依次调用 `/ly:review-code`"。未输出续接命令的三种情况——（a）分支拓扑校验等前置校验拒绝（含因该 change 目录有未提交改动被拒绝，常见于"验证失败"/"提交失败"终止后）；（b）baseline 失败且用户在 `switch` 内部询问中选择不继续；（c）`switch` 自身"是否仍要新建独立 worktree"内层询问被拒绝创建——均如实转述/报告对应原因并结束，不输出上述续接提示，不自动回退到"继续留在当前工作区实施"

## 3. `/ly:apply` 新增执行前隔离检测与 worktree 询问

- [ ] 3.1 在委托 `opsx:apply` 之前，插入隔离检测步骤：复用 `templates/commands/worktree.md` Add 步骤 1 的判定逻辑（比较 `git rev-parse --git-dir` 与 `--git-common-dir`，并用 `--show-superproject-working-tree` 排除子模块误判）判断"是否在任意 worktree 内"。定义"该 change 的固定目标路径" = `<主仓库上级目录>/.ly/<主仓库目录名>/<change-name>`（`/ly:worktree switch` 的默认路径；主仓库以 `git rev-parse --git-common-dir` 解析出的公共 Git 目录反推，不依赖当前调用所处 worktree 的相对路径，保证从任意 worktree 调用时算出的路径一致；本次不承认 `--local` 项目内路径为受控目标路径，`switch` 也没有定义过 `--local` 用法）。目标 `<change-name>` 的解析按固定优先级：`$ARGUMENTS` 中显式且合法的 change 名 → 当前 worktree 反查出的受控 change（枚举 `openspec/changes/` 下未归档 change，逐一计算其固定目标路径，检查是否等于当前 `git rev-parse --show-toplevel`；恰好一个匹配才采用，零个或多个视为反查失败） → `openspec/changes/` 下唯一未归档的 change → 无法唯一确定则直接询问用户；任一步骤无法唯一确定时不得继续调用 `switch` 或执行 `opsx:apply`
- [ ] 3.2 已在某个 worktree 内 → 若能确定目标 change 名，"匹配"（即"当前 worktree 是否为该 change 的受控目标 worktree"）需同时满足两个条件：（1）当前 worktree 根路径（`git rev-parse --show-toplevel`）严格等于该 change 的固定目标路径（见 3.1 定义）；（2）`git worktree list --porcelain` 中该固定路径下注册的分支名严格等于 `<change-name>`——`/ly:apply` 每次独立读取当前路径与该命令输出完成这两个条件的判定，不依赖、不假设本次会话之前是否调用过 `/ly:worktree switch`（`switch` 自身也会在定位阶段做同款分支校验，见第 4 节，两处校验各自独立执行）。任一条件不满足（含分支名相等但不在固定目标路径下、路径相等但注册分支不对、或 detached HEAD 无法读取分支名），均视为不匹配（不允许"无法判断就默认跳过"，也不允许仅凭"当前路径是某个已注册 worktree 的路径"就判定匹配），询问用户"当前不在该 change 对应的 worktree 中，是否仍在此继续实施，还是先切换到该 change 的 worktree"——选"先切换"时的后续处理与 3.3 的"不在 worktree 内选择切换"完全一致；两个条件都满足时直接跳过询问。**范围边界**：本条只防误操作（正常使用路径下不会误写错分支），不校验目标分支 `HEAD` 是否真的包含该 change 当前的 artifact，不防用户故意手工 reset 分支这类破坏本地 git 状态的操作（见 design.md Decision 11）
- [ ] 3.3 不在 worktree 内（或 3.2 中选择"先切换"）→ 询问是否要先切换隔离 worktree；选"是"→ 调用 `/ly:worktree switch <change-name>`，结果按"switch 结果统一判定规则"（见 2.7）处理：输出续接命令则按 2.7 的四种组合追加对应提示并结束，不执行本次 `opsx:apply`；未输出续接命令的三种情况分别转述/报告对应原因（含 4.2 新增的"目标路径已注册但分支不匹配"这一新的前置校验拒绝场景）；选"否"→ 继续正常实施
- [ ] 3.4 保留现有的实施后自动 commit + 通用 worktree 提示逻辑不变

## 4. `/ly:worktree switch` 定位已注册路径时新增分支校验（本次范围扩大，见 design.md Decision 10）

- [ ] 4.1 `templates/commands/worktree.md` Switch 步骤 1（路径映射）：补充"目标路径以 `git rev-parse --git-common-dir` 反推的主仓库位置为基准计算，不依赖当前调用所处 worktree 的相对路径"这一说明，确保从任意 worktree 调用 `switch` 时算出的路径一致。具体算法：`git rev-parse --git-common-dir` 的输出可能是相对路径（尤其在主工作区本身执行时），需先转换为绝对路径，再取其父目录得到主仓库根；后续与固定目标路径、`--show-toplevel`、`worktree list --porcelain` 输出的路径比较前，均需 canonicalize（解析符号链接、去掉多余的 `..`/`.`）后再比较，避免"从主仓库子目录调用"这类场景下基准计算错误
- [ ] 4.2 `templates/commands/worktree.md` Switch 步骤 3"判断目标路径是否已是已注册的 worktree"分支：命中"是"时，新增校验该路径当前注册的分支名是否严格等于 `<change-name>`；不等于则拒绝执行，报错提示"目标路径已注册但对应分支非 `<change-name>`（当前为 `<实际分支名>`），请手动处理后重试"，不直接定位、不进入步骤 6 输出续接命令；等于才按现有逻辑跳过分支拓扑校验直接定位
- [ ] 4.3 在"示例"一节补一条对应的报错示例，风格与现有"change 提交不在默认分支历史上时报错"等示例一致

## 5. 文档同步

- [ ] 5.1 更新根 `CLAUDE.md`：变更记录新增本次条目，"典型工作流"/命令说明表格如涉及总开关措辞需同步
- [ ] 5.2 更新 `CHANGELOG.md`：新增版本条目，覆盖 propose 全自动/手动路径改造、apply 隔离询问、worktree switch 分支校验、轮数上限 20→5
- [ ] 5.3 更新 `package.json` 版本号（沿用发版规则，本次为行为变化，minor 版本号）
- [ ] 5.4 检查 `templates/CLAUDE.md` 里 `propose.md`/`apply.md`/`worktree.md` 的一句话说明是否需要同步措辞

## 6. 验证

- [ ] 6.1 `openspec validate --specs --strict` 全过
- [ ] 6.2 走查 `/ly:propose` 全自动路径：模拟清零结束（问 worktree，带 `--auto`）与模拟熔断结束（先出终止报告，再问 worktree，不带 `--auto`）两种场景的文案自洽
- [ ] 6.3 走查 `/ly:propose` 手动路径：模拟"提交后选择切 worktree 直接结束"、"提交后选择不切换→不跑审查直接结束"、"不切换→跑审查→清零后问 worktree"、"不切换→跑审查→其余原因终止后问 worktree" 四种场景的文案自洽
- [ ] 6.4 走查 `/ly:apply`：模拟"不在 worktree 内询问"、"已在固定目标路径 worktree 内且注册分支匹配跳过询问"、"已在不匹配的 worktree 内询问是否继续"、"detached HEAD 视为不匹配"、"手工在非固定路径检出同名分支仍视为不匹配"五种场景的文案自洽
- [ ] 6.5 走查 `switch` 前置校验拒绝（分支拓扑失败、"目标路径已注册但分支不匹配"、含"目标 change 目录有未提交改动"这一常见于验证失败/提交失败终止后的场景）时，propose 与 apply 是否都正确转述原始错误并结束，不误报为成功切换
- [ ] 6.6 走查全局轮数上限恰好在第 5 轮清零的场景：确认报告为"清零"而非"达到轮数上限"
- [ ] 6.7 走查 `switch` 内层"是否仍要新建独立 worktree"询问被拒绝创建的场景：确认 propose/apply 如实说明未切换，不输出"运行 `/ly:apply` 继续"这类误导性提示
- [ ] 6.8 走查 `switch` 的 baseline 分支：模拟"baseline 失败且用户选择不继续"（不输出续接提示）与"baseline 失败但用户选择继续"（视为已就位，提示改为"处理完 baseline 失败问题后运行 `/ly:apply` 继续"）两种场景
- [ ] 6.9 走查带 `--auto` 切换成功的续接提示：分别验证"baseline 通过"（一条连贯说明"运行 `/ly:apply` 继续实施（自动 commit），完成后自动依次调用 `/ly:review-code`"）与"baseline 失败但用户选择继续"（"处理完 baseline 失败问题后，运行 `/ly:apply` 继续实施（自动 commit）；完成后自动依次调用 `/ly:review-code`"，两个约束都保留）两种场景，均不是拆成两条并列提示
- [ ] 6.10 走查未指定 change 名时从当前 worktree 反查的场景：反查成功（唯一匹配）直接使用，反查失败（零个或多个匹配）时按优先级继续尝试或询问用户
- [ ] 6.11 走查 `switch` 新增的分支校验：目标路径已注册但分支不是 `<change-name>` 时拒绝执行、不定位、不输出续接命令；分支相等时正常跳过拓扑校验直接定位
- [ ] 6.12 走查从另一个 worktree 内调用 `switch`/`apply` 的场景，以及从主仓库子目录（非根目录）调用的场景：确认目标路径解析结果一致，不因当前所处路径不同而算错（`git rev-parse --git-common-dir` 输出需先转绝对路径再取父目录，所有路径比较前都 canonicalize）
- [ ] 6.13 `openspec archive worktree-review-flow-refinement` 前确认 `git status` 干净或改动已按 change 生命周期规则逐步提交
