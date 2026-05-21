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
  sessionId: string
  cid: string
  /** Container name (for display in the global tray). */
  containerName: string
  /** Per-session label, e.g. "shell-1". Editable in the future. */
  label: string
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

function snapshotAll(): readonly string[] {
  return Array.from(sessions.keys())
}

let cachedAll: readonly string[] = snapshotAll()

function notify() {
  cachedAll = snapshotAll()
  emit()
}

export function subscribeSessions(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function getSessionIds(): readonly string[] {
  return cachedAll
}

export function getSession(sessionId: string): ShellSession | undefined {
  return sessions.get(sessionId)
}

export function getSessionsForCid(cid: string): readonly string[] {
  const out: string[] = []
  for (const [sid, s] of sessions) {
    if (s.cid === cid) out.push(sid)
  }
  return out
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

function nextLabelForCid(cid: string): string {
  let n = 1
  const taken = new Set<string>()
  for (const s of sessions.values()) {
    if (s.cid === cid) taken.add(s.label)
  }
  while (taken.has(`shell-${n}`)) n += 1
  return `shell-${n}`
}

function makeSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `s-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`
}

/**
 * Always creates a brand-new shell session for the given container. Returns
 * the new session id. The host div is created immediately; the xterm Terminal
 * opens lazily once the host is in the DOM.
 */
export function openShellSession(cid: string, containerName: string, label?: string): string {
  const sessionId = makeSessionId()
  const host = document.createElement('div')
  host.className = 'h-full w-full'
  const { terminal, fit } = createTerminal()
  const session: ShellSession = {
    sessionId,
    cid,
    containerName,
    label: label && label.trim() ? label.trim() : nextLabelForCid(cid),
    terminal,
    fit,
    ws: null,
    host,
    status: 'idle',
    statusDetail: '',
  }
  sessions.set(sessionId, session)
  if (trayHost) trayHost.appendChild(host)
  notify()
  return sessionId
}

/** Move a session's host into a viewport. Returns a detach() that moves it
 * back to the tray (so the terminal survives route changes). */
export function attachShellTo(
  sessionId: string,
  viewport: HTMLElement
): (() => void) | undefined {
  const session = sessions.get(sessionId)
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

export function closeShellSession(sessionId: string) {
  const session = sessions.get(sessionId)
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
  sessions.delete(sessionId)
  notify()
}

/** Hook: subscribe to changes in the full set of session ids. */
export function useShellSessions(): readonly string[] {
  return useSyncExternalStore(subscribeSessions, getSessionIds, () => cachedAll)
}

/** Hook: subscribe to changes and project down to one container's sessions. */
export function useShellSessionsForCid(cid: string): readonly string[] {
  const all = useShellSessions()
  // Recomputed each render — fine for the demo's tiny session counts.
  return all.filter((sid) => sessions.get(sid)?.cid === cid)
}
