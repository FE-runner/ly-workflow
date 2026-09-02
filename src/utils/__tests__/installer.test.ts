import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterAll, describe, expect, it } from 'vitest'
import fs from 'fs-extra'
import { getAllCommandIds, getWorkflowById, getWorkflowConfigs, injectConfigVariables, installWorkflows, uninstallWorkflows } from '../installer'

// Helper: find package root
function findPackageRoot(): string {
  let dir = import.meta.dirname
  for (let i = 0; i < 10; i++) {
    try {
      readFileSync(join(dir, 'package.json'))
      return dir
    }
    catch {
      dir = join(dir, '..')
    }
  }
  throw new Error('Could not find package root')
}

const PACKAGE_ROOT = findPackageRoot()
const TEMPLATES_DIR = join(PACKAGE_ROOT, 'templates', 'commands')

// ─────────────────────────────────────────────────────────────
// A. Workflow registry consistency
// ─────────────────────────────────────────────────────────────
describe('workflow registry', () => {
  it('getAllCommandIds returns the 14 core commands', () => {
    const ids = getAllCommandIds()
    expect(ids.length).toBe(14)
  })

  it('every command ID has a matching template file', () => {
    const ids = getAllCommandIds()
    for (const id of ids) {
      const workflow = getWorkflowById(id)
      expect(workflow, `workflow config missing for: ${id}`).toBeDefined()
      for (const cmd of workflow!.commands) {
        const corePath = join(TEMPLATES_DIR, `${cmd}.md`)
        expect(fs.existsSync(corePath), `template missing: ${cmd}.md`).toBe(true)
      }
    }
  })

  it('every template file has a matching workflow config', () => {
    const coreFiles = readdirSync(TEMPLATES_DIR)
      .filter(f => f.endsWith('.md'))
      .map(f => f.replace('.md', ''))
    const allCommands = getAllCommandIds()
      .flatMap(id => getWorkflowById(id)!.commands)

    for (const template of coreFiles) {
      expect(
        allCommands.includes(template),
        `template "${template}.md" has no workflow config`,
      ).toBe(true)
    }
  })

  it('getWorkflowConfigs returns sorted by order', () => {
    const configs = getWorkflowConfigs()
    for (let i = 1; i < configs.length; i++) {
      expect(configs[i].order).toBeGreaterThanOrEqual(configs[i - 1].order)
    }
  })

  it('all workflows have both name and nameEn', () => {
    const configs = getWorkflowConfigs()
    for (const config of configs) {
      expect(config.name, `${config.id} missing name`).toBeTruthy()
      expect(config.nameEn, `${config.id} missing nameEn`).toBeTruthy()
    }
  })

  it('all workflow IDs are unique', () => {
    const ids = getAllCommandIds()
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('getWorkflowById returns undefined for unknown id', () => {
    expect(getWorkflowById('nonexistent')).toBeUndefined()
  })

  it('release category commands have templates and are registered with category release', () => {
    const releaseConfigs = getWorkflowConfigs().filter(w => w.category === 'release')
    expect(releaseConfigs.map(w => w.id).sort()).toEqual(['changelog', 'publish', 'release'])

    for (const cfg of releaseConfigs) {
      for (const cmd of cfg.commands) {
        const corePath = join(TEMPLATES_DIR, `${cmd}.md`)
        expect(fs.existsSync(corePath), `template missing for release command: ${cmd}.md`).toBe(true)
      }
    }
  })
})

// ─────────────────────────────────────────────────────────────
// B. injectConfigVariables — routing & liteMode
// ─────────────────────────────────────────────────────────────
describe('injectConfigVariables — routing variables', () => {
  it('injects reviewer model', () => {
    const input = 'reviewer: {{REVIEWER_MODEL}}'
    const result = injectConfigVariables(input, {
      routing: { reviewer: 'hermes' },
    })
    expect(result).toBe('reviewer: hermes')
  })

  it('defaults to codex when reviewer not specified', () => {
    const input = 'reviewer: {{REVIEWER_MODEL}}'
    const result = injectConfigVariables(input, {})
    expect(result).toBe('reviewer: codex')
  })

  it('injects implementer model', () => {
    const input = 'implementer: {{IMPLEMENTER_MODEL}}'
    const result = injectConfigVariables(input, {
      routing: { implementer: 'openclaw' },
    })
    expect(result).toBe('implementer: openclaw')
  })

  it('defaults to claude when implementer not specified', () => {
    const input = 'implementer: {{IMPLEMENTER_MODEL}}'
    const result = injectConfigVariables(input, {})
    expect(result).toBe('implementer: claude')
  })
})

// ─────────────────────────────────────────────────────────────
// B2. Implementer conditional blocks (apply.md)
// ─────────────────────────────────────────────────────────────
describe('injectConfigVariables — implementer conditional blocks', () => {
  const externalBlock = '<!-- LY:IF:IMPLEMENTER_EXTERNAL -->\nEXT_BODY\n<!-- LY:ENDIF -->'
  const claudeBlock = '<!-- LY:IF:IMPLEMENTER_CLAUDE -->\nCLAUDE_BODY\n<!-- LY:ENDIF -->'
  const template = `${externalBlock}\nSHARED\n${claudeBlock}`

  it('keeps only the external block when implementer is external', () => {
    const result = injectConfigVariables(template, { routing: { implementer: 'codex' } })
    expect(result).toContain('EXT_BODY')
    expect(result).not.toContain('CLAUDE_BODY')
    expect(result).toContain('SHARED')
    expect(result).not.toContain('LY:IF')
    expect(result).not.toContain('LY:ENDIF')
  })

  it('keeps only the external block for hermes/openclaw', () => {
    for (const backend of ['hermes', 'openclaw']) {
      const result = injectConfigVariables(template, { routing: { implementer: backend } })
      expect(result).toContain('EXT_BODY')
      expect(result).not.toContain('CLAUDE_BODY')
      expect(result).not.toContain('LY:IF')
    }
  })

  it('keeps only the claude block when implementer is claude', () => {
    const result = injectConfigVariables(template, { routing: { implementer: 'claude' } })
    expect(result).toContain('CLAUDE_BODY')
    expect(result).not.toContain('EXT_BODY')
    expect(result).toContain('SHARED')
    expect(result).not.toContain('LY:IF')
    expect(result).not.toContain('LY:ENDIF')
  })

  it('defaults to claude branch when implementer not specified', () => {
    const result = injectConfigVariables(template, {})
    expect(result).toContain('CLAUDE_BODY')
    expect(result).not.toContain('EXT_BODY')
  })

  it('throws when a conditional is unclosed', () => {
    expect(() => injectConfigVariables('<!-- LY:IF:IMPLEMENTER_EXTERNAL -->\nBODY\n', { routing: { implementer: 'codex' } }))
      .toThrow(/unclosed\/stray implementer conditional/)
  })

  it('throws on unknown conditional marker', () => {
    expect(() => injectConfigVariables('<!-- LY:IF:IMPLEMENTER_FOO -->\nBODY\n<!-- LY:ENDIF -->', { routing: { implementer: 'codex' } }))
      .toThrow(/unknown implementer conditional/)
  })

  it('nested / two-branch-with-single-endif form still errors', () => {
    expect(() => injectConfigVariables(
      '<!-- LY:IF:IMPLEMENTER_EXTERNAL -->\nA\n<!-- LY:IF:IMPLEMENTER_CLAUDE -->\nB\n<!-- LY:ENDIF -->',
      { routing: { implementer: 'hermes' } },
    )).toThrow(/unclosed\/stray implementer conditional/)
  })
})

describe('injectConfigVariables — apply.md render snapshots', () => {
  const applyTemplate = readFileSync(join(TEMPLATES_DIR, 'apply.md'), 'utf-8')

  it('renders the in-session implementation branch when implementer=claude (no wrapper)', () => {
    const result = injectConfigVariables(applyTemplate, {
      routing: { reviewer: 'codex', implementer: 'claude' },
      liteMode: false,
      mcpProvider: 'ace-tool',
    })
    // Claude branch present, external machinery absent (frontmatter description
    // still mentions both paths in general terms — assert the body only)
    const body = result.split('---', 3)[2] ?? ''
    expect(result).toContain('本人实施')
    expect(result).toContain('不委托任何外部 agent')
    expect(body).not.toContain('codeagent-wrapper')
    expect(body).not.toContain('OVERALL')
    expect(result).not.toContain('LY:IF')
    expect(result).not.toContain('LY:ENDIF')
    // Shared parts remain
    expect(result).toContain('确定目标 change 名')
    expect(result).toContain('git commit -m "apply:')
  })

  it('renders the wrapper delegation branch when implementer=codex/hermes/openclaw', () => {
    for (const backend of ['codex', 'hermes', 'openclaw']) {
      const result = injectConfigVariables(applyTemplate, {
        routing: { reviewer: 'codex', implementer: backend },
        liteMode: false,
        mcpProvider: 'ace-tool',
      })
      expect(result, `backend=${backend}`).toContain('委托 Implementer agent 单次 agentic 调用')
      expect(result).toContain(`--backend ${backend}`)
      expect(result).toContain('OVERALL')
      expect(result).not.toContain('IMPLEMENTER_CLAUDE')
      expect(result).not.toContain('不委托任何外部 agent')
      expect(result).not.toContain('LY:IF')
      expect(result).not.toContain('LY:ENDIF')
    }
  })

  it('throws when apply.md conditional is left unclosed', () => {
    const broken = applyTemplate.replace('<!-- LY:ENDIF -->', '')
    expect(() => injectConfigVariables(broken, { routing: { implementer: 'codex' } }))
      .toThrow(/unclosed\/stray implementer conditional/)
  })
})

describe('injectConfigVariables — liteMode', () => {
  it('injects --lite flag when liteMode is true', () => {
    const input = 'codeagent-wrapper {{LITE_MODE_FLAG}}--backend codex'
    const result = injectConfigVariables(input, { liteMode: true })
    expect(result).toBe('codeagent-wrapper --lite --backend codex')
  })

  it('injects empty string when liteMode is false', () => {
    const input = 'codeagent-wrapper {{LITE_MODE_FLAG}}--backend codex'
    const result = injectConfigVariables(input, { liteMode: false })
    expect(result).toBe('codeagent-wrapper --backend codex')
  })

  it('injects empty string when liteMode is not specified', () => {
    const input = 'codeagent-wrapper {{LITE_MODE_FLAG}}--backend codex'
    const result = injectConfigVariables(input, {})
    expect(result).toBe('codeagent-wrapper --backend codex')
  })
})

// ─────────────────────────────────────────────────────────────
// C. Template variable completeness
// ─────────────────────────────────────────────────────────────
describe('template variable completeness', () => {
  function collectTemplateFiles(dir: string): string[] {
    const files: string[] = []
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        files.push(...collectTemplateFiles(fullPath))
      }
      else if (entry.name.endsWith('.md')) {
        files.push(fullPath)
      }
    }
    return files
  }

  const allTemplates = collectTemplateFiles(TEMPLATES_DIR)

  it('finds template files', () => {
    expect(allTemplates.length).toBeGreaterThan(0)
  })

  for (const file of allTemplates) {
    const relativePath = file.replace(PACKAGE_ROOT + '/', '')

    it(`${relativePath}: no unprocessed {{variables}} after full injection`, () => {
      const content = readFileSync(file, 'utf-8')
      const result = injectConfigVariables(content, {
        routing: { reviewer: 'codex' },
        liteMode: false,
        mcpProvider: 'ace-tool',
      })

      // Find any remaining {{ }} template variables
      const remaining = result.match(/\{\{[A-Z_]+\}\}/g) || []
      // Filter out known non-ly variables (user-facing placeholders like {{项目路径}})
      const lyVars = remaining.filter(v =>
        !v.includes('项目') && !v.includes('相关') && !v.includes('WORKDIR'),
      )
      expect(lyVars, `unprocessed variables in ${relativePath}: ${lyVars.join(', ')}`).toEqual([])
    })
  }
})

// ─────────────────────────────────────────────────────────────
// D. installWorkflows E2E — contextweaver provider
// ─────────────────────────────────────────────────────────────
describe('installWorkflows E2E — mcpProvider="contextweaver"', () => {
  const tmpDir = join(tmpdir(), `ly-test-cw-${Date.now()}`)

  afterAll(async () => {
    await fs.remove(tmpDir)
  })

  // 依赖真实网络下载 codeagent-wrapper 二进制，本地/CI 网络抖动会超时，跳过
  it.skip('installs all workflows without errors', async () => {
    const result = await installWorkflows(getAllCommandIds(), tmpDir, true, {
      mcpProvider: 'contextweaver',
    })
    expect(result.success).toBe(true)
    expect(result.errors).toEqual([])
  }, 30_000)
})

// ─────────────────────────────────────────────────────────────
// E. uninstallWorkflows E2E
// ─────────────────────────────────────────────────────────────
describe('uninstallWorkflows E2E', () => {
  const tmpDir = join(tmpdir(), `ly-test-uninstall-${Date.now()}`)

  afterAll(async () => {
    await fs.remove(tmpDir)
  })

  // 依赖真实网络下载 codeagent-wrapper 二进制，本地/CI 网络抖动会超时，跳过
  it.skip('installs then uninstalls cleanly', async () => {
    // First install
    const installResult = await installWorkflows(getAllCommandIds(), tmpDir, true, {
      mcpProvider: 'ace-tool',
    })
    expect(installResult.success).toBe(true)

    // Verify files exist
    expect(fs.existsSync(join(tmpDir, 'commands', 'ly', 'commit.md'))).toBe(true)

    // Now uninstall
    const uninstallResult = await uninstallWorkflows(tmpDir)
    expect(uninstallResult.success).toBe(true)
    expect(uninstallResult.removedCommands.length).toBeGreaterThan(0)

    // Verify commands directory removed
    expect(fs.existsSync(join(tmpDir, 'commands', 'ly'))).toBe(false)
  })

  it('uninstall on empty dir succeeds without errors', async () => {
    const emptyDir = join(tmpdir(), `ly-test-empty-${Date.now()}`)
    const result = await uninstallWorkflows(emptyDir)
    expect(result.success).toBe(true)
    expect(result.errors).toEqual([])
    await fs.remove(emptyDir)
  })
})

// ─────────────────────────────────────────────────────────────
// F. Binary installation
// ─────────────────────────────────────────────────────────────
describe('installWorkflows — binary installation', () => {
  const tmpDir = join(tmpdir(), `ly-test-bin-${Date.now()}`)

  afterAll(async () => {
    await fs.remove(tmpDir)
  })

  // 依赖真实网络下载 codeagent-wrapper 二进制，本地/CI 网络抖动会超时，跳过
  it.skip('installs codeagent-wrapper binary for current platform', async () => {
    const result = await installWorkflows(['commit'], tmpDir, true, {
      mcpProvider: 'skip',
    })

    expect(result.binInstalled).toBe(true)
    expect(result.binPath).toBeTruthy()

    const binaryName = process.platform === 'win32' ? 'codeagent-wrapper.exe' : 'codeagent-wrapper'
    expect(fs.existsSync(join(result.binPath!, binaryName))).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────
// G. Prompts installation
// ─────────────────────────────────────────────────────────────
describe('installWorkflows — prompts installation', () => {
  const tmpDir = join(tmpdir(), `ly-test-prompts-${Date.now()}`)

  afterAll(async () => {
    await fs.remove(tmpDir)
  })

  // 依赖真实网络下载 codeagent-wrapper 二进制，本地/CI 网络抖动会超时，跳过
  it.skip('installs codex and claude prompts only', async () => {
    const result = await installWorkflows(getAllCommandIds(), tmpDir, true, {
      mcpProvider: 'skip',
    })
    expect(result.success).toBe(true)
    expect(result.installedPrompts.length).toBeGreaterThan(0)

    // Check model directories exist
    const promptsDir = join(tmpDir, '.ly', 'prompts')
    expect(fs.existsSync(join(promptsDir, 'codex'))).toBe(true)
    expect(fs.existsSync(join(promptsDir, 'claude'))).toBe(true)

    // Removed backends must not be installed
    expect(fs.existsSync(join(promptsDir, 'gemini'))).toBe(false)
    expect(fs.existsSync(join(promptsDir, 'grok'))).toBe(false)
    expect(fs.existsSync(join(promptsDir, 'antigravity'))).toBe(false)

    // Check at least one prompt per model
    const codexFiles = readdirSync(join(promptsDir, 'codex')).filter(f => f.endsWith('.md'))
    expect(codexFiles.length).toBeGreaterThanOrEqual(5)
  })
})

// ─────────────────────────────────────────────────────────────
// H. Skills namespace isolation (skills/ly/)
// ─────────────────────────────────────────────────────────────
describe('skills namespace isolation', () => {
  const tmpDir = join(tmpdir(), `ly-test-skills-${Date.now()}`)

  afterAll(async () => {
    await fs.remove(tmpDir)
  })

  // 依赖真实网络下载 codeagent-wrapper 二进制，本地/CI 网络抖动会超时，跳过
  it.skip('installs skills under skills/ly/ namespace', async () => {
    const result = await installWorkflows(['commit'], tmpDir, true, {
      mcpProvider: 'skip',
    })
    expect(result.success).toBe(true)
    expect(result.installedSkills).toBeGreaterThanOrEqual(6)

    // Skills must be under skills/ly/, not skills/ root
    expect(fs.existsSync(join(tmpDir, 'skills', 'ly', 'SKILL.md'))).toBe(true)
    expect(fs.existsSync(join(tmpDir, 'skills', 'ly', 'tools'))).toBe(true)
    expect(fs.existsSync(join(tmpDir, 'skills', 'ly', 'orchestration'))).toBe(true)
  })

  // 依赖真实网络下载 codeagent-wrapper 二进制，本地/CI 网络抖动会超时，跳过
  it.skip('uninstall only removes skills/ly/, preserves user skills', async () => {
    // Simulate a user-created skill at skills/my-custom-skill/SKILL.md
    const userSkillDir = join(tmpDir, 'skills', 'my-custom-skill')
    await fs.ensureDir(userSkillDir)
    await fs.writeFile(join(userSkillDir, 'SKILL.md'), '# My Custom Skill')

    // Uninstall
    const result = await uninstallWorkflows(tmpDir)
    expect(result.success).toBe(true)
    expect(result.removedSkills.length).toBeGreaterThan(0)

    // ly skills gone
    expect(fs.existsSync(join(tmpDir, 'skills', 'ly'))).toBe(false)

    // User skill preserved!
    expect(fs.existsSync(join(userSkillDir, 'SKILL.md'))).toBe(true)

    // Cleanup
    await fs.remove(userSkillDir)
  })
})
