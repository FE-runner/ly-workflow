/**
 * web-ui — 审查进度 Web UI（极简 HTTP+SSE，对齐 Go 版 server.go 行为基线）。
 * port 0 随机空闲端口、内嵌单页（EventSource 订阅 /events）、自动开浏览器（失败静默）、
 * 后端进程退出时由调用方 close()，不残留后台进程。
 * 服务内部全部 try/catch：任何异常不影响审查主流程。
 * 事件范围：结构化事件流由 codex backend 产生；claude/hermes/openclaw 后端当前仅推送最终 done 报告（无过程事件）。
 */
import * as http from 'node:http'
import { spawn } from 'node:child_process'

export interface ProgressEvent {
  event: string // session_started / turn_started / cmd_done / reasoning / message / session_completed / turn_completed / done
  session_id?: string
  backend?: string
  content?: string
  content_type?: string // reasoning / message / command
  cmd?: string
  exit?: string
  done?: boolean
}

export interface ProgressServer {
  url: string
  port: number
  broadcast(event: ProgressEvent): void
  close(): void
}

/** 平台命令打开浏览器（macOS open -g 后台不抢焦点）；失败静默——URL 已由调用方打印到终端兜底 */
export function openBrowser(url: string): void {
  try {
    let child: ReturnType<typeof spawn>
    if (process.platform === 'darwin') {
      child = spawn('open', ['-g', url], { detached: true, stdio: 'ignore' })
    } else if (process.platform === 'win32') {
      child = spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' })
    } else {
      child = spawn('xdg-open', [url], { detached: true, stdio: 'ignore' })
    }
    // spawn 失败是异步 'error' 事件（如 headless 环境无 xdg-open），必须监听静默——
    // 无监听器时 unhandled 'error' 会崩溃整个 wrapper 进程
    child.on('error', () => { /* 打开失败静默：URL 已打印，用户可手动打开 */ })
    child.unref()
  } catch {
    // 打开失败静默：URL 已打印，用户可手动打开
  }
}

const PAGE_HTML = `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8">
<title>ly-wrapper 审查进度</title>
<style>
  body{font-family:-apple-system,monospace;max-width:900px;margin:2rem auto;padding:0 1rem;background:#0d1117;color:#c9d1d9}
  h1{font-size:1.1rem;border-bottom:1px solid #30363d;padding-bottom:.5rem}
  section{border:1px solid #30363d;border-radius:6px;margin:1rem 0;padding:.8rem}
  h2{font-size:.85rem;color:#8b949e;margin:0 0 .5rem;text-transform:uppercase}
  pre{white-space:pre-wrap;word-break:break-all;margin:0;font-size:.85rem;line-height:1.5}
  .status{color:#58a6ff;font-size:.85rem}
  .cmd{color:#7ee787}.reasoning{color:#d2a8ff}.message{color:#c9d1d9}.done{color:#3fb950}
</style>
</head>
<body>
<h1>ly-wrapper 审查进度 <span class="status" id="status">连接中…</span></h1>
<section id="sec-cmd"><h2>命令执行</h2><pre id="cmd"></pre></section>
<section id="sec-reasoning"><h2>思考</h2><pre id="reasoning"></pre></section>
<section id="sec-message"><h2>结论</h2><pre id="message" class="message"></pre></section>
<script>
const es = new EventSource('/events');
const $ = id => document.getElementById(id);
es.addEventListener('progress', e => {
  const ev = JSON.parse(e.data);
  if (ev.event === 'session_started') $('status').textContent = '运行中 · ' + (ev.backend || '');
  else if (ev.event === 'cmd_done') $('cmd').textContent += '$ ' + (ev.cmd || '') + (ev.exit != null ? '  [exit ' + ev.exit + ']' : '') + '\\n';
  else if (ev.event === 'reasoning') $('reasoning').textContent += (ev.content || '') + '\\n';
  else if (ev.event === 'message') $('message').textContent += (ev.content || '') + '\\n';
  else if (ev.event === 'done') { $('message').textContent = ev.content || $('message').textContent; $('status').textContent = '✓ 已结束'; es.close(); }
});
es.onerror = () => { $('status').textContent = '✓ 已结束（连接关闭）'; };
</script>
</body>
</html>`

/**
 * 启动进度服务（port 0 随机端口 + 自动开浏览器）。
 * 启动失败（端口/权限异常等）返回 null，调用方降级为纯终端进度——SHALL NOT 影响审查主流程。
 */
export function startProgressServer(backend: string): Promise<ProgressServer | null> {
  return new Promise((resolve) => {
    try {
      startServer(backend, resolve)
    } catch {
      resolve(null)
    }
  })
}

function startServer(backend: string, resolve: (s: ProgressServer | null) => void): void {
  const clients = new Set<http.ServerResponse>()
    const server = http.createServer((req, res) => {
      try {
        if (req.url === '/events') {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          })
          res.write(`event: progress\ndata: ${JSON.stringify({ event: 'hello', backend })}\n\n`)
          clients.add(res)
          req.on('close', () => clients.delete(res))
        } else {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(PAGE_HTML)
        }
      } catch {
        // 单请求异常不影响服务与主流程
      }
    })
    // Node listen 异步：等 'listening' 事件后才有 address；'error' 仅在 listen 阶段降级为 null
    let resolved = false
    server.once('error', () => {
      if (resolved) return // 运行期错误（罕见）不关停正在服务的 UI
      resolved = true
      try { server.close() } catch { /* ignore */ }
      resolve(null)
    })
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close()
        resolved = true
        resolve(null)
        return
      }
      const port = address.port
      // 绑定 127.0.0.1 就输出 127.0.0.1——部分环境 localhost 优先解析 ::1（IPv6）
      const url = `http://127.0.0.1:${port}`
      resolved = true
      openBrowser(url)
      resolve({
      url,
      port,
      broadcast(event: ProgressEvent) {
        try {
          const payload = `event: progress\ndata: ${JSON.stringify(event)}\n\n`
          for (const client of clients) {
            try { client.write(payload) } catch { clients.delete(client) }
          }
        } catch {
          // 广播异常不影响审查主流程
        }
      },
      close() {
        try {
          for (const client of clients) { try { client.end() } catch { /* ignore */ } }
          clients.clear()
          server.close()
        } catch {
          // 关闭异常静默
        }
      },
      })
    })
}
