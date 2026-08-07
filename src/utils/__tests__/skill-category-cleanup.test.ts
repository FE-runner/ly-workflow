import { tmpdir } from 'node:os'
import { join } from 'pathe'
import fs from 'fs-extra'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getAllCommandIds, installWorkflows } from '../installer'

const ALL_IDS = getAllCommandIds()
const tmpDirs: string[] = []

const BINARY_NAME = process.platform === 'win32' ? 'codeagent-wrapper.exe' : 'codeagent-wrapper'

function makeTmpDir(label: string): string {
  const dir = join(tmpdir(), `ly-test-cleanup-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  tmpDirs.push(dir)
  return dir
}

/** Seed a pre-downloaded binary into installDir/bin so installWorkflows skips the network download. */
async function seedBinary(installDir: string, cachedBinaryPath: string): Promise<void> {
  const binDir = join(installDir, 'bin')
  await fs.ensureDir(binDir)
  await fs.copy(cachedBinaryPath, join(binDir, BINARY_NAME))
  if (process.platform !== 'win32') {
    await fs.chmod(join(binDir, BINARY_NAME), 0o755)
  }
}

/** Run installWorkflows once with the given historical-impeccable-fixture setup, reusing the cached binary. */
async function installWithFixture(dir: string, cachedBinaryPath: string | null, config: Parameters<typeof installWorkflows>[3]) {
  if (cachedBinaryPath) {
    await seedBinary(dir, cachedBinaryPath)
  }
  return installWorkflows(ALL_IDS, dir, true, config)
}

afterAll(async () => {
  await Promise.all(tmpDirs.map(dir => fs.remove(dir)))
})

describe('skill category cleanup — impeccable', () => {
  // 跑一次真实安装，产出当前生成器的 fixture：impeccable 历史目录/命令 + 可复用的二进制缓存
  // （不是手工模拟旧格式，避免掩盖兼容性问题；后续场景复用同一份二进制跳过网络下载）
  let fixtureDir: string
  let cachedBinaryPath: string
  let impeccableCmdName: string

  beforeAll(async () => {
    fixtureDir = makeTmpDir('fixture')
    const result = await installWorkflows(ALL_IDS, fixtureDir, true, { mcpProvider: 'skip', skipImpeccable: false })
    expect(result.errors).toEqual([])

    cachedBinaryPath = join(fixtureDir, 'bin', BINARY_NAME)
    expect(await fs.pathExists(cachedBinaryPath)).toBe(true)

    expect(await fs.pathExists(join(fixtureDir, 'skills', 'ly', 'impeccable'))).toBe(true)

    const fixtureCommandsDir = join(fixtureDir, 'commands', 'ly')
    for (const f of await fs.readdir(fixtureCommandsDir)) {
      if (!f.endsWith('.md')) continue
      const content = await fs.readFile(join(fixtureCommandsDir, f), 'utf-8')
      if (content.includes('skills/ly/impeccable/') || content.includes('skills\\ly\\impeccable\\')) {
        impeccableCmdName = f
        break
      }
    }
    expect(impeccableCmdName).not.toBe(undefined)
  }, 60000)

  it('场景1+5: 历史安装(用当前生成器产出的fixture)重装选跳过，全部被清理（覆盖 update 走 init --skip-prompt 的场景）', async () => {
    // 真实场景：同一个目标目录先装一次(不跳过) → 产出历史文件，再重装选跳过。
    // 不用手工模拟旧格式或跨目录复制（会导致命令文件里的安装路径子串不匹配），
    // 直接用当前生成器对同一目录跑两次，天然覆盖"本变更上线前就已安装"的场景。
    const dir = makeTmpDir('history-then-skip')
    await seedBinary(dir, cachedBinaryPath)
    const first = await installWorkflows(ALL_IDS, dir, true, { mcpProvider: 'skip', skipImpeccable: false })
    expect(first.errors).toEqual([])
    expect(await fs.pathExists(join(dir, 'skills', 'ly', 'impeccable'))).toBe(true)
    expect(await fs.pathExists(join(dir, 'commands', 'ly', impeccableCmdName))).toBe(true)

    // config 里 skipImpeccable 已是 true —— 对应 update.ts 沿用配置跑 `init --skip-prompt` 的路径
    const second = await installWorkflows(ALL_IDS, dir, true, {
      mcpProvider: 'skip',
      skipImpeccable: true,
    })

    expect(second.errors).toEqual([])
    expect(await fs.pathExists(join(dir, 'skills', 'ly', 'impeccable'))).toBe(false)
    expect(await fs.pathExists(join(dir, 'commands', 'ly', impeccableCmdName))).toBe(false)
    expect(second.removedSkillDirectories).toContain('impeccable')
    expect(second.removedSkillCommands).toContain(impeccableCmdName.replace('.md', ''))
  }, 60000)

  it('场景2: 从未装过 impeccable，选跳过，无删除动作无报错', async () => {
    const dir = makeTmpDir('never-installed')
    const result = await installWithFixture(dir, cachedBinaryPath, {
      mcpProvider: 'skip',
      skipImpeccable: true,
    })

    expect(result.errors).toEqual([])
    expect(result.removedSkillDirectories).toEqual([])
    expect(result.removedSkillCommands).toEqual([])
    expect(result.skippedCleanupFiles).toEqual([])
    expect(await fs.pathExists(join(dir, 'skills', 'ly', 'impeccable'))).toBe(false)
  }, 60000)

  it('场景3: 文件名撞车但内容不含安装路径子串的自定义文件不被删，记录进 skippedCleanupFiles', async () => {
    const dir = makeTmpDir('custom-collision')
    await fs.ensureDir(join(dir, 'commands', 'ly'))

    const customPath = join(dir, 'commands', 'ly', impeccableCmdName)
    await fs.writeFile(customPath, '---\ndescription: my own custom command\n---\n\n# not the generator output\n')

    const result = await installWithFixture(dir, cachedBinaryPath, {
      mcpProvider: 'skip',
      skipImpeccable: true,
    })

    expect(result.errors).toEqual([])
    expect(await fs.pathExists(customPath)).toBe(true)
    expect(result.removedSkillCommands).not.toContain(impeccableCmdName.replace('.md', ''))
    expect(result.skippedCleanupFiles).toContain(impeccableCmdName.replace('.md', ''))
  }, 60000)

  it('场景4: fs.copy filter 生效——跳过分类时整棵子树不出现在复制结果里', async () => {
    const dir = makeTmpDir('filter-fresh')
    const result = await installWithFixture(dir, cachedBinaryPath, {
      mcpProvider: 'skip',
      skipImpeccable: true,
    })

    expect(result.errors).toEqual([])
    expect(await fs.pathExists(join(dir, 'skills', 'ly', 'impeccable'))).toBe(false)
    // 其他分类目录不受影响，证明 filter 只按分类目录前缀过滤，不是过度过滤
    expect(await fs.pathExists(join(dir, 'skills', 'ly', 'tools'))).toBe(true)
    expect(await fs.pathExists(join(dir, 'skills', 'ly', 'domains'))).toBe(true)
  }, 60000)
})
