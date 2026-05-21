'use client'

import '@xterm/xterm/css/xterm.css'

import { useCallback, useEffect, useRef, useState } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import { CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { buildStreamUrl, getBuildStatus } from '../api'
import type { BuildStatus } from '../types'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  buildId: string
  /** Optional snapshot of the build so the title/pill renders before the status fetch lands. */
  initialBuild?: BuildStatus
}

export function BuildLogsDialog({ open, onOpenChange, buildId, initialBuild }: Props) {
  const [build, setBuild] = useState<BuildStatus | null>(initialBuild ?? null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const esRef = useRef<EventSource | null>(null)

  const initTerm = useCallback(() => {
    if (termRef.current || !viewportRef.current) return
    const t = new Terminal({
      cursorBlink: false,
      disableStdin: true,
      convertEol: true,
      fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
      fontSize: 12,
      scrollback: 10_000,
      theme: { background: '#020617', foreground: '#e2e8f0' },
    })
    const fit = new FitAddon()
    t.loadAddon(fit)
    t.open(viewportRef.current)
    try {
      fit.fit()
    } catch {}
    termRef.current = t
    fitRef.current = fit
  }, [])

  // Open/close lifecycle: subscribe on open, dispose on close.
  useEffect(() => {
    if (!open || !buildId) return
    setBuild(initialBuild ?? null)
    queueMicrotask(initTerm)

    const es = new EventSource(buildStreamUrl(buildId))
    esRef.current = es
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as Record<string, unknown>
        if (typeof data.stream === 'string') {
          const line = data.stream
          termRef.current?.write(line.endsWith('\n') ? line : line + '\n')
        }
        if (typeof data.error === 'string') {
          termRef.current?.write(`\x1b[31m${data.error}\x1b[0m\r\n`)
        }
      } catch {
        termRef.current?.write(ev.data + '\n')
      }
    }
    es.onerror = async () => {
      es.close()
      try {
        const final = await getBuildStatus(buildId)
        setBuild(final)
      } catch {}
    }

    return () => {
      esRef.current?.close()
      esRef.current = null
      termRef.current?.dispose()
      termRef.current = null
      fitRef.current = null
    }
  }, [open, buildId, initialBuild, initTerm])

  const status = build?.status ?? 'running'
  const isRunning = status === 'running'
  const isOk = status === 'succeeded'
  const isFail = status === 'failed'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>Build logs</span>
            <code className="font-mono text-sm font-normal text-muted-foreground">
              {build?.tag ?? buildId}
            </code>
          </DialogTitle>
          <DialogDescription>
            Replays buffered events from the in-memory build, then tails any new output.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {build?.image_id ? `image id ${build.image_id.slice(0, 19)}…` : ''}
            </span>
            <Badge
              variant={isOk ? 'default' : isFail ? 'destructive' : 'secondary'}
              className="gap-1"
            >
              {isRunning && <Loader2 className="h-3 w-3 animate-spin" />}
              {isOk && <CheckCircle2 className="h-3 w-3" />}
              {isFail && <XCircle className="h-3 w-3" />}
              {status}
            </Badge>
          </div>
          <div
            ref={viewportRef}
            className="h-96 w-full overflow-hidden rounded-md border bg-[#020617] p-2"
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
