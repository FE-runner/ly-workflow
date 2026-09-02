## 1. 命令模板

- [ ] 1.1 创建 `templates/commands/release.md`：GitFlow 四场景命令（feature/release/hotfix/dev-offline），含 SemVer 自动推导规则
- [ ] 1.2 创建 `templates/commands/changelog.md`：Keep a Changelog 格式生成命令（Added/Fixed/Changed 分组）
- [ ] 1.3 创建 `templates/commands/publish.md`：npm 发布四场景命令（bmc/GitHub/npmjs/CI）

## 2. 命令注册

- [ ] 2.1 在 `src/utils/installer-data.ts` 的 `CORE_CONFIGS` 中添加 3 条 `cmd()` 注册（changelog/publish/release，category: `release`，order 40-42）

## 3. 文档同步

- [ ] 3.1 更新根目录 `CLAUDE.md`：变更记录 + 命令表 11→14
- [ ] 3.2 更新 `templates/CLAUDE.md`：命令数 11→14，补 3 条说明行

## 4. 验证

- [ ] 4.1 `pnpm typecheck` 通过
- [ ] 4.2 `pnpm build` 成功
- [ ] 4.3 `pnpm test` 全部通过