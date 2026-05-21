'use client'

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, FileText, Loader2, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatRelative } from '@/features/endpoints/lib/relative-time'
import { listBuilds } from '../api'
import type { BuildStatus } from '../types'
import { BuildLogsDialog } from './build-logs-dialog'

function durationMs(started: string, finished: string): number | null {
  const a = Date.parse(started)
  const b = finished ? Date.parse(finished) : Date.now()
  if (Number.isNaN(a)) return null
  return Math.max(0, b - a)
}

function formatDuration(ms: number | null): string {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms} ms`
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(1)} s`
  const m = Math.floor(s / 60)
  const rem = Math.round(s - m * 60)
  return `${m}m ${rem}s`
}

export function RecentBuilds() {
  const [builds, setBuilds] = useState<BuildStatus[]>([])
  const [openId, setOpenId] = useState<string>('')

  const refresh = useCallback(async () => {
    try {
      const res = await listBuilds()
      setBuilds(res.builds.slice(0, 10))
    } catch {
      // demo-grade: ignore transient errors
    }
  }, [])

  useEffect(() => {
    void refresh()
    const id = setInterval(refresh, 3000)
    return () => clearInterval(id)
  }, [refresh])

  const focused = builds.find((b) => b.build_id === openId)

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          Recent builds
          <span className="text-xs font-normal text-muted-foreground">({builds.length})</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {builds.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground">
            No builds yet. Hit <b>Build image</b> or pick a template.
          </div>
        ) : (
          <ul className="divide-y rounded-md border">
            {builds.map((b) => (
              <li key={b.build_id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <Badge
                  variant={
                    b.status === 'succeeded'
                      ? 'default'
                      : b.status === 'failed'
                        ? 'destructive'
                        : 'secondary'
                  }
                  className="gap-1"
                >
                  {b.status === 'running' && <Loader2 className="h-3 w-3 animate-spin" />}
                  {b.status === 'succeeded' && <CheckCircle2 className="h-3 w-3" />}
                  {b.status === 'failed' && <XCircle className="h-3 w-3" />}
                  {b.status}
                </Badge>
                <code className="min-w-0 flex-1 truncate font-mono text-xs">{b.tag}</code>
                <span className="text-xs text-muted-foreground">
                  {formatRelative(b.started_at)}
                </span>
                <span className="w-20 text-right text-xs text-muted-foreground tabular-nums">
                  {formatDuration(durationMs(b.started_at, b.finished_at))}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setOpenId(b.build_id)}
                  title="View build logs"
                >
                  <FileText className="h-3.5 w-3.5" /> Logs
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      {openId && (
        <BuildLogsDialog
          open={!!openId}
          onOpenChange={(o) => !o && setOpenId('')}
          buildId={openId}
          initialBuild={focused}
        />
      )}
    </Card>
  )
}
