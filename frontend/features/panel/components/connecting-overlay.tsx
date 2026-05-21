'use client'

import { Loader2 } from 'lucide-react'
import { usePanelState } from '../hooks'

export function ConnectingOverlay() {
  const { data, isLoading, isError } = usePanelState()

  if (data || isError || !isLoading) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/40 backdrop-blur-md">
      <div className="flex flex-col items-center gap-4 rounded-xl border bg-card/95 px-10 py-8 shadow-2xl">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <div className="text-center">
          <div className="text-sm font-medium">Connecting to backend…</div>
          <div className="mt-1 text-xs text-muted-foreground">Please wait</div>
        </div>
      </div>
    </div>
  )
}
