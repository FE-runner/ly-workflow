import type { LyConfig, ModelRouting, SupportedLang } from '../types'
import fs from 'fs-extra'
import { homedir } from 'node:os'
import { join } from 'pathe'
import { parse, stringify } from 'smol-toml'
import { version as packageVersion } from '../../package.json'

// v1.4.0: 配置目录统一到 ~/.claude/.ly/
const LY_DIR = join(homedir(), '.claude', '.ly')
const CONFIG_FILE = join(LY_DIR, 'config.toml')

// routing.reviewer 的合法值——claude 已不再可选（Claude 本身是总指挥，
// 不应再被选为被调度的审查 backend）。init.ts、menu.ts 的历史配置读取统一走这个白名单，
// 避免手改 config.toml 残留的非法值被原样透传进最终执行的命令串。
const VALID_ROUTING_BACKENDS = ['codex', 'hermes', 'openclaw'] as const
export type RoutingBackend = typeof VALID_ROUTING_BACKENDS[number]

// routing.implementer 的合法值——四选一，claude（编排者本人实施）为默认。
// 与 reviewer 白名单独立：实施对速度敏感（默认本人直做），审查对独立性敏感（不选 claude）。
const VALID_IMPLEMENTER_BACKENDS = ['claude', 'codex', 'hermes', 'openclaw'] as const
export type ImplementerBackend = typeof VALID_IMPLEMENTER_BACKENDS[number]

export function isValidRoutingBackend(value: unknown): value is RoutingBackend {
  return typeof value === 'string' && (VALID_ROUTING_BACKENDS as readonly string[]).includes(value)
}

export function isValidImplementerBackend(value: unknown): value is ImplementerBackend {
  return typeof value === 'string' && (VALID_IMPLEMENTER_BACKENDS as readonly string[]).includes(value)
}

export function getLyDir(): string {
  return LY_DIR
}

export function getConfigPath(): string {
  return CONFIG_FILE
}

export async function ensureLyDir(): Promise<void> {
  await fs.ensureDir(LY_DIR)
}

export async function readLyConfig(): Promise<LyConfig | null> {
  try {
    if (await fs.pathExists(CONFIG_FILE)) {
      const content = await fs.readFile(CONFIG_FILE, 'utf-8')
      return parse(content) as unknown as LyConfig
    }
  }
  catch {
    // Config doesn't exist or is invalid
  }
  return null
}

export async function writeLyConfig(config: LyConfig): Promise<void> {
  await ensureLyDir()
  const content = stringify(config as any)
  await fs.writeFile(CONFIG_FILE, content, 'utf-8')
}

export function createDefaultConfig(options: {
  language: SupportedLang
  routing: ModelRouting
  installedWorkflows: string[]
  mcpProvider?: string
  liteMode?: boolean
  skipImpeccable?: boolean
}): LyConfig {
  return {
    general: {
      version: packageVersion,
      language: options.language,
      createdAt: new Date().toISOString(),
    },
    routing: options.routing,
    workflows: {
      installed: options.installedWorkflows,
    },
    paths: {
      commands: join(homedir(), '.claude', 'commands', 'ly'),
      prompts: join(LY_DIR, 'prompts'), // v1.4.0: 移到配置目录
      backup: join(LY_DIR, 'backup'),
    },
    mcp: {
      provider: options.mcpProvider || 'fast-context',
      setup_url: 'https://augmentcode.com/',
    },
    performance: {
      liteMode: options.liteMode || false,
      skipImpeccable: options.skipImpeccable || false,
    },
  }
}

export function createDefaultRouting(): ModelRouting {
  return {
    reviewer: 'codex',
    implementer: 'claude',
  }
}
