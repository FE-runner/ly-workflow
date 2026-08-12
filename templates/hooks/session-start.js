#!/usr/bin/env node
// ly-workflow Session Start Hook — SessionStart
// Injects full project context when session starts, clears, or compacts.

'use strict';

try {
  const path = require('path');
  const fs = require('fs');
  const {
    findProjectRoot, getActiveTask, readFileSafe,
    detectTechStack, getGitInfo, outputHook
  } = require('./task-utils.js');

  const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const root = findProjectRoot(cwd);

  if (!root) process.exit(0);

  const sections = [];

  // Project info
  const techStack = detectTechStack(root);
  const git = getGitInfo(root);
  sections.push(`<project>
Tech: ${techStack}
Branch: ${git.branch}
Dirty files: ${git.dirtyCount}
Root: ${root}
</project>`);

  // Model routing config
  const configPath = path.join(root, '.ly', 'config.toml');
  if (fs.existsSync(configPath)) {
    const configRaw = readFileSafe(configPath);
    if (configRaw) {
      const frontendMatch = configRaw.match(/primary\s*=\s*"(\w+)"/);
      const models = frontendMatch ? `Configured (see .ly/config.toml)` : 'Default (frontend=gemini, backend=codex)';
      sections.push(`<models>${models}</models>`);
    }
  } else {
    sections.push('<models>Default (frontend=gemini, backend=codex)</models>');
  }

  // Active task
  const task = getActiveTask(root);
  if (task) {
    const taskLines = [
      `<active-task>`,
      `Task: ${task.title || task.id} (${task.status})`,
      `Strategy: ${task.strategy}`,
      `Phase: ${task.currentPhase}`,
    ];

    if (task.gate) taskLines.push(`⛔ GATE: ${task.gate}`);
    taskLines.push(`Next: ${task.nextAction || 'Continue'}`);
    taskLines.push(`Dir: ${task.dir}`);

    // Check for plan/prd
    const planPath = path.join(task.dir, 'plan.md');
    const prdPath = path.join(task.dir, 'requirements.md');
    if (fs.existsSync(planPath)) taskLines.push(`Plan: ${planPath}`);
    if (fs.existsSync(prdPath)) taskLines.push(`PRD: ${prdPath}`);

    taskLines.push('</active-task>');
    sections.push(taskLines.join('\n'));
  } else {
    sections.push('<active-task>No active task. Use /ly:go to start.</active-task>');
  }

  // Spec availability
  const specDir = path.join(root, '.ly', 'spec');
  if (fs.existsSync(specDir)) {
    try {
      const specPaths = [];
      const walk = (dir, prefix) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
          if (entry.isDirectory()) walk(path.join(dir, entry.name), rel);
          else if (entry.name.endsWith('.md')) specPaths.push(rel);
        }
      };
      walk(specDir, '');
      if (specPaths.length > 0) {
        sections.push(`<specs>\nAvailable specs in .ly/spec/:\n${specPaths.map(p => `  - ${p}`).join('\n')}\n</specs>`);
      }
    } catch { /* silent */ }
  }

  // Available commands hint
  sections.push(`<commands>
Key commands: /ly:go (smart entry), /ly:commit, /ly:review
All /ly:* commands available. Use /ly:go for intelligent routing.
</commands>`);

  const context = `<ly-session>\n${sections.join('\n\n')}\n</ly-session>`;
  outputHook('SessionStart', context);
} catch {
  process.exit(0);
}
