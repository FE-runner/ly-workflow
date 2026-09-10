import type { CAC } from 'cac'
import type { CliOptions } from './types'
import ansis from 'ansis'
import { version } from '../package.json'
import { homedir } from 'node:os'
import { join } from 'pathe'
import { doctor, status } from './commands/doctor'
import { init } from './commands/init'
import { showMainMenu } from './commands/menu'
import { i18n, initI18n } from './i18n'
import { readLyConfig } from './utils/config'
import { checkExternalDeps } from './utils/preflight'
import { uninstallWorkflows } from './utils/installer'

function customizeHelp(sections: any[]): any[] {
  sections.unshift({
    title: '',
    body: ansis.cyan.bold(`ly-workflow — Claude 主导开发, Codex 独立审查 v${version}`),
  })

  sections.push({
    title: ansis.yellow(i18n.t('cli:help.commands')),
    body: [
      `  ${ansis.cyan('ly')}              ${i18n.t('cli:help.commandDescriptions.showMenu')}`,
      `  ${ansis.cyan('ly init')} | ${ansis.cyan('i')}     ${i18n.t('cli:help.commandDescriptions.initConfig')}`,
      `  ${ansis.cyan('ly doctor')}       Check installation health`,
      `  ${ansis.cyan('ly status')}       Show installation overview`,
      `  ${ansis.cyan('ly uninstall')}    Uninstall ly-workflow (non-interactive)`,
      '',
      ansis.gray(`  ${i18n.t('cli:help.shortcuts')}`),
      `  ${ansis.cyan('ly i')}            ${i18n.t('cli:help.shortcutDescriptions.quickInit')}`,
    ].join('\n'),
  })

  sections.push({
    title: ansis.yellow(i18n.t('cli:help.options')),
    body: [
      `  ${ansis.green('--lang, -l')} <lang>         ${i18n.t('cli:help.optionDescriptions.displayLanguage')} (zh-CN, en)`,
      `  ${ansis.green('--force, -f')}               ${i18n.t('cli:help.optionDescriptions.forceOverwrite')}`,
      `  ${ansis.green('--help, -h')}                ${i18n.t('cli:help.optionDescriptions.displayHelp')}`,
      `  ${ansis.green('--version, -v')}             ${i18n.t('cli:help.optionDescriptions.displayVersion')}`,
      '',
      ansis.gray(`  ${i18n.t('cli:help.nonInteractiveMode')}`),
      `  ${ansis.green('--skip-prompt, -s')}         ${i18n.t('cli:help.optionDescriptions.skipAllPrompts')}`,
      `  ${ansis.green('--reviewer, -r')} <model>    ${i18n.t('cli:help.optionDescriptions.reviewerModel')}`,
      `  ${ansis.green('--implementer')} <model>     ${i18n.t('cli:help.optionDescriptions.implementerModel')}`,
      `  ${ansis.green('--workflows, -w')} <list>    ${i18n.t('cli:help.optionDescriptions.workflows')}`,
      `  ${ansis.green('--install-dir, -d')} <path>  ${i18n.t('cli:help.optionDescriptions.installDir')}`,
    ].join('\n'),
  })

  sections.push({
    title: ansis.yellow(i18n.t('cli:help.examples')),
    body: [
      ansis.gray(`  # ${i18n.t('cli:help.exampleDescriptions.showInteractiveMenu')}`),
      `  ${ansis.cyan('npx ly-workflow')}`,
      '',
      ansis.gray(`  # ${i18n.t('cli:help.exampleDescriptions.runFullInitialization')}`),
      `  ${ansis.cyan('npx ly-workflow init')}`,
      `  ${ansis.cyan('npx ly-workflow i')}`,
      '',
      ansis.gray(`  # ${i18n.t('cli:help.exampleDescriptions.customModels')}`),
      `  ${ansis.cyan('npx ly-workflow i --reviewer hermes --implementer codex')}`,
      '',
    ].join('\n'),
  })

  return sections
}

export async function setupCommands(cli: CAC): Promise<void> {
  try {
    const config = await readLyConfig()
    const defaultLang = config?.general?.language || 'zh-CN'
    await initI18n(defaultLang)
  }
  catch {
    await initI18n('zh-CN')
  }

  // Default command - show menu
  cli
    .command('', i18n.t('cli:help.commandDescriptions.showMenu'))
    .option('--lang, -l <lang>', `${i18n.t('cli:help.optionDescriptions.displayLanguage')} (zh-CN, en)`)
    .action(async (options: CliOptions) => {
      if (options.lang) {
        await initI18n(options.lang)
      }
      await checkExternalDeps()
      await showMainMenu()
    })

  // Init command
  cli
    .command('init', i18n.t('cli:help.commandDescriptions.initConfig'))
    .alias('i')
    .option('--lang, -l <lang>', `${i18n.t('cli:help.optionDescriptions.displayLanguage')} (zh-CN, en)`)
    .option('--force, -f', i18n.t('cli:help.optionDescriptions.forceOverwrite'))
    .option('--skip-prompt, -s', i18n.t('cli:help.optionDescriptions.skipAllPrompts'))
    .option('--reviewer, -r <model>', i18n.t('cli:help.optionDescriptions.reviewerModel'))
    .option('--implementer <model>', i18n.t('cli:help.optionDescriptions.implementerModel'))
    .option('--workflows, -w <workflows>', i18n.t('cli:help.optionDescriptions.workflows'))
    .option('--install-dir, -d <path>', i18n.t('cli:help.optionDescriptions.installDir'))
    .action(async (options: CliOptions) => {
      if (options.lang) {
        await initI18n(options.lang)
      }
      await checkExternalDeps({ skipPrompt: options.skipPrompt })
      await init(options)
    })

  // Doctor: environment health check
  cli
    .command('doctor', 'Check ly-workflow installation health')
    .action(async () => { await doctor() })

  // Status: show current installation overview
  cli
    .command('status', 'Show ly-workflow installation status')
    .action(async () => { await status() })

  // Uninstall ly-workflow (Claude Code mode): non-interactive
  cli
    .command('uninstall', 'Uninstall ly-workflow workflows from ~/.claude/ (non-interactive)')
    .action(async () => {
      const installDir = join(homedir(), '.claude')
      const result = await uninstallWorkflows(installDir)
      if (result.success) {
        console.log(ansis.green('✓ ly-workflow uninstalled'))
        if (result.removedCommands.length > 0) console.log(ansis.gray(`  Commands: ${result.removedCommands.length} removed`))
        if (result.removedHooks) console.log(ansis.gray('  Hooks: removed'))
        if (result.removedBin) console.log(ansis.gray('  Binary: removed'))
      }
      else {
        console.error(ansis.red('✗ Uninstall failed'))
        for (const err of result.errors) console.error(ansis.gray(`  ${err}`))
        process.exitCode = 1
      }
    })

  cli.help(sections => customizeHelp(sections))
  cli.version(version)
}
