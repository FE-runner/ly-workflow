import type { InstallResult } from '../types'
import ansis from 'ansis'
import fs from 'fs-extra'
import { basename, join } from 'pathe'
import { getWorkflowById } from './installer-data'
import { PACKAGE_ROOT, injectConfigVariables, replaceHomePathsInTemplate } from './installer-template'

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

// ═══════════════════════════════════════════════════════
// Install context — shared across sub-functions
// ═══════════════════════════════════════════════════════

interface InstallConfig {
  routing: {
    reviewer?: string
    implementer?: string
  }
  liteMode: boolean
}

interface InstallContext {
  installDir: string
  force: boolean
  config: InstallConfig
  templateDir: string
  result: InstallResult
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

  // Install role prompts for every backend the wrapper supports. Only codex/
  // and claude/ ship their own content; hermes/openclaw reuse codex's role
  // files so that ROLE_FILE: prompts/{{REVIEWER_MODEL}}/... always resolves.
  for (const model of ['codex', 'claude', 'hermes', 'openclaw']) {
    try {
      const srcModelDir = join(promptsTemplateDir, model)
      const srcDir = await fs.pathExists(srcModelDir) ? srcModelDir : join(promptsTemplateDir, 'codex')
      const installed = await copyMdTemplates(
        ctx,
        srcDir,
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
// ═══════════════════════════════════════════════════════
// ly-wrapper 安装（随 npm 包分发，无二进制下载/版本门禁）
// ═══════════════════════════════════════════════════════

/**
 * Install ly-wrapper script from the npm package dist/ → ~/.claude/bin/ly-wrapper.
 * The wrapper ships inside the npm package (built by scripts/build-wrapper.mjs) —
 * no GitHub Release download, no EXPECTED_BINARY_VERSION version gate.
 */
async function installBinaryFile(ctx: InstallContext): Promise<void> {
  try {
    const binDir = join(ctx.installDir, 'bin')
    await fs.ensureDir(binDir)
    const destBinary = join(binDir, 'ly-wrapper')
    const srcWrapper = join(PACKAGE_ROOT, 'dist', 'ly-wrapper.js')

    if (!(await fs.pathExists(srcWrapper))) {
      ctx.result.errors.push('ly-wrapper script not found in package dist/ — package build is broken')
      ctx.result.success = false
      return
    }

    await fs.copy(srcWrapper, destBinary, { overwrite: true })
    if (process.platform !== 'win32') {
      await fs.chmod(destBinary, 0o755)
    }

    // Verify the installed script runs
    try {
      const { execSync } = await import('node:child_process')
      execSync(`"${destBinary}" --version`, { stdio: 'pipe' })
      ctx.result.binPath = binDir
      ctx.result.binInstalled = true
    }
    catch (verifyError) {
      ctx.result.errors.push(`ly-wrapper verification failed (non-blocking): ${verifyError}`)
    }
  }
  catch (error) {
    ctx.result.errors.push(`Failed to install ly-wrapper (non-blocking): ${error}`)
  }
}

/** Check if ly-wrapper script exists in ~/.claude/bin and runs. */
export async function verifyBinary(installDir: string): Promise<boolean> {
  const wrapperPath = join(installDir, 'bin', 'ly-wrapper')
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
 * Show prominent red-box warning when ly-wrapper is missing or unusable.
 * Used by both init and update flows.
 */
export function showBinaryDownloadWarning(binDir: string): void {
  console.log()
  console.log(ansis.red.bold('  ╔════════════════════════════════════════════════════════════╗'))
  console.log(ansis.red.bold('  ║  ⚠  ly-wrapper 不可用                                     ║'))
  console.log(ansis.red.bold('  ╚════════════════════════════════════════════════════════════╝'))
  console.log()
  console.log(ansis.yellow('  审查命令 (/ly:review-plan, /ly:review-code) 需要此文件才能工作。'))
  console.log()
  console.log(ansis.cyan('  手动修复 / Manual fix:'))
  console.log(ansis.cyan('     重新安装: npx ly-workflow@latest'))
  console.log(ansis.gray(`     目标位置: ${binDir}/ly-wrapper`))
  console.log()
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
      implementer?: string
    }
    liteMode?: boolean
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
    },
    templateDir: join(PACKAGE_ROOT, 'templates'),
    result: {
      success: true,
      installedCommands: [],
      installedPrompts: [],
      errors: [],
      configPath: '',
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

  // Execute each install step
  await installCommandFiles(ctx, workflowIds)
  await installPromptFiles(ctx)
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
export async function uninstallWorkflows(
  installDir: string,
  options?: { preserveBinary?: boolean, legacyCleanupDirs?: { claudeDir?: string, codexDir?: string, homeDir?: string } },
): Promise<UninstallResult> {
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

  // Remove ly-wrapper script (skip during update)
  if (!options?.preserveBinary && await fs.pathExists(binDir)) {
    try {
      let removedAny = false
      const wrapperPath = join(binDir, 'ly-wrapper')
      if (await fs.pathExists(wrapperPath)) {
        await fs.remove(wrapperPath)
        removedAny = true
      }
      result.removedBin = removedAny
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

  // 遗产清理：回收 v2.0 瘦身前历史安装的上游资产（非阻断）
  try {
    const { cleanupLegacyArtifacts, reportCleanupResult } = await import('./legacy-cleanup')
    reportCleanupResult(await cleanupLegacyArtifacts(options?.legacyCleanupDirs))
  }
  catch (error) {
    result.errors.push(`Legacy cleanup failed (non-blocking): ${error}`)
  }

  return result
}
