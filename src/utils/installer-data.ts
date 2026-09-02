import type { WorkflowConfig } from '../types'

// ═══════════════════════════════════════════════════════
// Command builder — adding a new command = 1 function call
// ═══════════════════════════════════════════════════════

type CommandCategory = 'init' | 'git' | 'opsx' | 'review' | 'release'

/**
 * Create a WorkflowConfig with sensible defaults.
 * @param cmdOverride — Use when the slash command name differs from the id (e.g. 'init-project' → 'init')
 */
function cmd(
  id: string,
  order: number,
  category: CommandCategory,
  name: string,
  nameEn: string,
  description: string,
  descriptionEn: string,
  cmdOverride?: string,
): WorkflowConfig {
  return {
    id,
    name,
    nameEn,
    category,
    commands: [cmdOverride ?? id],
    defaultSelected: true,
    order,
    description,
    descriptionEn,
  }
}

// ═══════════════════════════════════════════════════════
// Core commands (always installed)
// Source: templates/commands/
// ═══════════════════════════════════════════════════════

const CORE_CONFIGS: WorkflowConfig[] = [
  // ── Independent Tools ────────────────────────────────
  cmd('init-project', 0, 'init', '项目初始化', 'Project Init', '生成 CLAUDE.md，初始化 OpenSpec 目录结构', 'Generate CLAUDE.md, initialize OpenSpec directory structure', 'init'),

  // ── Git ──────────────────────────────────────────────
  cmd('commit', 10, 'git', 'Git 提交', 'Git Commit', '智能生成 conventional commit 信息', 'Smart conventional commit message generation'),
  cmd('rollback', 11, 'git', 'Git 回滚', 'Git Rollback', '交互式回滚分支到历史版本', 'Interactive rollback to historical version'),
  cmd('clean-branches', 12, 'git', 'Git 清理分支', 'Git Clean Branches', '安全清理已合并或过期分支', 'Safely clean merged or stale branches'),
  cmd('worktree', 13, 'git', 'Git Worktree', 'Git Worktree', '管理 Git worktree', 'Manage Git worktree'),

  // ── OpenSpec lifecycle (thin delegation to opsx:* skills) ──
  cmd('explore', 20, 'opsx', '探索模式', 'Explore', '委托 opsx:explore，想清楚再动手', 'Delegates to opsx:explore — think before you build'),
  cmd('propose', 21, 'opsx', '提出方案', 'Propose', '委托 opsx:propose，生成 proposal/design/tasks', 'Delegates to opsx:propose — generates proposal/design/tasks'),
  cmd('apply', 22, 'opsx', '实施方案', 'Apply', '委托 opsx:apply，按 tasks 实施', 'Delegates to opsx:apply — implements tasks'),
  cmd('archive', 23, 'opsx', '归档方案', 'Archive', '委托 opsx:archive，完成后归档', 'Delegates to opsx:archive — archives a completed change'),

  // ── Review gates (Codex-backed) ──────────────────────
  cmd('review-plan', 30, 'review', '方案审查', 'Review Plan', '读取 OpenSpec change 的 proposal/design/tasks，Codex 审查方案合理性', 'Reads OpenSpec change artifacts, Codex reviews plan soundness'),
  cmd('review-code', 31, 'review', '代码审查', 'Review Code', '读取 git diff，Codex 审查代码变更，分级输出 Critical/Warning/Info', 'Reads git diff, Codex reviews code changes with severity grading'),

  // ── Release pipeline ───────────────────────────────────
  cmd('release', 40, 'release', 'GitFlow 发版', 'GitFlow Release', 'GitFlow 四场景发版流程，SemVer 自动推导版本号', 'GitFlow branching workflow with SemVer auto-detection'),
  cmd('changelog', 41, 'release', '生成 Changelog', 'Generate Changelog', 'Keep a Changelog 格式生成 CHANGELOG.md，按 commit 前缀分组', 'Generate Keep a Changelog format CHANGELOG.md from commit history'),
  cmd('publish', 42, 'release', 'npm 发布', 'npm Publish', 'npm 包发布：bmc 私域/GitHub/npmjs/CI 四场景', 'npm publish to bmc Nexus/GitHub/npmjs/CI targets'),
]

const WORKFLOW_CONFIGS: WorkflowConfig[] = CORE_CONFIGS

// ═══════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════

export function getWorkflowConfigs(): WorkflowConfig[] {
  return WORKFLOW_CONFIGS.sort((a, b) => a.order - b.order)
}

export function getWorkflowById(id: string): WorkflowConfig | undefined {
  return WORKFLOW_CONFIGS.find(w => w.id === id)
}

/** Core command IDs (always installed) */
export function getCoreCommandIds(): string[] {
  return CORE_CONFIGS.map(w => w.id)
}

/** All command IDs */
export function getAllCommandIds(): string[] {
  return WORKFLOW_CONFIGS.map(w => w.id)
}

/**
 * @deprecated Use getCoreCommandIds() or getAllCommandIds() instead.
 */
export const WORKFLOW_PRESETS = {
  full: {
    name: '完整',
    nameEn: 'Full',
    description: `全部命令（${WORKFLOW_CONFIGS.length}个）`,
    descriptionEn: `All commands (${WORKFLOW_CONFIGS.length})`,
    workflows: WORKFLOW_CONFIGS.map(w => w.id),
  },
}

export type WorkflowPreset = keyof typeof WORKFLOW_PRESETS

export function getWorkflowPreset(preset: WorkflowPreset): string[] {
  return [...WORKFLOW_PRESETS[preset].workflows]
}
