'use client'

import { useState } from 'react'
import { RotateCw, Square, Terminal as TerminalIcon, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { openShellSession } from '@/stores/shell-sessions'
import {
  useRemoveContainer,
  useRestartContainer,
  useStopContainer,
} from '../mutations'
import type { ManagedContainer } from '../types'

type Props = {
  container: Pick<ManagedContainer, 'id' | 'name' | 'status'>
  size?: 'icon-sm' | 'sm' | 'default'
  showShell?: boolean
  /** When true, navigate to detail page Shell tab on Shell click. Otherwise just open the global session. */
  openShellInPage?: boolean
}

export function ContainerActions({
  container,
  size = 'icon-sm',
  showShell = true,
  openShellInPage = false,
}: Props) {
  const stop = useStopContainer()
  const restart = useRestartContainer()
  const remove = useRemoveContainer()
  const router = useRouter()
  const [removeOpen, setRemoveOpen] = useState(false)

  const running = container.status === 'running'
  const busy = stop.isPending || restart.isPending || remove.isPending

  function onShell(e: React.MouseEvent) {
    e.stopPropagation()
    openShellSession(container.id, container.name)
    if (openShellInPage) {
      router.push(`/containers/${encodeURIComponent(container.id)}?tab=shell`)
    }
  }

  const iconOnly = size === 'icon-sm'

  return (
    <>
      <div className="flex gap-1">
        {showShell && running && (
          <Button
            variant="ghost"
            size={size}
            title="Open shell"
            onClick={onShell}
            disabled={busy}
          >
            <TerminalIcon />
            {!iconOnly && 'Shell'}
          </Button>
        )}
        {running && (
          <Button
            variant="ghost"
            size={size}
            title="Restart"
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation()
              restart.mutate({ cid: container.id, name: container.name })
            }}
          >
            <RotateCw />
            {!iconOnly && 'Restart'}
          </Button>
        )}
        {running && (
          <Button
            variant="ghost"
            size={size}
            title="Stop"
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation()
              stop.mutate({ cid: container.id, name: container.name })
            }}
          >
            <Square />
            {!iconOnly && 'Stop'}
          </Button>
        )}
        <Button
          variant="ghost"
          size={size}
          title="Remove"
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation()
            setRemoveOpen(true)
          }}
        >
          <Trash2 />
          {!iconOnly && 'Remove'}
        </Button>
      </div>
      <ConfirmDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        title={`Remove ${container.name}?`}
        desc="This will force-remove the container. Logs and shell will end."
        confirmText="Remove"
        destructive
        handleConfirm={() => {
          remove.mutate({ cid: container.id, name: container.name })
          setRemoveOpen(false)
        }}
      />
    </>
  )
}
