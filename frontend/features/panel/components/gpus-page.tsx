'use client'

import { Main } from '@/components/layout/main'
import { usePanelState, useGpuHistory } from '../hooks'
import { GpuCard } from './gpu-card'
import { GpuSparkline } from './gpu-sparkline'

export function GpusPage() {
  const { data } = usePanelState()
  const history = useGpuHistory(60)
  const gpus = data?.gpus ?? []

  return (
    <Main className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">GPUs</h1>
        <p className="text-muted-foreground">
          Live utilization and HAMi allocation per GPU on the target daemon.
        </p>
      </div>

      {gpus.length === 0 ? (
        <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
          No GPUs detected — probing through the Docker daemon…
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {gpus.map((gpu) => (
            <div key={gpu.index} className="space-y-3">
              <GpuCard gpu={gpu} />
              <GpuSparkline samples={history.get(gpu)} />
            </div>
          ))}
        </div>
      )}
    </Main>
  )
}
