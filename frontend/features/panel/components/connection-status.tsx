'use client'

import { cn } from '@/lib/utils'
import { usePanelState } from '../hooks'
import { BACKEND_URL } from '../api'

export function ConnectionStatus() {
  const { data, error, isFetching } = usePanelState()
  const fetchError =
    error instanceof Error ? error.message : error ? 'Backend unreachable' : ''
  const connected = !!data?.connected && !fetchError
  const target = data?.docker_target

  return (
    <div className="flex items-center gap-2 text-xs">
      <span
        className={cn(
          'inline-block size-2 rounded-full',
          connected
            ? 'bg-emerald-500 shadow-[0_0_6px] shadow-emerald-500/60'
            : 'bg-red-500 shadow-[0_0_6px] shadow-red-500/60',
          isFetching && 'animate-pulse'
        )}
      />
      <span className={cn(connected ? 'text-emerald-500' : 'text-red-500')}>
        {connected ? `Connected · ${target ?? ''}` : 'Disconnected'}
      </span>
      {!connected && (
        <span className="hidden font-mono text-muted-foreground md:inline">
          {BACKEND_URL}
        </span>
      )}
    </div>
  )
}
