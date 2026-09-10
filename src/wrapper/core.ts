/**
 * ly-wrapper core — TS 移植自 Go 版 codeagent-wrapper 的单任务路径。
 *
 * 对照基线（Go 版行为，实施前从 codeagent-wrapper/ 源码提取）：
 * - CLI: [--backend <v>|--backend=<v>] [--progress] [--lite|-L(关闭 Web UI)] [--skip-permissions(接受不生效)]
 *        [--skip-permissions(接受不生效)] (resume <session_id>)? (<task|->)? (<workdir>)?
 * - `-` 表示任务从 stdin 读入；ROLE_FILE: <path> 行原地替换为文件内容（~ 展开，读取失败保留原行）
 * - stdin 模式判定：显式 `-` 或任务含特殊字符(\n \ " ' ` $)或长度>800
 * - codex: e [--dangerously-bypass-approvals-and-sandbox(除非 CODEX_REQUIRE_APPROVAL)]
 *          [--skip-git-repo-check(除非 CODEX_DISABLE_SKIP_GIT_CHECK)]
 *          新任务: -C <workdir> --json <target>；resume: --json resume <sid> <target>
 * - claude: -p --dangerously-skip-permissions --setting-sources "" [-r <sid>] --output-format stream-json --verbose <target>
 * - hermes: [-r <sid>] -z <task 原文>（stdin 提升为 argv）
 * - openclaw: agent --local --agent main [--session-id <sid>] -m <task 原文> --json
 * - 解析优先级: claude(result) > codex(item.completed/agent_message) > 纯文本兜底
 * - 空 JSON 事件（{} / {"item":null}）不误收为 message
 * - openclaw 多行 JSON blob: payloads[].text 拼接 + meta.agentMeta.sessionId
 * - 超时: CODEX_TIMEOUT（>10000 视为毫秒），默认 7200s，超时 kill 进程树退出码 124
 * - 成功输出: <message>\n---\nSESSION_ID: <id>\n（有 session 时）
 * - 有意裁剪：管道输入自动读入（readPipedTask）未移植——命令模板均用显式 `-` 调用
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const DEFAULT_TIMEOUT_SECONDS = 7200
export const TIMEOUT_EXIT_CODE = 124

// ─── CLI 解析 ───────────────────────────────────────────

export interface WrapperConfig {
  backend: string
  mode: 'new' | 'resume'
  sessionId: string
  task: string
  explicitStdin: boolean
  workDir: string
  progress: boolean
  lite?: boolean
}

export interface ParseArgsResult {
  config?: WrapperConfig
  error?: string
  version?: boolean
  help?: boolean
}

export function parseArgs(argv: string[]): ParseArgsResult {
  if (argv[0] === '--version' || argv[0] === '-v') return { version: true }
  if (argv[0] === '--help' || argv[0] === '-h') return { help: true }

  let backend = 'codex'
  let progress = false
  let lite = false
  const filtered: string[] = []

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--lite' || arg === '-L') {
      lite = true
      continue
    }
    if (arg === '--skip-permissions' || arg === '--dangerously-skip-permissions') {
      continue // 接受但不影响单任务行为（与 Go 版一致）
    }
    if (arg === '--progress') {
      progress = true
      continue
    }
    if (arg === '--backend') {
      if (i + 1 >= argv.length) return { error: '--backend flag requires a value' }
      backend = argv[++i]
      continue
    }
    if (arg.startsWith('--backend=')) {
      const value = arg.slice('--backend='.length)
      if (!value) return { error: '--backend flag requires a value' }
      backend = value
      continue
    }
    filtered.push(arg)
  }

  if (filtered.length === 0) return { error: 'task required' }

  const config: WrapperConfig = {
    backend, mode: 'new', sessionId: '', task: '', explicitStdin: false,
    workDir: '.', progress, lite,
  }

  if (filtered[0] === 'resume') {
    if (filtered.length < 3) return { error: 'resume mode requires: resume <session_id> <task>' }
    config.mode = 'resume'
    config.sessionId = filtered[1].trim()
    if (!config.sessionId) return { error: 'resume mode requires non-empty session_id' }
    config.task = filtered[2]
    config.explicitStdin = filtered[2] === '-'
    if (filtered.length > 3) config.workDir = filtered[3]
  } else {
    config.task = filtered[0]
    config.explicitStdin = filtered[0] === '-'
    if (filtered.length > 1) config.workDir = filtered[1]
  }

  return { config }
}

/** stdin 模式判定：显式 `-` 或任务含特殊字符或长度>800（与 Go 版 stdinSpecialChars 一致） */
export function shouldUseStdin(config: WrapperConfig, piped: boolean): boolean {
  if (config.explicitStdin || piped) return true
  return /[\n\\\"'`$]/.test(config.task) || config.task.length > 800
}

// ─── ROLE_FILE 注入 ──────────────────────────────────────

/** 把 "ROLE_FILE: <path>" 行原地替换为文件内容（~ 展开；读取失败保留原行） */
export function injectRoleFile(taskText: string): string {
  return taskText.replace(/^ROLE_FILE:\s*(.+)$/gm, (match, rawPath: string) => {
    let filePath = rawPath.trim()
    if (filePath.startsWith('~/')) {
      filePath = join(homedir(), filePath.slice(2))
    }
    try {
      if (!existsSync(filePath)) return match
      return readFileSync(filePath, 'utf-8')
    } catch {
      return match
    }
  })
}

// ─── Backend 参数构造 ────────────────────────────────────

export function buildBackendArgs(config: WrapperConfig, targetArg: string): string[] {
  const isResume = config.mode === 'resume' && config.sessionId !== ''
  switch (config.backend) {
    case 'codex': {
      const args = ['e']
      if (process.env.CODEX_REQUIRE_APPROVAL !== 'true') {
        args.push('--dangerously-bypass-approvals-and-sandbox')
      }
      if (process.env.CODEX_DISABLE_SKIP_GIT_CHECK !== 'true') {
        args.push('--skip-git-repo-check')
      }
      if (isResume) {
        return [...args, '--json', 'resume', config.sessionId, targetArg]
      }
      return [...args, '-C', config.workDir, '--json', targetArg]
    }
    case 'claude': {
      const args = ['-p', '--dangerously-skip-permissions', '--setting-sources', '']
      if (isResume) args.push('-r', config.sessionId)
      args.push('--output-format', 'stream-json', '--verbose', targetArg)
      return args
    }
    case 'hermes': {
      // hermes -z 不接受 stdin 标记：任务文本提升为 argv 参数
      const args: string[] = []
      if (isResume) args.push('-r', config.sessionId)
      const prompt = targetArg === '-' && config.task && config.task !== '-' ? config.task : targetArg
      args.push('-z', prompt)
      return args
    }
    case 'openclaw': {
      // 任务文本提升为 -m 参数（不走 stdin 标记）
      const args = ['agent', '--local', '--agent', 'main']
      if (isResume) args.push('--session-id', config.sessionId)
      const prompt = targetArg === '-' && config.task && config.task !== '-' ? config.task : targetArg
      args.push('-m', prompt, '--json')
      return args
    }
    default:
      return []
  }
}

export function backendCommand(backend: string): string {
  return backend // 各后端命令名与其 backend 名一致
}

// ─── 输出解析 ────────────────────────────────────────────

export interface ParseResult {
  message: string
  sessionId: string
}

interface UnifiedEvent {
  type?: string
  thread_id?: string
  item?: unknown
  subtype?: string
  session_id?: string
  result?: string
}

interface ParsedItem {
  type?: string
  text?: unknown
  command?: string
  aggregated_output?: string
  exit_code?: number
}

interface ParseState {
  codexMessage: string
  claudeMessage: string
  plainText: string[]
  blobLines: string[]
  sessionId: string
}

export interface OutputStreamParser {
  push(line: string): void
  result(): ParseResult
}

type EmitFn = (event: string, fields?: Record<string, string>) => void

/** 结构化进度事件（供 Web UI 等消费者；content 传完整内容，不做终端展示用的截断） */
export interface StructuredEvent {
  name: string
  sessionId?: string
  contentType?: string // "reasoning" | "message" | "command"
  content?: string
  cmd?: string
  exit?: string
}

type StructuredEmitFn = (event: StructuredEvent) => void

function processLine(state: ParseState, rawLine: string, emit: EmitFn, emitStructured: StructuredEmitFn): void {
  const line = rawLine.trim()
  if (!line) return

  let event: UnifiedEvent
  try {
    event = JSON.parse(line) as UnifiedEvent
  } catch {
    state.plainText.push(line)
    state.blobLines.push(rawLine)
    return
  }

  const item = (event.item ?? null) as ParsedItem | null
  const itemType = item && typeof item === 'object' ? item.type : undefined

  // backend 判定（与 Go 版 UnifiedEvent 逻辑一致）
  const isCodex = !!event.thread_id || event.type === 'turn.completed' || event.type === 'turn.started'
    || (item && itemType) || (!!event.type && event.type !== 'result')
  const isClaude = !!event.subtype || !!event.result
    || (event.type === 'result' && !!event.session_id)

  // 空 JSON 事件（{} / {"item":null}）——不误收为 message
  if (!isCodex && !isClaude && !event.type && !event.thread_id && !event.subtype
    && !event.session_id && !event.result && !event.item) {
    return
  }

  if (event.session_id && !state.sessionId) state.sessionId = event.session_id
  if (event.thread_id && !state.sessionId) state.sessionId = event.thread_id

  if (isCodex) {
    if (event.type === 'thread.started' && event.thread_id) {
      state.sessionId = event.thread_id
      emit('session_started', { id: event.thread_id })
      emitStructured({ name: 'session_started', sessionId: event.thread_id })
    } else if (event.type === 'turn.started') {
      emit('turn_started')
      emitStructured({ name: 'turn_started', sessionId: state.sessionId })
    } else if (event.type === 'thread.completed' || event.type === 'turn.completed') {
      const name = event.type === 'thread.completed' ? 'session_completed' : 'turn_completed'
      emit(name)
      emitStructured({ name, sessionId: state.sessionId })
    } else if (event.type === 'item.completed' && item) {
      if (itemType === 'agent_message' || itemType === 'reasoning') {
        const text = typeof item.text === 'string' ? item.text : JSON.stringify(item.text ?? '')
        if (text) {
          if (itemType === 'agent_message') {
            state.codexMessage = text
            emit('message', { text: JSON.stringify(text.slice(0, 120)) })
            emitStructured({ name: 'message', sessionId: state.sessionId, contentType: 'message', content: text })
          } else {
            emit('reasoning', { text: JSON.stringify(text.slice(0, 120)) })
            emitStructured({ name: 'reasoning', sessionId: state.sessionId, contentType: 'reasoning', content: text })
          }
        }
      } else if (itemType === 'command_execution') {
        const exit = item.exit_code != null ? String(item.exit_code) : undefined
        emit('cmd_done', {
          cmd: JSON.stringify((item.command ?? '').slice(0, 120)),
          ...(exit ? { exit } : {}),
        })
        emitStructured({ name: 'cmd_done', sessionId: state.sessionId, contentType: 'command', cmd: (item.command ?? '').slice(0, 200), exit }) // cmd 为展示护栏截断；content 类字段不截断
      }
    }
    return
  }

  if (isClaude) {
    if (event.session_id && !state.sessionId) state.sessionId = event.session_id
    if (event.result) state.claudeMessage = event.result
    return
  }

  // 未识别事件（如 {"item":null} 之外的中间形态）——不入 message
}

function finalize(state: ParseState): ParseResult {
  // openclaw 多行 JSON blob 提取（非 JSON 行整体无法逐行解析时）
  if (!state.claudeMessage && !state.codexMessage && state.blobLines.length > 0) {
    const blob = state.blobLines.join('\n')
    try {
      const obj = JSON.parse(blob) as { payloads?: { text?: string }[]; meta?: { agentMeta?: { sessionId?: string } } }
      const texts = (obj.payloads ?? []).map(p => p.text ?? '').filter(Boolean)
      if (texts.length > 0) {
        state.codexMessage = texts.join('\n')
        if (obj.meta?.agentMeta?.sessionId && !state.sessionId) state.sessionId = obj.meta.agentMeta.sessionId
      }
    } catch {
      // 非 openclaw blob，维持纯文本兜底
    }
  }

  // 纯文本兜底：仅当无 JSON 事件产生 message 时使用
  let message: string
  if (state.claudeMessage) message = state.claudeMessage
  else if (state.codexMessage) message = state.codexMessage
  else message = state.plainText.join('\n')

  return { message, sessionId: state.sessionId }
}

/**
 * 增量式输出流解析器：逐行 push，实时产生进度回调；结束后 result() 取最终 message 与 session id。
 */
export function createOutputStreamParser(opts: {
  onProgress?: (line: string) => void
  onEvent?: (event: StructuredEvent) => void
} = {}): OutputStreamParser {
  const state: ParseState = { codexMessage: '', claudeMessage: '', plainText: [], blobLines: [], sessionId: '' }
  const emit: EmitFn = (event, fields = {}) => {
    if (!opts.onProgress) return
    const parts = Object.entries(fields).map(([k, v]) => `${k}=${v}`)
    opts.onProgress(`[PROGRESS] ${event}${parts.length ? ' ' + parts.join(' ') : ''}`)
  }
  const emitStructured: StructuredEmitFn = (event) => {
    if (!opts.onEvent) return
    opts.onEvent(event)
  }
  return {
    push(line: string) {
      processLine(state, line, emit, emitStructured)
    },
    result() {
      return finalize(state)
    },
  }
}

/**
 * 逐行解析后端 JSON 事件流（codex/claude），纯文本行兜底收集（hermes -z），
 * openclaw 多行 JSON blob 提取 payloads[].text 与 meta.agentMeta.sessionId。
 * 返回最终 message 与 session id。
 */
export function parseOutputStream(lines: string[], opts: { onProgress?: (line: string) => void } = {}): ParseResult {
  const parser = createOutputStreamParser(opts)
  for (const line of lines) parser.push(line)
  return parser.result()
}

// ─── 超时 ────────────────────────────────────────────────

export function resolveTimeoutSeconds(): number {
  const raw = process.env.CODEX_TIMEOUT
  if (!raw) return DEFAULT_TIMEOUT_SECONDS
  const parsed = Number.parseInt(raw, 10)
  if (Number.isNaN(parsed) || parsed <= 0) return DEFAULT_TIMEOUT_SECONDS
  return parsed > 10000 ? Math.floor(parsed / 1000) : parsed
}

// ─── 环境注入 ────────────────────────────────────────────

/**
 * 读取 ~/.claude/settings.json 中 env 对象的字符串值（移植自 Go 版 loadMinimalEnvSettings）。
 * 文件缺失 / 解析失败 / 文件超过 1MB 时返回空对象；仅提取字符串值，其余类型忽略。
 */
export function loadMinimalEnvSettings(): Record<string, string> {
  const settingsPath = join(homedir(), '.claude', 'settings.json')
  try {
    if (statSync(settingsPath).size > 1024 * 1024) return {}
    const parsed = JSON.parse(readFileSync(settingsPath, 'utf-8')) as {
      env?: Record<string, unknown>
    }
    const env: Record<string, string> = {}
    if (parsed.env && typeof parsed.env === 'object') {
      for (const [key, value] of Object.entries(parsed.env)) {
        if (typeof value === 'string') env[key] = value
      }
    }
    return env
  } catch {
    return {}
  }
}
