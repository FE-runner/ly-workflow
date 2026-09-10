import { describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cleanupLegacyArtifacts } from '../legacy-cleanup'

/**
 * legacy-cleanup 支持注入 claudeDir/codexDir/homeDir——本测试全部在
 * mkdtemp 临时目录构造产物后运行，绝不触碰真实 homedir。
 * 覆盖：产物被清、其他条目保留、AGENTS.md 非 LY 内容保留、幂等、不存在的目标不报错。
 */

function write(path: string, content: string): void {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, content)
}

function makeFakeHome(): string {
  const home = mkdtempSync(join(tmpdir(), 'ly-cleanup-test-'))
  const claude = join(home, '.claude')
  const codex = join(home, '.codex')
  const gemini = join(home, '.gemini')

  // 假 ~/.claude 产物
  write(join(claude, 'skills/ly/impeccable/SKILL.md'), 'legacy skill')
  write(join(claude, 'hooks/ly/subagent-context.js'), '// legacy hook')
  write(join(claude, 'rules/ly-skill-routing.md'), '# routing rules')
  write(join(claude, 'bin/codeagent-wrapper'), 'old go binary')
  // settings.json：一条指向 hooks/ly 的 hook 条目 + 一条其他工具条目；permissions 含 codeagent-wrapper + 其他
  write(join(claude, 'settings.json'), JSON.stringify({
    hooks: {
      SessionStart: [
        { matcher: '*', hooks: [{ command: join(claude, 'hooks/ly/session-start.js') }] },
        { matcher: '*', hooks: [{ command: '/usr/bin/other-tool' }] },
      ],
    },
    permissions: {
      allow: ['Bash(*codeagent-wrapper*)', 'Bash(ls)'],
    },
  }))
  // 假 ~/.claude.json：ace-tool + other-server
  write(join(home, '.claude.json'), JSON.stringify({
    mcpServers: {
      'ace-tool': { command: 'ace' },
      'other-server': { command: 'keep-me' },
    },
  }))

  // 假 ~/.codex 产物（AGENTS.md 用无 ` --` 后缀的起始标记，覆盖 em dash 变体兼容）
  write(join(codex, 'AGENTS.md'), [
    '# My Codex Config',
    '',
    '<!-- LY:START',
    'ly managed content',
    '-- LY:END -->',
    '',
    'User content stays',
    '',
  ].join('\n'))
  write(join(codex, 'config.toml'), [
    '# ly-workflow managed section',
    '# Installed by: npx ly-workflow init',
    '',
    '[model]',
    'gpt = "5"',
    '',
    '[features.multi_agent_v2]',
    'enabled = true',
    'extra = "value"',
    '',
    '[mcp_servers.user_own]',
    'user-key = "keep-me"',
    'ace-tool = { command = "ace" }',
    'context7 = "legacy"',
    '',
  ].join('\n'))
  write(join(codex, 'agents/ly-review.toml'), '# legacy agent')
  write(join(codex, 'hooks.json'), '{}')
  write(join(codex, 'hooks/ly-workflow.py'), '# legacy hook')
  write(join(codex, '.ly-version'), '1.0.0')

  // 假 ~/.gemini/settings.json：context7 + other-mcp
  write(join(gemini, 'settings.json'), JSON.stringify({
    mcpServers: {
      context7: { command: 'npx' },
      'other-mcp': { command: 'keep-me' },
    },
  }))

  return home
}

describe('cleanupLegacyArtifacts（注入临时目录）', () => {
  it('清空历史产物、保留非 LY 条目、幂等且不触碰真实 homedir', async () => {
    const home = makeFakeHome()
    try {
      const r = await cleanupLegacyArtifacts({
        claudeDir: join(home, '.claude'),
        codexDir: join(home, '.codex'),
        homeDir: home,
      })
      expect(r.failed).toEqual([])

      // 产物被清
      expect(existsSync(join(home, '.claude/skills/ly/impeccable'))).toBe(false)
      expect(existsSync(join(home, '.claude/hooks/ly/subagent-context.js'))).toBe(false)
      expect(existsSync(join(home, '.claude/rules/ly-skill-routing.md'))).toBe(false)
      expect(existsSync(join(home, '.claude/bin/codeagent-wrapper'))).toBe(false)
      expect(existsSync(join(home, '.codex/AGENTS.md'))).toBe(true) // 文件保留（仅剥区块）
      expect(existsSync(join(home, '.codex/hooks.json'))).toBe(false)
      expect(existsSync(join(home, '.codex/hooks/ly-workflow.py'))).toBe(false)
      expect(existsSync(join(home, '.codex/agents/ly-review.toml'))).toBe(false)
      expect(existsSync(join(home, '.codex/.ly-version'))).toBe(false)

      // settings.json：其他 hook 条目保留、ly 条目移除；permissions 仅移除 codeagent-wrapper 条目
      const settings = JSON.parse(readFileSync(join(home, '.claude/settings.json'), 'utf-8')) as {
        hooks: Record<string, { hooks: { command: string }[] }[]>
        permissions: { allow: string[] }
      }
      const sessionCommands = settings.hooks.SessionStart.flatMap(e => e.hooks.map(h => h.command))
      expect(sessionCommands).toEqual(['/usr/bin/other-tool'])
      expect(settings.permissions.allow).toEqual(['Bash(ls)'])

      // ~/.claude.json：other-server 保留、ace-tool 移除
      const claudeJson = JSON.parse(readFileSync(join(home, '.claude.json'), 'utf-8')) as {
        mcpServers: Record<string, unknown>
      }
      expect(claudeJson.mcpServers['other-server']).toBeDefined()
      expect(claudeJson.mcpServers['ace-tool']).toBeUndefined()

      // AGENTS.md：非 LY 内容保留、LY 区块剥离（含 em dash 变体起始标记）
      const agentsMd = readFileSync(join(home, '.codex/AGENTS.md'), 'utf-8')
      expect(agentsMd).toContain('# My Codex Config')
      expect(agentsMd).toContain('User content stays')
      expect(agentsMd).not.toContain('LY:START')
      expect(agentsMd).not.toContain('ly managed content')

      // config.toml：LY 头部注释 + multi_agent_v2 表 + MCP 单行条目移除；用户配置保留
      const configToml = readFileSync(join(home, '.codex/config.toml'), 'utf-8')
      expect(configToml).not.toContain('# ly-workflow')
      expect(configToml).not.toContain('Installed by: npx ly-workflow')
      expect(configToml).not.toContain('features.multi_agent_v2')
      expect(configToml).not.toContain('enabled = true')
      expect(configToml).not.toContain('ace-tool')
      expect(configToml).not.toContain('context7')
      expect(configToml).toContain('[model]')
      expect(configToml).toContain('gpt = "5"')
      expect(configToml).toContain('[mcp_servers.user_own]')
      expect(configToml).toContain('user-key = "keep-me"')

      // ~/.gemini/settings.json：other-mcp 保留、context7 移除
      const gemini = JSON.parse(readFileSync(join(home, '.gemini/settings.json'), 'utf-8')) as {
        mcpServers: Record<string, unknown>
      }
      expect(gemini.mcpServers['other-mcp']).toBeDefined()
      expect(gemini.mcpServers.context7).toBeUndefined()

      // 幂等：第二次运行全 skipped、零 cleaned、零 failed
      const second = await cleanupLegacyArtifacts({
        claudeDir: join(home, '.claude'),
        codexDir: join(home, '.codex'),
        homeDir: home,
      })
      expect(second.cleaned).toEqual([])
      expect(second.failed).toEqual([])
      expect(second.skipped.length).toBeGreaterThan(0)
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })

  it('目标全部不存在时不报错（failed 为空、全 skipped）', async () => {
    const home = mkdtempSync(join(tmpdir(), 'ly-cleanup-empty-'))
    try {
      const r = await cleanupLegacyArtifacts({
        claudeDir: join(home, '.claude'),
        codexDir: join(home, '.codex'),
        homeDir: home,
      })
      expect(r.failed).toEqual([])
      expect(r.cleaned).toEqual([])
      expect(r.skipped.length).toBeGreaterThan(0)
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })
})
