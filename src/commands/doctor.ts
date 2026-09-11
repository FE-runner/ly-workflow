import ansis from 'ansis'
import fs from 'fs-extra'
import { homedir } from 'node:os'
import { join } from 'pathe'
import { readLyConfig } from '../utils/config'
import { detectOpenspecCli, detectOpsxSkills } from '../utils/preflight'
import { i18n } from '../i18n'
import { version as packageVersion } from '../../package.json'

const OK = ansis.green('✓')
const WARN = ansis.yellow('⚠')
const FAIL = ansis.red('✗')

async function fileExists(p: string): Promise<boolean> {
  return fs.pathExists(p)
}

async function dirFiles(p: string): Promise<string[]> {
  if (!(await fs.pathExists(p))) return []
  return (await fs.readdir(p)).filter(f => !f.startsWith('.'))
}

function execSafe(cmd: string): string | null {
  try {
    const { execSync } = require('node:child_process') as typeof import('node:child_process')
    return execSync(cmd, { stdio: 'pipe', timeout: 10000 }).toString().trim()
  }
  catch { return null }
}

export async function doctor(): Promise<void> {
  const installDir = join(homedir(), '.claude')
  const checks: { label: string, status: string, detail: string }[] = []

  // 1. Node version
  const nodeVer = process.version
  const major = Number.parseInt(nodeVer.slice(1))
  checks.push({
    label: 'Node.js',
    status: major >= 20 ? OK : FAIL,
    detail: `${nodeVer}${major < 20 ? ' (requires >=20)' : ''}`,
  })

  // 2. ly-workflow config
  const config = await readLyConfig()
  checks.push({
    label: 'ly-workflow config',
    status: config ? OK : WARN,
    detail: config ? `v${config.general?.version || '?'}, lang=${config.general?.language || '?'}` : 'Not found (~/.claude/.ly/config.toml)',
  })

  // 3. Commands
  const cmds = await dirFiles(join(installDir, 'commands', 'ly'))
  const cmdCount = cmds.filter(f => f.endsWith('.md')).length
  checks.push({
    label: 'Commands',
    status: cmdCount > 0 ? OK : FAIL,
    detail: `${cmdCount} installed`,
  })

  // 4. ly-wrapper script
  const wrapperPath = join(installDir, 'bin', 'ly-wrapper')
  let binaryVer: string | null = null
  if (await fileExists(wrapperPath)) {
    binaryVer = execSafe(`"${wrapperPath}" --version`)
    if (binaryVer) binaryVer = binaryVer.replace(/^.*version\s*/, '')
  }
  checks.push({
    label: 'ly-wrapper',
    status: binaryVer ? OK : FAIL,
    detail: binaryVer ? `v${binaryVer}` : `Not found (${wrapperPath})`,
  })

  // 5. Rules
  const rulesDir = join(installDir, 'rules')
  const rules = (await dirFiles(rulesDir)).filter(f => f.startsWith('ly-'))
  checks.push({
    label: 'Rules',
    status: rules.length >= 2 ? OK : rules.length > 0 ? WARN : FAIL,
    detail: rules.length > 0 ? rules.join(', ') : 'None',
  })

  // 6. OpenSpec CLI
  const openspecCli = await detectOpenspecCli()
  checks.push({
    label: 'OpenSpec CLI',
    status: openspecCli.installed ? OK : WARN,
    detail: openspecCli.installed ? `v${openspecCli.version}` : i18n.t('common:doctor.openspecCliMissing'),
  })

  // 7. OpenSpec skills (opsx)
  const hasOpsxSkills = detectOpsxSkills()
  checks.push({
    label: 'OpenSpec skills',
    status: hasOpsxSkills ? OK : WARN,
    detail: hasOpsxSkills ? i18n.t('common:doctor.skillsInitialized') : i18n.t('common:doctor.skillsMissing'),
  })

  // Output
  console.log()
  console.log(ansis.cyan.bold(`  ly-workflow Doctor v${packageVersion}`))
  console.log()
  for (const { label, status, detail } of checks) {
    console.log(`  ${status} ${ansis.bold(label.padEnd(20))} ${ansis.gray(detail)}`)
  }

  const failures = checks.filter(c => c.status === FAIL)
  console.log()
  if (failures.length === 0) {
    console.log(ansis.green('  All checks passed.'))
  }
  else {
    console.log(ansis.red(`  ${failures.length} issue(s) found. Run ${ansis.cyan('npx ly-workflow')} to reinstall.`))
  }
  console.log()
}

export async function status(): Promise<void> {
  const installDir = join(homedir(), '.claude')

  // Version
  const config = await readLyConfig()
  const installedVer = config?.general?.version || 'unknown'
  const latestVer = execSafe('npm view ly-workflow version') || 'unknown'

  // Commands
  const cmds = (await dirFiles(join(installDir, 'commands', 'ly'))).filter(f => f.endsWith('.md'))

  // ly-wrapper script
  const wrapperPath = join(installDir, 'bin', 'ly-wrapper')
  let binaryVer = '—'
  if (await fileExists(wrapperPath)) {
    const raw = execSafe(`"${wrapperPath}" --version`)
    if (raw) binaryVer = raw.replace(/^.*version\s*/, 'v')
  }

  // Model routing
  const reviewer = config?.routing?.reviewer || 'codex'

  // Active tasks
  let activeTasks = 0
  const tasksDir = join(process.cwd(), '.ly', 'tasks')
  if (await fileExists(tasksDir)) {
    for (const d of await fs.readdir(tasksDir)) {
      if (d === 'archive') continue
      const taskJson = join(tasksDir, d, 'task.json')
      if (await fileExists(taskJson)) {
        try {
          const t = await fs.readJSON(taskJson)
          const s = String(t.status || '').toLowerCase()
          if (!['completed', 'complete', 'done', 'finished', 'archived', 'cancelled', 'closed'].includes(s)) {
            activeTasks++
          }
        }
        catch { /* ignore */ }
      }
    }
  }

  // OpenSpec dependency (same detectors as installer preflight)
  const openspecCli = await detectOpenspecCli()
  const openspecSkills = detectOpsxSkills()

  // Output
  console.log()
  console.log(ansis.cyan.bold('  ly-workflow Status'))
  console.log()
  console.log(`  ${ansis.bold('Version')}        ${installedVer}${installedVer !== latestVer ? ansis.yellow(` (latest: ${latestVer})`) : ansis.green(' (up to date)')}`)
  console.log(`  ${ansis.bold('Commands')}       ${cmds.length}`)
  console.log(`  ${ansis.bold('ly-wrapper')}      ${binaryVer}`)
  console.log(`  ${ansis.bold('Reviewer')}       ${reviewer}`)
  console.log(`  ${ansis.bold('OpenSpec CLI')}   ${openspecCli.installed ? `v${openspecCli.version}` : ansis.yellow(i18n.t('common:doctor.openspecCliMissing'))}`)
  console.log(`  ${ansis.bold('OpenSpec skills')}${openspecSkills ? ` ${i18n.t('common:doctor.skillsInitialized')}` : ansis.yellow(` ${i18n.t('common:doctor.skillsMissing')}`)}`)
  console.log(`  ${ansis.bold('Active tasks')}   ${activeTasks > 0 ? ansis.yellow(String(activeTasks)) : '0'}`)
  console.log()
}
