import ansis from 'ansis'
import { existsSync } from 'node:fs'
import { execFile, spawn } from 'node:child_process'
import { homedir } from 'node:os'
import inquirer from 'inquirer'
import { join } from 'pathe'
import { i18n } from '../i18n'

/**
 * External dependency preflight checks.
 *
 * OpenSpec lifecycle commands (/ly:init /ly:explore /ly:propose /ly:review-plan
 * /ly:archive) depend on the global `openspec` CLI and the opsx skills it
 * installs during `openspec init`. Detection runs at installer entry points
 * (default / init / menu) so missing-dependency failures surface early
 * instead of at first command invocation.
 */

export interface OpenspecCliStatus {
  installed: boolean
  version?: string
}

/** Commands that directly require the openspec CLI / opsx skills. */
const DEPENDENT_COMMANDS = ['/ly:init', '/ly:explore', '/ly:propose', '/ly:review-plan', '/ly:archive']

const INSTALL_CMD = 'npm install -g @fission-ai/openspec@latest'

/** opsx skills directory — honors CLAUDE_CONFIG_DIR, defaults to ~/.claude. */
export function getOpsxSkillsDir(): string {
  const base = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')
  return join(base, 'commands', 'opsx')
}

/** Detect the global openspec CLI via `openspec --version`. */
export function detectOpenspecCli(): Promise<OpenspecCliStatus> {
  return new Promise((resolve) => {
    execFile('openspec', ['--version'], { timeout: 5000 }, (err, stdout) => {
      if (err) resolve({ installed: false })
      else resolve({ installed: true, version: stdout.toString().trim() || 'unknown' })
    })
  })
}

/** Detect whether opsx skills are installed (i.e. `openspec init` has been run). */
export function detectOpsxSkills(): boolean {
  return existsSync(getOpsxSkillsDir())
}

function isNonTTY(): boolean {
  return !process.stdin.isTTY || !process.stdout.isTTY
}

function printUnavailable(): void {
  console.log(ansis.yellow(`  ${i18n.t('common:preflight.unavailableList', { list: DEPENDENT_COMMANDS.join(' ') })}`))
  console.log(ansis.gray(`  ${i18n.t('common:preflight.unaffectedNote')}`))
}

async function runNpmInstall(): Promise<boolean> {
  return new Promise((resolve) => {
    const [cmd, ...args] = INSTALL_CMD.split(' ')
    const child = spawn(cmd, args, { stdio: 'inherit' })
    child.on('error', () => resolve(false))
    child.on('close', code => resolve(code === 0))
  })
}

/**
 * Orchestrated preflight entry for installer flows (default action / init / menu).
 * Never throws — installer main flow must proceed regardless of check outcomes.
 */
export async function checkExternalDeps(): Promise<void> {
  try {
    const cli = await detectOpenspecCli()

    if (cli.installed) {
      if (!detectOpsxSkills()) {
        console.log(ansis.yellow(`⚠ ${i18n.t('common:preflight.skillsMissing')}`))
      }
      return
    }

    console.log(ansis.yellow(`⚠ ${i18n.t('common:preflight.cliMissing')}`))

    if (isNonTTY()) {
      printUnavailable()
      return
    }

    const { confirmed } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirmed',
      message: i18n.t('common:preflight.installAsk'),
      default: true,
    }])

    if (!confirmed) {
      printUnavailable()
      return
    }

    const ok = await runNpmInstall()
    if (!ok) {
      console.error(ansis.red(`✗ ${i18n.t('common:preflight.installFailed')}`))
      printUnavailable()
      return
    }

    // Re-check skills after install: a stale opsx dir may already exist
    // (openspec CLI was previously installed then removed).
    if (detectOpsxSkills()) {
      console.log(ansis.green(`✓ ${i18n.t('common:preflight.installSuccessWithSkills')}`))
    }
    else {
      console.log(ansis.green(`✓ ${i18n.t('common:preflight.installSuccessNeedInit')}`))
    }
  }
  catch {
    // Never break the installer flow because of preflight failures.
  }
}
