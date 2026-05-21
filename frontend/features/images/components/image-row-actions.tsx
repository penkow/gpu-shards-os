'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Code2, Eye, Rocket, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { removeImage } from '../api'
import { InspectImageDialog } from './inspect-image-dialog'

type Props = {
  tag: string
  /** Container short_ids that currently reference this image. */
  usedBy: string[]
  /** Maps container short_id → human name, when known. */
  resolveContainerName: (id: string) => string
  /** Called after a successful removal. */
  onRemoved: () => void
}

export function ImageRowActions({ tag, usedBy, resolveContainerName, onRemoved }: Props) {
  const router = useRouter()
  const [inspectOpen, setInspectOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [removing, setRemoving] = useState(false)

  const inUse = usedBy.length > 0
  const usingList = usedBy.map(resolveContainerName).join(', ')

  function onDeploy() {
    router.push(`/deploy?image=${encodeURIComponent(tag)}`)
  }

  function onUseInEditor() {
    try {
      localStorage.setItem('gpu-shards.preferred-image', tag)
    } catch {}
    router.push('/editor')
  }

  async function onRemove() {
    setRemoving(true)
    try {
      await removeImage(tag)
      toast.success(`Removed ${tag}`)
      onRemoved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Remove failed')
    } finally {
      setRemoving(false)
      setConfirmOpen(false)
    }
  }

  return (
    <>
      <div className="flex justify-end gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          title="Deploy a container with this image"
          onClick={onDeploy}
        >
          <Rocket />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          title="Open the editor with this image preselected for the next endpoint"
          onClick={onUseInEditor}
        >
          <Code2 />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          title="Inspect"
          onClick={() => setInspectOpen(true)}
        >
          <Eye />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          title={
            inUse
              ? `In use by ${usingList || `${usedBy.length} container(s)`}. Remove/stop them first.`
              : 'Remove image'
          }
          disabled={inUse}
          onClick={() => setConfirmOpen(true)}
        >
          <Trash2 />
        </Button>
      </div>

      <InspectImageDialog
        open={inspectOpen}
        onOpenChange={setInspectOpen}
        imageRef={tag}
      />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={(o) => !removing && setConfirmOpen(o)}
        title={`Remove ${tag}?`}
        desc="The image will be deleted from the Docker daemon. Layers shared with other images stay."
        confirmText={removing ? 'Removing…' : 'Remove'}
        destructive
        handleConfirm={() => void onRemove()}
      />
    </>
  )
}
