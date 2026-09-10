## 1. 模板同步：release.md 对齐源 v2.1.0

- [ ] 1.1 重要规则块：三分支同步措辞改为"含 feature 方式 C 直上线、release/hotfix 的 PR merge 或本地直接合并"
- [ ] 1.2 重要规则块：新增主分支名检测规则段（`git remote show origin | grep 'HEAD branch'` + `git branch -r | grep -E 'origin/(master|main)$'` 兜底 + "示例中 master 替换为实际分支名"）
- [ ] 1.3 release 场景步骤 4：push + PR 改为二选一（方式 A 远端 PR 默认 / 方式 B 本地直接合并五步命令）；步骤 5 措辞改"上线合并完成后（无论方式 A 还是 B）"
- [ ] 1.4 hotfix 场景步骤 4：同样二选一（方式 B 文案"适合紧急情况快速上线"）；步骤 5 与"注意"行措辞同步覆盖两种方式
- [ ] 1.5 一致性检查：release.md 其余场景（feature/dev-offline）与规则块内其余条目无源更新遗漏、无措辞残留

## 2. 文档同步

- [ ] 2.1 根 `CLAUDE.md` 命令表 `/ly:release` 行：补"上线合并二选一（远端 PR / 本地直接合并）+ 主分支名检测（master/main）"
- [ ] 2.2 `README.md` 命令表 `/ly:release` 行：同步补关键词

## 3. 验证

- [ ] 3.1 运行 `openspec validate --changes release-gitflow-v21-sync` 确认 delta spec 结构合法
- [ ] 3.2 逐段对照源 SKILL.md（v2.1.0）与 release.md，确认三处改动逐字对齐、上下文差异（场景编号/分支名）处理正确
