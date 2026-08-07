# codeagent-wrapper (Go CLI Wrapper)

> [根目录](../CLAUDE.md) > **codeagent-wrapper**

**Last Updated**: 2026-08-07
**Binary Version**: v6.0.0

---

## 模块职责

Go 编写的跨平台 CLI 包装器，统一 Codex CLI / Claude Code 两种后端的调用接口。`/ly:review-plan`、`/ly:review-code` 通过它调用 Codex 做审查。

---

## 调用语法

```bash
codeagent-wrapper --backend <codex|claude> "任务文本" [工作目录]
codeagent-wrapper --backend <codex|claude> - [工作目录] <<'EOF'
任务内容
EOF
codeagent-wrapper resume <session_id> "任务文本" [工作目录]
codeagent-wrapper --parallel < tasks.txt
```

## Backend 抽象层（`backend.go`）

```go
type Backend interface {
    Name()     string
    Command()  string
    BuildArgs(cfg *Config, targetArg string) []string
}
```

已注册后端（`config.go`）：

| 后端 | 命令 | 参数构建函数 |
|------|------|------|
| `codex` | `codex` | `buildCodexArgs()` |
| `claude` | `claude` | `buildClaudeArgs()` |

> v6.0.0 起不再支持 `gemini`/`grok`/`antigravity` 后端（随项目改名一并砍除多模型协作层）。

## 源码结构

| 文件 | 职责 |
|------|------|
| `main.go` | CLI 入口、参数路由 |
| `config.go` | `Config`/`TaskSpec` 结构体、`parseArgs()` |
| `backend.go` | `Backend` 接口 + Codex/Claude 实现 |
| `executor.go` | 核心执行引擎，并发调度、进程终止 |
| `parser.go` | Codex/Claude JSON 流解析 |
| `logger.go` | 异步日志 |
| `server.go` | SSE Web UI（进度实时预览） |

## 版本同步规则

修改任何 `.go` 文件后必须同步 bump：

| 文件 | 位置 |
|------|------|
| `codeagent-wrapper/main.go` | `version = "6.0.0"` |
| `src/utils/installer.ts` | `EXPECTED_BINARY_VERSION = '6.0.0'` |

两边不一致会导致 `update` 不触发 binary 重新下载。

## 构建

```bash
cd codeagent-wrapper
go build -o codeagent-wrapper .
go test ./...          # 两个 timing-sensitive 测试用 -short 跳过
go test -short ./...   # CI 实际跑法
```
