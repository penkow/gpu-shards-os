'use client'

import { useState } from 'react'
import { Hammer } from 'lucide-react'
import { Main } from '@/components/layout/main'
import { Button } from '@/components/ui/button'
import { BuildImageDialog } from '@/features/images/components/build-image-dialog'
import { usePanelState } from '../hooks'

export function ImagesPage() {
  const { data, refetch } = usePanelState()
  const images = data?.images ?? []
  const [buildOpen, setBuildOpen] = useState(false)

  return (
    <Main className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Images</h1>
          <p className="text-muted-foreground">
            Docker images currently available on the target daemon.
          </p>
        </div>
        <Button onClick={() => setBuildOpen(true)} className="gap-1.5">
          <Hammer className="h-4 w-4" />
          Build image
        </Button>
      </div>
      {images.length === 0 ? (
        <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
          No images reported by the daemon.
        </div>
      ) : (
        <ul className="overflow-hidden rounded-lg border divide-y">
          {images.map((image) => (
            <li
              key={image}
              className="flex items-center gap-3 px-4 py-2 font-mono text-sm"
            >
              {image}
            </li>
          ))}
        </ul>
      )}
      <BuildImageDialog
        open={buildOpen}
        onOpenChange={setBuildOpen}
        onBuilt={() => {
          try {
            refetch?.()
          } catch {}
        }}
      />
    </Main>
  )
}
