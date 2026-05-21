'use client'

import { useEffect, useRef } from 'react'
import {
  attachShellTo,
  getSession,
  openShellSession,
  useShellSessions,
} from '@/stores/shell-sessions'

type Props = {
  cid: string
  name: string
  className?: string
}

/**
 * Visible viewport for an xterm session. Mounting/unmounting only moves the
 * shared terminal DOM in and out — it does NOT dispose the session, so navigating
 * away and back preserves the prompt and scrollback.
 */
export function ShellView({ cid, name, className }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null)
  // Re-render when status changes (so resize observer triggers fit).
  useShellSessions()

  useEffect(() => {
    openShellSession(cid, name)
  }, [cid, name])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const detach = attachShellTo(cid, viewport)

    const ro = new ResizeObserver(() => {
      const session = getSession(cid)
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
  }, [cid])

  const session = getSession(cid)
  const status = session?.status ?? 'idle'
  const detail = session?.statusDetail ?? ''

  return (
    <div className={className}>
      <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
        <span className="font-mono">{cid}</span>
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
