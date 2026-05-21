'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Boxes, Hammer, Layers, Loader2, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Main } from '@/components/layout/main'
import { formatRelative } from '@/features/endpoints/lib/relative-time'
import { listImages } from '../api'
import { formatBytes } from '../lib/format-bytes'
import type { ImageInfo } from '../types'
import { useContainerNameResolver } from './use-container-name-resolver'
import { BuildImageDialog } from './build-image-dialog'
import {
  DOCKERFILE_TEMPLATES,
  DockerfileTemplatesDialog,
  type DockerfileTemplate,
} from './dockerfile-templates-dialog'
import { ImageRowActions } from './image-row-actions'
import { RecentBuilds } from './recent-builds'

export function ImagesPage() {
  const [images, setImages] = useState<ImageInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>('')
  const [filter, setFilter] = useState('')
  const [buildOpen, setBuildOpen] = useState(false)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [templateSeed, setTemplateSeed] = useState<DockerfileTemplate | null>(null)
  const resolveContainerName = useContainerNameResolver()

  const refresh = useCallback(async () => {
    try {
      const res = await listImages()
      setImages(res.images)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const id = setInterval(refresh, 5000)
    return () => clearInterval(id)
  }, [refresh])

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return images
    return images.filter((img) => {
      if (img.tags.some((t) => t.toLowerCase().includes(q))) return true
      if (img.id.toLowerCase().includes(q)) return true
      return false
    })
  }, [filter, images])

  function openTemplates() {
    setTemplatesOpen(true)
  }

  function onPickTemplate(t: DockerfileTemplate) {
    setTemplateSeed(t)
    setBuildOpen(true)
  }

  return (
    <Main className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Images</h1>
          <p className="text-muted-foreground">
            Docker images on the target daemon, plus build history and curated
            Dockerfile templates.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={openTemplates} className="gap-1.5">
            <Layers className="h-4 w-4" />
            Templates
          </Button>
          <Button
            onClick={() => {
              setTemplateSeed(null)
              setBuildOpen(true)
            }}
            className="gap-1.5"
          >
            <Hammer className="h-4 w-4" />
            Build image
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Boxes className="h-4 w-4" /> Images
            <span className="text-xs font-normal text-muted-foreground">
              ({images.length})
            </span>
            <div className="ml-auto flex w-64 items-center gap-2 rounded-md border bg-background px-2">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter by tag or id"
                className="h-7 border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
              />
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading images…
            </div>
          ) : error ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              {error}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {images.length === 0
                ? 'No images reported by the daemon. Hit Build image or pick a template.'
                : 'No images match the filter.'}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tag</TableHead>
                  <TableHead>ID</TableHead>
                  <TableHead className="text-right">Size</TableHead>
                  <TableHead>Age</TableHead>
                  <TableHead>Used by</TableHead>
                  <TableHead className="w-40 text-right"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((img) => {
                  const primaryTag = img.tags[0] ?? img.id
                  return (
                    <TableRow key={img.id + (img.tags[0] ?? '')}>
                      <TableCell className="font-mono text-xs">
                        <div className="flex flex-col gap-0.5">
                          {img.tags.length === 0 ? (
                            <span className="text-muted-foreground">&lt;none&gt;</span>
                          ) : (
                            img.tags.map((t) => <span key={t}>{t}</span>)
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {img.id}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {formatBytes(img.size_bytes)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {img.created_at ? formatRelative(img.created_at) : '—'}
                      </TableCell>
                      <TableCell>
                        {img.used_by.length === 0 ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <Badge
                            variant="secondary"
                            title={img.used_by.map(resolveContainerName).join(', ')}
                          >
                            {img.used_by.length} container
                            {img.used_by.length === 1 ? '' : 's'}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <ImageRowActions
                          tag={primaryTag}
                          usedBy={img.used_by}
                          resolveContainerName={resolveContainerName}
                          onRemoved={refresh}
                        />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <RecentBuilds />

      <DockerfileTemplatesDialog
        open={templatesOpen}
        onOpenChange={setTemplatesOpen}
        onPick={onPickTemplate}
      />

      <BuildImageDialog
        open={buildOpen}
        onOpenChange={(o) => {
          setBuildOpen(o)
          if (!o) setTemplateSeed(null)
        }}
        initialTag={templateSeed?.suggestedTag}
        initialDockerfile={templateSeed?.dockerfile}
        onBuilt={() => {
          void refresh()
        }}
      />
    </Main>
  )
}
