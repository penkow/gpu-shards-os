'use client'

import { Main } from '@/components/layout/main'
import { usePanelState } from '../hooks'

export function ImagesPage() {
  const { data } = usePanelState()
  const images = data?.images ?? []
  return (
    <Main className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Images</h1>
        <p className="text-muted-foreground">
          Docker images currently available on the target daemon.
        </p>
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
    </Main>
  )
}
