import type { CcgConfig, SupportedLang } from '../types'

export interface CliOptions {
  lang?: SupportedLang
  force?: boolean
  skipPrompt?: boolean
  skipMcp?: boolean
  reviewer?: string
  workflows?: string
  installDir?: string
}

export type { CcgConfig, SupportedLang }
