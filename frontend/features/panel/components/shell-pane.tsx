'use client'

import { useCallback, useEffect, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Plus, Terminal as TerminalIcon, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  closeShellSession,
  getSession,
  openShellSession,
  useShellSessionsForCid,
} from '@/stores/shell-sessions'
import { ShellView } from './shell-view'

type Props = {
  cid: string
  name: string
  /** When true, render an empty state but don't autostart a session (e.g. container not running). */
  disabled?: boolean
  disabledMessage?: string
  /** Outer height. The pane fills this with a fixed sidebar + flex-1 viewport. */
  className?: string
}

function statusDotClass(status?: string): string {
  switch (status) {
    case 'connected':
      return 'bg-emerald-500'
    case 'connecting':
      return 'bg-amber-500 animate-pulse'
    case 'error':
      return 'bg-red-500'
    case 'closed':
      return 'bg-zinc-500'
    default:
      return 'bg-zinc-400'
  }
}

export function ShellPane({ cid, name, disabled, disabledMessage, className }: Props) {
  const router = useRouter()
  const search = useSearchParams()
  const sessionIds = useShellSessionsForCid(cid)
  const requestedSid = search.get('sid') ?? ''

  // Resolve the active sessionId: requested if it exists for this cid, else the first.
  const activeSid = useMemo(() => {
    if (requestedSid && sessionIds.includes(requestedSid)) return requestedSid
    return sessionIds[0] ?? ''
  }, [requestedSid, sessionIds])

  const setActiveSid = useCallback(
    (sid: string) => {
      const sp = new URLSearchParams(search.toString())
      sp.set('tab', 'shell')
      if (sid) sp.set('sid', sid)
      else sp.delete('sid')
      router.replace(`/containers/${encodeURIComponent(cid)}?${sp.toString()}`, {
        scroll: false,
      })
    },
    [cid, router, search],
  )

  // If the URL points at a sid we don't have, fall through silently.
  useEffect(() => {
    if (requestedSid && !sessionIds.includes(requestedSid) && sessionIds.length > 0) {
      setActiveSid(sessionIds[0])
    }
  }, [requestedSid, sessionIds, setActiveSid])

  const onNew = useCallback(() => {
    if (disabled) return
    const sid = openShellSession(cid, name)
    setActiveSid(sid)
  }, [disabled, cid, name, setActiveSid])

  const onKill = useCallback(
    (sid: string) => {
      const wasActive = sid === activeSid
      closeShellSession(sid)
      if (wasActive) {
        const remaining = sessionIds.filter((s) => s !== sid)
        setActiveSid(remaining[0] ?? '')
      }
    },
    [activeSid, sessionIds, setActiveSid],
  )

  return (
    <div className={`flex h-full min-h-0 gap-3 ${className ?? ''}`}>
      <aside className="flex w-56 shrink-0 flex-col overflow-hidden rounded-md border bg-muted/30">
        <div className="border-b p-2">
          <Button
            size="sm"
            className="w-full gap-1.5"
            onClick={onNew}
            disabled={disabled}
            title={disabled ? disabledMessage : 'Start a new shell session'}
          >
            <Plus className="h-4 w-4" /> New session
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-1.5">
          {sessionIds.length === 0 ? (
            <div className="px-2 py-6 text-center text-xs text-muted-foreground">
              {disabled ? disabledMessage ?? 'Container is not running.' : 'No sessions yet.'}
            </div>
          ) : (
            <ul className="space-y-1">
              {sessionIds.map((sid) => {
                const s = getSession(sid)
                if (!s) return null
                const isActive = sid === activeSid
                return (
                  <li
                    key={sid}
                    className={`group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
                      isActive ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
                    }`}
                  >
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2"
                      onClick={() => setActiveSid(sid)}
                      title={s.statusDetail || s.status}
                    >
                      <span className={`h-2 w-2 shrink-0 rounded-full ${statusDotClass(s.status)}`} />
                      <TerminalIcon className="h-3.5 w-3.5 shrink-0 opacity-70" />
                      <span className="truncate font-mono text-xs">{s.label}</span>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="opacity-0 group-hover:opacity-100"
                      title="Kill session"
                      onClick={(e) => {
                        e.stopPropagation()
                        onKill(sid)
                      }}
                    >
                      <X />
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {activeSid ? (
          <ShellView sessionId={activeSid} className="flex h-full min-h-0 flex-col" />
        ) : (
          <div className="flex h-full items-center justify-center rounded-md border border-dashed bg-muted/20 text-sm text-muted-foreground">
            <div className="text-center">
              <TerminalIcon className="mx-auto mb-2 h-6 w-6 opacity-50" />
              <p>{disabled ? disabledMessage ?? 'Container is not running.' : 'No active session.'}</p>
              {!disabled && (
                <Button variant="link" onClick={onNew} className="mt-1 h-auto p-0">
                  Start a session
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
