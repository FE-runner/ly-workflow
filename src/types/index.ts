// 支持的语言
export type SupportedLang = 'zh-CN' | 'en'

// 模型类型（审查/实施阶段可选后端；claude 仅供 wrapper 内部兼容，routing 配置不再允许选它）
export type ModelType = 'codex' | 'claude' | 'hermes' | 'openclaw'

// 模型路由配置：Claude 是总指挥（出方案/裁决/commit），审查与实施阶段可选独立后端
export interface ModelRouting {
  reviewer: ModelType
  implementer: ModelType
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
  mcp: {
    provider: string
    setup_url: string
  }
  performance?: {
    liteMode?: boolean // 轻量模式：禁用 Web UI，更快响应
    skipImpeccable?: boolean // 跳过 Impeccable 前端设计命令安装
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
  skipMcp?: boolean // 更新时跳过 MCP 配置
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
  installedSkills?: number
  installedSkillCommands?: number
  installedRules?: boolean
  errors: string[]
  configPath: string
  binPath?: string
  binInstalled?: boolean
  /** 因分类被跳过而删除的历史命令文件名（不含 .md） */
  removedSkillCommands: string[]
  /** 因分类被跳过而整体删除的历史技能目录名 */
  removedSkillDirectories: string[]
  /** 文件名与被跳过分类的skill撞车、但指纹校验不通过而跳过清理的文件名 */
  skippedCleanupFiles: string[]
}

// ace-tool 配置
export interface AceToolConfig {
  baseUrl: string
  token: string
}

// fast-context (Windsurf Fast Context) 配置
export interface FastContextConfig {
  apiKey?: string // WINDSURF_API_KEY (本地装 Windsurf 登录后可自动提取)
  includeSnippets?: boolean // FC_INCLUDE_SNIPPETS — true 返回完整代码片段
}

// Re-export CLI types
export * from './cli'
