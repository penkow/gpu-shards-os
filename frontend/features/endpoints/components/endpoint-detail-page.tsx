'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Copy,
  Loader2,
  Play,
  RefreshCcw,
  Save,
  Trash2,
  X,
  XCircle,
  Zap,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/confirm-dialog'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { LogsView } from '@/features/panel/components/logs-view'
import {
  deleteEndpoint,
  deleteTemplate,
  getEndpoint,
  invokeEndpoint,
  invokeUrl,
  invokeUrlContainsKey,
  listTemplates,
  upsertTemplate,
} from '@/features/endpoints/api'
import type { EndpointDetail, InvokeResult, RequestTemplate } from '@/features/endpoints/types'
import { formatRelative } from '@/features/endpoints/lib/relative-time'
import { SaveTemplateAsDialog } from './save-template-as-dialog'

const UNSAVED = '__unsaved__'

function p50(samples: number[]): number {
  if (samples.length === 0) return 0
  const sorted = [...samples].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-mono text-lg leading-tight">{value}</div>
    </div>
  )
}

export function EndpointDetailPage() {
  const params = useParams<{ name: string }>()
  const router = useRouter()
  const name = params?.name ?? ''

  const [endpoint, setEndpoint] = useState<EndpointDetail | null>(null)
  const [error, setError] = useState<string>('')
  const [bodyText, setBodyText] = useState<string>('{\n  "prompt": "hello"\n}')
  const [invoking, setInvoking] = useState(false)
  const [lastResult, setLastResult] = useState<InvokeResult | null>(null)
  const [lastError, setLastError] = useState<string>('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [templates, setTemplates] = useState<RequestTemplate[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(UNSAVED)
  const [dirty, setDirty] = useState(false)
  const [saveAsOpen, setSaveAsOpen] = useState(false)
  const initialTemplatesAppliedRef = useRef(false)
  const pollRef = useRef<NodeJS.Timeout | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await getEndpoint(name)
      setEndpoint(res)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [name])

  const refreshTemplates = useCallback(async () => {
    try {
      const res = await listTemplates(name)
      setTemplates(res.templates)
      return res.templates
    } catch (e) {
      console.warn('failed to load templates', e)
      return []
    }
  }, [name])

  useEffect(() => {
    if (!name) return
    void refresh()
    void refreshTemplates().then((tpls) => {
      if (initialTemplatesAppliedRef.current) return
      initialTemplatesAppliedRef.current = true
      if (tpls.length > 0) {
        setSelectedTemplateId(tpls[0].id)
        setBodyText(tpls[0].body)
        setDirty(false)
      }
    })
    pollRef.current = setInterval(refresh, 3000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [name, refresh, refreshTemplates])

  const onPickTemplate = useCallback(
    (id: string) => {
      if (id === UNSAVED) {
        setSelectedTemplateId(UNSAVED)
        setDirty(false)
        return
      }
      const tpl = templates.find((t) => t.id === id)
      if (!tpl) return
      setSelectedTemplateId(id)
      setBodyText(tpl.body)
      setDirty(false)
    },
    [templates],
  )

  const onBodyChange = useCallback(
    (value: string) => {
      setBodyText(value)
      if (selectedTemplateId !== UNSAVED) setDirty(true)
    },
    [selectedTemplateId],
  )

  const onSaveAs = useCallback(
    async (id: string, displayName: string) => {
      try {
        await upsertTemplate(name, id, { name: displayName, body: bodyText })
        const tpls = await refreshTemplates()
        const created = tpls.find((t) => t.id === id)
        setSelectedTemplateId(created?.id ?? id)
        setDirty(false)
        toast.success(`Template "${displayName}" saved`)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to save template')
      }
    },
    [name, bodyText, refreshTemplates],
  )

  const onUpdateTemplate = useCallback(async () => {
    if (selectedTemplateId === UNSAVED) return
    const tpl = templates.find((t) => t.id === selectedTemplateId)
    if (!tpl) return
    try {
      await upsertTemplate(name, tpl.id, { name: tpl.name, body: bodyText })
      await refreshTemplates()
      setDirty(false)
      toast.success(`Template "${tpl.name}" updated`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update template')
    }
  }, [name, selectedTemplateId, templates, bodyText, refreshTemplates])

  const onDeleteTemplate = useCallback(async () => {
    if (selectedTemplateId === UNSAVED) return
    const tpl = templates.find((t) => t.id === selectedTemplateId)
    if (!tpl) return
    try {
      await deleteTemplate(name, tpl.id)
      await refreshTemplates()
      setSelectedTemplateId(UNSAVED)
      setDirty(false)
      toast.success(`Template "${tpl.name}" deleted`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete template')
    }
  }, [name, selectedTemplateId, templates, refreshTemplates])

  // Recomputed on every render so a config change (apiKey edited via Settings,
  // backend URL flipped) is reflected without page reload — the parent
  // re-renders on react-query invalidation triggered by setBackendConfig().
  const url = invokeUrl(name)
  const urlHasSecret = invokeUrlContainsKey()
  const curlSnippet = useMemo(
    () => `curl -X POST ${url} \\\n  -H 'Content-Type: application/json' \\\n  -d '${bodyText.replace(/\s+/g, ' ').trim() || '{}'}'`,
    [url, bodyText],
  )

  async function onInvoke() {
    let parsed: unknown
    try {
      parsed = bodyText.trim() ? JSON.parse(bodyText) : {}
    } catch (e) {
      toast.error('Invalid JSON in request body')
      return
    }
    setInvoking(true)
    setLastError('')
    try {
      const res = await invokeEndpoint(name, parsed)
      setLastResult(res)
      // Optimistic refresh to pick up the new count fast.
      void refresh()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setLastError(msg)
      setLastResult(null)
    } finally {
      setInvoking(false)
    }
  }

  async function onDelete() {
    try {
      await deleteEndpoint(name)
      toast.success(`Endpoint ${name} removed`)
      router.push('/endpoints')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete endpoint')
    } finally {
      setConfirmDelete(false)
    }
  }

  function copy(text: string, label: string) {
    void navigator.clipboard.writeText(text)
    toast.success(`${label} copied`)
  }

  if (!name) return null

  if (error && !endpoint) {
    return (
      <div className="p-6">
        <Button variant="ghost" size="sm" onClick={() => router.push('/endpoints')} className="mb-3">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <Card>
          <CardContent className="py-8 text-center text-sm text-destructive">
            {error}
          </CardContent>
        </Card>
      </div>
    )
  }

  const ep = endpoint
  const samples = ep?.recent_latencies_ms ?? []
  const median = p50(samples)
  const isOk = lastResult ? lastResult.ok !== false && !lastResult.error : false

  return (
    <div className="flex h-svh flex-col gap-3 overflow-hidden p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push('/endpoints')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              <h1 className="text-xl font-semibold tracking-tight">{name}</h1>
              {ep && (
                <Badge variant={ep.status === 'running' ? 'default' : 'secondary'}>
                  {ep.status}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {ep?.use_gpu
                ? `GPU ${ep.gpu_index} · ${ep.memory_limit_raw || '?'} mem · ${ep.sm_limit}% SM`
                : 'CPU'}
              {ep?.image_used ? (
                <>
                  {' · '}
                  <span className="font-mono">{ep.image_used}</span>
                </>
              ) : null}
              {ep?.container_name ? (
                <>
                  {' · '}
                  <Link
                    href={`/containers/${encodeURIComponent(ep.container_id)}`}
                    className="underline"
                  >
                    {ep.container_name}
                  </Link>
                </>
              ) : null}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => setConfirmDelete(true)}>
          <Trash2 className="h-4 w-4" /> Delete
        </Button>
      </div>

      <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
        <ResizablePanel defaultSize={55} minSize={30}>
          <div className="flex h-full flex-col gap-3 overflow-y-auto pr-2">
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Invocations" value={ep?.invocation_count ?? 0} />
              <Stat
                label="Last invoked"
                value={
                  <span className="text-sm">
                    {ep?.last_invoked_at ? formatRelative(ep.last_invoked_at) : 'never'}
                  </span>
                }
              />
              <Stat label="p50 latency" value={median ? `${median} ms` : '—'} />
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Invoke URL</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-2">
                  <code className="flex-1 truncate rounded-md border bg-muted/50 px-2 py-1 font-mono text-xs">
                    {url}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="Copy URL"
                    onClick={() => copy(url, 'URL')}
                  >
                    <Copy />
                  </Button>
                </div>
                <div className="rounded-md border bg-muted/30 p-2">
                  <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                    <span>curl</span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Copy curl"
                      onClick={() => copy(curlSnippet, 'curl snippet')}
                    >
                      <Copy />
                    </Button>
                  </div>
                  <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs">
                    {curlSnippet}
                  </pre>
                </div>
                {urlHasSecret && (
                  <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      This URL contains your API key as a <code>?token=</code> query param so the curl works
                      copy-pasted. Treat it like a password — do not paste it in public chats, screenshots, or
                      issue trackers.
                    </span>
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="flex flex-1 flex-col">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  Try it
                  {templates.length > 0 && (
                    <span className="ml-auto text-xs font-normal text-muted-foreground">
                      {templates.length} template{templates.length === 1 ? '' : 's'} saved
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={selectedTemplateId} onValueChange={onPickTemplate}>
                    <SelectTrigger className="h-8 w-56">
                      <SelectValue placeholder="Template…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNSAVED}>(unsaved request)</SelectItem>
                      {templates.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedTemplateId !== UNSAVED && dirty && (
                    <span className="text-xs text-amber-600" title="Modified since loaded">•</span>
                  )}
                  <div className="ml-auto flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSaveAsOpen(true)}
                      title="Save current body as a new template"
                    >
                      <Save className="h-3.5 w-3.5" /> Save as…
                    </Button>
                    {selectedTemplateId !== UNSAVED && (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={onUpdateTemplate}
                          disabled={!dirty}
                          title="Overwrite the selected template"
                        >
                          <RefreshCcw className="h-3.5 w-3.5" /> Update
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={onDeleteTemplate}
                          title="Delete this template"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                <Textarea
                  value={bodyText}
                  onChange={(e) => onBodyChange(e.target.value)}
                  rows={6}
                  className="font-mono text-xs"
                  placeholder='{"key": "value"}'
                />
                <div className="flex justify-end">
                  <Button onClick={onInvoke} disabled={invoking || ep?.status !== 'running'}>
                    {invoking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                    {invoking ? 'Invoking…' : 'Send'}
                  </Button>
                </div>

                {(lastResult || lastError) && (
                  <div className="rounded-md border bg-muted/30 p-2">
                    <div className="mb-1 flex items-center gap-2 text-xs">
                      {lastError ? (
                        <>
                          <XCircle className="h-3.5 w-3.5 text-destructive" />
                          <span className="text-destructive">Gateway error</span>
                        </>
                      ) : isOk ? (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                          <span>OK</span>
                        </>
                      ) : (
                        <>
                          <XCircle className="h-3.5 w-3.5 text-destructive" />
                          <span className="text-destructive">Handler error</span>
                        </>
                      )}
                      {lastResult?.gateway_duration_ms != null && (
                        <span className="ml-auto text-muted-foreground">
                          {lastResult.gateway_duration_ms} ms (gateway)
                          {lastResult.duration_ms != null
                            ? ` · ${lastResult.duration_ms} ms (handler)`
                            : ''}
                        </span>
                      )}
                    </div>
                    <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all font-mono text-xs">
                      {lastError ? lastError : JSON.stringify(lastResult, null, 2)}
                    </pre>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel defaultSize={45} minSize={25}>
          <div className="flex h-full flex-col rounded-lg border bg-gray-50 dark:bg-gray-900/50">
            <div className="border-b px-3 py-2 text-sm font-medium">Container logs</div>
            <div className="flex min-h-0 flex-1 p-2">
              {ep?.container_id ? (
                <LogsView
                  cid={ep.container_id}
                  name={ep.container_name}
                  mode="live"
                  showHeader={false}
                  className="h-full w-full"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                  Loading container…
                </div>
              )}
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Remove endpoint ${name}?`}
        desc="The container will be force-removed and the workspace deleted."
        confirmText="Remove"
        destructive
        handleConfirm={() => void onDelete()}
      />

      <SaveTemplateAsDialog
        open={saveAsOpen}
        onOpenChange={setSaveAsOpen}
        existingIds={templates.map((t) => t.id)}
        onSave={onSaveAs}
      />
    </div>
  )
}
