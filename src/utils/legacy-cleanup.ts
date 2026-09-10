/**
 * legacy-cleanup — 回收 v2.0 瘦身前历史安装的上游遗产产物。
 *
 * 清理范围（存在才清，不存在跳过；单项失败记录不阻断）：
 * - ~/.claude/skills/ly/ 历史分类产物（domains/impeccable/tools/orchestration/scrapling/SKILL.md/run_skill.js）
 * - ~/.claude/commands/ly/ 分类生成器历史命令文件（指纹判据常量化，见 COMMAND_FILE_FINGERPRINTS）
 * - ~/.claude/hooks/ly/ 五个 hook 文件 + ~/.claude/settings.json 指向它们的注册项
 *   + permissions.allow 中包含 codeagent-wrapper 的条目
 * - ~/.claude/output-styles/ ly 安装的风格文件
 * - ~/.claude/rules/ly-skill-routing.md
 * - MCP 注册项（旧版 LY_MCP_IDS 全集）：~/.claude.json mcpServers、~/.gemini/settings.json mcpServers、
 *   ~/.codex/config.toml 中 `<key> =` 单行条目、~/.contextweaver/
 * - ~/.codex/ Codex Mode 产物（AGENTS.md LY 区块、config.toml 头部 ly-workflow 注释 + features.multi_agent_v2 表、
 *   hooks.json、hooks/ly-workflow.py、agents/ly-*.toml、.ly-version）
 * - ~/.claude/bin/codeagent-wrapper 旧 Go 二进制
 *
 * 所有目标目录均可注入（claudeDir/codexDir/homeDir），默认基于真实 homedir() 计算以便测试隔离。
 */
import * as fs from 'fs-extra'
import { homedir } from 'node:os'
import { join } from 'node:path'

export interface CleanupResult {
  cleaned: string[]
  skipped: string[]
  failed: string[]
}

export interface CleanupOptions {
  claudeDir?: string
  codexDir?: string
  homeDir?: string
}

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

/** 本工具注册的 MCP server key（旧版 LY_MCP_IDS 全集，兼容 em dash 变体标记） */
const MCP_SERVER_KEYS = ['ace-tool', 'ace-tool-rs', 'contextweaver', 'grok-search', 'context7', 'fast-context']

interface Dirs {
  claudeDir: string
  codexDir: string
  homeDir: string
}

async function removePath(target: string): Promise<void> {
  await fs.remove(target)
}

/** 仅移除 settings.json 中指向 hooks/ly 的 hook 注册条目与 permissions.allow 中含 codeagent-wrapper 的条目，其余不动；原子写 */
async function cleanupSettingsJsonHooks(result: CleanupResult, dirs: Dirs): Promise<void> {
  const settingsPath = join(dirs.claudeDir, 'settings.json')
  if (!(await fs.pathExists(settingsPath))) {
    result.skipped.push('settings.json (not found)')
    return
  }
  try {
    const raw = await fs.readFile(settingsPath, 'utf-8')
    const settings = JSON.parse(raw) as {
      hooks?: Record<string, { matcher?: string, hooks?: { command?: string }[] }[]>
      permissions?: { allow?: string[] }
    }
    const hookMarker = join(dirs.claudeDir, 'hooks', 'ly')
    let hooksRemoved = 0
    if (settings.hooks) {
      for (const entries of Object.values(settings.hooks)) {
        for (const entry of entries) {
          if (entry.hooks) {
            const before = entry.hooks.length
            entry.hooks = entry.hooks.filter(h => !(h.command && h.command.includes(hookMarker)))
            hooksRemoved += before - entry.hooks.length
          }
        }
      }
    }

    let permsRemoved = 0
    if (settings.permissions?.allow) {
      const before = settings.permissions.allow.length
      settings.permissions.allow = settings.permissions.allow.filter(
        p => !(p === 'Bash(codeagent-wrapper*)' || p === 'Bash(*codeagent-wrapper*)'))
      permsRemoved = before - settings.permissions.allow.length
    }

    if (hooksRemoved > 0 || permsRemoved > 0) {
      const tmpPath = `${settingsPath}.tmp`
      await fs.writeFile(tmpPath, JSON.stringify(settings, null, 2))
      await fs.move(tmpPath, settingsPath, { overwrite: true })
      if (hooksRemoved > 0) result.cleaned.push(`settings.json hooks (${hooksRemoved} entries)`)
      if (permsRemoved > 0) result.cleaned.push(`settings.json permissions.allow (${permsRemoved} entries)`)
    } else {
      result.skipped.push('settings.json (no ly hook/permission entries)')
    }
  } catch (error) {
    result.failed.push(`settings.json: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/** AGENTS.md：剥 LY 管理区块（兼容 `<!-- LY:START` 与 `<!-- LY:START --` 两种起始标记） */
async function cleanupCodexAgentsMd(result: CleanupResult, dirs: Dirs): Promise<void> {
  const filePath = join(dirs.codexDir, 'AGENTS.md')
  if (!(await fs.pathExists(filePath))) {
    result.skipped.push('~/.codex/AGENTS.md (not found)')
    return
  }
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    const stripped = content.replace(/<!-- LY:START[\s\S]*?-- LY:END -->\n?/g, '')
    if (stripped !== content) {
      const tmpPath = `${filePath}.tmp`
      await fs.writeFile(tmpPath, stripped)
      await fs.move(tmpPath, filePath, { overwrite: true })
      result.cleaned.push('~/.codex/AGENTS.md (LY blocks stripped)')
    } else {
      result.skipped.push('~/.codex/AGENTS.md (no LY blocks)')
    }
  } catch (error) {
    result.failed.push(`~/.codex/AGENTS.md: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * config.toml（Codex Mode LY 区块）：精确行处理——
 * 删文件头部 `# ly-workflow ...` / `# Installed by: npx ly-workflow...` 注释行 +
 * `[features.multi_agent_v2]` 表（含其后至下一个 `[` 或 EOF 的键值行）。用户其余配置保留。
 */
async function cleanupCodexConfigTomlLyBlocks(result: CleanupResult, dirs: Dirs): Promise<void> {
  const filePath = join(dirs.codexDir, 'config.toml')
  if (!(await fs.pathExists(filePath))) {
    result.skipped.push('~/.codex/config.toml (not found)')
    return
  }
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    const lines = content.split('\n')
    const out: string[] = []
    let removed = false
    let inLyTable = false
    let headerZone = true // 仅文件头部（首个非空非注释行之前）匹配 ly-workflow 注释行
    for (const line of lines) {
      const trimmed = line.trim()
      if (headerZone && trimmed.startsWith('#')) {
        if (/^#\s*ly-workflow/.test(trimmed) || /^#\s*Installed by: npx ly-workflow/.test(trimmed)) {
          removed = true
          continue
        }
        out.push(line)
        continue
      }
      if (trimmed !== '') headerZone = false
      if (inLyTable) {
        if (trimmed.startsWith('[')) {
          inLyTable = false // 下一个表开始，该行按正常逻辑处理
        } else {
          removed = true
          continue
        }
      }
      if (trimmed.startsWith('[features.multi_agent_v2]')) {
        removed = true
        inLyTable = true
        continue
      }
      out.push(line)
    }
    if (removed) {
      const tmpPath = `${filePath}.tmp`
      await fs.writeFile(tmpPath, out.join('\n'))
      await fs.move(tmpPath, filePath, { overwrite: true })
      result.cleaned.push('~/.codex/config.toml (LY blocks stripped)')
    } else {
      result.skipped.push('~/.codex/config.toml (no LY blocks)')
    }
  } catch (error) {
    result.failed.push(`~/.codex/config.toml: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function cleanupCodexMode(result: CleanupResult, dirs: Dirs): Promise<void> {
  await cleanupCodexAgentsMd(result, dirs)
  await cleanupCodexConfigTomlLyBlocks(result, dirs)

  const codexFiles: [string, boolean][] = [
    ['hooks.json', false],
    [join('hooks', 'ly-workflow.py'), false],
    ['.ly-version', false],
  ]
  for (const [rel] of codexFiles) {
    const filePath = join(dirs.codexDir, rel)
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
  const agentsDir = join(dirs.codexDir, 'agents')
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

/** 从 JSON 配置的 mcpServers 对象中删除 MCP_SERVER_KEYS（按 key 删，其余来源不动） */
function removeMcpKeys(config: { mcpServers?: Record<string, unknown> }): string[] {
  const removed: string[] = []
  if (config.mcpServers) {
    for (const key of MCP_SERVER_KEYS) {
      if (key in config.mcpServers) {
        delete config.mcpServers[key]
        removed.push(key)
      }
    }
  }
  return removed
}

async function cleanupMcpRegistrations(result: CleanupResult, dirs: Dirs): Promise<void> {
  // ~/.claude.json
  const claudeJsonPath = join(dirs.homeDir, '.claude.json')
  if (await fs.pathExists(claudeJsonPath)) {
    try {
      const raw = await fs.readFile(claudeJsonPath, 'utf-8')
      const config = JSON.parse(raw) as { mcpServers?: Record<string, unknown> }
      const removed = removeMcpKeys(config)
      if (removed.length > 0) {
        const tmpPath = `${claudeJsonPath}.tmp`
        await fs.writeFile(tmpPath, JSON.stringify(config, null, 2))
        await fs.move(tmpPath, claudeJsonPath, { overwrite: true })
        result.cleaned.push(`~/.claude.json mcpServers (${removed.join(', ')})`)
      } else {
        result.skipped.push('~/.claude.json mcpServers (no ly-registered servers)')
      }
    } catch (error) {
      result.failed.push(`~/.claude.json: ${error instanceof Error ? error.message : String(error)}`)
    }
  } else {
    result.skipped.push('~/.claude.json (not found)')
  }

  // ~/.gemini/settings.json mcpServers
  const geminiSettingsPath = join(dirs.homeDir, '.gemini', 'settings.json')
  if (await fs.pathExists(geminiSettingsPath)) {
    try {
      const raw = await fs.readFile(geminiSettingsPath, 'utf-8')
      const settings = JSON.parse(raw) as { mcpServers?: Record<string, unknown> }
      const removed = removeMcpKeys(settings)
      if (removed.length > 0) {
        const tmpPath = `${geminiSettingsPath}.tmp`
        await fs.writeFile(tmpPath, JSON.stringify(settings, null, 2))
        await fs.move(tmpPath, geminiSettingsPath, { overwrite: true })
        result.cleaned.push(`~/.gemini/settings.json mcpServers (${removed.join(', ')})`)
      } else {
        result.skipped.push('~/.gemini/settings.json mcpServers (no ly-registered servers)')
      }
    } catch (error) {
      result.failed.push(`~/.gemini/settings.json: ${error instanceof Error ? error.message : String(error)}`)
    }
  } else {
    result.skipped.push('~/.gemini/settings.json (not found)')
  }

  // ~/.codex/config.toml 中 `<key> =` 单行条目（简单行级处理）
  const codexConfigPath = join(dirs.codexDir, 'config.toml')
  if (await fs.pathExists(codexConfigPath)) {
    try {
      const content = await fs.readFile(codexConfigPath, 'utf-8')
      const lines = content.split('\n')
      // 两种真实产物格式：内联 `key = { ... }`（手写）与 `[mcp_servers.<key>]` 表（smol-toml stringify）
      const out: string[] = []
      let removed = false
      let inLyTable = false
      for (const line of lines) {
        const trimmed = line.trim()
        if (inLyTable) {
          if (trimmed.startsWith('[')) {
            inLyTable = false // 下一个表开始，该行按正常逻辑处理
          } else {
            removed = true
            continue
          }
        }
        const tableMatch = trimmed.match(/^\[mcp_servers\."?([\w-]+)"?\]$/)
        if (tableMatch && MCP_SERVER_KEYS.includes(tableMatch[1])) {
          removed = true
          inLyTable = true
          continue
        }
        if (MCP_SERVER_KEYS.some(key => trimmed.startsWith(`${key} =`))) {
          removed = true
          continue
        }
        out.push(line)
      }
      if (removed) {
        const tmpPath = `${codexConfigPath}.tmp`
        await fs.writeFile(tmpPath, out.join('\n'))
        await fs.move(tmpPath, codexConfigPath, { overwrite: true })
        result.cleaned.push('~/.codex/config.toml mcpServers (ly-registered entries removed)')
      } else {
        result.skipped.push('~/.codex/config.toml mcpServers (no ly-registered entries)')
      }
    } catch (error) {
      result.failed.push(`~/.codex/config.toml: ${error instanceof Error ? error.message : String(error)}`)
    }
  } else {
    result.skipped.push('~/.codex/config.toml (not found)')
  }

  // ~/.contextweaver/
  const cwDir = join(dirs.homeDir, '.contextweaver')
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
 * 目录可注入（claudeDir/codexDir/homeDir），默认基于真实 homedir() 计算。
 */
export async function cleanupLegacyArtifacts(options: CleanupOptions = {}): Promise<CleanupResult> {
  const homeDir = options.homeDir ?? homedir()
  const dirs: Dirs = {
    claudeDir: options.claudeDir ?? join(homeDir, '.claude'),
    codexDir: options.codexDir ?? join(homeDir, '.codex'),
    homeDir,
  }
  const result: CleanupResult = { cleaned: [], skipped: [], failed: [] }

  // 1. skills/ly 历史分类产物 + domains
  const skillsLyDir = join(dirs.claudeDir, 'skills', 'ly')
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
  const commandsLyDir = join(dirs.claudeDir, 'commands', 'ly')
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

  // 3. hooks/ly 文件 + settings.json 注册项 + permissions
  const hooksLyDir = join(dirs.claudeDir, 'hooks', 'ly')
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
  await cleanupSettingsJsonHooks(result, dirs)

  // 4. output-styles
  const stylesDir = join(dirs.claudeDir, 'output-styles')
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
  const routingRule = join(dirs.claudeDir, 'rules', 'ly-skill-routing.md')
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

  // 6. MCP 注册项（~/.claude.json + ~/.gemini/settings.json + ~/.codex/config.toml + ~/.contextweaver）
  await cleanupMcpRegistrations(result, dirs)

  // 7. ~/.codex Codex Mode 产物
  await cleanupCodexMode(result, dirs)

  // 8. 旧 Go 二进制
  for (const name of ['codeagent-wrapper', 'codeagent-wrapper.exe']) {
    const wrapperPath = join(dirs.claudeDir, 'bin', name)
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

/** 汇总打印清理结果（供 update/uninstall/init 主流程调用）：清理/跳过/失败 逐项报告 */
export function reportCleanupResult(result: CleanupResult): void {
  if (result.cleaned.length > 0) {
    console.log(`  ✓ 遗产清理 cleaned: ${result.cleaned.length} 项`)
    for (const item of result.cleaned) console.log(`    - ${item}`)
  }
  if (result.skipped.length > 0) {
    console.log(`  - 遗产清理 skipped: ${result.skipped.length} 项（不存在或无需处理）`)
    for (const item of result.skipped) console.log(`    - ${item}`)
  }
  if (result.failed.length > 0) {
    console.log('  ⚠ 遗产清理失败（不阻断）:')
    for (const item of result.failed) console.log(`    - ${item}`)
  }
}
