import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { injectConfigVariables } from '../installer'

// Helper: find package root (mirrors the logic in installer.ts)
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
// Integration test with real templates
// ─────────────────────────────────────────────────────────────
describe('integration: real templates have no MCP placeholders', () => {
  // Collect all .md files under templates/commands/
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

  const templateFiles = collectTemplateFiles(TEMPLATES_DIR)

  it('no command template references {{MCP_SEARCH_TOOL}} / {{MCP_SEARCH_PARAM}}', () => {
    const filesWithMcpRef = templateFiles.filter((f) => {
      const content = readFileSync(f, 'utf-8')
      return content.includes('{{MCP_SEARCH_TOOL}}') || content.includes('{{MCP_SEARCH_PARAM}}')
    })
    expect(filesWithMcpRef).toEqual([])
  })
})
