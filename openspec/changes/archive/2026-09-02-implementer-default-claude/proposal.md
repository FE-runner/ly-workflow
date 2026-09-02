# Proposal: implementer-default-claude

## Why

v1.7.0 将 `/ly:apply` 的实施步骤强制委托给外部 agent（`routing.implementer` 必选，默认 `hermes`），实测外部 agent 从零 bootstrap 读方案/读代码库、单次串行跑完所有任务，**实施速度明显慢于编排者本人**。实施环节对速度敏感，而审查环节才对独立性敏感——"实施要快、审查要独立"的分工下，实施默认交给 Claude 本人（编排者，带着 propose 阶段全部上下文直接开干），外部模型只保留为审查关卡与可选实施后端，是更合理的默认。

## What Changes

- **`routing.implementer` 合法值扩为四选一**：`claude`（新默认）/`codex`/`hermes`/`openclaw`——reviewer 白名单不变（仍不收 `claude`），`isValidRoutingBackend` 拆分为 reviewer / implementer 双白名单
- **init 向导**："选择实施后端"步骤默认值 `hermes` → `claude`，四选一；选 `claude` 时与 reviewer 相同性提示不触发（reviewer 不可能是 claude，逻辑自然短路）
- **update 非交互路径**：检测到 `routing.implementer` 缺失时静默补齐 `claude`（原 `hermes`）；存量配置一律不动
- **`/ly:apply` 模板新增 claude 分支**：`{{IMPLEMENTER_MODEL}}=claude` 时安装期渲染"本人实施"单路径版本——Claude 当前会话直接读 tasks.md 逐任务实施+验证+勾 checkbox → commit，不再有 wrapper 调用、OVERALL: PASS/FAIL 解析、"FAIL 不重试不切回 Claude"、"半成品转人工"等外部调度机制；非 claude 值仍渲染现有 wrapper 委托路径
- **v1.7.0 决策 5 的心智模型更新**：Claude 是默认实施者 + 循环 Critical 亲自修复者；外部 implementer 后端降级为进阶选项（想保持实施视角多样性/隔离性的用户手动选择）
- 非 BREAKING：`routing.implementer` 配置项继续存在且必选，存量配置（codex/hermes/openclaw）行为完全不变

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `optional-implementer-agent`: 实施后端合法值扩为四选一并新增默认值 `claude`（编排者本人实施）；新增"claude 模式下 apply 由当前会话 Claude 亲自实施"的需求；非 claude 后端的委托/判定/失败处理需求保持不变，仅适用范围收窄为"implementer 非 claude 时"

## Impact

- **代码**：`src/utils/config.ts`（白名单拆分、`createDefaultRouting()` 默认值）、`src/types/index.ts`（`ModelRouting.implementer` 类型收窄）、`src/commands/init.ts`（默认值、向导选项、update 补齐值）、`src/commands/menu.ts`（implementer 编辑入口补 claude 选项，如存在同类枚举）、`src/i18n/index.ts`（新增选项文案）
- **模板**：`templates/commands/apply.md`（claude 分支渲染逻辑）、渲染器（`src/utils/installer-template.ts` 或 `installer.ts` 中 `{{IMPLEMENTER_MODEL}}` 的分支处理）
- **测试**：`src/utils/__tests__/config.test.ts`、`src/utils/__tests__/installer.test.ts` 中 implementer 白名单/默认值/渲染断言
- **文档**：`CLAUDE.md`（决策 5、命令表）、`CHANGELOG.md`
- **不受影响**：`routing.reviewer` 全部逻辑、codeagent-wrapper Go 代码、review-plan/review-code 审查循环、worktree 编排
