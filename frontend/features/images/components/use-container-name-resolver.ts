'use client'

import { useCallback } from 'react'
import { usePanelState } from '@/features/panel/hooks'

/** Returns a function that maps a container short_id → human name, falling
 * back to the id when we don't have the container in current state. */
export function useContainerNameResolver(): (id: string) => string {
  const { data } = usePanelState()
  const containers = data?.containers ?? []
  return useCallback(
    (id: string) => {
      const c = containers.find((x) => x.id === id)
      return c?.name ?? id
    },
    [containers],
  )
}
