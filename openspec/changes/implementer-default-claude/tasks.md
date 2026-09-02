## 1. 白名单与类型拆分（design D1）

- [ ] 1.1 `src/utils/config.ts`：新增 `VALID_IMPLEMENTER_BACKENDS = ['claude','codex','hermes','openclaw']`、`ImplementerBackend` 类型与 `isValidImplementerBackend()`；`VALID_ROUTING_BACKENDS` / `isValidRoutingBackend` 语义不变并更新注释（implementer 已独立白名单）
- [ ] 1.2 `src/types/index.ts`：`ModelRouting.implementer` 类型收窄为 `ImplementerBackend`（reviewer 保持三值），确认 `LyConfig` 相关类型随之成立

## 2. 默认值与向导（design D3/D5）

- [ ] 2.1 `src/commands/init.ts`：交互向导"选择实施后端"步骤改为四选一（Claude `(recommended)` 置顶/Codex/Hermes/OpenClaw），默认值 `'hermes'` → `'claude'`；非交互（`--skip-prompt`）路径缺失补齐值 `'hermes'` → `'claude'`；`options.implementer` 校验与 `init.ts:247`/`init.ts:317` 的存量值校验一并切换为 `isValidImplementerBackend`
- [ ] 2.2 `src/commands/menu.ts`：`configModelRouting()` 的 implementer fallback `'hermes'` → `'claude'`，`menu.ts:518` 校验切换为 `isValidImplementerBackend`，选项列表同步四选一并迁移 `(recommended)` 标记；reviewer 侧不动
- [ ] 2.3 `src/utils/installer-template.ts`：`injectConfigVariables` 的 implementer fallback `'hermes'` → `'claude'`
- [ ] 2.4 `src/i18n/index.ts`：补 implementer Claude 选项文案（含 recommended 场景），中英双语
- [ ] 2.5 `src/utils/config.ts`：`createDefaultRouting()` 的 `implementer: 'hermes'` → `'claude'`（公共导出 API 默认值，design Context 第四处）

## 3. apply.md 条件块渲染（design D2）

- [ ] 3.1 `src/utils/installer-template.ts`：`injectConfigVariables` 实现条件块标记处理（`<!-- LY:IF:IMPLEMENTER_EXTERNAL -->` / `<!-- LY:IF:IMPLEMENTER_CLAUDE -->` / `<!-- LY:ENDIF -->`），按 implementer 值删除不命中块；未闭合或未知标记显式报错不静默保留
- [ ] 3.2 `templates/commands/apply.md`：现有 wrapper 委托内容包入 `IMPLEMENTER_EXTERNAL` 条件块；新增 `IMPLEMENTER_CLAUDE` 块（读 tasks.md → 逐任务实施+验证+勾 checkbox → git add + commit `apply: <change-name>` → 报告；无 wrapper 调用、无 OVERALL 解析、无委托失败分支）；共享部分（change 名解析、commit 步骤、失败时报告任务清单）留在条件块外——现有文本中夹带委托语义的措辞同步拆进 `IMPLEMENTER_EXTERNAL` 块（步骤 2"写在步骤 3 的命令里"的快照说明、步骤 5"Implementer agent 报告 PASS 但无产出"的绑定），避免共享部分残留外部调度用语

## 4. 测试

- [ ] 4.1 `src/utils/__tests__/config.test.ts`：`isValidImplementerBackend` 白名单断言（claude 合法/reviewer 白名单仍拒 claude）、非法值拒绝
- [ ] 4.2 `src/utils/__tests__/installer.test.ts`：implementer=claude 渲染快照（apply.md 仅含本人实施块、无 wrapper 命令）与 implementer=codex/hermes/openclaw 渲染快照（仅含委托块）；条件块未闭合显式报错用例
- [ ] 4.3 `src/utils/__tests__/config.test.ts` 与 `src/commands` 相关既有测试中 implementer 默认值断言同步更新（hermes → claude，含 `createDefaultRouting()` 返回值断言）

## 5. 验证与文档收尾

- [ ] 5.1 `pnpm typecheck && pnpm build && pnpm test` 全绿
- [ ] 5.2 更新 `CLAUDE.md`（决策 5、`/ly:apply` 命令描述、命令表）、`CHANGELOG.md` 新条目
