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

/** Mutable CLI presence read by the execFile mock — install success can flip it. */
const cliState = { installed: true }

function mockExec() {
  execFileMock.mockImplementation((cmd: string, _args: any, _opts: any, cb: (err: any, out: string) => void) => {
    if (cmd !== 'openspec') { cb(null, ''); return }
    if (!cliState.installed) { cb(new Error('not found'), ''); return }
    cb(null, '1.7.0\n')
  })
}

/** Simulate npm install outcome; onSpawn runs before the close/error event. */
function npmInstallResult(exitCode: number | 'spawn-error', onSpawn?: () => void) {
  spawnMock.mockImplementation(() => {
    const listeners: Record<string, any[]> = {}
    const on = (event: string, cb: any) => {
      (listeners[event] ||= []).push(cb)
      return undefined
    }
    const emit = (event: string, arg?: any) => (listeners[event] || []).forEach(cb => cb(arg))
    queueMicrotask(() => {
      onSpawn?.()
      if (exitCode === 'spawn-error') emit('error', new Error('spawn ENOENT'))
      else emit('close', exitCode)
    })
    return { on } as any
  })
}

/** Force isTTY value on stdin/stdout; restores (or deletes) original state. */
async function withTTY(value: boolean, fn: () => Promise<void>) {
  const stdin = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY')
  const stdout = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY')
  Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value })
  Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value })
  try {
    await fn()
  }
  finally {
    for (const [target, desc] of [[process.stdin, stdin], [process.stdout, stdout]] as const) {
      if (desc) Object.defineProperty(target, 'isTTY', desc)
      else delete (target as any).isTTY
    }
  }
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
    mockExec()
    cliState.installed = true
    expect(await detectOpenspecCli()).toEqual({ installed: true, version: '1.7.0' })
  })

  it('returns not installed on exec error', async () => {
    mockExec()
    cliState.installed = false
    expect(await detectOpenspecCli()).toEqual({ installed: false })
  })

  it('treats timeout (killed) as installed-but-unhealthy, not missing', async () => {
    execFileMock.mockImplementation((_cmd: string, _a: any, _o: any, cb: any) => {
      cb(Object.assign(new Error('spawn timeout'), { killed: true }), '')
    })
    expect(await detectOpenspecCli()).toEqual({ installed: true, version: 'unknown' })
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
    cliState.installed = true
  })

  afterEach(() => {
    delete process.env.CLAUDE_CONFIG_DIR
    vi.restoreAllMocks()
  })

  it('silent pass when CLI installed and skills present', async () => {
    mockExec()
    existsSyncMock.mockReturnValue(true)
    await checkExternalDeps()
    expect(logSpy).not.toHaveBeenCalled()
    expect(errSpy).not.toHaveBeenCalled()
  })

  it('warns once when CLI installed but skills missing', async () => {
    mockExec()
    existsSyncMock.mockReturnValue(false)
    await checkExternalDeps()
    expect(logSpy).toHaveBeenCalledTimes(1)
    expect(promptMock).not.toHaveBeenCalled()
  })

  it('skipPrompt option: skips install ask and prints unavailable list', async () => {
    mockExec()
    cliState.installed = false
    existsSyncMock.mockReturnValue(false)
    await withTTY(true, async () => {
      await checkExternalDeps({ skipPrompt: true })
    })
    expect(promptMock).not.toHaveBeenCalled()
    expect(logSpy).toHaveBeenCalled()
  })

  it('non-TTY: skips install ask and prints unavailable list', async () => {
    mockExec()
    cliState.installed = false
    existsSyncMock.mockReturnValue(false)
    await withTTY(false, async () => {
      await checkExternalDeps()
    })
    expect(promptMock).not.toHaveBeenCalled()
    expect(logSpy).toHaveBeenCalled()
  })

  it('declined install: prints unavailable list, no npm call', async () => {
    mockExec()
    cliState.installed = false
    existsSyncMock.mockReturnValue(false)
    promptMock.mockResolvedValue({ confirmed: false })
    await withTTY(true, async () => {
      await checkExternalDeps()
    })
    expect(promptMock).toHaveBeenCalledTimes(1)
    expect(spawnMock).not.toHaveBeenCalled()
    expect(logSpy).toHaveBeenCalled()
  })

  it('successful install: spawn npm with arg array, CLI recheck passes', async () => {
    mockExec()
    cliState.installed = false
    existsSyncMock.mockReturnValue(true)
    promptMock.mockResolvedValue({ confirmed: true })
    npmInstallResult(0, () => { cliState.installed = true })
    await withTTY(true, async () => {
      await checkExternalDeps()
    })
    const spawnArgs = spawnMock.mock.calls[0] as any[]
    expect(spawnArgs[0]).toBe('npm')
    expect(Array.isArray(spawnArgs[1])).toBe(true)
    expect(logSpy).toHaveBeenCalled()
  })

  it('install succeeds but CLI not on PATH: prints PATH guidance', async () => {
    mockExec()
    cliState.installed = false
    existsSyncMock.mockReturnValue(true)
    promptMock.mockResolvedValue({ confirmed: true })
    npmInstallResult(0) // CLI recheck still fails — npm bin not on PATH
    await withTTY(true, async () => {
      await checkExternalDeps()
    })
    expect(spawnMock).toHaveBeenCalled()
    expect(logSpy).toHaveBeenCalled()
  })

  it('failed npm install: reports error and continues (never throws)', async () => {
    mockExec()
    cliState.installed = false
    existsSyncMock.mockReturnValue(false)
    promptMock.mockResolvedValue({ confirmed: true })
    npmInstallResult(1)
    await withTTY(true, async () => {
      await expect(checkExternalDeps()).resolves.toBeUndefined()
    })
    expect(errSpy).toHaveBeenCalled()
  })

  it('npm spawn error (ENOENT): reports error and continues (never throws)', async () => {
    mockExec()
    cliState.installed = false
    existsSyncMock.mockReturnValue(false)
    promptMock.mockResolvedValue({ confirmed: true })
    npmInstallResult('spawn-error')
    await withTTY(true, async () => {
      await expect(checkExternalDeps()).resolves.toBeUndefined()
    })
    expect(errSpy).toHaveBeenCalled()
  })

  it('inquirer prompt rejection: swallowed by top-level catch (never throws)', async () => {
    mockExec()
    cliState.installed = false
    existsSyncMock.mockReturnValue(false)
    promptMock.mockRejectedValue(new Error('User force closed the prompt'))
    await withTTY(true, async () => {
      await expect(checkExternalDeps()).resolves.toBeUndefined()
    })
  })
})
