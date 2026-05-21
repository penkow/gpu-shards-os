'use client'

import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { fetchState, inspectContainer } from './api'
import type { ContainerDetail, Gpu, ManagedContainer, PanelState } from './types'

export const EMPTY_STATE: PanelState = {
  connected: false,
  docker_target: '',
  error: '',
  gpus: [],
  containers: [],
  images: [],
}

export function usePanelState() {
  return useQuery<PanelState>({
    queryKey: ['panel', 'state'],
    queryFn: fetchState,
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  })
}

export function useContainerInspect(cid: string | undefined) {
  return useQuery<ContainerDetail>({
    queryKey: ['container', cid, 'inspect'],
    queryFn: () => inspectContainer(cid as string),
    enabled: !!cid,
    refetchInterval: 10_000,
  })
}

export function useContainerFromState(cid: string | undefined): ManagedContainer | undefined {
  const { data } = usePanelState()
  if (!cid || !data) return undefined
  return data.containers.find((c) => c.id === cid || c.name === cid)
}

export type GpuSample = { t: number; util: number; used: number; alloc: number }

/** Rolling client-side GPU history fed by the 5s state poll. */
export function useGpuHistory(maxSamples = 60) {
  const { data, dataUpdatedAt } = usePanelState()
  const historyRef = useRef<Map<number, GpuSample[]>>(new Map())
  const lastTickRef = useRef(0)

  if (data && dataUpdatedAt && dataUpdatedAt !== lastTickRef.current) {
    lastTickRef.current = dataUpdatedAt
    const t = dataUpdatedAt
    const history = historyRef.current
    for (const gpu of data.gpus) {
      const arr = history.get(gpu.index) ?? []
      arr.push({
        t,
        util: gpu.utilization_pct,
        used: gpu.memory_used_mb,
        alloc: gpu.allocated_mb,
      })
      if (arr.length > maxSamples) arr.splice(0, arr.length - maxSamples)
      history.set(gpu.index, arr)
    }
  }

  function get(gpu: Gpu): GpuSample[] {
    return historyRef.current.get(gpu.index) ?? []
  }
  return { get }
}

/** Watch the polled state and toast on container status transitions. */
export function useContainerChangeToasts() {
  const { data } = usePanelState()
  const lastSeen = useRef<Map<string, string>>(new Map())
  const initialized = useRef(false)

  useEffect(() => {
    if (!data) return
    const current = new Map<string, string>()
    for (const c of data.containers) current.set(c.id, c.status)

    if (!initialized.current) {
      lastSeen.current = current
      initialized.current = true
      return
    }

    for (const [id, status] of current) {
      const prev = lastSeen.current.get(id)
      if (prev && prev !== status) {
        const c = data.containers.find((x) => x.id === id)
        const name = c?.name ?? id
        if (status === 'exited') {
          toast.error(`${name} exited`)
        } else if (status === 'running' && prev !== 'created') {
          toast.success(`${name} is running`)
        } else if (status === 'restarting') {
          toast.info(`${name} restarting…`)
        } else {
          toast.info(`${name}: ${prev} → ${status}`)
        }
      } else if (!prev) {
        // newly observed
        const c = data.containers.find((x) => x.id === id)
        if (c && c.status === 'running') {
          toast.success(`${c.name} appeared (running)`)
        }
      }
    }
    for (const id of lastSeen.current.keys()) {
      if (!current.has(id)) {
        toast.info(`Container ${id.slice(0, 12)} removed`)
      }
    }
    lastSeen.current = current
  }, [data])
}
