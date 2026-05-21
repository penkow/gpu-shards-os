'use client'

import { Card, CardContent } from '@/components/ui/card'
import type { GpuSample } from '../hooks'

type Props = {
  samples: GpuSample[]
  height?: number
}

export function GpuSparkline({ samples, height = 60 }: Props) {
  if (samples.length < 2) {
    return (
      <Card>
        <CardContent className="text-xs italic text-muted-foreground">
          Collecting samples…
        </CardContent>
      </Card>
    )
  }
  const points = samples.map((s, i) => ({
    x: (i / (samples.length - 1)) * 100,
    util: Math.max(0, Math.min(100, s.util)),
  }))
  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${(100 - p.util).toFixed(2)}`)
    .join(' ')
  const last = samples[samples.length - 1]

  return (
    <Card>
      <CardContent className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium uppercase tracking-wide text-muted-foreground">
            Utilization · last {samples.length * 5}s
          </span>
          <span className="font-mono">{last.util}%</span>
        </div>
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{ height, width: '100%' }}
          className="block"
        >
          <path
            d={`${path} L 100 100 L 0 100 Z`}
            fill="currentColor"
            className="text-emerald-500/15"
          />
          <path
            d={path}
            fill="none"
            strokeWidth={1.5}
            stroke="currentColor"
            className="text-emerald-500"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </CardContent>
    </Card>
  )
}
