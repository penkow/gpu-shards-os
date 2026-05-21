'use client'

import { useQueryClient } from '@tanstack/react-query'
import { Main } from '@/components/layout/main'
import { usePanelState } from '../hooks'
import { DeployForm } from './deploy-form'

export function DeployPage() {
  const queryClient = useQueryClient()
  const { data } = usePanelState()
  return (
    <Main className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Deploy</h1>
        <p className="text-muted-foreground">
          Launch a HAMi-managed container with explicit GPU, memory, and SM
          quotas.
        </p>
      </div>
      <DeployForm
        gpus={data?.gpus ?? []}
        images={data?.images ?? []}
        onDeployed={() =>
          queryClient.invalidateQueries({ queryKey: ['panel', 'state'] })
        }
      />
    </Main>
  )
}
