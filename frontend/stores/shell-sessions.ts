'use client'

import { useSyncExternalStore } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import { shellWebSocketUrl } from '@/features/panel/api'

export type ShellStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'closed'
  | 'error'

export type ShellSession = {
  cid: string
  name: string
  terminal: Terminal
  fit: FitAddon
  ws: WebSocket | null
  host: HTMLDivElement
  status: ShellStatus
  statusDetail: string
}

const sessions = new Map<string, ShellSession>()
const listeners = new Set<() => void>()
let trayHost: HTMLElement | null = null

function emit() {
  for (const l of listeners) l()
}

function snapshot(): readonly string[] {
  return Array.from(sessions.keys())
}

let cached: readonly string[] = snapshot()

function notify() {
  cached = snapshot()
  emit()
}

export function subscribeSessions(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function getSessions(): readonly string[] {
  return cached
}

export function getSession(cid: string): ShellSession | undefined {
  return sessions.get(cid)
}

export function registerTrayHost(host: HTMLElement | null) {
  trayHost = host
  if (host) {
    for (const session of sessions.values()) {
      if (!session.host.isConnected) host.appendChild(session.host)
    }
  }
}

function createTerminal(): { terminal: Terminal; fit: FitAddon } {
  const terminal = new Terminal({
    cursorBlink: true,
    convertEol: false,
    fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
    fontSize: 13,
    scrollback: 5000,
    theme: {
      background: '#020617',
      foreground: '#e2e8f0',
      cursor: '#34d399',
    },
  })
  const fit = new FitAddon()
  terminal.loadAddon(fit)
  return { terminal, fit }
}

function setStatus(session: ShellSession, status: ShellStatus, detail = '') {
  session.status = status
  session.statusDetail = detail
  notify()
}

function connectWebSocket(session: ShellSession) {
  setStatus(session, 'connecting')
  let ws: WebSocket
  try {
    ws = new WebSocket(shellWebSocketUrl(session.cid))
    ws.binaryType = 'arraybuffer'
  } catch (e) {
    setStatus(session, 'error', e instanceof Error ? e.message : String(e))
    return
  }
  session.ws = ws
  const t = session.terminal

  const dataDisposable = t.onData((input) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ input }))
  })

  ws.onopen = () => {
    setStatus(session, 'connected')
    try {
      session.fit.fit()
      ws.send(JSON.stringify({ resize: { rows: t.rows, cols: t.cols } }))
    } catch {}
  }
  ws.onmessage = (event) => {
    const data = event.data
    if (typeof data === 'string') {
      t.write(data)
    } else if (data instanceof ArrayBuffer) {
      t.write(new Uint8Array(data))
    } else if (data instanceof Blob) {
      data.arrayBuffer().then((buf) => t.write(new Uint8Array(buf)))
    }
  }
  ws.onerror = () => {
    setStatus(session, 'error', 'websocket error')
    t.write('\r\n\x1b[31mShell connection error\x1b[0m\r\n')
  }
  ws.onclose = (ev) => {
    setStatus(session, 'closed', `code=${ev.code}${ev.reason ? ' ' + ev.reason : ''}`)
    t.write(
      `\r\n\x1b[33m[shell closed${ev.reason ? ' ' + ev.reason : ''}]\x1b[0m\r\n`
    )
    dataDisposable.dispose()
  }
}

/** Create-or-reuse a shell session. The host div is created immediately but the
 * xterm Terminal is opened lazily once the host is in the DOM. */
export function openShellSession(cid: string, name: string): ShellSession {
  const existing = sessions.get(cid)
  if (existing) {
    existing.name = name
    return existing
  }

  const host = document.createElement('div')
  host.className = 'h-full w-full'
  const { terminal, fit } = createTerminal()
  const session: ShellSession = {
    cid,
    name,
    terminal,
    fit,
    ws: null,
    host,
    status: 'idle',
    statusDetail: '',
  }
  sessions.set(cid, session)
  if (trayHost) trayHost.appendChild(host)
  notify()
  return session
}

/** Move a session's host into a viewport. Returns a detach() that moves it
 * back to the tray (so the terminal survives route changes). */
export function attachShellTo(
  cid: string,
  viewport: HTMLElement
): (() => void) | undefined {
  const session = sessions.get(cid)
  if (!session) return undefined
  if (session.host.parentElement !== viewport) {
    viewport.appendChild(session.host)
  }
  if (!session.terminal.element) {
    try {
      session.terminal.open(session.host)
      session.fit.fit()
      session.terminal.focus()
    } catch (e) {
      setStatus(session, 'error', e instanceof Error ? e.message : String(e))
    }
  }
  if (!session.ws) {
    connectWebSocket(session)
  } else {
    try {
      session.fit.fit()
    } catch {}
  }
  return () => {
    if (trayHost && session.host.parentElement !== trayHost) {
      trayHost.appendChild(session.host)
    }
  }
}

export function closeShellSession(cid: string) {
  const session = sessions.get(cid)
  if (!session) return
  try {
    session.ws?.close()
  } catch {}
  try {
    session.terminal.dispose()
  } catch {}
  try {
    session.host.remove()
  } catch {}
  sessions.delete(cid)
  notify()
}

export function useShellSessions(): readonly string[] {
  return useSyncExternalStore(subscribeSessions, getSessions, () => cached)
}
