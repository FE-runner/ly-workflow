import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  buildBackendArgs, createOutputStreamParser, injectRoleFile, parseArgs,
  resolveTimeoutSeconds, shouldUseStdin, TIMEOUT_EXIT_CODE,
} from '../core'
import type { StructuredEvent, WrapperConfig } from '../core'

function cfg(overrides: Partial<WrapperConfig> = {}): WrapperConfig {
  return {
    backend: 'codex', mode: 'new', sessionId: '', task: 'do something',
    explicitStdin: false, workDir: '.', progress: false, ...overrides,
  }
}

describe('parseArgs', () => {
  it('解析单任务形态：--backend/--progress/-/workdir', () => {
    const r = parseArgs(['--progress', '--backend', 'codex', '-', '$PWD'])
    expect(r.error).toBeUndefined()
    expect(r.config).toMatchObject({
      backend: 'codex', mode: 'new', explicitStdin: true, workDir: '$PWD', progress: true,
    })
  })

  it('解析 --backend=<v> 等价形态', () => {
    const r = parseArgs(['--backend=hermes', 'task'])
    expect(r.config?.backend).toBe('hermes')
  })

  it('解析 resume 子形态', () => {
    const r = parseArgs(['--backend', 'codex', 'resume', 'sess-1', '-', '.'])
    expect(r.config).toMatchObject({ mode: 'resume', sessionId: 'sess-1', explicitStdin: true })
  })

  it('resume 缺 session_id 报错', () => {
    expect(parseArgs(['resume']).error).toBeDefined()
    expect(parseArgs(['resume', '  ']).error).toBeDefined()
  })

  it('--lite/--skip-permissions 接受但不生效', () => {
    const r = parseArgs(['--lite', '--skip-permissions', 'task'])
    expect(r.error).toBeUndefined()
    expect(r.config?.task).toBe('task')
  })

  it('无任务时报错；--version/--help 生效', () => {
    expect(parseArgs([]).error).toBeDefined()
    expect(parseArgs(['--version']).version).toBe(true)
    expect(parseArgs(['--help']).help).toBe(true)
  })
})

describe('shouldUseStdin', () => {
  it('显式 stdin 或含特殊字符或超长时走 stdin', () => {
    expect(shouldUseStdin(cfg({ explicitStdin: true }), false)).toBe(true)
    expect(shouldUseStdin(cfg({ task: 'line1\nline2' }), false)).toBe(true)
    expect(shouldUseStdin(cfg({ task: 'has "quote"' }), false)).toBe(true)
    expect(shouldUseStdin(cfg({ task: 'x'.repeat(801) }), false)).toBe(true)
    expect(shouldUseStdin(cfg({ task: 'plain task' }), false)).toBe(false)
  })
})

describe('injectRoleFile', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'ly-wrapper-test-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('ROLE_FILE 行被替换为文件内容（~ 不展开时用绝对路径）', () => {
    const rolePath = join(dir, 'reviewer.md')
    writeFileSync(rolePath, 'ROLE CONTENT')
    const out = injectRoleFile(`ROLE_FILE: ${rolePath}\n<TASK>审查</TASK>`)
    expect(out).toContain('ROLE CONTENT')
    expect(out).not.toContain('ROLE_FILE:')
  })

  it('文件读取失败时保留原行', () => {
    const out = injectRoleFile('ROLE_FILE: /nonexistent/path/x.md')
    expect(out).toBe('ROLE_FILE: /nonexistent/path/x.md')
  })
})

describe('buildBackendArgs', () => {
  it('codex 新任务: -C workdir --json target', () => {
    expect(buildBackendArgs(cfg(), '-')).toEqual([
      'e', '--dangerously-bypass-approvals-and-sandbox', '--skip-git-repo-check', '-C', '.', '--json', '-',
    ])
  })

  it('codex resume: --json resume <sid> <target>（无 -C）', () => {
    expect(buildBackendArgs(cfg({ mode: 'resume', sessionId: 's1' }), 'task')).toEqual([
      'e', '--dangerously-bypass-approvals-and-sandbox', '--skip-git-repo-check', '--json', 'resume', 's1', 'task',
    ])
  })

  it('codex 环境开关：CODEX_REQUIRE_APPROVAL/CODEX_DISABLE_SKIP_GIT_CHECK', () => {
    process.env.CODEX_REQUIRE_APPROVAL = 'true'
    process.env.CODEX_DISABLE_SKIP_GIT_CHECK = 'true'
    expect(buildBackendArgs(cfg(), 't')).toEqual(['e', '-C', '.', '--json', 't'])
    delete process.env.CODEX_REQUIRE_APPROVAL
    delete process.env.CODEX_DISABLE_SKIP_GIT_CHECK
  })

  it('claude: -p --dangerously-skip-permissions --setting-sources "" + resume -r + stream-json', () => {
    expect(buildBackendArgs(cfg({ backend: 'claude' }), '-')).toEqual([
      '-p', '--dangerously-skip-permissions', '--setting-sources', '', '--output-format', 'stream-json', '--verbose', '-',
    ])
    expect(buildBackendArgs(cfg({ backend: 'claude', mode: 'resume', sessionId: 'c1' }), 't')).toContain('-r')
  })

  it('hermes: stdin 任务文本提升为 -z argv；resume 用 -r', () => {
    const c = cfg({ backend: 'hermes', task: '审查这个 diff' })
    expect(buildBackendArgs(c, '-')).toEqual(['-z', '审查这个 diff'])
    expect(buildBackendArgs(cfg({ backend: 'hermes', mode: 'resume', sessionId: 'h1', task: 't' }), '-'))
      .toEqual(['-r', 'h1', '-z', 't'])
  })

  it('openclaw: agent --local --agent main -m <task> --json；resume 用 --session-id', () => {
    const c = cfg({ backend: 'openclaw', task: '实施 tasks' })
    expect(buildBackendArgs(c, '-')).toEqual(['agent', '--local', '--agent', 'main', '-m', '实施 tasks', '--json'])
    expect(buildBackendArgs(cfg({ backend: 'openclaw', mode: 'resume', sessionId: 'o1', task: 't' }), '-'))
      .toEqual(['agent', '--local', '--agent', 'main', '--session-id', 'o1', '-m', 't', '--json'])
  })

  it('未知 backend 返回空数组', () => {
    expect(buildBackendArgs(cfg({ backend: 'gemini' }), 't')).toEqual([])
  })

  // 端到端：显式 stdin 模式（`-` + stdin heredoc）——ly-wrapper 读入任务文本回填 cfg.task 后，
  // hermes/openclaw 的 stdin 提升逻辑必须产出任务全文（而非 `-` 字面量）
  it('端到端 hermes: parseArgs(`-`) + stdin 回填 task → -z 任务全文', () => {
    const parsed = parseArgs(['--backend', 'hermes', '-', '.'])
    expect(parsed.error).toBeUndefined()
    const c = parsed.config!
    c.task = '审查任务全文' // 模拟 ly-wrapper 读入 stdin 并回填 cfg.task
    expect(buildBackendArgs(c, '-')).toEqual(['-z', '审查任务全文'])
  })

  it('端到端 openclaw: parseArgs(`-`) + stdin 回填 task → -m 任务全文', () => {
    const parsed = parseArgs(['--backend', 'openclaw', '-', '.'])
    expect(parsed.error).toBeUndefined()
    const c = parsed.config!
    c.task = '实施任务全文'
    expect(buildBackendArgs(c, '-'))
      .toEqual(['agent', '--local', '--agent', 'main', '-m', '实施任务全文', '--json'])
  })
})

describe('createOutputStreamParser', () => {
  it('codex JSON 事件流: agent_message → message，thread.started → session', () => {
    const p = createOutputStreamParser()
    p.push(JSON.stringify({ type: 'thread.started', thread_id: 'th-1' }))
    p.push(JSON.stringify({ type: 'item.started', item: { type: 'reasoning' } }))
    p.push(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: '审查结论' } }))
    p.push(JSON.stringify({ type: 'turn.completed' }))
    const r = p.result()
    expect(r.message).toBe('审查结论')
    expect(r.sessionId).toBe('th-1')
  })

  it('claude result 事件: result 字段为 message，session_id 提取', () => {
    const p = createOutputStreamParser()
    p.push(JSON.stringify({ type: 'system', subtype: 'init', session_id: 'cl-1' }))
    p.push(JSON.stringify({ type: 'result', subtype: 'success', session_id: 'cl-1', result: '实施完成' }))
    const r = p.result()
    expect(r.message).toBe('实施完成')
    expect(r.sessionId).toBe('cl-1')
  })

  it('空 JSON 事件（{} / {"item":null}）不误收为 message', () => {
    const p = createOutputStreamParser()
    p.push('{}')
    p.push('{"item":null}')
    p.push(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'ok' } }))
    expect(p.result().message).toBe('ok')
  })

  it('hermes 纯文本输出兜底收集为 message', () => {
    const p = createOutputStreamParser()
    p.push('这是 hermes 的纯文本回复')
    p.push('第二行')
    const r = p.result()
    expect(r.message).toBe('这是 hermes 的纯文本回复\n第二行')
    expect(r.sessionId).toBe('')
  })

  it('openclaw 多行 JSON blob 提取 payloads[].text 与 sessionId', () => {
    const p = createOutputStreamParser()
    // openclaw --json 输出多行缩进 JSON blob：逐行 JSON.parse 失败 → blobLines 聚合后整体解析
    const blob = JSON.stringify({
      payloads: [{ text: '第一段' }, { text: '第二段' }],
      meta: { agentMeta: { sessionId: 'oc-1' } },
    }, null, 2)
    for (const line of blob.split('\n')) p.push(line)
    const r = p.result()
    expect(r.message).toBe('第一段\n第二段')
    expect(r.sessionId).toBe('oc-1')
  })

  it('message 优先级: claude > codex > 纯文本', () => {
    const p = createOutputStreamParser()
    p.push('plain line')
    p.push(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'codex msg' } }))
    expect(p.result().message).toBe('codex msg')
    const p2 = createOutputStreamParser()
    p2.push(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'codex msg' } }))
    p2.push(JSON.stringify({ type: 'result', session_id: 's', result: 'claude msg' }))
    expect(p2.result().message).toBe('claude msg')
  })

  it('进度回调产生 [PROGRESS] 行', () => {
    const events: string[] = []
    const p = createOutputStreamParser({ onProgress: (l) => events.push(l) })
    p.push(JSON.stringify({ type: 'thread.started', thread_id: 't' }))
    p.push(JSON.stringify({ type: 'item.completed', item: { type: 'command_execution', command: 'git diff', exit_code: 0 } }))
    expect(events.some(e => e.startsWith('[PROGRESS] session_started'))).toBe(true)
    expect(events.some(e => e.startsWith('[PROGRESS] cmd_done'))).toBe(true)
  })

  it('结构化 onEvent 回调：完整 content 不截断、content_type 正确', () => {
    const events: StructuredEvent[] = []
    const p = createOutputStreamParser({ onEvent: e => events.push(e) })
    p.push(JSON.stringify({ type: 'thread.started', thread_id: 't1' }))
    p.push(JSON.stringify({ type: 'item.completed', item: { type: 'reasoning', text: 'x'.repeat(300) } }))
    p.push(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: '结'.repeat(200) } }))
    p.push(JSON.stringify({ type: 'turn.completed' }))
    const reasoning = events.find(e => e.name === 'reasoning')
    expect(reasoning?.content?.length).toBe(300) // 结构化载荷不截断
    expect(reasoning?.contentType).toBe('reasoning')
    expect(reasoning?.sessionId).toBe('t1')
    const msg = events.find(e => e.name === 'message')
    expect(msg?.contentType).toBe('message')
    expect(msg?.content?.length).toBe(200)
    expect(events.some(e => e.name === 'turn_completed')).toBe(true)
    // 终端展示行仍截断（并存语义）：默认无 onProgress 时不产出
  })
})

describe('resolveTimeoutSeconds', () => {
  const orig = process.env.CODEX_TIMEOUT
  afterEach(() => {
    if (orig === undefined) delete process.env.CODEX_TIMEOUT
    else process.env.CODEX_TIMEOUT = orig
  })

  it('默认 7200s；>10000 视为毫秒；非法回退默认', () => {
    delete process.env.CODEX_TIMEOUT
    expect(resolveTimeoutSeconds()).toBe(7200)
    process.env.CODEX_TIMEOUT = '60000'
    expect(resolveTimeoutSeconds()).toBe(60)
    process.env.CODEX_TIMEOUT = '30'
    expect(resolveTimeoutSeconds()).toBe(30)
    process.env.CODEX_TIMEOUT = 'abc'
    expect(resolveTimeoutSeconds()).toBe(7200)
  })

  it('超时退出码常量为 124', () => {
    expect(TIMEOUT_EXIT_CODE).toBe(124)
  })
})
