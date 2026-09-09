import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

const execFileMock = vi.fn()
const spawnMock = vi.fn()
const existsSyncMock = vi.fn()
const promptMock = vi.fn()

vi.mock('node:child_process', () => ({
  execFile: (...args: any[]) => execFileMock(...args),
  spawn: (...args: any[]) => spawnMock(...args),
}))

vi.mock('node:fs', () => ({
  existsSync: (...args: any[]) => existsSyncMock(...args),
}))

vi.mock('inquirer', () => ({
  default: { prompt: (...args: any[]) => promptMock(...args) },
}))

import { checkExternalDeps, detectOpenspecCli, detectOpsxSkills, getOpsxSkillsDir } from '../preflight'

function execSucceeds(output = '1.7.0\n') {
  execFileMock.mockImplementation((cmd: string, _args: any, _opts: any, cb: (err: Error | null, out: string) => void) => {
    if (cmd === 'openspec') cb(null, output)
    else cb(null, '')
  })
}

function execFailsFor(cmd: string) {
  execFileMock.mockImplementation((c: string, _args: any, _opts: any, cb: (err: Error | null, out: string) => void) => {
    if (c === cmd) cb(new Error('not found'), '')
    else cb(null, '')
  })
}

function failCli() {
  execFileMock.mockImplementation((cmd: string, _args: any, _opts: any, cb: (err: Error | null, out: string) => void) => {
    if (cmd === 'openspec') cb(new Error('not found'), '')
    else cb(null, '')
  })
}

function npmInstallResult(exitCode: number | 'spawn-error') {
  spawnMock.mockImplementation(() => {
    const listeners: Record<string, any[]> = {}
    const on = (event: string, cb: any) => {
      (listeners[event] ||= []).push(cb)
      return undefined
    }
    const emit = (event: string, arg?: any) => (listeners[event] || []).forEach(cb => cb(arg))
    queueMicrotask(() => {
      if (exitCode === 'spawn-error') emit('error', new Error('spawn ENOENT'))
      else emit('close', exitCode)
    })
    return { on } as any
  })
}

/** Force isTTY value on stdin/stdout for non-TTY simulation. */
function withTTY(value: boolean, fn: () => Promise<void>) {
  const stdin = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY')
  const stdout = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY')
  Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value })
  Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value })
  return fn().finally(() => {
    if (stdin) Object.defineProperty(process.stdin, 'isTTY', stdin)
    if (stdout) Object.defineProperty(process.stdout, 'isTTY', stdout)
  })
}

describe('getOpsxSkillsDir', () => {
  afterEach(() => {
    delete process.env.CLAUDE_CONFIG_DIR
    vi.restoreAllMocks()
  })

  it('defaults to ~/.claude/commands/opsx', () => {
    delete process.env.CLAUDE_CONFIG_DIR
    expect(getOpsxSkillsDir().replace(/\\/g, '/')).toMatch(/\.claude\/commands\/opsx$/)
  })

  it('honors CLAUDE_CONFIG_DIR', () => {
    process.env.CLAUDE_CONFIG_DIR = '/custom/claude'
    expect(getOpsxSkillsDir().replace(/\\/g, '/')).toBe('/custom/claude/commands/opsx')
  })
})

describe('detectOpenspecCli', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns installed with trimmed version on success', async () => {
    execSucceeds('1.7.0\n')
    expect(await detectOpenspecCli()).toEqual({ installed: true, version: '1.7.0' })
  })

  it('returns not installed on exec error', async () => {
    execFailsFor('openspec')
    expect(await detectOpenspecCli()).toEqual({ installed: false })
  })
})

describe('detectOpsxSkills', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns true when skills dir exists', () => {
    existsSyncMock.mockReturnValue(true)
    expect(detectOpsxSkills()).toBe(true)
  })

  it('returns false when skills dir missing', () => {
    existsSyncMock.mockReturnValue(false)
    expect(detectOpsxSkills()).toBe(false)
  })
})

describe('checkExternalDeps', () => {
  let logSpy: ReturnType<typeof vi.spyOn>
  let errSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    delete process.env.CLAUDE_CONFIG_DIR
    vi.restoreAllMocks()
  })

  it('silent pass when CLI installed and skills present', async () => {
    execSucceeds()
    existsSyncMock.mockReturnValue(true)
    await checkExternalDeps()
    expect(logSpy).not.toHaveBeenCalled()
    expect(errSpy).not.toHaveBeenCalled()
  })

  it('warns once when CLI installed but skills missing', async () => {
    execSucceeds()
    existsSyncMock.mockReturnValue(false)
    await checkExternalDeps()
    expect(logSpy).toHaveBeenCalledTimes(1)
    expect(promptMock).not.toHaveBeenCalled()
  })

  it('non-TTY: skips install ask and prints unavailable list', async () => {
    execFailsFor('openspec')
    existsSyncMock.mockReturnValue(false)
    await withTTY(false, async () => {
      await checkExternalDeps()
    })
    expect(promptMock).not.toHaveBeenCalled()
    expect(logSpy).toHaveBeenCalled()
  })

  it('declined install: prints unavailable list, no npm call', async () => {
    execFailsFor('openspec')
    existsSyncMock.mockReturnValue(false)
    promptMock.mockResolvedValue({ confirmed: false })
    await withTTY(true, async () => {
      await checkExternalDeps()
    })
    expect(promptMock).toHaveBeenCalledTimes(1)
    expect(execFileMock.mock.calls.some((c: any[]) => c[0] === 'npm')).toBe(false)
    expect(logSpy).toHaveBeenCalled()
  })

  it('successful install: spawn called, message depends on skills state', async () => {
    failCli()
    promptMock.mockResolvedValue({ confirmed: true })
    existsSyncMock.mockReturnValue(true)
    npmInstallResult(0)
    await withTTY(true, async () => {
      await checkExternalDeps()
    })
    expect(spawnMock).toHaveBeenCalled()
    expect(logSpy).toHaveBeenCalled()
  })

  it('failed npm install: reports error and continues (never throws)', async () => {
    failCli()
    promptMock.mockResolvedValue({ confirmed: true })
    existsSyncMock.mockReturnValue(false)
    npmInstallResult(1)
    await withTTY(true, async () => {
      await expect(checkExternalDeps()).resolves.toBeUndefined()
    })
    expect(errSpy).toHaveBeenCalled()
  })
})
