/**
 * Skill Registry — SKILL.md frontmatter 驱动的技能发现与命令生成
 *
 * 移植自 code-abyss skill-registry.js，TypeScript 化。
 * 核心功能：
 * 1. 递归扫描 templates/skills/ 下所有 SKILL.md
 * 2. 解析 frontmatter 提取 name/description/user-invocable 等元数据
 * 3. 为 user-invocable=true 的技能自动生成 slash commands
 */

import fs from 'fs-extra'
import { basename, join, relative, sep } from 'pathe'

// ═══════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════

// 新增可选分类前，需先扩展这个联合类型、下方 inferCategory() 的目录映射、
// 以及 CATEGORY_DIR_MAP 三处；清理逻辑（installSkillFiles/installSkillCommands）
// 本身届时可直接复用，不需要重写。
export type SkillCategory = 'tool' | 'domain' | 'orchestration' | 'impeccable' | 'root'
export type SkillRuntimeType = 'scripted' | 'knowledge'

/**
 * 分类标识 → 模板/安装目录名的显式映射。
 * 分类标识不等于目录名（如 tool→tools、domain→domains 单复数不一致），
 * 复制过滤（fs.copy filter）与历史目录清理（fs.remove）共用这份真源。
 * root 不对应一个可整体删除的子目录（技能直接放在 skills 根下），留空字符串。
 */
export const CATEGORY_DIR_MAP: Record<SkillCategory, string> = {
  tool: 'tools',
  domain: 'domains',
  orchestration: 'orchestration',
  impeccable: 'impeccable',
  root: '',
}

export interface SkillMeta {
  /** kebab-case slug, e.g. 'red-team' */
  name: string
  /** Human-readable description */
  description: string
  /** Whether to auto-generate a slash command */
  userInvocable: boolean
  /** Allowed Claude tools for this skill */
  allowedTools: string[]
  /** Argument hint shown to user, e.g. '[target]' */
  argumentHint: string
  /** Optional aliases for the skill name */
  aliases: string[]
  /** Inferred from directory: tool/domain/orchestration/impeccable/root */
  category: SkillCategory
  /** scripted (has scripts/) or knowledge (no scripts) */
  runtimeType: SkillRuntimeType
  /** Relative path from skills root, e.g. 'domains/security' */
  relPath: string
  /** Absolute path to the SKILL.md file */
  skillPath: string
  /** Absolute path to the script .js file (if scripted) */
  scriptPath: string | null
}

// ═══════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════

const DEFAULT_ALLOWED_TOOLS = ['Read']
const NAME_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const TOOL_NAME_RE = /^[A-Z][A-Za-z0-9]*$/
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype'])
const SKIP_NAMES = new Set(['__pycache__', '.DS_Store', 'Thumbs.db', '.git', 'node_modules'])

// ═══════════════════════════════════════════════════════
// Frontmatter parsing
// ═══════════════════════════════════════════════════════

/**
 * Parse YAML frontmatter from a markdown file.
 * Returns a plain key-value object, or null if no frontmatter found.
 */
export function parseFrontmatter(content: string): Record<string, string> | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return null

  const meta: Record<string, string> = Object.create(null)
  for (const rawLine of match[1].split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const m = rawLine.match(/^([\w][\w-]*)\s*:\s*(.+)$/)
    if (!m) continue // Skip malformed lines instead of throwing

    if (!UNSAFE_KEYS.has(m[1])) {
      meta[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
    }
  }
  return Object.keys(meta).length > 0 ? meta : null
}

// ═══════════════════════════════════════════════════════
// Skill normalization
// ═══════════════════════════════════════════════════════

function inferCategory(relPath: string): SkillCategory {
  const normalized = relPath.split(sep).join('/')
  const head = normalized.split('/')[0]
  if (head === 'tools') return 'tool'
  if (head === 'domains') return 'domain'
  if (head === 'orchestration') return 'orchestration'
  if (head === 'impeccable') return 'impeccable'
  return 'root'
}

function listScriptEntries(skillDir: string): string[] {
  const scriptsDir = join(skillDir, 'scripts')
  try {
    return fs.readdirSync(scriptsDir)
      .filter((name: string) => name.endsWith('.js'))
      .sort()
      .map((name: string) => join(scriptsDir, name))
  }
  catch {
    return []
  }
}

function normalizeAllowedTools(value: string | undefined): string[] {
  if (!value || value.trim() === '') return [...DEFAULT_ALLOWED_TOOLS]

  const tools = value.split(',').map(t => t.trim()).filter(Boolean)
  if (tools.length === 0) return [...DEFAULT_ALLOWED_TOOLS]

  // Validate tool names but don't throw — just filter invalid ones
  return tools.filter(t => TOOL_NAME_RE.test(t))
}

function normalizeSkillRecord(skillsDir: string, skillDir: string, meta: Record<string, string>): SkillMeta | null {
  const relPath = relative(skillsDir, skillDir)
  const scriptEntries = listScriptEntries(skillDir)

  // Skip if more than 1 script (ambiguous)
  if (scriptEntries.length > 1) return null

  const name = meta.name?.trim()
  if (!name || !NAME_SLUG_RE.test(name)) return null

  const description = meta.description?.trim()
  if (!description) return null

  // user-invocable defaults to false if missing
  const userInvocable = String(meta['user-invocable'] || 'false').toLowerCase() === 'true'

  return {
    name,
    description,
    userInvocable,
    allowedTools: normalizeAllowedTools(meta['allowed-tools']),
    argumentHint: meta['argument-hint'] || '',
    aliases: meta.aliases
      ? meta.aliases.split(',').map(a => a.trim()).filter(Boolean)
      : [],
    category: inferCategory(relPath),
    runtimeType: scriptEntries.length === 1 ? 'scripted' : 'knowledge',
    relPath,
    skillPath: join(skillDir, 'SKILL.md'),
    scriptPath: scriptEntries[0] || null,
  }
}

// ═══════════════════════════════════════════════════════
// Skill collection
// ═══════════════════════════════════════════════════════

/**
 * Recursively scan a skills directory and collect all valid skill definitions.
 */
export function collectSkills(skillsDir: string): SkillMeta[] {
  const results: SkillMeta[] = []
  const seenNames = new Set<string>()

  function scan(dir: string): void {
    const skillMd = join(dir, 'SKILL.md')
    if (fs.existsSync(skillMd)) {
      try {
        const content = fs.readFileSync(skillMd, 'utf8')
        const meta = parseFrontmatter(content)
        if (meta) {
          const skill = normalizeSkillRecord(skillsDir, dir, meta)
          if (skill && !seenNames.has(skill.name)) {
            seenNames.add(skill.name)
            results.push(skill)
          }
        }
      }
      catch {
        // Skip unparseable skills
      }
    }

    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true }) as fs.Dirent[]
    }
    catch {
      return
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (entry.name === 'scripts' || entry.name === 'agents' || SKIP_NAMES.has(entry.name)) continue
      scan(join(dir, entry.name))
    }
  }

  scan(skillsDir)
  return results.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Collect only user-invocable skills.
 */
export function collectInvocableSkills(skillsDir: string): SkillMeta[] {
  return collectSkills(skillsDir).filter(s => s.userInvocable)
}

// ═══════════════════════════════════════════════════════
// Command generation
// ═══════════════════════════════════════════════════════

/**
 * Generate slash command content for a user-invocable skill.
 *
 * For knowledge skills: instructs Claude to read the SKILL.md and follow its guidance.
 * For scripted skills: runs the script via run_skill.js.
 */
export function generateCommandContent(skill: SkillMeta, skillsInstallDir: string): string {
  const skillMdPath = join(skillsInstallDir, skill.relPath, 'SKILL.md')
  const runSkillPath = join(skillsInstallDir, 'run_skill.js')

  // Frontmatter is REQUIRED — CC command parser fails on files without it,
  // cascading to break ALL commands in the same directory (and beyond).
  const frontmatter = [
    '---',
    `description: '${skill.description.replace(/'/g, "''")}'`,
    '---',
  ].join('\n')

  if (skill.runtimeType === 'scripted') {
    return [
      frontmatter,
      '',
      `# ${skill.name}`,
      '',
      skill.description,
      '',
      `## 执行`,
      '',
      '执行以下命令：',
      '',
      '```bash',
      `node "${runSkillPath}" ${skill.name} $ARGUMENTS`,
      '```',
      '',
      `如需了解此技能的详细说明，请读取: ${skillMdPath}`,
    ].join('\n')
  }

  // Knowledge skill
  return [
    frontmatter,
    '',
    `# ${skill.name}`,
    '',
    skill.description,
    '',
    `## 指令`,
    '',
    `读取技能秘典文件 \`${skillMdPath}\`，按照其中的指导完成魔尊的任务。`,
    '',
    `\`\`\``,
    `$ARGUMENTS`,
    `\`\`\``,
  ].join('\n')
}

/**
 * 校验命令文件内容是否命中"本生成器产出"的指纹：
 * `# <skill名称>` 标题行 + 该skill安装路径子串（SKILL.md 路径或 run_skill.js 路径）两者都命中才算。
 * 用于清理候选文件时区分"本工具历史生成"与"用户自定义同名文件"。
 */
function hasGeneratedFingerprint(content: string, skill: SkillMeta, skillsInstallDir: string): boolean {
  const titleLine = `# ${skill.name}`
  const hasTitle = content.split('\n').some(line => line.trim() === titleLine)
  if (!hasTitle) return false

  if (skill.runtimeType === 'scripted') {
    return content.includes(join(skillsInstallDir, 'run_skill.js'))
  }
  return content.includes(join(skillsInstallDir, skill.relPath, 'SKILL.md'))
}

/**
 * 扫描当前模板里指定分类下定义的skill名称清单。
 * 名称清单是运行时确定性事实（当前已装 npm 包里的 SKILL.md 扫描结果），
 * 跟历史命令文件是否带标记无关——天然覆盖本变更上线前的历史安装。
 */
function collectSkillNamesByCategory(skillsTemplateDir: string, categories: SkillCategory[]): Set<string> {
  if (categories.length === 0) return new Set()
  return new Set(
    collectInvocableSkills(skillsTemplateDir)
      .filter(s => categories.includes(s.category))
      .map(s => s.name),
  )
}

export interface InstallSkillCommandsResult {
  /** 本次新生成的命令名称列表 */
  generated: string[]
  /** 被跳过分类、且指纹校验通过后删除的历史命令名称列表 */
  removedSkillCommands: string[]
  /** 文件名撞车但指纹不匹配（疑似用户自定义），跳过清理的文件名列表 */
  skippedCleanupFiles: string[]
}

/**
 * Install auto-generated commands for all user-invocable skills.
 *
 * @param skillsTemplateDir - Path to templates/skills/ (source)
 * @param skillsInstallDir - Path to ~/.claude/skills/ly/ (installed destination)
 * @param commandsDir - Path to ~/.claude/commands/ly/ (command output)
 * @param existingCommandNames - Set of command names already defined in installer-data.ts (to avoid conflicts)
 * @returns Generated command names + cleanup outcome for skipped categories
 */
export async function installSkillCommands(
  skillsTemplateDir: string,
  skillsInstallDir: string,
  commandsDir: string,
  existingCommandNames: Set<string>,
  skipCategories: SkillCategory[] = [],
): Promise<InstallSkillCommandsResult> {
  const allInvocableSkills = collectInvocableSkills(skillsTemplateDir)
  const invocableSkills = allInvocableSkills.filter(s => !skipCategories.includes(s.category))
  const generated: string[] = []

  await fs.ensureDir(commandsDir)

  for (const skill of invocableSkills) {
    // Skip if a command with this name already exists in installer-data.ts
    if (existingCommandNames.has(skill.name)) continue

    const content = generateCommandContent(skill, skillsInstallDir)
    const cmdPath = join(commandsDir, `${skill.name}.md`)
    await fs.writeFile(cmdPath, content, 'utf-8')
    generated.push(skill.name)
  }

  // 清理：被跳过分类的skill名称清单里，命中commandsDir已存在的文件——覆盖历史安装
  const removedSkillCommands: string[] = []
  const skippedCleanupFiles: string[] = []
  const skippedSkillNames = collectSkillNamesByCategory(skillsTemplateDir, skipCategories)
  for (const name of skippedSkillNames) {
    const cmdPath = join(commandsDir, `${name}.md`)
    if (!(await fs.pathExists(cmdPath))) continue

    const skill = allInvocableSkills.find(s => s.name === name)
    const content = await fs.readFile(cmdPath, 'utf-8').catch(() => '')
    if (skill && hasGeneratedFingerprint(content, skill, skillsInstallDir)) {
      await fs.remove(cmdPath)
      removedSkillCommands.push(name)
    }
    else {
      skippedCleanupFiles.push(name)
    }
  }

  return { generated, removedSkillCommands, skippedCleanupFiles }
}
