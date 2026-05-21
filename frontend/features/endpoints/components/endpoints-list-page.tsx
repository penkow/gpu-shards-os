'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ExternalLink, Loader2, Plus, Trash2, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/confirm-dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { deleteEndpoint, listEndpoints } from '@/features/endpoints/api'
import type { EndpointSummary } from '@/features/endpoints/types'
import { formatRelative } from '@/features/endpoints/lib/relative-time'

export function EndpointsListPage() {
  const router = useRouter()
  const [endpoints, setEndpoints] = useState<EndpointSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>('')
  const [confirmDelete, setConfirmDelete] = useState<string>('')

  const refresh = useCallback(async () => {
    try {
      const res = await listEndpoints()
      setEndpoints(res.endpoints)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const id = setInterval(refresh, 3000)
    return () => clearInterval(id)
  }, [refresh])

  async function onDelete(name: string) {
    try {
      await deleteEndpoint(name)
      toast.success(`Endpoint ${name} removed`)
      setEndpoints((prev) => prev.filter((e) => e.name !== name))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete endpoint')
    } finally {
      setConfirmDelete('')
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Endpoints</h1>
          <p className="text-sm text-muted-foreground">
            Functions deployed from the editor. Each one wraps your <code className="font-mono">handler(event, context)</code> in a persistent container.
          </p>
        </div>
        <Button onClick={() => router.push('/editor')}>
          <Plus className="h-4 w-4" /> Create from editor
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap className="h-4 w-4" /> Deployed
            <span className="text-xs font-normal text-muted-foreground">
              ({endpoints.length})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading endpoints…
            </div>
          ) : error ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              {error}
            </div>
          ) : endpoints.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              <Zap className="mx-auto mb-2 h-8 w-8 opacity-40" />
              <p>No endpoints yet.</p>
              <p className="mt-1 text-xs">
                Open the <Link className="underline" href="/editor">editor</Link>, write a handler, and click <b>Deploy as Endpoint</b>.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>GPU</TableHead>
                  <TableHead className="text-right">Invocations</TableHead>
                  <TableHead>Last invoked</TableHead>
                  <TableHead className="w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {endpoints.map((e) => (
                  <TableRow
                    key={e.name}
                    className="cursor-pointer"
                    onClick={() => router.push(`/endpoints/${encodeURIComponent(e.name)}`)}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Zap className="h-3.5 w-3.5 text-muted-foreground" />
                        {e.name}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={e.status === 'running' ? 'default' : 'secondary'}>
                        {e.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {e.gpu_index === '?' ? 'CPU' : `GPU ${e.gpu_index}`}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{e.invocation_count}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {e.last_invoked_at ? formatRelative(e.last_invoked_at) : 'never'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Open"
                          onClick={(ev) => {
                            ev.stopPropagation()
                            router.push(`/endpoints/${encodeURIComponent(e.name)}`)
                          }}
                        >
                          <ExternalLink />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Delete"
                          onClick={(ev) => {
                            ev.stopPropagation()
                            setConfirmDelete(e.name)
                          }}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete('')}
        title={`Remove endpoint ${confirmDelete}?`}
        desc="The container will be force-removed and the workspace deleted."
        confirmText="Remove"
        destructive
        handleConfirm={() => void onDelete(confirmDelete)}
      />
    </div>
  )
}
