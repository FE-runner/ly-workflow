# Design: implementer-default-claude

## Context

v1.7.0 起实施后端由 `routing.implementer` 控制，合法值白名单 `VALID_ROUTING_BACKENDS = ['codex', 'hermes', 'openclaw']`（`src/utils/config.ts:15`）同时约束 reviewer 与 implementer 两处；默认值散落在四处硬编码：`src/commands/init.ts:231`（`'hermes'`）、`src/commands/menu.ts:520`（fallback `'hermes'`）、`src/utils/installer-template.ts:80`（fallback `'hermes'`）、`src/utils/config.ts:87-90` 的 `createDefaultRouting()`（公共导出，经 `src/index.ts:11` 对外暴露，返回 `implementer: 'hermes'`，运行时 init 写配置路径不经过它，但属公共 API 语义）；另有 `src/utils/__tests__/config.test.ts:10-13` 对该默认值的显式断言。`apply.md` 模板通过安装期 `{{IMPLEMENTER_MODEL}}` 字符串替换（`injectConfigVariables`）渲染出 wrapper 委托命令，`ROLE_FILE: prompts/{{IMPLEMENTER_MODEL}}/builder.md`。现有值校验调用点 `src/commands/init.ts:247`/`src/commands/init.ts:317`/`src/commands/menu.ts:518` 均走 `isValidRoutingBackend`。动机见 proposal.md 的 Why。

## Goals / Non-Goals

**Goals:**

- `routing.implementer` 四选一（`claude` 默认 / `codex` / `hermes` / `openclaw`），reviewer 白名单不动
- implementer=claude 时 apply 渲染为"编排者本人实施"版本，外部委托机制整体不出现
- 存量配置零影响；`update` 静默补齐值改为 `claude`

**Non-Goals:**

- 不改 `routing.reviewer` 任何行为（仍不收 `claude`）
- 不改 codeagent-wrapper Go 代码、review-plan/review-code 审查循环、propose worktree 编排
- 不删除外部后端路径（codex/hermes/openclaw 的 wrapper 委托机制原样保留）
- 不做存量 `claude`-implementer 配置之外的任何配置迁移

## Decisions

### D1: 白名单拆分——reviewer / implementer 各自独立

`config.ts` 拆为两组：`VALID_ROUTING_BACKENDS`（reviewer 用，保持 `['codex','hermes','openclaw']` 不动）与新增 `VALID_IMPLEMENTER_BACKENDS = ['claude','codex','hermes','openclaw']`；新增 `isValidImplementerBackend()`，`isValidRoutingBackend()` 保留原语义继续服务 reviewer。类型层面新增 `ImplementerBackend`，`ModelRouting.implementer` 收窄为 `ImplementerBackend`（`reviewer` 仍为 `ModelType` 收窄后的三值）。

**备选**：单一白名单 + 调用处按字段过滤——否决，两处约束未来还会继续分化（本次就是分化点），双白名单让约束显式化。白名单拆分的同时，现有校验调用点随语义迁移：`src/commands/init.ts:247`（skipPrompt 路径存量校验）、`src/commands/init.ts:317`（交互路径存量校验）、`src/commands/menu.ts:518`（`currentImplementer` 读取）从 `isValidRoutingBackend` 切换为 `isValidImplementerBackend`——否则合法的 `claude` 存量值会被旧校验判非法、交互 re-run 不预选、menu 显示 fallback 值。

### D2: apply.md 用单模板 + 条件块标记，而非两份模板文件

`apply.md` 内用安装期条件标记区分两路径：

```
<!-- LY:IF:IMPLEMENTER_EXTERNAL -->
（wrapper 调用、OVERALL 解析、FAIL 处理等现有内容）
<!-- LY:ENDIF -->
<!-- LY:IF:IMPLEMENTER_CLAUDE -->
（本人实施步骤：读 tasks.md → 逐任务实施+验证+勾 checkbox → git add + commit）
<!-- LY:ENDIF -->
```

`injectConfigVariables()` 在替换 `{{IMPLEMENTER_MODEL}}` 的同时按 implementer 值删除不命中的条件块（与现有 `mcpProvider === 'skip'` 的多段替换兜底同一机制风格）。渲染结果仍是单路径命令文件，运行时的 Claude 不做任何分支判断。

**备选**：`apply.md` + `apply-claude.md` 两份独立模板，installer 按 implementer 选其一——否决：change 名解析、commit 步骤、报告结构在两份文件中重复，后续改提交逻辑容易只改一边造成漂移；条件块让共享部分天然同步。

### D3: 默认值三处同改 + 菜单"recommended"标记随默认迁移

`init.ts:231`、`menu.ts:520`、`installer-template.ts:80` 的 `'hermes'` fallback 全部改为 `'claude'`；menu 与 init 向导中 implementer 列表的 `(recommended)` 标记从 Hermes 移到 Claude，新增 Claude 选项置顶。reviewer 列表不动。

### D4: 独立性提示逻辑不动

`selectedImplementer === selectedReviewer` 的提示判断保持原样——reviewer 白名单不含 `claude`，implementer=claude 时条件天然为假，无需特判。基线 spec 的「routing.implementer 与 routing.reviewer 相同时给出独立性提示」Requirement 本身保持不动（无任何 Requirement 变化，故不出现在 delta 中），并非遗漏。

### D5: update 非交互补齐值改 `claude`，存量不改写

`init.ts` 非交互路径（`--skip-prompt`）检测到 `routing.implementer` 缺失时静默写 `'claude'`；已有合法值（含 v1.7.0 时代写入的 `hermes`）一律尊重，不改写——与"存量 codex/hermes/openclaw 行为完全不变"的 proposal 承诺一致。

## Risks / Trade-offs

- **[主会话上下文膨胀]** claude 模式实施全过程吃进当前会话，中型 change 可能触发 compaction → 持久状态全在磁盘（tasks.md 勾选、代码、commit），compaction 后凭 tasks.md 可续接；review-code 审的是 diff 不是对话，审查质量不受影响
- **[失去外部实施视角多样性]** 默认 claude 后实施与修复同源，reviewer 审"同类模型写的代码"可能挑错效率下降 → 外部后端保留为四选一选项，介意者手动切 codex/hermes；且 review-plan（方案阶段）审查不受影响
- **[条件块标记渲染遗漏]** 标记拼写错误或嵌套不闭合会导致两个路径的内容同时残留在安装产物中 → 渲染函数对未闭合/未命中标记做显式报错而非静默保留；installer 测试覆盖 claude 与非 claude 两种渲染快照
- **[模板标记与 MCP skip 替换机制并存]** apply.md 同时含 `{{MCP_SEARCH_TOOL}}` 与条件块，替换顺序需保证条件块删除先于/独立于 MCP 替换 → 条件块处理放在 `injectConfigVariables` 内 implementer 替换处统一完成，与 MCP 逻辑互不重叠（标记文本不包含 MCP 占位符）

## Migration Plan

无配置迁移：默认值只影响"缺失时补齐"与"新装"两条路径，存量 config.toml 一字不动。发布后用户重新 `npx ly-workflow update` 即可让 apply.md 按新默认重渲染（已配置 hermes 的用户如想切换需手动改配置或经 menu）。

## Open Questions

（无）
