import type { LyConfig, SupportedLang } from '../types'

export interface CliOptions {
  lang?: SupportedLang
  force?: boolean
  skipPrompt?: boolean
  skipMcp?: boolean
  reviewer?: string
  implementer?: string
  workflows?: string
  installDir?: string
}

export type { LyConfig, SupportedLang }
