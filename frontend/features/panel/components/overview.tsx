'use client'

import Link from 'next/link'
import { Boxes, Cpu, Package } from 'lucide-react'
import { Main } from '@/components/layout/main'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { usePanelState, useGpuHistory } from '../hooks'
import { GpuCard } from './gpu-card'
import { GpuSparkline } from './gpu-sparkline'

export function Overview() {
  const { data } = usePanelState()
  const history = useGpuHistory(60)

  const gpus = data?.gpus ?? []
  const containers = data?.containers ?? []
  const running = containers.filter((c) => c.status === 'running').length
  const totalMem = gpus.reduce((s, g) => s + g.memory_total_mb, 0)
  const usedMem = gpus.reduce((s, g) => s + g.memory_used_mb, 0)
  const allocMem = gpus.reduce((s, g) => s + g.allocated_mb, 0)
  const avgUtil =
    gpus.length === 0
      ? 0
      : Math.round(gpus.reduce((s, g) => s + g.utilization_pct, 0) / gpus.length)

  return (
    <Main className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
        <p className="text-muted-foreground">
          {data?.connected
            ? `Connected to ${data.docker_target}`
            : 'Backend disconnected'}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="GPUs"
          value={gpus.length}
          icon={<Cpu className="text-muted-foreground" />}
          href="/gpus"
        />
        <StatCard
          label="Containers"
          value={running}
          sub={containers.length ? `of ${containers.length} managed` : '0 managed'}
          icon={<Boxes className="text-muted-foreground" />}
          href="/containers"
        />
        <StatCard
          label="Avg GPU util"
          value={`${avgUtil}%`}
          sub={
            totalMem
              ? `${usedMem.toLocaleString()} / ${totalMem.toLocaleString()} MB used`
              : ''
          }
        />
        <StatCard
          label="HAMi allocated"
          value={`${allocMem.toLocaleString()} MB`}
          sub={
            totalMem
              ? `${Math.round((allocMem / totalMem) * 100)}% of total memory`
              : ''
          }
          icon={<Package className="text-muted-foreground" />}
        />
      </div>

      <section className="space-y-3">
        <h2 className="text-xs font-bold tracking-widest text-muted-foreground uppercase">
          GPUs
        </h2>
        {gpus.length === 0 ? (
          <div className="rounded-lg border p-6 text-sm text-muted-foreground italic">
            No GPUs detected — probing through the Docker daemon…
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {gpus.map((gpu) => (
              <div key={gpu.index} className="space-y-4">
                <GpuCard gpu={gpu} />
                <GpuSparkline samples={history.get(gpu)} />
              </div>
            ))}
          </div>
        )}
      </section>
    </Main>
  )
}

function StatCard({
  label,
  value,
  sub,
  icon,
  href,
}: {
  label: string
  value: React.ReactNode
  sub?: string
  icon?: React.ReactNode
  href?: string
}) {
  const inner = (
    <Card className="h-full">
      <CardContent className="space-y-1">
        <div className="flex items-start justify-between">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {label}
          </div>
          {icon}
        </div>
        <div className="text-3xl font-bold tracking-tight">{value}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  )
  return href ? (
    <Button asChild variant="ghost" className="h-auto p-0">
      <Link href={href}>{inner}</Link>
    </Button>
  ) : (
    inner
  )
}
