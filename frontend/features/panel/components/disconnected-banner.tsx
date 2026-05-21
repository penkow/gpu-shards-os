'use client'

import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { BACKEND_URL } from '../api'
import { usePanelState } from '../hooks'

export function DisconnectedBanner() {
  const { data, error, refetch, isFetching } = usePanelState()
  const fetchError =
    error instanceof Error ? error.message : error ? 'Backend unreachable' : ''
  const stateError = data?.error || ''
  const connected = !!data?.connected && !fetchError
  if (connected && !stateError) return null

  const message =
    stateError ||
    (fetchError
      ? `Backend unreachable at ${BACKEND_URL}: ${fetchError}`
      : 'Backend is reporting disconnected state.')

  return (
    <Alert variant="destructive" className="mx-4 mt-2">
      <AlertTriangle />
      <AlertTitle className="flex items-center justify-between gap-3">
        <span>Disconnected from Docker daemon</span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={isFetching ? 'animate-spin' : undefined} />
          Retry
        </Button>
      </AlertTitle>
      <AlertDescription className="break-words">{message}</AlertDescription>
    </Alert>
  )
}
