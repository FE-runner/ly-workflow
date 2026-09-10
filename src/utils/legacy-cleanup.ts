/**
 * legacy-cleanup — 回收 v2.0 瘦身前历史安装的上游遗产产物。
 *
 * 清理范围（存在才清，不存在跳过；单项失败记录不阻断）：
 * - ~/.claude/skills/ly/ 历史分类产物（domains/impeccable/tools/orchestration/scrapling/SKILL.md/run_skill.js）
 * - ~/.claude/commands/ly/ 分类生成器历史命令文件（指纹判据常量化，见 COMMAND_FILE_FINGERPRINTS）
 * - ~/.claude/hooks/ly/ 五个 hook 文件 + ~/.claude/settings.json 指向它们的注册项
 * - ~/.claude/output-styles/ ly 安装的风格文件
 * - ~/.claude/rules/ly-skill-routing.md
 * - MCP 注册项：~/.claude.json mcpServers['ace-tool']（本工具注册的 server）、~/.contextweaver/
 * - ~/.codex/ Codex Mode 产物（AGENTS.md LY 区块、hooks.json、hooks/ly-workflow.py、agents/ly-*.toml、.ly-version、config.toml LY 区块）
 * - ~/.claude/bin/codeagent-wrapper 旧 Go 二进制
 */
import * as fs from 'fs-extra'
import { homedir } from 'node:os'
import { join } from 'node:path'

export interface CleanupResult {
  cleaned: string[]
  skipped: string[]
  failed: string[]
}

const CLAUDE_DIR = join(homedir(), '.claude')
const CODEX_DIR = join(homedir(), '.codex')

/** 历史分类产物（skills/ly/ 下），固定清单识别 */
const SKILLS_LY_LEGACY_ITEMS = [
  'domains', 'impeccable', 'tools', 'orchestration', 'scrapling',
  'SKILL.md', 'run_skill.js',
]

/**
 * 分类生成器历史命令文件的指纹判据（常量化保留——生成器代码已随瘦身删除）。
 * 判据 = 文件内含生成器固有标记行；用户自定义同名文件不含标记，不误删。
 */
const COMMAND_FILE_FINGERPRINTS: { file: string, marker: string }[] = [
  { file: 'gen-docs.md', marker: 'ly-workflow' },
  { file: 'verify-module.md', marker: 'ly-workflow' },
  { file: 'verify-security.md', marker: 'ly-workflow' },
  { file: 'verify-quality.md', marker: 'ly-workflow' },
  { file: 'verify-change.md', marker: 'ly-workflow' },
]

/** ly 安装的 output-styles 固定清单 */
const OUTPUT_STYLE_FILES = [
  'abyss-command.md', 'abyss-concise.md', 'abyss-cultivator.md', 'abyss-ritual.md',
  'engineer-professional.md', 'laowang-engineer.md', 'nekomata-engineer.md', 'ojousama-engineer.md',
]

/** 已退役的 hook 文件（~/.claude/hooks/ly/） */
const HOOK_FILES = [
  'task-utils.js', 'workflow-state.js', 'session-start.js',
  'subagent-context.js', 'skill-router.js',
]

/** 本工具注册的 MCP server key（~/.claude.json mcpServers） */
const MCP_SERVER_KEYS = ['ace-tool']

async function removePath(target: string): Promise<void> {
  await fs.remove(target)
}

/** 仅移除 settings.json 中指向 ~/.claude/hooks/ly/ 的 hook 注册条目，其余条目不动；原子写 */
async function cleanupSettingsJsonHooks(result: CleanupResult): Promise<void> {
  const settingsPath = join(CLAUDE_DIR, 'settings.json')
  if (!(await fs.pathExists(settingsPath))) {
    result.skipped.push('settings.json (not found)')
    return
  }
  try {
    const raw = await fs.readFile(settingsPath, 'utf-8')
    const settings = JSON.parse(raw) as {
      hooks?: Record<string, { matcher?: string, hooks?: { command?: string }[] }[]>
    }
    const marker = join(CLAUDE_DIR, 'hooks', 'ly')
    let removed = 0
    if (settings.hooks) {
      for (const entries of Object.values(settings.hooks)) {
        for (const entry of entries) {
          if (entry.hooks) {
            const before = entry.hooks.length
            entry.hooks = entry.hooks.filter(h => !(h.command && h.command.includes(marker)))
            removed += before - entry.hooks.length
          }
        }
      }
    }
    if (removed > 0) {
      const tmpPath = `${settingsPath}.tmp`
      await fs.writeFile(tmpPath, JSON.stringify(settings, null, 2))
      await fs.move(tmpPath, settingsPath, { overwrite: true })
      result.cleaned.push(`settings.json hooks (${removed} entries)`)
    } else {
      result.skipped.push('settings.json hooks (no ly entries)')
    }
  } catch (error) {
    result.failed.push(`settings.json: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function cleanupCodexMode(result: CleanupResult): Promise<void> {
  // AGENTS.md / config.toml 只剥 LY 管理区块
  for (const name of ['AGENTS.md', 'config.toml']) {
    const filePath = join(CODEX_DIR, name)
    if (!(await fs.pathExists(filePath))) {
      result.skipped.push(`~/.codex/${name} (not found)`)
      continue
    }
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      const stripped = content.replace(/<!-- LY:START --[\s\S]*?-- LY:END -->\n?/g, '')
        .replace(/# ly-workflow[\s\S]*?(?=\n\[|\n#|\s*$)/g, (m, offset: number, full: string) =>
          // config.toml 的 LY 说明注释块（仅当位于文件头部且属于 ly-workflow 标记注释）
          offset === 0 && full.slice(0, 200).includes('ly-workflow') ? '' : m)
      if (stripped !== content) {
        const tmpPath = `${filePath}.tmp`
        await fs.writeFile(tmpPath, stripped)
        await fs.move(tmpPath, filePath, { overwrite: true })
        result.cleaned.push(`~/.codex/${name} (LY blocks stripped)`)
      } else {
        result.skipped.push(`~/.codex/${name} (no LY blocks)`)
      }
    } catch (error) {
      result.failed.push(`~/.codex/${name}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const codexFiles: [string, boolean][] = [
    ['hooks.json', false],
    [join('hooks', 'ly-workflow.py'), false],
    ['.ly-version', false],
  ]
  for (const [rel] of codexFiles) {
    const filePath = join(CODEX_DIR, rel)
    if (await fs.pathExists(filePath)) {
      try {
        await removePath(filePath)
        result.cleaned.push(`~/.codex/${rel}`)
      } catch (error) {
        result.failed.push(`~/.codex/${rel}: ${error instanceof Error ? error.message : String(error)}`)
      }
    } else {
      result.skipped.push(`~/.codex/${rel} (not found)`)
    }
  }

  // agents/ly-*.toml
  const agentsDir = join(CODEX_DIR, 'agents')
  if (await fs.pathExists(agentsDir)) {
    try {
      for (const file of await fs.readdir(agentsDir)) {
        if (file.startsWith('ly-') && file.endsWith('.toml')) {
          await removePath(join(agentsDir, file))
          result.cleaned.push(`~/.codex/agents/${file}`)
        }
      }
    } catch (error) {
      result.failed.push(`~/.codex/agents: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

async function cleanupMcpRegistrations(result: CleanupResult): Promise<void> {
  const claudeJsonPath = join(homedir(), '.claude.json')
  if (await fs.pathExists(claudeJsonPath)) {
    try {
      const raw = await fs.readFile(claudeJsonPath, 'utf-8')
      const config = JSON.parse(raw) as { mcpServers?: Record<string, unknown> }
      let removed = false
      if (config.mcpServers) {
        for (const key of MCP_SERVER_KEYS) {
          if (key in config.mcpServers) {
            delete config.mcpServers[key]
            removed = true
          }
        }
      }
      if (removed) {
        const tmpPath = `${claudeJsonPath}.tmp`
        await fs.writeFile(tmpPath, JSON.stringify(config, null, 2))
        await fs.move(tmpPath, claudeJsonPath, { overwrite: true })
        result.cleaned.push(`~/.claude.json mcpServers (${MCP_SERVER_KEYS.join(', ')})`)
      } else {
        result.skipped.push('~/.claude.json mcpServers (no ly-registered servers)')
      }
    } catch (error) {
      result.failed.push(`~/.claude.json: ${error instanceof Error ? error.message : String(error)}`)
    }
  } else {
    result.skipped.push('~/.claude.json (not found)')
  }

  const cwDir = join(homedir(), '.contextweaver')
  if (await fs.pathExists(cwDir)) {
    try {
      await removePath(cwDir)
      result.cleaned.push('~/.contextweaver/')
    } catch (error) {
      result.failed.push(`~/.contextweaver: ${error instanceof Error ? error.message : String(error)}`)
    }
  } else {
    result.skipped.push('~/.contextweaver (not found)')
  }
}

/**
 * 执行全部遗产清理。幂等：重复运行全部按"不存在"跳过。
 * 单项失败记录进 result.failed，不抛出、不中断。
 */
export async function cleanupLegacyArtifacts(): Promise<CleanupResult> {
  const result: CleanupResult = { cleaned: [], skipped: [], failed: [] }

  // 1. skills/ly 历史分类产物 + domains
  const skillsLyDir = join(CLAUDE_DIR, 'skills', 'ly')
  for (const item of SKILLS_LY_LEGACY_ITEMS) {
    const target = join(skillsLyDir, item)
    if (await fs.pathExists(target)) {
      try {
        await removePath(target)
        result.cleaned.push(`skills/ly/${item}`)
      } catch (error) {
        result.failed.push(`skills/ly/${item}: ${error instanceof Error ? error.message : String(error)}`)
      }
    } else {
      result.skipped.push(`skills/ly/${item} (not found)`)
    }
  }

  // 2. commands/ly 生成器历史命令文件（指纹识别，不误删用户自定义）
  const commandsLyDir = join(CLAUDE_DIR, 'commands', 'ly')
  if (await fs.pathExists(commandsLyDir)) {
    for (const { file, marker } of COMMAND_FILE_FINGERPRINTS) {
      const filePath = join(commandsLyDir, file)
      if (!(await fs.pathExists(filePath))) {
        result.skipped.push(`commands/ly/${file} (not found)`)
        continue
      }
      try {
        const content = await fs.readFile(filePath, 'utf-8')
        if (content.includes(marker)) {
          await removePath(filePath)
          result.cleaned.push(`commands/ly/${file} (fingerprint matched)`)
        } else {
          result.skipped.push(`commands/ly/${file} (no fingerprint — user file kept)`)
        }
      } catch (error) {
        result.failed.push(`commands/ly/${file}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }

  // 3. hooks/ly 文件 + settings.json 注册项
  const hooksLyDir = join(CLAUDE_DIR, 'hooks', 'ly')
  for (const file of HOOK_FILES) {
    const filePath = join(hooksLyDir, file)
    if (await fs.pathExists(filePath)) {
      try {
        await removePath(filePath)
        result.cleaned.push(`hooks/ly/${file}`)
      } catch (error) {
        result.failed.push(`hooks/ly/${file}: ${error instanceof Error ? error.message : String(error)}`)
      }
    } else {
      result.skipped.push(`hooks/ly/${file} (not found)`)
    }
  }
  await cleanupSettingsJsonHooks(result)

  // 4. output-styles
  const stylesDir = join(CLAUDE_DIR, 'output-styles')
  for (const file of OUTPUT_STYLE_FILES) {
    const filePath = join(stylesDir, file)
    if (await fs.pathExists(filePath)) {
      try {
        await removePath(filePath)
        result.cleaned.push(`output-styles/${file}`)
      } catch (error) {
        result.failed.push(`output-styles/${file}: ${error instanceof Error ? error.message : String(error)}`)
      }
    } else {
      result.skipped.push(`output-styles/${file} (not found)`)
    }
  }

  // 5. rules/ly-skill-routing.md
  const routingRule = join(CLAUDE_DIR, 'rules', 'ly-skill-routing.md')
  if (await fs.pathExists(routingRule)) {
    try {
      await removePath(routingRule)
      result.cleaned.push('rules/ly-skill-routing.md')
    } catch (error) {
      result.failed.push(`rules/ly-skill-routing.md: ${error instanceof Error ? error.message : String(error)}`)
    }
  } else {
    result.skipped.push('rules/ly-skill-routing.md (not found)')
  }

  // 6. MCP 注册项
  await cleanupMcpRegistrations(result)

  // 7. ~/.codex Codex Mode 产物
  await cleanupCodexMode(result)

  // 8. 旧 Go 二进制
  for (const name of ['codeagent-wrapper', 'codeagent-wrapper.exe']) {
    const wrapperPath = join(CLAUDE_DIR, 'bin', name)
    if (await fs.pathExists(wrapperPath)) {
      try {
        await removePath(wrapperPath)
        result.cleaned.push(`bin/${name}`)
      } catch (error) {
        result.failed.push(`bin/${name}: ${error instanceof Error ? error.message : String(error)}`)
      }
    } else {
      result.skipped.push(`bin/${name} (not found)`)
    }
  }

  return result
}

/** 汇总打印清理结果（供 update/uninstall 主流程调用） */
export function reportCleanupResult(result: CleanupResult): void {
  if (result.cleaned.length > 0) {
    console.log(`  ✓ 遗产清理 cleaned: ${result.cleaned.length} 项`)
    for (const item of result.cleaned) console.log(`    - ${item}`)
  }
  if (result.failed.length > 0) {
    console.log('  ⚠ 遗产清理失败（不阻断）:')
    for (const item of result.failed) console.log(`    - ${item}`)
  }
}
