## 1. preflight 共享模块

- [ ] 1.1 新增 `src/utils/preflight.ts`：`detectOpenspecCli()`（子进程 `openspec --version`，超时/非零/不存在判定未安装，返回 `{ installed, version? }`）、`detectOpsxSkills()`（`~/.claude/commands/opsx/` 目录存在性，路径常量收口单处）、`checkExternalDeps()` 编排入口（两级检测 + 交互）
- [ ] 1.2 `checkExternalDeps()` 三种缺失态行为：CLI 缺失 → inquirer confirm 询问就地 `npm install -g @fission-ai/openspec@latest`（成功→提示"运行 /ly:init 完成 openspec init"；失败→报告 npm 原始错误并按拒绝口径继续；拒绝→列出依赖 openspec 的 6 个命令清单不可用、说明 Git 工具链不受影响，继续主流程，不重复询问）；CLI 在但技能缺失 → 一次性非阻断提示"完成后运行 /ly:init"；全就绪 → 静默通过零输出；全程 SHALL NOT 抛异常中断安装器主流程

## 2. 入口接入与 doctor/status

- [ ] 2.1 `src/cli-setup.ts`：默认动作、`init`、`menu` 三个 action 回调内（i18n 初始化后、主流程前）调用 `checkExternalDeps()`；确认 `doctor`/`diagnose-mcp`/`update`/`uninstall` 等子命令不触发
- [ ] 2.2 `src/commands/doctor.ts`：`doctor()` 与 `status()` 各新增两项状态展示——openspec CLI（含版本号）、opsx 技能（未初始化时附"运行 /ly:init"引导）；复用 `detectOpenspecCli()`/`detectOpsxSkills()`，非阻断
- [ ] 2.3 `src/i18n/index.ts`：preflight 全部用户可见文案（缺失提示、安装询问、安装成功/失败、拒绝后的不可用清单、技能缺失引导、doctor/status 标签）zh-CN/en 双语补齐，无硬编码文案残留

## 3. 测试与验证

- [ ] 3.1 `src/__tests__/` 新增 preflight 测试：mock 子进程/文件系统，覆盖 CLI 在/不在、技能在/不在、安装成功/失败/拒绝各分支
- [ ] 3.2 手动验证：本机（openspec 已装）跑 `npx tsx src/cli.ts` 入口确认静默通过、`ly doctor`/`ly status` 两项展示正确且判定一致
- [ ] 3.3 `pnpm typecheck && pnpm build && pnpm test` 全绿

## 4. 文档与发版

- [ ] 4.1 版本号三处同步 bump：`package.json` → 1.9.0（minor：新用户可见能力），`codeagent-wrapper/main.go` `version` 与 `src/utils/installer.ts` `EXPECTED_BINARY_VERSION` 同步 1.9.0
- [ ] 4.2 文档同步：根 `CLAUDE.md`（变更记录新条目 + 模块职责提 preflight）、`CHANGELOG.md` 新条目（[1.9.0]）、`README.md`（若有安装前提/依赖描述则补一句"安装器会检测 openspec 依赖"）
- [ ] 4.3 运行 `openspec validate --changes installer-openspec-preflight` 通过
