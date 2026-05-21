'use client'

import '@xterm/xterm/css/xterm.css'

import { useEffect, useRef } from 'react'
import {
  closeShellSession,
  getSession,
  registerTrayHost,
  useShellSessions,
} from '@/stores/shell-sessions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'
import Link from 'next/link'

/**
 * Global parking spot for shell terminals. When a per-container Shell view is
 * mounted, it adopts the session's host div from this tray. When unmounted,
 * the div returns here so the xterm Terminal keeps its scrollback/state across
 * route changes.
 */
export function ShellTray() {
  const hostRef = useRef<HTMLDivElement>(null)
  const sessionIds = useShellSessions()

  useEffect(() => {
    registerTrayHost(hostRef.current)
    return () => registerTrayHost(null)
  }, [])

  return (
    <>
      <div
        ref={hostRef}
        aria-hidden
        className="pointer-events-none fixed left-0 top-0 -z-10 size-px overflow-hidden opacity-0"
      />
      {sessionIds.length > 0 && (
        <div className="pointer-events-auto fixed bottom-4 right-4 z-40 flex max-w-md flex-wrap gap-2">
          {sessionIds.map((sid) => {
            const session = getSession(sid)
            if (!session) return null
            return (
              <div
                key={sid}
                className="flex items-center gap-2 rounded-full border bg-background/95 px-3 py-1 text-xs shadow-md backdrop-blur"
              >
                <Badge
                  variant={
                    session.status === 'connected'
                      ? 'default'
                      : session.status === 'error'
                        ? 'destructive'
                        : 'secondary'
                  }
                  className="capitalize"
                >
                  {session.status}
                </Badge>
                <Link
                  href={`/containers/${encodeURIComponent(session.cid)}?tab=shell&sid=${encodeURIComponent(sid)}`}
                  className="max-w-48 truncate font-mono hover:underline"
                  title={`${session.containerName} · ${session.label}`}
                >
                  {session.containerName}/{session.label}
                </Link>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Close shell"
                  onClick={() => closeShellSession(sid)}
                >
                  <X />
                </Button>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
