#!/usr/bin/env node
/**
 * ly-wrapper — 单任务 wrapper 入口（替代 Go 版 codeagent-wrapper）。
 *
 * 用法:
 *   ly-wrapper [--backend codex|claude|hermes|openclaw] [--progress] - "<WORKDIR>"
 *   ly-wrapper --backend <b> resume <session_id> - "<WORKDIR>"
 * 任务文本（含 ROLE_FILE: 行）从 stdin 读入；`-` 表示显式 stdin 模式。
 */
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import {
  backendCommand, buildBackendArgs, createOutputStreamParser, injectRoleFile,
  loadMinimalEnvSettings, parseArgs, resolveTimeoutSeconds, shouldUseStdin, TIMEOUT_EXIT_CODE,
} from './wrapper/core'

const LY_WRAPPER_VERSION = '2.0.0'

function fail(message: string): never {
  process.stderr.write(`ERROR: ${message}\n`)
  process.exit(1)
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return ''
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf-8')
}

async function main(): Promise<number> {
  const parsed = parseArgs(process.argv.slice(2))
  if (parsed.version) {
    process.stdout.write(`ly-wrapper version ${LY_WRAPPER_VERSION}\n`)
    return 0
  }
  if (parsed.help) {
    process.stdout.write(
      `Usage: ly-wrapper [--backend codex|claude|hermes|openclaw] [--progress] - [workdir]\n`
      + `       ly-wrapper --backend <b> resume <session_id> - [workdir]\n`
      + `Env: CODEX_TIMEOUT (秒, >10000 视为毫秒; 默认 7200)\n`)
    return 0
  }
  if (parsed.error || !parsed.config) fail(parsed.error ?? 'task required')

  const cfg = parsed.config

  let finalTask: string
  if (cfg.explicitStdin) {
    const stdinTask = injectRoleFile(await readStdin())
    if (!stdinTask) fail('Explicit stdin mode requires task input from stdin')
    finalTask = stdinTask
  } else {
    finalTask = injectRoleFile(cfg.task)
  }

  // 显式 stdin 模式下把回填的任务文本写回 cfg.task，
  // 使 buildBackendArgs 中 hermes/openclaw 的 stdin 提升（targetArg === '-' && config.task）生效
  cfg.task = finalTask

  // 与 Go 版一致：显式 `-` 必走 stdin；否则仅当任务含特殊字符（\n \ " ' ` $）或长度>800 时走 stdin
  const stdinMode = cfg.explicitStdin || shouldUseStdin({ ...cfg, explicitStdin: false }, false)

  const targetArg = stdinMode ? '-' : finalTask
  const command = backendCommand(cfg.backend)
  const args = buildBackendArgs(cfg, targetArg)
  if (args.length === 0) fail(`unknown backend: ${cfg.backend}`)

  process.stderr.write(`[ly-wrapper]\n  Backend: ${cfg.backend}\n  Command: ${command} ${args.join(' ')}\n`)

  const child = spawn(command, args, {
    cwd: cfg.workDir,
    env: { ...process.env, ...loadMinimalEnvSettings() },
    stdio: ['pipe', 'pipe', 'inherit'],
    detached: process.platform !== 'win32', // posix 下独立进程组，便于超时整树 kill
  })

  if (stdinMode) {
    child.stdin.write(finalTask)
  }
  child.stdin.end()

  const timeoutSeconds = resolveTimeoutSeconds()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    process.stderr.write(`ERROR: timeout after ${timeoutSeconds}s, killing backend process tree\n`)
    if (process.platform !== 'win32' && child.pid) {
      try { process.kill(-child.pid, 'SIGKILL') } catch { child.kill('SIGKILL') }
    } else {
      child.kill('SIGKILL')
    }
  }, timeoutSeconds * 1000)
  timer.unref?.()

  // 流式解析 stdout：实时产生进度行（--progress 时转发），结束后取最终 message/session
  const parser = createOutputStreamParser({
    onProgress: (line) => {
      if (cfg.progress) process.stdout.write(`${line}\n`)
    },
  })
  const rl = createInterface({ input: child.stdout })
  rl.on('line', (line) => parser.push(line))

  const exitCode: number = await new Promise((resolve) => {
    child.on('close', (code) => resolve(code ?? 1))
    child.on('error', (err) => {
      process.stderr.write(`ERROR: failed to spawn backend '${command}': ${err.message}\n`)
      resolve(127)
    })
  })

  clearTimeout(timer)
  rl.close()

  if (timedOut) return TIMEOUT_EXIT_CODE
  if (exitCode !== 0) {
    // 非零退出：保留已收集输出供诊断，退出码如实转发（不伪装成空报告）
    const partial = parser.result()
    if (partial.message) process.stdout.write(`${partial.message}\n`)
    return exitCode
  }

  const result = parser.result()
  if (!result.message) {
    // 退出码 0 但无任何 message：按失败处理，避免伪装成空报告
    process.stderr.write(`ERROR: backend completed without message output${result.sessionId ? ` (session: ${result.sessionId})` : ''}\n`)
    return 1
  }
  process.stdout.write(`${result.message}\n`)
  if (result.sessionId) {
    process.stdout.write(`\n---\nSESSION_ID: ${result.sessionId}\n`)
  }
  return 0
}

main().then((code) => process.exit(code)).catch((err: unknown) => {
  process.stderr.write(`ERROR: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
