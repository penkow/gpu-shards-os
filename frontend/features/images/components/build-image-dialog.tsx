'use client'

import '@xterm/xterm/css/xterm.css'

import { useCallback, useEffect, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import { CheckCircle2, Hammer, Loader2, XCircle } from 'lucide-react'
import { toast } from 'sonner'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { buildStreamUrl, getBuildStatus, startBuild } from '../api'
import type { BuildStatus } from '../types'

const TAG_RE = /^[a-z0-9][a-z0-9._/-]*(:[a-zA-Z0-9._-]+)?$/

const STARTER_DOCKERFILE = `FROM gpu-shards-editor-gpu:latest
RUN pip install --no-cache-dir \\
    transformers \\
    accelerate
`

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Fires once with the final tag when a build succeeds. */
  onBuilt?: (tag: string) => void
}

export function BuildImageDialog({ open, onOpenChange, onBuilt }: Props) {
  const [tag, setTag] = useState('my-image:latest')
  const [dockerfile, setDockerfile] = useState(STARTER_DOCKERFILE)
  const [build, setBuild] = useState<BuildStatus | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const viewportRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const esRef = useRef<EventSource | null>(null)

  // Reset state every time the dialog opens.
  useEffect(() => {
    if (open) {
      setTag('my-image:latest')
      setDockerfile(STARTER_DOCKERFILE)
      setBuild(null)
      setSubmitting(false)
    } else {
      esRef.current?.close()
      esRef.current = null
      termRef.current?.dispose()
      termRef.current = null
      fitRef.current = null
    }
  }, [open])

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

  const writeLine = useCallback((line: string) => {
    if (!line) return
    termRef.current?.write(line.endsWith('\n') ? line : line + '\n')
  }, [])

  const writeError = useCallback((msg: string) => {
    if (!msg) return
    termRef.current?.write(`\x1b[31m${msg}\x1b[0m\r\n`)
  }, [])

  const onStart = useCallback(async () => {
    if (!TAG_RE.test(tag.trim())) {
      toast.error('Invalid tag (lowercase, no spaces; optional `:tag`).')
      return
    }
    if (!dockerfile.trim()) {
      toast.error('Dockerfile is empty.')
      return
    }
    setSubmitting(true)
    initTerm()
    try {
      const started = await startBuild({ tag: tag.trim(), dockerfile })
      setBuild(started)

      const es = new EventSource(buildStreamUrl(started.build_id))
      esRef.current = es
      es.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data) as Record<string, unknown>
          if (typeof data.stream === 'string') writeLine(data.stream)
          if (typeof data.error === 'string') writeError(data.error)
          // `status` / `progressDetail` ignored — too noisy for the demo.
        } catch {
          writeLine(ev.data)
        }
      }
      es.onerror = async () => {
        es.close()
        // Stream may have ended; poll final status.
        try {
          const final = await getBuildStatus(started.build_id)
          setBuild(final)
          if (final.status === 'succeeded') {
            toast.success(`Built ${final.tag}`)
            onBuilt?.(final.tag)
          } else if (final.status === 'failed') {
            toast.error(`Build failed: ${final.error || 'see logs'}`)
          }
        } catch {}
        setSubmitting(false)
      }
    } catch (e) {
      writeError(e instanceof Error ? e.message : String(e))
      toast.error(e instanceof Error ? e.message : 'Failed to start build')
      setSubmitting(false)
    }
  }, [tag, dockerfile, initTerm, writeLine, writeError, onBuilt])

  const isRunning = submitting || build?.status === 'running'
  const isSucceeded = build?.status === 'succeeded'
  const isFailed = build?.status === 'failed'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Build a custom image</DialogTitle>
          <DialogDescription>
            Writes the Dockerfile to a temp build context and streams the build output.
            Anything in <code className="font-mono">FROM gpu-shards-editor-gpu:latest</code> + <code className="font-mono">RUN pip install</code> works without extra setup.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="img-tag">Tag</Label>
              <Input
                id="img-tag"
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                placeholder="my-image:latest"
                disabled={isRunning || isSucceeded}
                spellCheck={false}
                className="font-mono"
              />
            </div>
            <div className="flex items-end">
              <Button
                onClick={onStart}
                disabled={isRunning || isSucceeded}
                className="w-full"
              >
                {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Hammer className="h-4 w-4" />}
                {isRunning ? 'Building…' : 'Build'}
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Dockerfile</Label>
            <div className="h-44 overflow-hidden rounded-md border">
              <Editor
                height="100%"
                language="dockerfile"
                theme="vs-dark"
                value={dockerfile}
                onChange={(v) => setDockerfile(v ?? '')}
                options={{
                  readOnly: isRunning || isSucceeded,
                  fontSize: 12,
                  minimap: { enabled: false },
                  wordWrap: 'on',
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  padding: { top: 8 },
                }}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Build output</Label>
              {build && (
                <Badge
                  variant={
                    isSucceeded ? 'default' : isFailed ? 'destructive' : 'secondary'
                  }
                  className="gap-1"
                >
                  {isSucceeded && <CheckCircle2 className="h-3 w-3" />}
                  {isFailed && <XCircle className="h-3 w-3" />}
                  {build.status}
                </Badge>
              )}
            </div>
            <div
              ref={viewportRef}
              className="h-48 w-full overflow-hidden rounded-md border bg-[#020617] p-2"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isRunning}>
            {isSucceeded ? 'Close' : 'Cancel'}
          </Button>
          {isSucceeded && (
            <Button
              onClick={() => {
                onBuilt?.(build!.tag)
                onOpenChange(false)
              }}
            >
              Use {build!.tag}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
