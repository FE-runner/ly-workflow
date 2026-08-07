import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterAll, describe, expect, it } from 'vitest'
import fs from 'fs-extra'
import { getAllCommandIds, installWorkflows } from '../installer'

const ALL_IDS = getAllCommandIds()

// Collect all .md files recursively
function collectMdFiles(dir: string): string[] {
  const files: string[] = []
  if (!fs.existsSync(dir))
    return files
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory())
      files.push(...collectMdFiles(full))
    else if (entry.name.endsWith('.md'))
      files.push(full)
  }
  return files
}

// ─────────────────────────────────────────────────────────────
// E2E: installWorkflows with mcpProvider='skip'
// ─────────────────────────────────────────────────────────────
// Note: none of the 7 ly:* commands currently reference {{MCP_SEARCH_TOOL}}
// (they're thin opsx delegators or git tools), so this suite only asserts
// the install completes cleanly and leaves no unreplaced template variables.
describe('installWorkflows E2E — mcpProvider="skip"', () => {
  const tmpDir = join(tmpdir(), `ly-test-skip-${Date.now()}`)

  afterAll(async () => {
    await fs.remove(tmpDir)
  })

  // 依赖真实网络下载 codeagent-wrapper 二进制，本地/CI 网络抖动会超时，跳过
  it.skip('installs all workflows without errors', async () => {
    const result = await installWorkflows(ALL_IDS, tmpDir, true, {
      mcpProvider: 'skip',
    })
    expect(result.success).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.installedCommands.length).toBeGreaterThan(0)
  }, 15000)

  // 依赖上面被跳过的安装用例产出的文件，同样跟着跳过
  it.skip('generated command files contain no unreplaced MCP template variables', async () => {
    const cmdDir = join(tmpDir, 'commands', 'ly')
    const files = collectMdFiles(cmdDir)
    expect(files.length).toBeGreaterThan(0)

    for (const file of files) {
      const content = readFileSync(file, 'utf-8')
      const rel = file.replace(tmpDir + '/', '')
      expect(content, `${rel} should not contain mcp__ace-tool`).not.toContain('mcp__ace-tool__search_context')
      expect(content, `${rel} should not contain {{MCP_SEARCH_TOOL}}`).not.toContain('{{MCP_SEARCH_TOOL}}')
      expect(content, `${rel} should not contain {{MCP_SEARCH_PARAM}}`).not.toContain('{{MCP_SEARCH_PARAM}}')
    }
  })
})

// ─────────────────────────────────────────────────────────────
// E2E: installWorkflows with mcpProvider='ace-tool' (control)
// ─────────────────────────────────────────────────────────────
describe('installWorkflows E2E — mcpProvider="ace-tool" (control)', () => {
  const tmpDir = join(tmpdir(), `ly-test-ace-${Date.now()}`)

  afterAll(async () => {
    await fs.remove(tmpDir)
  })

  // 依赖真实网络下载 codeagent-wrapper 二进制，本地/CI 网络抖动会超时，跳过
  it.skip('installs all workflows and completes without errors', async () => {
    const result = await installWorkflows(ALL_IDS, tmpDir, true, {
      mcpProvider: 'ace-tool',
    })
    expect(result.success).toBe(true)
    expect(result.errors).toEqual([])
  })
})
