'use client'

import { AlertTriangle, RefreshCw, Settings } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { getBackendConfig } from '@/lib/backend-config'
import { usePanelState } from '../hooks'

export function DisconnectedBanner() {
  const { data, error, refetch, isFetching } = usePanelState()
  const fetchError =
    error instanceof Error ? error.message : error ? 'Backend unreachable' : ''
  const stateError = data?.error || ''
  const connected = !!data?.connected && !fetchError
  if (connected && !stateError) return null

  // Distinguish "panel can't reach backend" (network/auth) from "backend
  // reached us, but Docker probe failed" (post-connection state error). Only
  // the former benefits from the Open Settings shortcut.
  const isFetchFailure = !!fetchError
  const title = isFetchFailure
    ? 'Backend unreachable'
    : 'Disconnected from Docker daemon'
  const message =
    stateError ||
    (fetchError
      ? `Could not reach ${getBackendConfig().url}: ${fetchError}`
      : 'Backend is reporting disconnected state.')

  const openSettings = () =>
    window.dispatchEvent(new CustomEvent('gpu-shards:open-settings'))

  return (
    <Alert variant="destructive" className="mx-4 mt-2">
      <AlertTriangle />
      <AlertTitle className="flex items-center justify-between gap-3">
        <span>{title}</span>
        <div className="flex items-center gap-2">
          {isFetchFailure && (
            <Button variant="outline" size="sm" onClick={openSettings}>
              <Settings className="h-3.5 w-3.5" />
              Open Settings
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={isFetching ? 'animate-spin' : undefined} />
            Retry
          </Button>
        </div>
      </AlertTitle>
      <AlertDescription className="break-words">{message}</AlertDescription>
    </Alert>
  )
}
