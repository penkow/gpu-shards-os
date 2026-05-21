'use client'

import { Main } from '@/components/layout/main'
import { usePanelState } from '../hooks'
import { ContainersTable } from './containers-table'

export function ContainersPage() {
  const { data } = usePanelState()
  const containers = data?.containers ?? []

  return (
    <Main className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Containers</h1>
        <p className="text-muted-foreground">
          Managed HAMi workloads. Click a name to drill into logs, shell, and
          metadata.
        </p>
      </div>
      <ContainersTable containers={containers} />
    </Main>
  )
}
