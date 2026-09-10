## 1. 模板改造：propose.md 步骤 1 三选一

- [ ] 1.1 重写 `templates/commands/propose.md` 步骤 1 的询问形态：二选一改为三选一（隔离 worktree / 本项目切新分支 / 留在当前分支），"已在 worktree 内则跳过询问"检测逻辑与文字保持不变，并明确"已在开发分支（非默认分支）上时照常询问、不跳过"
- [ ] 1.2 worktree 子分支内容原样保留（脏改动提示"将留在原 worktree"、分支名询问、`git worktree add`、env 复制、baseline、cd 续跑、兜底命令），仅将其触发条件从"是"改为三选中的"隔离 worktree"
- [ ] 1.3 新增"本项目切新分支"子分支：开发分支名询问（复用 worktree 路径规则，可含 `/`）→ 脏改动三选处置（WIP commit / Stash / 原样保留，文案如实写明各自后果；留在当前分支路径复用同一处置块且 Stash 不自动 pop）→ `git checkout -b <开发分支名>` → 无 baseline / 无 cd / 无兜底命令的说明 → 进入步骤 2
- [ ] 1.4 新增"留在当前分支"子分支：不创建 worktree、不切分支，porcelain 非空时触发脏改动三选处置，进入步骤 2
- [ ] 1.5 补充失败分支文字：`checkout -b` 因分支名已存在/非法失败时如实报错停止编排转人工（不自动改名、不自动 stash）；处置动作（commit/stash）失败时同样报错停止
- [ ] 1.6 全文一致性检查：确认 propose.md 其余步骤（自审、commit、流水线、手动路径）对"留在当前工作区"的旧表述已同步为三选一语义，无残留二选一措辞

## 2. 文档同步

- [ ] 2.1 更新根 `CLAUDE.md` 的 `/ly:propose` 命令表行：描述补三选一隔离方式（worktree / 本项目切新分支 / 留在当前分支）与脏改动处置
- [ ] 2.2 更新 `README.md` 中 `/ly:propose` 的描述（若含隔离询问相关文字），与三选一语义对齐

## 3. 验证

- [ ] 3.1 运行 `openspec validate --changes propose-isolation-three-option` 确认 delta spec 结构合法
- [ ] 3.2 通读改造后的 `templates/commands/propose.md`，核对 delta spec 全部新 Scenario 在模板文字中均有对应执行依据（逐 Scenario 对照）
