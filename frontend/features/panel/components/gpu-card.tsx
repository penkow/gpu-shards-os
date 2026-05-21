'use client'

import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { Gpu } from '../types'

function Bar({
  pct,
  className,
}: {
  pct: number
  className?: string
}) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn('h-full transition-[width] duration-500', className)}
        style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }}
      />
    </div>
  )
}

export function GpuCard({ gpu }: { gpu: Gpu }) {
  const pctUsed = gpu.memory_total_mb
    ? (gpu.memory_used_mb / gpu.memory_total_mb) * 100
    : 0
  const pctAlloc = gpu.memory_total_mb
    ? (gpu.allocated_mb / gpu.memory_total_mb) * 100
    : 0
  const allocOver = pctAlloc > 100

  return (
    <Card className="min-w-72 flex-1">
      <CardContent className="space-y-4">
        <div className="flex items-baseline justify-between">
          <div className="text-2xl font-bold tracking-tight">
            GPU {gpu.index}
          </div>
          <span className="text-xs text-muted-foreground">
            {gpu.utilization_pct}% util
          </span>
        </div>
        <div className="-mt-3 truncate text-xs text-muted-foreground">
          {gpu.name}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Memory used</span>
            <span className="font-mono">
              {gpu.memory_used_mb.toLocaleString()} /{' '}
              {gpu.memory_total_mb.toLocaleString()} MB
            </span>
          </div>
          <Bar pct={pctUsed} className="bg-emerald-500" />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Allocated by panel</span>
            <span className="font-mono">
              {gpu.allocated_mb.toLocaleString()} MB ({pctAlloc.toFixed(0)}%)
            </span>
          </div>
          <Bar
            pct={pctAlloc}
            className={allocOver ? 'bg-red-500' : 'bg-amber-500'}
          />
        </div>
      </CardContent>
    </Card>
  )
}
