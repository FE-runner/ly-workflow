#!/usr/bin/env node
// ly-workflow Skill Router Hook — UserPromptSubmit
// Detects domain keywords in user message and injects relevant skill content.
// Fires alongside workflow-state.js on every user prompt.

'use strict';

try {
  const fs = require('fs');
  const path = require('path');
  const { findProjectRoot, outputHook } = require('./task-utils.js');

  // Read hook input (contains user's message)
  let inputData = '';
  if (!process.stdin.isTTY) {
    inputData = fs.readFileSync(0, 'utf-8');
  }

  // Extract user message from hook input
  let userMessage = '';
  try {
    const parsed = JSON.parse(inputData);
    userMessage = parsed.message || parsed.content || parsed.prompt || '';
    if (typeof userMessage === 'object') userMessage = JSON.stringify(userMessage);
  } catch {
    userMessage = inputData;
  }

  if (!userMessage || userMessage.length < 5) process.exit(0);

  const msgLower = userMessage.toLowerCase();

  // Keyword → skill file routing table
  const ROUTES = [
    { keywords: ['渗透', '红队', 'pentest', 'exploit', 'c2', '横向', '提权', 'bypass', 'red team'], skill: 'domains/security/red-team.md', name: '红队渗透' },
    { keywords: ['蓝队', '告警', 'ioc', '应急', '取证', 'siem', 'edr', 'blue team', 'incident'], skill: 'domains/security/blue-team.md', name: '蓝队防御' },
    { keywords: ['sqli', 'xss', 'ssrf', 'rce', 'injection', 'owasp', 'web渗透', 'api安全'], skill: 'domains/security/pentest.md', name: 'Web渗透' },
    { keywords: ['代码审计', '污点分析', 'sink', 'source', '危险函数', 'code audit'], skill: 'domains/security/code-audit.md', name: '代码审计' },
    { keywords: ['逆向', 'pwn', 'fuzzing', '栈溢出', '堆溢出', 'rop', 'binary', 'reversing'], skill: 'domains/security/vuln-research.md', name: '漏洞研究' },
    { keywords: ['osint', '威胁情报', '威胁建模', 'att&ck', 'threat', 'threat hunting'], skill: 'domains/security/threat-intel.md', name: '威胁情报' },
    { keywords: ['api设计', 'rest', 'graphql', 'grpc', 'endpoint', 'versioning', 'api design'], skill: 'domains/architecture/api-design.md', name: 'API设计' },
    { keywords: ['缓存', 'redis', 'memcached', 'cache', 'cdn', 'invalidation'], skill: 'domains/architecture/caching.md', name: '缓存架构' },
    { keywords: ['kubernetes', 'docker', 'k8s', '微服务', 'service mesh', 'cloud native'], skill: 'domains/architecture/cloud-native.md', name: '云原生' },
    { keywords: ['kafka', 'rabbitmq', '消息队列', 'event driven', 'pub/sub', 'message queue'], skill: 'domains/architecture/message-queue.md', name: '消息队列' },
    { keywords: ['rag', 'retrieval', '向量', 'embedding', 'chunking', 'vector'], skill: 'domains/ai/rag-system.md', name: 'RAG系统' },
    { keywords: ['ai agent', 'tool use', 'function calling', 'agent框架', 'orchestration'], skill: 'domains/ai/agent-dev.md', name: 'Agent开发' },
    { keywords: ['prompt injection', 'jailbreak', 'guardrail', 'llm安全'], skill: 'domains/ai/llm-security.md', name: 'LLM安全' },
  ];

  // Find matching skills
  const matched = ROUTES.filter(route =>
    route.keywords.some(kw => msgLower.includes(kw))
  );

  // ── Model action triggers ──
  // Detect when user wants to use a specific model for a task.
  // v1.5.2: removed dead gemini/both (dual-model) branches left over from the
  // pre-v1.0.0 multi-model engine; added hermes/claude/openclaw to match the
  // wrapper backendRegistry (codex/claude/hermes/openclaw).
  const MODEL_ACTIONS = [
    { keywords: ['codex审查', 'codex 审查', 'codex review', '用codex看', '让codex检查', 'codex检查'], model: 'codex', role: 'reviewer', action: '审查当前代码变更（git diff）' },
    { keywords: ['codex分析', 'codex 分析', 'codex analyze', '用codex分析'], model: 'codex', role: 'analyzer', action: '分析当前项目/代码' },
    { keywords: ['codex调试', 'codex 调试', 'codex debug', '用codex调试'], model: 'codex', role: 'debugger', action: '诊断问题' },
    { keywords: ['codex测试', 'codex 测试', 'codex test', '用codex写测试'], model: 'codex', role: 'tester', action: '生成测试用例' },
    { keywords: ['hermes审查', 'hermes 审查', 'hermes review', '用hermes看', '让hermes检查'], model: 'hermes', role: 'reviewer', action: '审查当前代码变更（git diff）' },
    { keywords: ['hermes分析', 'hermes 分析', 'hermes analyze', '用hermes分析'], model: 'hermes', role: 'analyzer', action: '分析当前项目/代码' },
    { keywords: ['claude审查', 'claude 审查', 'claude review', '用claude看', '让claude检查'], model: 'claude', role: 'reviewer', action: '审查当前代码变更（git diff）' },
    { keywords: ['openclaw审查', 'openclaw 审查', 'openclaw review', '用openclaw看'], model: 'openclaw', role: 'reviewer', action: '审查当前代码变更（git diff）' },
  ];

  const modelAction = MODEL_ACTIONS.find(a => a.keywords.some(kw => msgLower.includes(kw)));
  if (modelAction) {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    const wrapperPath = path.join(homeDir, '.claude', 'bin', 'codeagent-wrapper');
    // hermes/openclaw have no role-prompt dir under prompts/ yet — fall back to
    // the codex role prompt (generic review/analyze instructions) for them.
    const promptsBase = path.join(homeDir, '.claude', '.ly', 'prompts');
    const roleDir = path.join(promptsBase, modelAction.model);
    const roleFile = fs.existsSync(roleDir)
      ? path.join(roleDir, modelAction.role + '.md')
      : path.join(promptsBase, 'codex', modelAction.role + '.md');

    const actionInstructions = `<ly-model-action>
用户请求使用 ${modelAction.model} 执行${modelAction.action}。请立即执行：

1. 获取工作目录: WORKDIR=$(pwd)
2. 调用模型:

   ${wrapperPath} --progress --backend ${modelAction.model} - "$WORKDIR" <<'EOF'
   ROLE_FILE: ${roleFile}
   <TASK>${modelAction.action}</TASK>
   EOF

3. 等待结果并输出
</ly-model-action>`;

    outputHook('UserPromptSubmit', actionInstructions);
    process.exit(0);
  }

  // ── Domain knowledge injection ──
  if (matched.length === 0) process.exit(0);

  const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  const skillsBase = path.join(homeDir, '.claude', 'skills', 'ly');

  if (!fs.existsSync(skillsBase)) process.exit(0);

  const injections = [];
  for (const match of matched.slice(0, 2)) {
    const skillPath = path.join(skillsBase, match.skill);
    if (!fs.existsSync(skillPath)) continue;

    try {
      const content = fs.readFileSync(skillPath, 'utf-8');
      const lines = content.split('\n');
      const excerpt = lines.slice(0, 120).join('\n');
      injections.push(`## ${match.name} (auto-injected)\n${excerpt}${lines.length > 120 ? '\n...(truncated, full: ' + match.skill + ')' : ''}`);
    } catch { /* silent */ }
  }

  if (injections.length === 0) process.exit(0);

  const context = `<ly-domain-knowledge>\n${injections.join('\n\n---\n\n')}\n</ly-domain-knowledge>`;
  outputHook('UserPromptSubmit', context);
} catch {
  process.exit(0);
}
