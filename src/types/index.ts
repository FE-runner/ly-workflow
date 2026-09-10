import type { ImplementerBackend, RoutingBackend } from '../utils/config'

// 支持的语言
export type SupportedLang = 'zh-CN' | 'en'

// 模型类型（审查/实施阶段可选后端；claude 仅供 wrapper 内部兼容）
export type ModelType = 'codex' | 'claude' | 'hermes' | 'openclaw'

// 模型路由配置：Claude 是总指挥（出方案/裁决/commit）
// - reviewer 三选一（codex/hermes/openclaw），不包含 claude——审查必须独立于编排者
// - implementer 四选一（claude/codex/hermes/openclaw），默认 claude——实施对速度敏感，默认本人直做
export interface ModelRouting {
  reviewer: RoutingBackend
  implementer: ImplementerBackend
}

// ly-workflow 配置
export interface LyConfig {
  general: {
    version: string
    language: SupportedLang
    createdAt: string
  }
  routing: ModelRouting
  workflows: {
    installed: string[]
  }
  paths: {
    commands: string
    prompts: string
    backup: string
  }
  performance?: {
    liteMode?: boolean // 轻量模式：审查命令传 --lite 标志
  }
}

// 工作流定义
export interface WorkflowConfig {
  id: string
  name: string
  nameEn: string
  category: string
  commands: string[]
  defaultSelected: boolean
  order: number
  description?: string
  descriptionEn?: string
}

// 初始化选项
export interface InitOptions {
  lang?: SupportedLang
  skipPrompt?: boolean
  force?: boolean
  // 非交互模式参数
  reviewer?: string
  implementer?: string
  workflows?: string
  installDir?: string
}

// 安装结果
export interface InstallResult {
  success: boolean
  installedCommands: string[]
  installedPrompts: string[]
  installedRules?: boolean
  errors: string[]
  configPath: string
  binPath?: string
  binInstalled?: boolean
}

// Re-export CLI types
export * from './cli'
