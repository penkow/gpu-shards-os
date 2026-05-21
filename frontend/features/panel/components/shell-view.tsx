'use client'

import { useEffect, useRef } from 'react'
import {
  attachShellTo,
  getSession,
  useShellSessions,
} from '@/stores/shell-sessions'

type Props = {
  sessionId: string
  className?: string
}

/**
 * Visible viewport for an existing xterm session. Mounting/unmounting only
 * moves the shared terminal DOM in and out — it does NOT dispose the session,
 * so navigating away and back preserves the prompt and scrollback.
 */
export function ShellView({ sessionId, className }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null)
  // Re-render when any session status changes.
  useShellSessions()

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const detach = attachShellTo(sessionId, viewport)

    const ro = new ResizeObserver(() => {
      const session = getSession(sessionId)
      if (!session) return
      try {
        session.fit.fit()
        if (session.ws?.readyState === WebSocket.OPEN) {
          session.ws.send(
            JSON.stringify({
              resize: { rows: session.terminal.rows, cols: session.terminal.cols },
            }),
          )
        }
      } catch {}
    })
    ro.observe(viewport)

    return () => {
      ro.disconnect()
      detach?.()
    }
  }, [sessionId])

  const session = getSession(sessionId)
  const status = session?.status ?? 'idle'
  const detail = session?.statusDetail ?? ''

  return (
    <div className={className}>
      <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
        <span className="font-mono">{session?.label ?? sessionId}</span>
        <span>· {status}</span>
        {detail && <span className="truncate">— {detail}</span>}
      </div>
      <div
        ref={viewportRef}
        className="h-[65vh] w-full overflow-hidden rounded-md border bg-[#020617] p-2"
      />
    </div>
  )
}
