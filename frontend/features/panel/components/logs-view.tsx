'use client'

import '@xterm/xterm/css/xterm.css'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Download, Pause, Play, RefreshCw } from 'lucide-react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import { Button } from '@/components/ui/button'
import { fetchLogs, logsStreamUrl } from '../api'

type Props = {
  cid: string
  name: string
  /** snapshot fetches once; live attaches an SSE stream. */
  mode?: 'snapshot' | 'live'
  /** Show the status bar + pause/refresh/download controls (default true). */
  showHeader?: boolean
  className?: string
}

export function LogsView({ cid, name, mode = 'live', showHeader = true, className }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const sourceRef = useRef<EventSource | null>(null)
  const bufferRef = useRef<string>('')
  const [status, setStatus] = useState<string>('idle')
  const [paused, setPaused] = useState(false)

  // Initialize the terminal once per cid+mode.
  useEffect(() => {
    let disposed = false
    const viewport = viewportRef.current
    if (!viewport) return

    const raf = requestAnimationFrame(() => {
      if (disposed) return
      const term = new Terminal({
        cursorBlink: false,
        disableStdin: true,
        convertEol: true,
        fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
        fontSize: 12,
        scrollback: 10_000,
        theme: {
          background: '#020617',
          foreground: '#e2e8f0',
        },
      })
      const fit = new FitAddon()
      term.loadAddon(fit)
      term.open(viewport)
      try {
        fit.fit()
      } catch {}
      terminalRef.current = term
      fitRef.current = fit
      bufferRef.current = ''
    })

    const ro = new ResizeObserver(() => {
      try {
        fitRef.current?.fit()
      } catch {}
    })
    ro.observe(viewport)

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      ro.disconnect()
      try {
        terminalRef.current?.dispose()
      } catch {}
      terminalRef.current = null
      fitRef.current = null
    }
  }, [cid, mode])

  const write = useCallback((chunk: string) => {
    bufferRef.current += chunk
    terminalRef.current?.write(chunk)
  }, [])

  const loadSnapshot = useCallback(async () => {
    setStatus('loading')
    try {
      const res = await fetchLogs(cid)
      terminalRef.current?.clear()
      bufferRef.current = ''
      write(res.logs || '(no logs yet)\n')
      setStatus('snapshot')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setStatus(`error: ${msg}`)
      write(`\x1b[31m${msg}\x1b[0m\r\n`)
    }
  }, [cid, write])

  // Drive snapshot / live attach.
  useEffect(() => {
    if (mode === 'snapshot') {
      void loadSnapshot()
      return
    }
    if (paused) {
      sourceRef.current?.close()
      sourceRef.current = null
      setStatus('paused')
      return
    }
    setStatus('connecting')
    const es = new EventSource(logsStreamUrl(cid))
    sourceRef.current = es
    es.onopen = () => setStatus('live')
    es.onmessage = (ev) => write((ev.data ?? '') + '\r\n')
    es.onerror = () => setStatus('reconnecting…')
    return () => {
      es.close()
      sourceRef.current = null
    }
  }, [cid, mode, paused, loadSnapshot, write])

  function download() {
    const blob = new Blob([bufferRef.current], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${name || cid}-logs.txt`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div className={`flex flex-col ${className ?? ''}`}>
      {showHeader && (
        <div className="mb-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="truncate font-mono">{cid} · {status}</span>
          <div className="flex items-center gap-1">
            {mode === 'live' && (
              <Button
                variant="ghost"
                size="icon-sm"
                title={paused ? 'Resume tail' : 'Pause tail'}
                onClick={() => setPaused((p) => !p)}
              >
                {paused ? <Play /> : <Pause />}
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              title="Reload snapshot"
              onClick={() => void loadSnapshot()}
            >
              <RefreshCw />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              title="Download buffered logs"
              onClick={download}
            >
              <Download />
            </Button>
          </div>
        </div>
      )}
      <div
        ref={viewportRef}
        className="w-full flex-1 min-h-0 overflow-hidden rounded-md border bg-[#020617] p-2"
      />
    </div>
  )
}
