/**
 * 构建后处理：从 dist/ly-wrapper.mjs 生成 dist/ly-wrapper.js（带 node shebang），
 * 供安装器复制到 ~/.claude/bin/ly-wrapper 直接执行。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'dist', 'ly-wrapper.mjs')
const dest = join(root, 'dist', 'ly-wrapper.js')

if (!existsSync(src)) {
  console.error('build-wrapper: dist/ly-wrapper.mjs not found — run unbuild first')
  process.exit(1)
}

let content = readFileSync(src, 'utf-8')
if (!content.startsWith('#!')) {
  content = `#!/usr/bin/env node\n${content}`
}
writeFileSync(dest, content)
console.log('build-wrapper: dist/ly-wrapper.js generated')
