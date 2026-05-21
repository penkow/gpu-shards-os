'use client'

import { useEffect, useState } from 'react'
import { Check, Loader2, Moon, RotateCcw, Settings, Sun } from 'lucide-react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import {
  getBackendConfig,
  getDefaultBackendConfig,
  setBackendConfig,
} from '@/lib/backend-config'
import { useTheme } from '@/context/theme-provider'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'

type ThemeOption = 'light' | 'dark' | 'system'

const THEME_OPTIONS: { value: ThemeOption; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Settings },
]

export function ConfigDrawer() {
  const { theme, setTheme } = useTheme()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)

  // Local form state for the backend section — only saved on click.
  const [url, setUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<'ok' | 'fail' | null>(null)

  // Hydrate form values whenever the dialog opens.
  useEffect(() => {
    if (!open) return
    const cfg = getBackendConfig()
    setUrl(cfg.url)
    setApiKey(cfg.apiKey)
    setTestResult(null)
  }, [open])

  const normalizeUrl = (raw: string) => raw.trim().replace(/\/$/, '')

  const testConnection = async () => {
    const target = normalizeUrl(url)
    if (!target) {
      toast.error('Enter a backend URL first')
      return
    }
    setTesting(true)
    setTestResult(null)
    try {
      const headers: Record<string, string> = {}
      if (apiKey) headers['X-API-Key'] = apiKey
      const res = await fetch(`${target}/api/health`, { headers })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = (await res.json()) as { ok?: boolean }
      if (body?.ok !== true) throw new Error('unexpected response')
      setTestResult('ok')
      toast.success('Backend reachable')
    } catch (e: any) {
      setTestResult('fail')
      toast.error('Cannot reach backend', { description: e?.message ?? String(e) })
    } finally {
      setTesting(false)
    }
  }

  const save = () => {
    const target = normalizeUrl(url)
    if (!target) {
      toast.error('Backend URL cannot be empty')
      return
    }
    setBackendConfig({ url: target, apiKey })
    // Bust react-query caches so subsequent reads hit the new backend.
    queryClient.invalidateQueries()
    toast.success('Backend settings saved')
    setOpen(false)
  }

  const resetToDefault = () => {
    const d = getDefaultBackendConfig()
    setUrl(d.url)
    setApiKey(d.apiKey)
    setTestResult(null)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <SidebarMenu>
        <SidebarMenuItem>
          <DialogTrigger asChild>
            <SidebarMenuButton tooltip="Settings">
              <Settings />
              <span>Settings</span>
            </SidebarMenuButton>
          </DialogTrigger>
        </SidebarMenuItem>
      </SidebarMenu>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Configure the app.</DialogDescription>
        </DialogHeader>

        <section className="space-y-3">
          <h3 className="text-sm font-medium">Theme</h3>
          <div className="grid grid-cols-3 gap-2">
            {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
              const active = theme === value
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTheme(value)}
                  className={cn(
                    'flex flex-col items-center gap-2 rounded-md border p-3 text-sm transition-colors',
                    active
                      ? 'border-primary bg-primary/5'
                      : 'hover:bg-accent hover:text-accent-foreground',
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <span className="flex items-center gap-1">
                    {label}
                    {active && <Check className="h-3 w-3" />}
                  </span>
                </button>
              )
            })}
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Backend</h3>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={resetToDefault}
              className="h-7 text-xs"
            >
              <RotateCcw className="h-3 w-3" />
              Default
            </Button>
          </div>
          <div className="space-y-2">
            <Label htmlFor="backend-url" className="text-xs">
              URL
            </Label>
            <Input
              id="backend-url"
              type="url"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value)
                setTestResult(null)
              }}
              placeholder="http://localhost:8000"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="backend-api-key" className="text-xs">
              API key <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="backend-api-key"
              type="password"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value)
                setTestResult(null)
              }}
              placeholder="Leave blank if the backend has no API key"
              autoComplete="off"
            />
          </div>
        </section>

        <DialogFooter className="flex-row items-center justify-between gap-2 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={testConnection}
            disabled={testing}
            className="flex items-center gap-2"
          >
            {testing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : testResult === 'ok' ? (
              <Check className="h-4 w-4 text-green-600" />
            ) : null}
            Test connection
          </Button>
          <Button type="button" onClick={save}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
