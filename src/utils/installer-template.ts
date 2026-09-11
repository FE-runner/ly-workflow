import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import fs from 'fs-extra'
import { dirname, join } from 'pathe'
import { isWindows } from './platform'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * Find package root by looking for package.json up the directory tree.
 * Validates that the found root contains a templates/ directory.
 *
 * Increased depth from 5 → 10 to handle deeply nested npm cache paths
 * on Windows (e.g., AppData\Local\npm-cache\_npx\<hash>\node_modules\...).
 */
function findPackageRoot(startDir: string): string {
  let dir = startDir
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(join(dir, 'package.json'))) {
      // Validate: package root must contain templates/ directory
      if (fs.existsSync(join(dir, 'templates'))) {
        return dir
      }
      // Found package.json but no templates/ — might be a parent workspace
      // Continue searching upward
    }
    const parent = dirname(dir)
    if (parent === dir) break // Reached filesystem root
    dir = parent
  }

  // Fallback: warn loudly — this is the root cause of "silent install failure"
  console.error(
    `[ly-workflow] ⚠ PACKAGE_ROOT resolution failed: could not find package.json with templates/ directory.\n`
    + `  Start dir: ${startDir}\n`
    + `  Last checked: ${dir}\n`
    + `  This will cause commands/skills/prompts to not be installed.\n`
    + `  Please report this issue at: https://github.com/FE-runner/ly-workflow/issues`,
  )
  return startDir
}

export const PACKAGE_ROOT = findPackageRoot(__dirname)

/**
 * Replace template variables in content based on user configuration.
 * Injects model routing configs at install time.
 */
export function injectConfigVariables(content: string, config: {
  routing?: {
    reviewer?: string
    implementer?: string
  }
  liteMode?: boolean
}): string {
  let processed = content

  // Reviewer model injection
  const routing = config.routing || {}
  const reviewer = routing.reviewer || 'codex'
  processed = processed.replace(/\{\{REVIEWER_MODEL\}\}/g, reviewer)

  // Implementer model injection (used by apply.md to delegate implementation;
  // claude = orchestrator implements in-session, no wrapper delegation)
  const implementer = routing.implementer || 'claude'
  processed = processed.replace(/\{\{IMPLEMENTER_MODEL\}\}/g, implementer)

  // Implementer conditional blocks (apply.md): each `LY:IF:<COND>` block is kept
  // only when its condition matches the selected implementer, otherwise removed.
  // Unclosed / unknown markers abort loudly so the wrong branch can never be
  // silently retained in the installed artifact.
  const CONDITIONAL_BLOCK = /\n?<!--\s*LY:IF:([A-Z_]+)\s*-->([\s\S]*?)<!--\s*LY:ENDIF\s*-->\n?/g
  processed = processed.replace(CONDITIONAL_BLOCK, (_match, cond: string, body: string): string => {
    if (cond === 'IMPLEMENTER_EXTERNAL') return implementer !== 'claude' ? body : ''
    if (cond === 'IMPLEMENTER_CLAUDE') return implementer === 'claude' ? body : ''
    throw new Error(`[ly] unknown implementer conditional marker: <!-- LY:IF:${cond} -->`)
  })

  // Catch any unclosed / stray markers that the regex above didn't consume.
  const stray = processed.match(/<!--\s*LY:(?:IF|ENDIF):?[A-Z_]*\s*-->/g)
  if (stray) {
    throw new Error(`[ly] unclosed/stray implementer conditional marker: ${stray.join(' ')}`)
  }

  // Lite mode flag for ly-wrapper
  // If liteMode is true, inject "--lite" flag
  const liteModeFlag = config.liteMode ? '--lite ' : ''
  processed = processed.replace(/\{\{LITE_MODE_FLAG\}\}/g, liteModeFlag)

  return processed
}

/**
 * Replace ~ paths in template content with absolute paths.
 * Fixes Windows multi-user path resolution issues.
 *
 * IMPORTANT: Always use forward slashes (/) for cross-platform compatibility.
 * Windows Git Bash requires forward slashes in heredoc (backslashes get escaped).
 * PowerShell and CMD also support forward slashes for most commands.
 */
export function replaceHomePathsInTemplate(content: string, installDir: string): string {
  // Get absolute paths for replacement
  const userHome = homedir()
  const lyConfigDir = join(installDir, '.ly')
  const binDir = join(installDir, 'bin')
  const claudeDir = installDir // ~/.claude

  // IMPORTANT: Always use forward slashes for cross-platform compatibility
  // Git Bash on Windows requires forward slashes in heredoc (backslashes get escaped)
  // PowerShell and CMD also support forward slashes for most commands
  const toForwardSlash = (path: string) => path.replace(/\\/g, '/')

  let processed = content

  // Order matters: replace longer patterns first to avoid partial matches
  // 1. Replace ~/.claude/.ly with absolute path (longest match first)
  processed = processed.replace(/~\/\.claude\/\.ly/g, toForwardSlash(lyConfigDir))

  // 2. Replace ~/.claude/bin/ly-wrapper with absolute path
  //    (ly-wrapper is a Node script shipped in the npm package — no .exe needed)
  const wrapperPath = `${toForwardSlash(binDir)}/ly-wrapper`
  processed = processed.replace(/~\/\.claude\/bin\/ly-wrapper/g, wrapperPath)

  // 3. Replace ~/.claude/bin with absolute path (for other binaries)
  processed = processed.replace(/~\/\.claude\/bin/g, toForwardSlash(binDir))

  // 4. Replace ~/.claude with absolute path
  processed = processed.replace(/~\/\.claude/g, toForwardSlash(claudeDir))

  // 5. Replace remaining ~/ patterns with user home
  processed = processed.replace(/~\//g, `${toForwardSlash(userHome)}/`)

  return processed
}
