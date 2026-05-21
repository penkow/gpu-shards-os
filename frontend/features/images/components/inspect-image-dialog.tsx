'use client'

import { useEffect, useState } from 'react'
import { Copy, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { inspectImage } from '../api'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  imageRef: string
}

export function InspectImageDialog({ open, onOpenChange, imageRef }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')
  const [data, setData] = useState<Record<string, unknown> | null>(null)

  useEffect(() => {
    if (!open || !imageRef) return
    let cancelled = false
    setLoading(true)
    setError('')
    setData(null)
    inspectImage(imageRef)
      .then((res) => {
        if (cancelled) return
        setData(res.data ?? {})
      })
      .catch((e) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, imageRef])

  const json = data ? JSON.stringify(data, null, 2) : ''

  function copy() {
    void navigator.clipboard.writeText(json)
    toast.success('Inspect JSON copied')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>Inspect</span>
            <code className="font-mono text-sm font-normal text-muted-foreground">{imageRef}</code>
          </DialogTitle>
          <DialogDescription>
            Raw <code className="font-mono">docker inspect</code> output for this image.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              disabled={!json}
              onClick={copy}
              title="Copy JSON to clipboard"
            >
              <Copy className="h-3.5 w-3.5" />
              Copy
            </Button>
          </div>
          <div className="h-[60vh] overflow-auto rounded-md border bg-muted/30">
            {loading ? (
              <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading inspect…
              </div>
            ) : error ? (
              <div className="p-4 text-sm text-destructive">{error}</div>
            ) : (
              <pre className="whitespace-pre-wrap break-all p-3 font-mono text-[11px] leading-relaxed">
                {json || '(empty)'}
              </pre>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
