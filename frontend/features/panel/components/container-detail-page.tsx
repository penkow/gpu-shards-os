'use client'

import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, Zap } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useContainerFromState, useContainerInspect } from '../hooks'
import { ContainerActions } from './container-actions'
import { LogsView } from './logs-view'
import { ShellPane } from './shell-pane'

export function ContainerDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const search = useSearchParams()
  const cid = decodeURIComponent(params.id as string)

  const fromState = useContainerFromState(cid)
  const detail = useContainerInspect(cid)
  const container = fromState ?? detail.data
  const status = container?.status ?? '—'
  const name = container?.name ?? cid

  const initialTab = (search.get('tab') as 'logs' | 'shell' | 'metadata' | null) ?? 'logs'

  function setTab(v: string) {
    const sp = new URLSearchParams(search.toString())
    sp.set('tab', v)
    router.replace(`/containers/${encodeURIComponent(cid)}?${sp.toString()}`, {
      scroll: false,
    })
  }

  return (
    <div className="flex h-svh flex-col gap-3 overflow-hidden p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <Button variant="ghost" size="sm" asChild className="-ms-2 mb-1">
            <Link href="/containers">
              <ArrowLeft />
              Containers
            </Link>
          </Button>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{name}</h1>
            <Badge
              variant={status === 'running' ? 'default' : 'secondary'}
              className="capitalize"
            >
              {status}
            </Badge>
            {detail.data?.endpoint_name && (
              <Link href={`/endpoints/${encodeURIComponent(detail.data.endpoint_name)}`}>
                <Badge variant="outline" className="gap-1">
                  <Zap className="h-3 w-3" />
                  Endpoint: {detail.data.endpoint_name}
                </Badge>
              </Link>
            )}
          </div>
          <p className="font-mono text-xs text-muted-foreground">{cid}</p>
        </div>
        {container && (
          <ContainerActions
            container={{ id: cid, name, status }}
            size="sm"
            showShell={false}
          />
        )}
      </div>

      <Tabs value={initialTab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col gap-3">
        <TabsList className="self-start">
          <TabsTrigger value="logs">Logs</TabsTrigger>
          <TabsTrigger value="shell" disabled={status !== 'running'}>
            Shell
          </TabsTrigger>
          <TabsTrigger value="metadata">Metadata</TabsTrigger>
        </TabsList>

        <TabsContent value="logs" className="min-h-0 flex-1">
          <LogsView cid={cid} name={name} mode="live" className="h-full" />
        </TabsContent>

        <TabsContent value="shell" className="min-h-0 flex-1">
          <ShellPane
            cid={cid}
            name={name}
            disabled={status !== 'running'}
            disabledMessage={`Container is ${status}; start it to attach a shell.`}
          />
        </TabsContent>

        <TabsContent value="metadata" className="min-h-0 flex-1 overflow-y-auto">
          {detail.isLoading && !detail.data ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="animate-spin" /> Loading inspect…
            </div>
          ) : detail.error ? (
            <p className="text-sm text-destructive">
              {detail.error instanceof Error
                ? detail.error.message
                : 'Inspect failed'}
            </p>
          ) : detail.data ? (
            <MetadataView data={detail.data} />
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function MetadataView({ data }: { data: import('../types').ContainerDetail }) {
  const entries: [string, React.ReactNode][] = [
    ['Image', <span className="font-mono">{data.image}</span>],
    ['GPU index', data.gpu_index],
    ['Memory limit', data.memory_limit_raw],
    ['SM limit', data.sm_limit],
    ['Created', fmt(data.created_at)],
    ['Started', fmt(data.started_at)],
    ['Finished', fmt(data.finished_at)],
    ['Exit code', data.exit_code],
    ['Restart count', data.restart_count],
    ['Restart policy', data.restart_policy || '—'],
    ['Command', data.command.length ? data.command.join(' ') : '—'],
  ]

  return (
    <div className="space-y-5">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm md:grid-cols-2">
        {entries.map(([k, v]) => (
          <div
            key={k}
            className="flex items-baseline justify-between gap-3 border-b py-1.5"
          >
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="truncate font-mono text-xs">{v}</dd>
          </div>
        ))}
      </dl>

      <div>
        <h3 className="mb-2 text-xs font-bold tracking-widest text-muted-foreground uppercase">
          Environment
        </h3>
        <pre className="overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed">
          {Object.entries(data.env)
            .map(([k, v]) => `${k}=${v}`)
            .join('\n') || '(empty)'}
        </pre>
      </div>
    </div>
  )
}

function fmt(s: string): string {
  if (!s) return '—'
  try {
    return new Date(s).toLocaleString()
  } catch {
    return s
  }
}
