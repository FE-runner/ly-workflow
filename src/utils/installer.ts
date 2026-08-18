import type { InstallResult } from '../types'
import { homedir } from 'node:os'
import ansis from 'ansis'
import fs from 'fs-extra'
import { basename, join, relative, sep } from 'pathe'
import { getWorkflowById } from './installer-data'
import { PACKAGE_ROOT, injectConfigVariables, replaceHomePathsInTemplate } from './installer-template'
import { readLyConfig } from './config'
import { CATEGORY_DIR_MAP, installSkillCommands } from './skill-registry'
import type { SkillCategory } from './skill-registry'
import { version as packageVersion } from '../../package.json'

// ═══════════════════════════════════════════════════════
// Re-exports — all consumers import from './installer'
// These re-exports preserve backward compatibility.
// ═══════════════════════════════════════════════════════

export {
  getAllCommandIds,
  getCoreCommandIds,
  getWorkflowById,
  getWorkflowConfigs,
  getWorkflowPreset,
  WORKFLOW_PRESETS,
} from './installer-data'
export type { WorkflowPreset } from './installer-data'

export { injectConfigVariables } from './installer-template'

export {
  installAceTool,
  installAceToolRs,
  installContextWeaver,
  installFastContext,
  installMcpServer,
  syncMcpToCodex,
  syncMcpToGemini,
  uninstallAceTool,
  uninstallContextWeaver,
  uninstallFastContext,
  uninstallMcpServer,
} from './installer-mcp'
export type { ContextWeaverConfig } from './installer-mcp'

import {
  removeFastContextPrompt,
  writeFastContextPrompt,
} from './installer-prompt'
export {
  removeFastContextPrompt,
  writeFastContextPrompt,
}

export {
  collectInvocableSkills,
  collectSkills,
  parseFrontmatter,
} from './skill-registry'
export type { SkillMeta } from './skill-registry'

// ═══════════════════════════════════════════════════════
// Binary version tracking
// ═══════════════════════════════════════════════════════

/**
 * Expected codeagent-wrapper binary version.
 * Must match the `version` constant in codeagent-wrapper/main.go.
 * When this differs from the installed binary, update triggers re-download.
 */
const EXPECTED_BINARY_VERSION = '6.1.0'

// ═══════════════════════════════════════════════════════
// Install context — shared across sub-functions
// ═══════════════════════════════════════════════════════

interface InstallConfig {
  routing: {
    reviewer?: string
  }
  liteMode: boolean
  mcpProvider: string
  skipImpeccable?: boolean
}

interface InstallContext {
  installDir: string
  force: boolean
  config: InstallConfig
  templateDir: string
  result: InstallResult
}

// ═══════════════════════════════════════════════════════
// Binary download
// ═══════════════════════════════════════════════════════

const GITHUB_REPO = 'FE-runner/ly-workflow'
const RELEASE_TAG = 'preset'

/** Download sources: R2 CDN first (China-friendly) → GitHub fallback (global) */
const BINARY_SOURCES = [
  { name: 'Cloudflare CDN', url: 'https://github.20031227.xyz/preset', timeoutMs: 30_000 },
  { name: 'GitHub Release', url: `https://github.com/${GITHUB_REPO}/releases/download/${RELEASE_TAG}`, timeoutMs: 120_000 },
]

/**
 * Download binary from a single URL with retry.
 * Uses curl for proxy support (reads HTTPS_PROXY / ALL_PROXY env vars automatically).
 * Falls back to Node.js fetch if curl is unavailable.
 */
async function downloadFromUrl(url: string, destPath: string, timeoutMs: number, maxAttempts = 2): Promise<boolean> {
  const timeoutSec = Math.ceil(timeoutMs / 1000)

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // Prefer curl — auto-reads HTTPS_PROXY / ALL_PROXY for proxy support
      const { execSync } = await import('node:child_process')
      execSync(
        `curl -fsSL --max-time ${timeoutSec} -o "${destPath}" "${url}"`,
        { stdio: 'pipe', timeout: timeoutMs + 5000 },
      )

      if (process.platform !== 'win32') {
        await fs.chmod(destPath, 0o755)
      }
      return true
    }
    catch {
      // curl failed — try Node.js fetch as fallback (no proxy support)
      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), timeoutMs)

        const response = await fetch(url, { redirect: 'follow', signal: controller.signal })
        if (!response.ok) {
          clearTimeout(timer)
          if (attempt < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, attempt * 2000))
            continue
          }
          return false
        }

        const buffer = Buffer.from(await response.arrayBuffer())
        clearTimeout(timer)

        await fs.writeFile(destPath, buffer)
        if (process.platform !== 'win32') {
          await fs.chmod(destPath, 0o755)
        }
        return true
      }
      catch {
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, attempt * 2000))
          continue
        }
        return false
      }
    }
  }
  return false
}

/**
 * Download codeagent-wrapper binary with dual-source fallback.
 * Strategy: R2 mirror (60s) → GitHub Release (120s). Uses curl for proxy support.
 */
async function downloadBinaryFromRelease(binaryName: string, destPath: string): Promise<boolean> {
  for (const source of BINARY_SOURCES) {
    const url = `${source.url}/${binaryName}`
    const ok = await downloadFromUrl(url, destPath, source.timeoutMs)
    if (ok) return true
  }
  return false
}

// ═══════════════════════════════════════════════════════
// Shared file-copy helper
// ═══════════════════════════════════════════════════════

/**
 * Copy .md templates from srcDir → destDir with optional variable injection.
 * Returns list of installed file stems (filename without .md).
 */
async function copyMdTemplates(
  ctx: InstallContext,
  srcDir: string,
  destDir: string,
  options: { inject?: boolean } = {},
): Promise<string[]> {
  const installed: string[] = []
  if (!(await fs.pathExists(srcDir))) {
    // Log warning — helps diagnose "0 commands installed" issues
    console.error(`[ly-workflow] Template source directory not found: ${srcDir}`)
    return installed
  }

  await fs.ensureDir(destDir)
  const files = await fs.readdir(srcDir)
  for (const file of files) {
    if (!file.endsWith('.md')) continue
    const destFile = join(destDir, file)
    if (ctx.force || !(await fs.pathExists(destFile))) {
      let content = await fs.readFile(join(srcDir, file), 'utf-8')
      if (options.inject) content = injectConfigVariables(content, ctx.config)
      content = replaceHomePathsInTemplate(content, ctx.installDir)
      await fs.writeFile(destFile, content, 'utf-8')
      installed.push(file.replace('.md', ''))
    }
  }
  return installed
}

// ═══════════════════════════════════════════════════════
// Install sub-steps
// ═══════════════════════════════════════════════════════

/**
 * Install slash command .md files from templates/commands/
 */
async function installCommandFiles(ctx: InstallContext, workflowIds: string[]): Promise<void> {
  const commandsDir = join(ctx.installDir, 'commands', 'ly')

  for (const workflowId of workflowIds) {
    const workflow = getWorkflowById(workflowId)
    if (!workflow) {
      ctx.result.errors.push(`Unknown workflow: ${workflowId}`)
      continue
    }

    for (const cmd of workflow.commands) {
      const srcFile = join(ctx.templateDir, 'commands', `${cmd}.md`)
      const destFile = join(commandsDir, `${cmd}.md`)

      try {
        if (await fs.pathExists(srcFile)) {
          if (ctx.force || !(await fs.pathExists(destFile))) {
            let content = await fs.readFile(srcFile, 'utf-8')
            content = injectConfigVariables(content, ctx.config)
            content = replaceHomePathsInTemplate(content, ctx.installDir)
            await fs.writeFile(destFile, content, 'utf-8')
          }
          ctx.result.installedCommands.push(cmd)
        }
        else {
          const placeholder = `---
description: "${workflow.descriptionEn}"
---

# /ly:${cmd}

${workflow.description}
`
          await fs.writeFile(destFile, placeholder, 'utf-8')
          ctx.result.installedCommands.push(cmd)
        }
      }
      catch (error) {
        ctx.result.errors.push(`Failed to install ${cmd}: ${error}`)
        ctx.result.success = false
      }
    }
  }
}

/**
 * Install agent .md files from templates/commands/agents/
 */
async function installAgentFiles(ctx: InstallContext): Promise<void> {
  try {
    await copyMdTemplates(
      ctx,
      join(ctx.templateDir, 'commands', 'agents'),
      join(ctx.installDir, 'agents', 'ly'),
      { inject: true },
    )
  }
  catch (error) {
    ctx.result.errors.push(`Failed to install agents: ${error}`)
    ctx.result.success = false
  }
}

/**
 * Install expert prompt .md files from templates/prompts/{codex,gemini,claude}/
 */
async function installPromptFiles(ctx: InstallContext): Promise<void> {
  const promptsTemplateDir = join(ctx.templateDir, 'prompts')
  const promptsDir = join(ctx.installDir, '.ly', 'prompts')
  if (!(await fs.pathExists(promptsTemplateDir))) {
    ctx.result.errors.push(`Prompts template directory not found: ${promptsTemplateDir}`)
    return
  }

  for (const model of ['codex', 'claude']) {
    try {
      const installed = await copyMdTemplates(
        ctx,
        join(promptsTemplateDir, model),
        join(promptsDir, model),
      )
      for (const name of installed) {
        ctx.result.installedPrompts.push(`${model}/${name}`)
      }
    }
    catch (error) {
      ctx.result.errors.push(`Failed to install ${model} prompts: ${error}`)
      ctx.result.success = false
    }
  }
}

/**
 * Recursively collect skill names (directories containing SKILL.md, excludes root).
 * Used by both install (count) and uninstall (list names).
 */
async function collectSkillNames(dir: string, depth = 0): Promise<string[]> {
  const names: string[] = []
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        names.push(...await collectSkillNames(join(dir, entry.name), depth + 1))
      }
      else if (entry.name === 'SKILL.md' && depth > 0) {
        names.push(basename(dir))
      }
    }
  }
  catch (error) {
    // Only suppress ENOENT (dir not found); log other errors that indicate real problems
    const code = (error as NodeJS.ErrnoException).code
    if (code !== 'ENOENT') {
      console.error(`[ly-workflow] Failed to read skills directory ${dir}: ${code || error}`)
    }
  }
  return names
}

/**
 * Remove a directory and collect .md file stems. Returns [] if dir doesn't exist.
 */
async function removeDirCollectMdNames(dir: string): Promise<string[]> {
  if (!(await fs.pathExists(dir))) return []
  const files = await fs.readdir(dir)
  const names = files.filter(f => f.endsWith('.md')).map(f => f.replace('.md', ''))
  await fs.remove(dir)
  return names
}

/**
 * 根据当前安装配置算出应被跳过安装/清理的 SkillCategory 集合。
 * skill目录复制过滤（installSkillFiles）与命令清理（installSkillGeneratedCommands）共用同一份判断。
 */
function computeSkipCategories(config: InstallConfig): SkillCategory[] {
  const skipCategories: SkillCategory[] = []
  if (config.skipImpeccable) {
    skipCategories.push('impeccable')
  }
  return skipCategories
}

/**
 * Install skill files from templates/skills/ → ~/.claude/skills/ly/
 * Includes v1.7.73 legacy layout migration.
 */
async function installSkillFiles(ctx: InstallContext): Promise<void> {
  const skillsTemplateDir = join(ctx.templateDir, 'skills')
  const skillsDestDir = join(ctx.installDir, 'skills', 'ly')

  // Report error instead of silently returning when template dir is missing
  if (!(await fs.pathExists(skillsTemplateDir))) {
    ctx.result.errors.push(`Skills template directory not found: ${skillsTemplateDir}`)
    return
  }

  try {
    // Migration: move old v1.7.73 layout into skills/ly/ namespace
    const oldSkillsRoot = join(ctx.installDir, 'skills')
    const lyLegacyItems = ['tools', 'orchestration', 'SKILL.md', 'run_skill.js']
    const needsMigration = !await fs.pathExists(skillsDestDir)
      && await fs.pathExists(join(oldSkillsRoot, 'tools'))
    if (needsMigration) {
      await fs.ensureDir(skillsDestDir)
      for (const item of lyLegacyItems) {
        const oldPath = join(oldSkillsRoot, item)
        const newPath = join(skillsDestDir, item)
        if (await fs.pathExists(oldPath)) {
          try {
            await fs.move(oldPath, newPath, { overwrite: true })
          }
          catch (moveErr) {
            // Windows: file locking can cause move to fail — log but continue
            ctx.result.errors.push(`Skills migration: failed to move ${item}: ${moveErr}`)
          }
        }
      }
    }

    // Recursive copy: preserves full directory tree
    // Always overwrite to ensure fresh install gets all files
    const skipCategories = computeSkipCategories(ctx.config)
    const skipDirNames = skipCategories.map(c => CATEGORY_DIR_MAP[c]).filter(Boolean)
    await fs.copy(skillsTemplateDir, skillsDestDir, {
      overwrite: true,
      errorOnExist: false,
      filter: (src: string) => {
        if (skipDirNames.length === 0) return true
        const rel = relative(skillsTemplateDir, src)
        if (rel === '') return true
        const head = rel.split(sep)[0]
        return !skipDirNames.includes(head)
      },
    })

    // 清理目标目录里被跳过分类的历史遗留子目录（覆盖本变更上线前就已安装的场景）
    for (const dirName of skipDirNames) {
      const staleDir = join(skillsDestDir, dirName)
      if (await fs.pathExists(staleDir)) {
        await fs.remove(staleDir)
        ctx.result.removedSkillDirectories.push(dirName)
      }
    }

    // Remove security domain files — contains red team/pentest reference content
    // that triggers antivirus/corporate security tool false positives.
    // Users who need it can manually copy from templates/skills/domains/security/.
    const securityDir = join(skillsDestDir, 'domains', 'security')
    if (await fs.pathExists(securityDir)) {
      await fs.remove(securityDir)
    }

    // Post-copy: apply template variable replacement to .md files
    const replacePathsInDir = async (dir: string): Promise<void> => {
      const entries = await fs.readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = join(dir, entry.name)
        if (entry.isDirectory()) {
          await replacePathsInDir(fullPath)
        }
        else if (entry.name.endsWith('.md')) {
          const content = await fs.readFile(fullPath, 'utf-8')
          const processed = replaceHomePathsInTemplate(content, ctx.installDir)
          if (processed !== content) {
            await fs.writeFile(fullPath, processed, 'utf-8')
          }
        }
      }
    }
    await replacePathsInDir(skillsDestDir)

    // Post-copy validation: verify at least one SKILL.md was actually copied
    const installedSkills = await collectSkillNames(skillsDestDir)
    ctx.result.installedSkills = installedSkills.length

    if (installedSkills.length === 0) {
      ctx.result.errors.push(
        `Skills copy completed but no SKILL.md found in ${skillsDestDir}. `
        + `Possible cause: file locking (antivirus), permission denied, or path too long. `
        + `Try running as administrator or disabling antivirus real-time scanning temporarily.`,
      )
    }
  }
  catch (error) {
    ctx.result.errors.push(`Failed to install skills: ${error}`)
    ctx.result.success = false
  }
}

/**
 * Auto-generate slash commands for user-invocable skills via Skill Registry.
 *
 * Scans templates/skills/ for SKILL.md files with `user-invocable: true` frontmatter,
 * then generates ~/.claude/commands/ly/{name}.md for each — SKIPPING any name that
 * already exists in installer-data.ts to avoid conflicts with complex multi-model commands.
 */
async function installSkillGeneratedCommands(ctx: InstallContext): Promise<void> {
  const skillsTemplateDir = join(ctx.templateDir, 'skills')
  const skillsInstallDir = join(ctx.installDir, 'skills', 'ly')
  const commandsDir = join(ctx.installDir, 'commands', 'ly')

  if (!(await fs.pathExists(skillsTemplateDir))) return

  try {
    // Collect names of commands already installed by installer-data.ts
    const existingCommandNames = new Set<string>()
    const existingFiles = await fs.readdir(commandsDir).catch(() => [] as string[])
    for (const f of existingFiles) {
      if (f.endsWith('.md')) {
        existingCommandNames.add(basename(f, '.md'))
      }
    }

    const skipCategories = computeSkipCategories(ctx.config)

    const { generated, removedSkillCommands, skippedCleanupFiles } = await installSkillCommands(
      skillsTemplateDir,
      skillsInstallDir,
      commandsDir,
      existingCommandNames,
      skipCategories,
    )

    if (generated.length > 0) {
      ctx.result.installedCommands.push(...generated)
      ctx.result.installedSkillCommands = generated.length
    }
    if (removedSkillCommands.length > 0) {
      ctx.result.removedSkillCommands.push(...removedSkillCommands)
    }
    if (skippedCleanupFiles.length > 0) {
      ctx.result.skippedCleanupFiles.push(...skippedCleanupFiles)
    }
  }
  catch (error) {
    // Non-fatal: skill command generation failure shouldn't block installation
    ctx.result.errors.push(`Skill Registry command generation warning: ${error}`)
  }
}

/**
 * Install Codex-mode files: AGENTS.md + .codex/config.toml + .codex/agents/*.toml
 * These enable Codex CLI as an alternative lead orchestrator (Codex-led multi-model mode).
 * Files are installed to ~/.codex/ (global) and user copies AGENTS.md to project root.
 */
export async function installCodexMode(): Promise<{ success: boolean, message: string }> {
  const codexTemplateDir = join(PACKAGE_ROOT, 'templates', 'codex')
  if (!(await fs.pathExists(codexTemplateDir))) {
    return { success: false, message: 'Codex template directory not found' }
  }

  try {
    const codexHome = join(homedir(), '.codex')
    await fs.ensureDir(join(codexHome, 'agents'))

    // Read ly config once — reused for template variable injection across
    // AGENTS.md + hooks/ly-workflow.py so model routing (frontend/backend)
    // stays consistent with what the user configured (issue: codex mode still
    // referenced gemini after the antigravity default switch).
    const config = await readLyConfig()
    const injectOpts = {
      routing: config?.routing as any,
      liteMode: config?.performance?.liteMode || false,
      mcpProvider: config?.mcp?.provider || 'skip',
    }

    const configSrc = join(codexTemplateDir, 'config.toml')
    const configDest = join(codexHome, 'config.toml')
    if (await fs.pathExists(configSrc) && !(await fs.pathExists(configDest))) {
      await fs.copy(configSrc, configDest)
    }

    const agentsSrc = join(codexTemplateDir, 'agents')
    if (await fs.pathExists(agentsSrc)) {
      await fs.copy(agentsSrc, join(codexHome, 'agents'), { overwrite: true })
    }

    const agentsMdSrc = join(codexTemplateDir, 'AGENTS.md')
    if (await fs.pathExists(agentsMdSrc)) {
      // Always inject — injectConfigVariables falls back to sane defaults
      // (antigravity/codex) when no config, so placeholders never leak.
      let content = await fs.readFile(agentsMdSrc, 'utf-8')
      content = injectConfigVariables(content, injectOpts)
      content = replaceHomePathsInTemplate(content, join(homedir(), '.claude'))
      await fs.writeFile(join(codexHome, 'AGENTS.md'), content, 'utf-8')
    }

    // hooks/ — inject template variables into ly-workflow.py so the guidance
    // it emits references the user's actual frontend model, not hardcoded gemini.
    const hooksSrc = join(codexTemplateDir, 'hooks')
    if (await fs.pathExists(hooksSrc)) {
      const hooksDest = join(codexHome, 'hooks')
      await fs.ensureDir(hooksDest)
      for (const file of await fs.readdir(hooksSrc)) {
        const srcFile = join(hooksSrc, file)
        const destFile = join(hooksDest, file)
        if (file.endsWith('.py')) {
          let content = await fs.readFile(srcFile, 'utf-8')
          content = injectConfigVariables(content, injectOpts)
          await fs.writeFile(destFile, content, 'utf-8')
        }
        else {
          await fs.copy(srcFile, destFile, { overwrite: true })
        }
      }
    }

    // hooks.json — resolve the `~/.codex/...` hook command to an absolute path.
    // Codex does not reliably expand `~` when spawning the hook command, so a
    // relative/tilde path made it look for `.codex/hooks/` in the project dir.
    const hooksJsonSrc = join(codexTemplateDir, 'hooks.json')
    if (await fs.pathExists(hooksJsonSrc)) {
      let content = await fs.readFile(hooksJsonSrc, 'utf-8')
      const absHome = homedir().replace(/\\/g, '/')
      content = content.replace(/~\//g, `${absHome}/`)
      await fs.writeFile(join(codexHome, 'hooks.json'), content, 'utf-8')
    }

    // Write version marker so external tools can check which ly-workflow version installed Codex mode
    await fs.writeFile(join(codexHome, '.ly-version'), packageVersion, 'utf-8')

    return {
      success: true,
      message: `Codex mode installed:\n  ~/.codex/AGENTS.md\n  ~/.codex/config.toml\n  ~/.codex/hooks.json\n  ~/.codex/hooks/ly-workflow.py\n  ~/.codex/agents/ly-implement.toml\n  ~/.codex/agents/ly-review.toml\n  ~/.codex/agents/ly-research.toml\n  ~/.codex/.ly-version (${packageVersion})`,
    }
  }
  catch (error) {
    return { success: false, message: `Failed to install Codex mode: ${error}` }
  }
}

/**
 * Uninstall ly-workflow Codex mode — only removes files installed by ly-workflow, preserves user files.
 */
export async function uninstallCodexMode(): Promise<{ success: boolean, removed: string[], skipped: string[] }> {
  const codexHome = join(homedir(), '.codex')
  const removed: string[] = []
  const skipped: string[] = []

  // ly-managed files (exact paths)
  const lyFiles = [
    join(codexHome, 'agents', 'ly-implement.toml'),
    join(codexHome, 'agents', 'ly-review.toml'),
    join(codexHome, 'agents', 'ly-research.toml'),
    join(codexHome, 'hooks', 'ly-workflow.py'),
    join(codexHome, 'hooks.json'),
    join(codexHome, '.ly-version'),
  ]

  // AGENTS.md — only remove if it contains ly-workflow marker
  const agentsMd = join(codexHome, 'AGENTS.md')

  try {
    for (const file of lyFiles) {
      if (await fs.pathExists(file)) {
        await fs.remove(file)
        removed.push(file.replace(homedir(), '~'))
      }
    }

    if (await fs.pathExists(agentsMd)) {
      const content = await fs.readFile(agentsMd, 'utf-8')
      if (content.includes('<!-- LY:START')) {
        await fs.remove(agentsMd)
        removed.push('~/.codex/AGENTS.md')
      }
      else {
        skipped.push('~/.codex/AGENTS.md (not managed by ly-workflow)')
      }
    }

    // config.toml — never delete (user may have custom settings)
    skipped.push('~/.codex/config.toml (preserved — may contain user settings)')

    // Clean up empty dirs
    for (const dir of ['agents', 'hooks']) {
      const dirPath = join(codexHome, dir)
      if (await fs.pathExists(dirPath)) {
        const files = await fs.readdir(dirPath)
        if (files.length === 0) {
          await fs.remove(dirPath)
          removed.push(`~/.codex/${dir}/ (empty, removed)`)
        }
      }
    }

    return { success: true, removed, skipped }
  }
  catch (error) {
    return { success: false, removed, skipped: [...skipped, `Error: ${error}`] }
  }
}

async function _installCodexFilesInternal(ctx: InstallContext): Promise<void> {
  const codexTemplateDir = join(ctx.templateDir, 'codex')
  if (!(await fs.pathExists(codexTemplateDir))) return

  try {
    const codexHome = join(homedir(), '.codex')
    await fs.ensureDir(join(codexHome, 'agents'))

    // .codex/config.toml (merge, don't overwrite user's existing config)
    const configSrc = join(codexTemplateDir, 'config.toml')
    const configDest = join(codexHome, 'config.toml')
    if (await fs.pathExists(configSrc)) {
      if (!(await fs.pathExists(configDest))) {
        await fs.copy(configSrc, configDest)
      }
    }

    // .codex/agents/*.toml
    const agentsSrc = join(codexTemplateDir, 'agents')
    if (await fs.pathExists(agentsSrc)) {
      await fs.copy(agentsSrc, join(codexHome, 'agents'), { overwrite: true })
    }

    // AGENTS.md → ~/.codex/AGENTS.md (global fallback)
    const agentsMdSrc = join(codexTemplateDir, 'AGENTS.md')
    if (await fs.pathExists(agentsMdSrc)) {
      await fs.copy(agentsMdSrc, join(codexHome, 'AGENTS.md'), { overwrite: true })
    }
  }
  catch (error) {
    // Non-fatal: Codex mode is optional
    ctx.result.errors.push(`Codex files install warning: ${error}`)
  }
}

/**
 * Install rule .md files from templates/rules/ → ~/.claude/rules/
 */
async function installRuleFiles(ctx: InstallContext): Promise<void> {
  try {
    const installed = await copyMdTemplates(
      ctx,
      join(ctx.templateDir, 'rules'),
      join(ctx.installDir, 'rules'),
    )
    if (installed.length > 0) ctx.result.installedRules = true
  }
  catch (error) {
    ctx.result.errors.push(`Failed to install rules: ${error}`)
  }
}

/** Resolve platform-specific binary name. Returns null for unsupported platforms. */
function getBinaryName(): string | null {
  const osMap: Record<string, string> = { darwin: 'darwin', linux: 'linux', win32: 'windows' }
  const os = osMap[process.platform]
  if (!os) return null
  const arch = process.arch === 'arm64' ? 'arm64' : 'amd64'
  const ext = process.platform === 'win32' ? '.exe' : ''
  return `codeagent-wrapper-${os}-${arch}${ext}`
}

/**
 * Check if codeagent-wrapper binary exists and is functional.
 * Returns true if the binary passes `--version` check.
 */
export async function verifyBinary(installDir: string): Promise<boolean> {
  const binDir = join(installDir, 'bin')
  const wrapperName = process.platform === 'win32' ? 'codeagent-wrapper.exe' : 'codeagent-wrapper'
  const wrapperPath = join(binDir, wrapperName)

  if (!(await fs.pathExists(wrapperPath))) return false

  try {
    const { execSync } = await import('node:child_process')
    execSync(`"${wrapperPath}" --version`, { stdio: 'pipe' })
    return true
  }
  catch {
    return false
  }
}

/**
 * Check if installed binary version matches expected version.
 * Returns true if version matches, false if outdated or unreadable.
 */
export async function verifyBinaryVersion(installDir: string): Promise<boolean> {
  const binDir = join(installDir, 'bin')
  const wrapperName = process.platform === 'win32' ? 'codeagent-wrapper.exe' : 'codeagent-wrapper'
  const wrapperPath = join(binDir, wrapperName)

  try {
    const { execSync } = await import('node:child_process')
    const output = execSync(`"${wrapperPath}" --version`, { stdio: 'pipe' }).toString().trim()
    const version = output.replace(/^.*version\s*/, '')
    return version === EXPECTED_BINARY_VERSION
  }
  catch {
    return false
  }
}

/**
 * Show prominent red-box warning when codeagent-wrapper binary download failed.
 * Used by both init and update flows to provide manual fix instructions.
 */
export function showBinaryDownloadWarning(binDir: string): void {
  const binaryExt = process.platform === 'win32' ? '.exe' : ''
  const platformLabel = process.platform === 'darwin'
    ? (process.arch === 'arm64' ? 'darwin-arm64' : 'darwin-amd64')
    : process.platform === 'linux'
      ? (process.arch === 'arm64' ? 'linux-arm64' : 'linux-amd64')
      : (process.arch === 'arm64' ? 'windows-arm64' : 'windows-amd64')
  const binaryFileName = `codeagent-wrapper-${platformLabel}${binaryExt}`
  const destFileName = `codeagent-wrapper${binaryExt}`
  const releaseUrl = `https://github.com/${GITHUB_REPO}/releases/tag/${RELEASE_TAG}`

  console.log()
  console.log(ansis.red.bold(`  ╔════════════════════════════════════════════════════════════╗`))
  console.log(ansis.red.bold(`  ║  ⚠  codeagent-wrapper 下载失败                            ║`))
  console.log(ansis.red.bold(`  ║     Binary download failed (network issue)                 ║`))
  console.log(ansis.red.bold(`  ╚════════════════════════════════════════════════════════════╝`))
  console.log()
  console.log(ansis.yellow(`  Codex 审查命令 (/ly:review-plan, /ly:review-code) 需要此文件才能工作。`))
  console.log(ansis.yellow(`  Codex review commands require this binary to work.`))
  console.log()
  console.log(ansis.cyan(`  手动修复 / Manual fix:`))
  console.log()
  console.log(ansis.white(`    1. 下载 / Download:`))
  console.log(ansis.cyan(`       ${releaseUrl}`))
  console.log(ansis.gray(`       → 找到 ${ansis.white(binaryFileName)} 并下载`))
  console.log()
  console.log(ansis.white(`    2. 放到 / Place at:`))
  const displayPath = process.platform === 'win32'
    ? `${binDir.replace(/\//g, '\\')}\\${destFileName}`
    : `${binDir}/${destFileName}`
  console.log(ansis.cyan(`       ${displayPath}`))
  console.log()
  if (process.platform !== 'win32') {
    console.log(ansis.white(`    3. 加权限 / Make executable:`))
    console.log(ansis.cyan(`       chmod +x "${binDir}/${destFileName}"`))
    console.log()
  }
  console.log(ansis.white(`    或重新安装 / Or re-install:`))
  console.log(ansis.cyan(`       npx ly-workflow@latest`))
  console.log()
}

/**
 * Download and install codeagent-wrapper binary for current platform.
 * Skips download if binary already exists and passes `--version` check.
 */
async function installBinaryFile(ctx: InstallContext): Promise<void> {
  try {
    const binDir = join(ctx.installDir, 'bin')
    await fs.ensureDir(binDir)

    const binaryName = getBinaryName()
    if (!binaryName) {
      ctx.result.errors.push(`Unsupported platform: ${process.platform}`)
      ctx.result.success = false
      return
    }

    const destBinary = join(binDir, process.platform === 'win32' ? 'codeagent-wrapper.exe' : 'codeagent-wrapper')

    // Check if binary exists, is functional, AND version matches
    if (await fs.pathExists(destBinary)) {
      try {
        const { execSync } = await import('node:child_process')
        const versionOutput = execSync(`"${destBinary}" --version`, { stdio: 'pipe' }).toString().trim()
        const installedVersion = versionOutput.replace(/^.*version\s*/, '')

        // Compare with expected version from package
        const expectedVersion = EXPECTED_BINARY_VERSION
        if (installedVersion === expectedVersion) {
          // Binary exists, works, and version matches — skip download
          ctx.result.binPath = binDir
          ctx.result.binInstalled = true
          return
        }
        // Version mismatch — fall through to re-download
      }
      catch {
        // Binary exists but broken — fall through to re-download
      }
    }

    const installed = await downloadBinaryFromRelease(binaryName, destBinary)

    if (installed) {
      try {
        const { execSync } = await import('node:child_process')
        execSync(`"${destBinary}" --version`, { stdio: 'pipe' })
        ctx.result.binPath = binDir
        ctx.result.binInstalled = true
      }
      catch (verifyError) {
        ctx.result.errors.push(`Binary verification failed (non-blocking): ${verifyError}`)
      }
    }
    else {
      ctx.result.errors.push(`Failed to download binary: ${binaryName} from GitHub Release (after 3 attempts). Check network or visit https://github.com/${GITHUB_REPO}/releases/tag/${RELEASE_TAG}`)
    }
  }
  catch (error) {
    ctx.result.errors.push(`Failed to install codeagent-wrapper (non-blocking): ${error}`)
  }
}

// ═══════════════════════════════════════════════════════
// ly-workflow Engine installation
// ═══════════════════════════════════════════════════════

/**
 * Install engine files from templates/engine/ → ~/.claude/.ly/engine/
 * Includes model-router.md, phase-guide.md, and strategy files.
 * All .md files receive variable injection + path replacement.
 */
async function installEngineFiles(ctx: InstallContext): Promise<void> {
  const engineSrcDir = join(ctx.templateDir, 'engine')
  if (!(await fs.pathExists(engineSrcDir))) return

  const engineDestDir = join(ctx.installDir, '.ly', 'engine')

  try {
    // Copy top-level engine .md files (model-router.md, phase-guide.md)
    await copyMdTemplates(ctx, engineSrcDir, engineDestDir, { inject: true })

    // Copy strategy files
    const strategiesSrc = join(engineSrcDir, 'strategies')
    const strategiesDest = join(engineDestDir, 'strategies')
    if (await fs.pathExists(strategiesSrc)) {
      await copyMdTemplates(ctx, strategiesSrc, strategiesDest, { inject: true })
    }
  }
  catch (error) {
    ctx.result.errors.push(`Failed to install engine files: ${error}`)
  }
}

// ═══════════════════════════════════════════════════════
// ly-workflow Hook installation
// ═══════════════════════════════════════════════════════

const HOOK_FILES = ['task-utils.js', 'workflow-state.js', 'session-start.js', 'subagent-context.js', 'skill-router.js']

/**
 * Install ly-workflow hook scripts to ~/.claude/hooks/ly/
 */
async function installHookScripts(ctx: InstallContext): Promise<void> {
  const hooksSrcDir = join(ctx.templateDir, 'hooks')
  if (!(await fs.pathExists(hooksSrcDir))) return

  const hooksDestDir = join(ctx.installDir, 'hooks', 'ly')
  await fs.ensureDir(hooksDestDir)

  try {
    for (const file of HOOK_FILES) {
      const src = join(hooksSrcDir, file)
      const dest = join(hooksDestDir, file)
      if (await fs.pathExists(src)) {
        await fs.copy(src, dest, { overwrite: true })
      }
    }
  }
  catch (error) {
    ctx.result.errors.push(`Failed to install hook scripts: ${error}`)
  }
}

/**
 * Register ly-workflow hooks in ~/.claude/settings.json.
 * Merges with existing hooks — does not overwrite user's other hooks.
 */
async function registerHooksInSettings(ctx: InstallContext): Promise<void> {
  const settingsPath = join(ctx.installDir, 'settings.json')
  const hooksDir = join(ctx.installDir, 'hooks', 'ly')

  try {
    let settings: Record<string, unknown> = {}
    if (await fs.pathExists(settingsPath)) {
      try {
        settings = JSON.parse(await fs.readFile(settingsPath, 'utf-8'))
      }
      catch {
        settings = {}
      }
    }

    const hooks = (settings.hooks || {}) as Record<string, unknown[]>

    const lyHookDefs = {
      UserPromptSubmit: {
        hooks: [
          { type: 'command', command: `node ${join(hooksDir, 'workflow-state.js')}`, timeout: 10000 },
          { type: 'command', command: `node ${join(hooksDir, 'skill-router.js')}`, timeout: 5000 },
        ],
      },
      SessionStart: {
        matcher: 'startup|clear|compact',
        hooks: [{ type: 'command', command: `node ${join(hooksDir, 'session-start.js')}`, timeout: 15000 }],
      },
      PreToolUse: {
        matcher: 'Bash|Agent',
        hooks: [{ type: 'command', command: `node ${join(hooksDir, 'subagent-context.js')}`, timeout: 15000 }],
      },
    }

    for (const [event, def] of Object.entries(lyHookDefs)) {
      const eventHooks = (hooks[event] || []) as Record<string, unknown>[]
      const lyCommand = (def.hooks[0] as Record<string, unknown>).command as string
      const existingIdx = eventHooks.findIndex((h) => {
        const hHooks = (h.hooks || []) as Record<string, unknown>[]
        return hHooks.some(hh => typeof hh.command === 'string' && hh.command.includes('hooks/ly/'))
      })

      if (existingIdx >= 0) {
        eventHooks[existingIdx] = def
      }
      else {
        eventHooks.push(def)
      }
      hooks[event] = eventHooks
    }

    settings.hooks = hooks
    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
  }
  catch (error) {
    ctx.result.errors.push(`Failed to register hooks in settings.json: ${error}`)
  }
}

// ═══════════════════════════════════════════════════════
// Public API: install / uninstall
// ═══════════════════════════════════════════════════════

export async function installWorkflows(
  workflowIds: string[],
  installDir: string,
  force = false,
  config?: {
    routing?: {
      reviewer?: string
    }
    liteMode?: boolean
    mcpProvider?: string
    skipImpeccable?: boolean
  },
): Promise<InstallResult> {
  const ctx: InstallContext = {
    installDir,
    force,
    config: {
      routing: config?.routing as InstallConfig['routing'] || {
        reviewer: 'codex',
      },
      liteMode: config?.liteMode || false,
      mcpProvider: config?.mcpProvider || 'fast-context',
      skipImpeccable: config?.skipImpeccable || false,
    },
    templateDir: join(PACKAGE_ROOT, 'templates'),
    result: {
      success: true,
      installedCommands: [],
      installedPrompts: [],
      errors: [],
      configPath: '',
      removedSkillCommands: [],
      removedSkillDirectories: [],
      skippedCleanupFiles: [],
    },
  }

  // ── Pre-flight: validate template directory exists ──
  // This is the #1 root cause of "silent install failure" on Windows:
  // if PACKAGE_ROOT resolved wrong, templateDir doesn't exist and every
  // sub-step silently returns empty results while reporting success.
  if (!(await fs.pathExists(ctx.templateDir))) {
    const errorMsg = `Template directory not found: ${ctx.templateDir} (PACKAGE_ROOT=${PACKAGE_ROOT}). `
      + `This usually means the npm package is incomplete or the cache is corrupted. `
      + `Try: npm cache clean --force && npx ly-workflow@latest`
    ctx.result.errors.push(errorMsg)
    ctx.result.success = false
    return ctx.result
  }

  // Ensure base directories
  await fs.ensureDir(join(installDir, 'commands', 'ly'))
  await fs.ensureDir(join(installDir, '.ly'))
  await fs.ensureDir(join(installDir, '.ly', 'prompts'))
  await fs.ensureDir(join(installDir, '.ly', 'engine', 'strategies'))

  // Execute each install step
  await installCommandFiles(ctx, workflowIds)
  await installEngineFiles(ctx)
  await installHookScripts(ctx)
  await registerHooksInSettings(ctx)
  await installAgentFiles(ctx)
  await installPromptFiles(ctx)
  await installSkillFiles(ctx)
  await installSkillGeneratedCommands(ctx)
  await installRuleFiles(ctx)
  await installBinaryFile(ctx)

  // ── Post-flight: validate installation produced results ──
  // Catch the case where all sub-steps silently returned empty
  if (ctx.result.installedCommands.length === 0 && ctx.result.errors.length === 0) {
    ctx.result.errors.push(
      `No commands were installed (expected ${workflowIds.length}). `
      + `Template dir: ${ctx.templateDir}. `
      + `This may indicate a corrupted package or file permission issue.`,
    )
    ctx.result.success = false
  }

  ctx.result.configPath = join(installDir, 'commands', 'ly')
  return ctx.result
}

// ═══════════════════════════════════════════════════════
// Uninstall
// ═══════════════════════════════════════════════════════

export interface UninstallResult {
  success: boolean
  removedCommands: string[]
  removedPrompts: string[]
  removedAgents: string[]
  removedSkills: string[]
  removedRules: boolean
  removedHooks: boolean
  removedBin: boolean
  errors: string[]
}

/**
 * Uninstall workflows by removing their command files.
 * @param options.preserveBinary — when true, skip binary removal (used during update)
 */
export async function uninstallWorkflows(installDir: string, options?: { preserveBinary?: boolean }): Promise<UninstallResult> {
  const result: UninstallResult = {
    success: true,
    removedCommands: [],
    removedPrompts: [],
    removedAgents: [],
    removedSkills: [],
    removedRules: false,
    removedHooks: false,
    removedBin: false,
    errors: [],
  }

  const commandsDir = join(installDir, 'commands', 'ly')
  const agentsDir = join(installDir, 'agents', 'ly')
  const skillsDir = join(installDir, 'skills', 'ly')
  const rulesDir = join(installDir, 'rules')
  const binDir = join(installDir, 'bin')
  const lyConfigDir = join(installDir, '.ly')

  // Remove ly-workflow commands directory
  try {
    result.removedCommands = await removeDirCollectMdNames(commandsDir)
  }
  catch (error) {
    result.errors.push(`Failed to remove commands directory: ${error}`)
    result.success = false
  }

  // Remove ly-workflow agents directory
  try {
    result.removedAgents = await removeDirCollectMdNames(agentsDir)
  }
  catch (error) {
    result.errors.push(`Failed to remove agents directory: ${error}`)
    result.success = false
  }

  // Remove ly-workflow skills directory only (skills/ly/) — preserves user's own skills
  if (await fs.pathExists(skillsDir)) {
    try {
      result.removedSkills = await collectSkillNames(skillsDir)
      await fs.remove(skillsDir)
    }
    catch (error) {
      result.errors.push(`Failed to remove skills: ${error}`)
      result.success = false
    }
  }

  // Remove ly-workflow rules files
  if (await fs.pathExists(rulesDir)) {
    try {
      for (const ruleFile of ['ly-skills.md', 'ly-grok-search.md', 'ly-skill-routing.md', 'ly-codegraph.md']) {
        const rulePath = join(rulesDir, ruleFile)
        if (await fs.pathExists(rulePath)) {
          await fs.remove(rulePath)
          result.removedRules = true
        }
      }
    }
    catch (error) {
      result.errors.push(`Failed to remove rules: ${error}`)
    }
  }

  // Remove fast-context rule file (~/.claude/rules/ly-fast-context.md).
  // Written by writeFastContextPrompt (installer-prompt.ts) — NOT part of
  // templates/rules/, so the fixed-name list above misses it. Also clears the
  // marker blocks it appended to ~/.codex/AGENTS.md / ~/.gemini/GEMINI.md.
  try {
    await removeFastContextPrompt()
    result.removedRules = true
  }
  catch (error) {
    result.errors.push(`Failed to remove fast-context rule: ${error}`)
    result.success = false
  }

  // Remove codeagent-wrapper binary (skip during update to avoid unnecessary re-download)
  if (!options?.preserveBinary && await fs.pathExists(binDir)) {
    try {
      const wrapperName = process.platform === 'win32' ? 'codeagent-wrapper.exe' : 'codeagent-wrapper'
      const wrapperPath = join(binDir, wrapperName)
      if (await fs.pathExists(wrapperPath)) {
        await fs.remove(wrapperPath)
        result.removedBin = true
      }
    }
    catch (error) {
      result.errors.push(`Failed to remove binary: ${error}`)
      result.success = false
    }
  }

  // Remove .ly config directory (engine, prompts, strategies all live here)
  if (await fs.pathExists(lyConfigDir)) {
    try {
      await fs.remove(lyConfigDir)
      result.removedPrompts.push('ALL_PROMPTS_AND_CONFIGS')
    }
    catch (error) {
      result.errors.push(`Failed to remove .ly directory: ${error}`)
    }
  }

  // Remove ly-workflow hook scripts directory (hooks/ly/) — added by the v3.0 engine.
  // Older uninstall logic predates the hook engine and left these behind.
  const hooksLyDir = join(installDir, 'hooks', 'ly')
  if (await fs.pathExists(hooksLyDir)) {
    try {
      await fs.remove(hooksLyDir)
      result.removedHooks = true
    }
    catch (error) {
      result.errors.push(`Failed to remove hooks directory: ${error}`)
      result.success = false
    }
  }

  // Deregister ly-workflow hooks from settings.json — preserve the user's own hooks.
  // ly-workflow hook entries are identified by a command path that points at hooks/ly/.
  const settingsPath = join(installDir, 'settings.json')
  if (await fs.pathExists(settingsPath)) {
    try {
      const settings = JSON.parse(await fs.readFile(settingsPath, 'utf-8')) as Record<string, any>
      const hooks = settings.hooks as Record<string, any[]> | undefined
      if (hooks && typeof hooks === 'object') {
        const isLyEntry = (h: any): boolean => {
          const hHooks = (h?.hooks || []) as any[]
          return hHooks.some(hh => typeof hh?.command === 'string' && /hooks[\\/]ly[\\/]/.test(hh.command))
        }
        let modified = false
        for (const event of Object.keys(hooks)) {
          const arr = Array.isArray(hooks[event]) ? hooks[event] : []
          const filtered = arr.filter(h => !isLyEntry(h))
          if (filtered.length !== arr.length) {
            modified = true
            if (filtered.length === 0) delete hooks[event]
            else hooks[event] = filtered
          }
        }
        if (modified) {
          if (Object.keys(hooks).length === 0) delete settings.hooks
          await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
          result.removedHooks = true
        }
      }
    }
    catch (error) {
      result.errors.push(`Failed to deregister hooks from settings.json: ${error}`)
    }
  }

  return result
}
