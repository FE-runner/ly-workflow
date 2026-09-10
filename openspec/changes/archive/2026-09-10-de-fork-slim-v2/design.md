# de-fork-slim-v2 设计

## Context

项目当前为 TS CLI（installer/init/update/menu/doctor，~10k 行含测试）+ Go 二进制 wrapper（codeagent-wrapper，非测试 ~4900 行）双语言结构；`templates/` 携带大量上游遗产（domains/output-styles/codex mode/hooks/MCP 安装目标）。Go wrapper 实际在用的只有单任务调用路径（四 backend 参数构造、stdin prompt、流式输出、OVERALL+SESSION_ID 解析、resume、超时 kill），并发调度/拓扑排序/SSE server/logger 均为死代码。命令模板（`templates/commands/*.md`）以 `~/.claude/bin/codeagent-wrapper` 绝对路径调用 wrapper。已有测试：vitest（src 侧）+ Go test（wrapper 侧，随 Go 删除）。

## Goals / Non-Goals

**Goals:**
- 项目收敛为纯 TS：`src/` + `templates/`（瘦身后）+ 新 `src/wrapper/`
- wrapper 以单文件 JS 随 npm 分发，安装到 `~/.claude/bin/ly-wrapper`，调用契约与原 Go 版单任务路径等价
- 用户机器上历史安装的遗产产物被 update/uninstall 主动回收
- 删除 Go 分发链（GitHub Release 下载、版本门禁、build-binaries workflow）

**Non-Goals:**
- 不改变 14 个命令的行为语义（审查-修复循环、propose 编排、apply 委托规则全部不动）
- 不迁移/不兼容 `.ly/tasks` 旧任务系统（hook 服务的死系统，直接退役）
- 不处理老用户的配置迁移（自用项目，无升级兼容负担）
- 不重构 installer 的核心架构（init/update/menu/doctor 骨架保留，只删功能面）

## Decisions

### D-A: wrapper 重写为 TS 独立脚本，而非内联进 CLI 或直接裸调 CLI

**选择**：`src/wrapper/` 独立 entry（build.config.ts 增加 entry），unbuild 产出 `dist/ly-wrapper.js`（顶部注入 node shebang），安装时复制到 `~/.claude/bin/ly-wrapper` 并 `chmod +x`。

**理由**：
- 相比"审查命令直接裸调 codex/hermes CLI"：SESSION_ID 提取、resume 拼参、输出解析、超时 kill 是稳定性逻辑，塞进 markdown 模板会退化为各命令重复的自然语言指令（v1.5.0 实际踩过的坑）——保留独立进程作为稳定 seam
- 相比"内联进 CLI 主程序"：wrapper 需要被子进程语义调用（独立超时 kill、stdout 纯净输出供命令解析）；CLI 主程序是交互式工具，两者生命周期不同。独立 entry 成本极低（同一个 unbuild）
- node 可用性前提：Claude Code 本身基于 node 运行，目标用户机器必然有 node，无需打包成单二进制

**备选否决**：保留 Go 只删死代码（拒绝——用户明确要求全 TS）；esbuild 单文件打包（unbuild 已在用，不引入新工具链）。

### D-B: wrapper 实现范围 = 原 Go 版单任务路径的等价移植

保留：`Backend` 参数构造（codex/claude/hermes/openclaw 四个，含 hermes `-z` 任务文本提升为 argv、openclaw `--json` blob 提取）、stdin 任务读取、流式 stdout 转发、`--progress` 进度语义、`--lite` 标志透传、OVERALL/SESSION_ID 解析（含纯文本兜底、未知 JSON 事件不误收）、resume 模式（`resume <session_id>` 子形态）、超时 kill（进程树）、非零退出转发、后端缺失报错。

抛弃：并发任务调度（executor.go）、拓扑排序、SSE web server（server.go）、任务 logger（logger.go）、Windows 控制台特判（wrapper 在 Claude 会话的 Bash 工具内运行，无交互控制台需求）、`wrapper_name.go` 的自改名机制（安装产物固定为 `ly-wrapper`）。

超时默认值与 CLI 参数面（`--timeout` 等）对齐原 Go 版单任务路径的实际默认，不新增配置面。

### D-C: 遗产清理挂在 update/uninstall 的既有清理环节，按"存在才清"执行

**选择**：`src/utils/legacy-cleanup.ts` 新模块，导出逐项清理函数清单；update 与 uninstall 各自在既有清理步骤后调用。每项清理独立 try/catch，失败记录进汇总不阻断。

**理由**：
- settings.json 的 hook 清理按"命令字段包含 `~/.claude/hooks/ly/` 路径"识别，只删指向已退役 hook 的条目——不碰其他工具的 hook（对应 `upstream-legacy-cleanup` 的不误删需求）
- MCP 注册项清理按"由本工具注册的 server 名/来源标识"识别（`~/.claude.json` mcpServers 及其同步副本），其他来源的 MCP 注册不碰；`~/.claude.json` 与 settings.json 同样走原子写
- 历史分类产物清理按已知清单（`~/.claude/skills/ly/` 下 impeccable/tools/orchestration/scrapling/SKILL.md/run_skill.js）+ `~/.claude/commands/ly/` 生成器指纹识别，不误删用户自定义同名文件（承接 `cli-skill-category-lifecycle` 退役后的 Migration 承诺）
- `~/.codex/` 清理只删 LY 管理区块（`<!-- LY:START -->...<!-- LY:END -->`）与明确由 ly-workflow 安装的文件（hooks/ly-workflow.py、agents/ly-*.toml、hooks.json、`.ly-version` 标记文件），config.toml 只剥 LY 管理区块不删整个文件
- 旧二进制 `~/.claude/bin/codeagent-wrapper` 直接删除（本安装器的生成物，无指纹歧义）

**备选否决**：要求用户手动清理（拒绝——cleanup 是本 change 的验收项之一）；在 init 向导加询问（拒绝——多余交互，清理是纯回收动作）。

### D-D: 删除策略 = 目录整体删除 + 引用面同步清零，不保留任何 shim

`templates/{skills,output-styles,codex,hooks}/`、`codeagent-wrapper/`、MCP 四个 src 文件、migration.ts、社区文档整体删除；`templates/rules/` 仅删 `ly-skill-routing.md`（domains 路由表），`ly-skills.md` 去 orchestration 引用后保留，`ly-codegraph.md` 原样保留。所有引用点（installer 的分类常量/skill-registry、menu 的入口项、doctor 的体检项、package.json files 白名单、workflows、根 CLAUDE.md/README）在同一次实施中清零，不留 shim、不留"暂时停用"状态——自用项目无需灰度。

### D-E: 发布工作流收敛

`.github/workflows/build-binaries.yml` 删除；`release.yml` 移除 Go 构建段，保留 npm publish（`push: tags: v*` 触发不变，见根 CLAUDE.md 发版规则第 6 条）。package.json `files` 白名单更新：移除 `templates/output-styles/`、`templates/skills/`，确认 `dist/`（含 ly-wrapper.js）在列。

### D-F: Go 测试资产随 Go 删除，wrapper 行为以 spec 场景为准绳

Go 侧 8500 行测试删除，不机械翻译成 TS 测试。TS 侧为 wrapper 新增针对 spec 场景的 vitest 测试：四 backend 参数构造、stdin 读取、SESSION_ID/OVERALL 解析（含纯文本兜底与未知 JSON 事件）、resume 拼参、后端缺失报错；进程类场景（流式转发/超时 kill）用 fake child 进程测试。src 侧既有测试随被删功能同步删除。

## Risks / Trade-offs

- [wrapper 重写引入与 Go 版行为偏差（参数拼装细节、解析边界）导致审查循环突然失效] → 移植前先记录 Go 版四个 backend 的实际 CLI 参数与解析规则作为对照基线；D-F 的测试逐条对齐 spec 场景；上线后第一次 review-plan/review-code 实跑验证
- [hermes/openclaw backend 无法在实施时实机验证（未安装）] → 这两个 backend 的参数构造以 Go 版源码为准移植并做单元测试；spec 不变（`optional-review-agent` 的缺失报错语义兜底），标注为已知验证盲区
- [settings.json 清理误伤用户手写配置] → 仅按 hook 命令字段中的 ly hook 路径匹配，写入前对 settings.json 做原子写（先写临时文件再 rename）；`upstream-legacy-cleanup` 的不误删需求约束
- [命令模板中的 wrapper 路径改名遗漏] → 实施时全局 grep `codeagent-wrapper` 清零作为任务验收项（模板 + src + 文档 + workflows 四处）
- [dist/ly-wrapper.js 未随 npm 包发布（files 白名单遗漏）] → 发布前 `npm pack --dry-run` 检查任务覆盖

## Migration Plan

单分支一次实施，无运行时数据迁移。用户侧收尾顺序：发版后运行 `npx ly-workflow update` → legacy-cleanup 回收历史产物 → 下一次 review-plan/review-code 自然使用 ly-wrapper。回滚 = 整体 revert 分支（无 schema/数据变更，可安全回退）。

## Open Questions

无——探索阶段已收敛全部边界决策（D1-D9 账本见 proposal）。
