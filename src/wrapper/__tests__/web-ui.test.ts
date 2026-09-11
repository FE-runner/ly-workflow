import { afterEach, describe, expect, it } from 'vitest'
import { parseArgs } from '../core'
import { startProgressServer } from '../web-ui'
import type { ProgressServer } from '../web-ui'

const servers: ProgressServer[] = []
afterEach(() => {
  for (const s of servers.splice(0)) s.close()
})

describe('parseArgs lite 门控', () => {
  it('--lite 与 -L 均写入 config.lite', () => {
    expect(parseArgs(['--lite', 'task']).config?.lite).toBe(true)
    expect(parseArgs(['-L', 'task']).config?.lite).toBe(true)
    expect(parseArgs(['task']).config?.lite).toBe(false)
  })
})

describe('startProgressServer', () => {
  it('随机端口监听、页面可达、broadcast→SSE 事件转发、close 后不再服务', async () => {
    const server = await startProgressServer('codex')
    expect(server).not.toBeNull()
    servers.push(server!)

    // 主页返回内嵌 HTML
    const page = await fetch(`${server!.url}/`)
    expect(page.status).toBe(200)
    expect(await page.text()).toContain('ly-wrapper 审查进度')

    // SSE 端点：建立连接后 broadcast 一条事件，读取到转发内容
    const controller = new AbortController()
    const stream = await fetch(`${server!.url}/events`, { signal: controller.signal })
    expect(stream.status).toBe(200)
    const reader = stream.body!.getReader()
    const decoder = new TextDecoder()
    // 先读到 hello 帧
    let acc = ''
    for (;;) {
      const { value, done } = await reader.read()
      acc += decoder.decode(value)
      if (acc.includes('hello') || done) break
    }
    server!.broadcast({ event: 'message', session_id: 's1', backend: 'codex', content: '结论内容', content_type: 'message' })
    for (;;) {
      const { value, done } = await reader.read()
      acc += decoder.decode(value)
      if (acc.includes('结论内容') || done) break
    }
    expect(acc).toContain('"event":"message"')
    expect(acc).toContain('"session_id":"s1"')
    controller.abort()

    // close 后端口不再监听
    server!.close()
    await new Promise(r => setTimeout(r, 50))
    await expect(fetch(`${server!.url}/`)).rejects.toThrow()
  })

  it('close 幂等（重复调用不抛错）', async () => {
    const server = await startProgressServer('hermes')
    expect(server).not.toBeNull()
    server!.close()
    expect(() => server!.close()).not.toThrow()
  })
})
