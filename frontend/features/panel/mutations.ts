'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { removeContainer, restartContainer, stopContainer } from './api'

type Action = 'stop' | 'restart' | 'remove'

const VERB: Record<Action, string> = {
  stop: 'stop',
  restart: 'restart',
  remove: 'remove',
}

const PAST: Record<Action, string> = {
  stop: 'Stopped',
  restart: 'Restarted',
  remove: 'Removed',
}

const FNS: Record<Action, (cid: string) => Promise<{ ok: boolean }>> = {
  stop: stopContainer,
  restart: restartContainer,
  remove: removeContainer,
}

function useContainerAction(action: Action) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ cid }: { cid: string; name?: string }) => FNS[action](cid),
    onSuccess: (_data, { cid, name }) => {
      toast.success(`${PAST[action]} ${name ?? cid}`)
      queryClient.invalidateQueries({ queryKey: ['panel', 'state'] })
      queryClient.invalidateQueries({ queryKey: ['container', cid] })
    },
    onError: (err, { name }) => {
      toast.error(
        err instanceof Error
          ? `${VERB[action]} failed${name ? ` for ${name}` : ''}: ${err.message}`
          : `${VERB[action]} failed`
      )
    },
  })
}

export const useStopContainer = () => useContainerAction('stop')
export const useRestartContainer = () => useContainerAction('restart')
export const useRemoveContainer = () => useContainerAction('remove')

/**
 * Fire an action against many containers in parallel, swallow individual
 * failures, then invalidate exactly once.
 */
export function useBulkContainerAction(action: Action) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (cids: string[]) => {
      const results = await Promise.allSettled(cids.map((cid) => FNS[action](cid)))
      const failed = results.filter((r) => r.status === 'rejected')
      return { total: cids.length, failed: failed.length }
    },
    onSuccess: ({ total, failed }) => {
      const ok = total - failed
      if (failed === 0) {
        toast.success(`${PAST[action]} ${ok} container${ok === 1 ? '' : 's'}`)
      } else if (ok === 0) {
        toast.error(`Failed to ${VERB[action]} ${failed} container${failed === 1 ? '' : 's'}`)
      } else {
        toast.warning(
          `${PAST[action]} ${ok}, failed ${failed} (of ${total})`
        )
      }
      queryClient.invalidateQueries({ queryKey: ['panel', 'state'] })
    },
    onError: (err) => {
      toast.error(
        err instanceof Error
          ? `Bulk ${VERB[action]} failed: ${err.message}`
          : `Bulk ${VERB[action]} failed`
      )
    },
  })
}
