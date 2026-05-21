'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Rocket } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { createEndpoint } from '@/features/endpoints/api'
import type { Gpu } from '@/features/panel/types'

const NAME_RE = /^[a-z][a-z0-9-]{0,31}$/

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  code: string
  gpus: Gpu[]
  defaultUseGpu: boolean
  defaultGpuIndex: number
}

export function DeployEndpointDialog({
  open,
  onOpenChange,
  code,
  gpus,
  defaultUseGpu,
  defaultGpuIndex,
}: Props) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [useGpu, setUseGpu] = useState(defaultUseGpu)
  const [gpuIndex, setGpuIndex] = useState<number>(defaultGpuIndex)
  const [memory, setMemory] = useState('4g')
  const [smLimit, setSmLimit] = useState(50)
  const [deploying, setDeploying] = useState(false)

  // Reset state whenever the dialog opens.
  useEffect(() => {
    if (open) {
      setName('')
      setUseGpu(defaultUseGpu)
      setGpuIndex(defaultGpuIndex)
      setMemory('4g')
      setSmLimit(50)
    }
  }, [open, defaultUseGpu, defaultGpuIndex])

  const nameValid = NAME_RE.test(name)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nameValid) {
      toast.error('Name must be lowercase, start with a letter, and contain only a-z, 0-9, hyphen.')
      return
    }
    setDeploying(true)
    const t = toast.loading(`Booting endpoint ${name}…`)
    try {
      await createEndpoint({
        name,
        code,
        use_gpu: useGpu,
        gpu_index: gpuIndex,
        memory: memory.trim() || '4g',
        sm_limit: smLimit,
      })
      toast.success(`Endpoint live: ${name}`, { id: t })
      onOpenChange(false)
      router.push(`/endpoints/${encodeURIComponent(name)}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to deploy endpoint', { id: t })
    } finally {
      setDeploying(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Deploy as Endpoint</DialogTitle>
          <DialogDescription>
            Wraps your <code className="font-mono">handler(event, context)</code> in a persistent
            HTTP server. The endpoint stays up until you delete it.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ep-name">Name</Label>
            <Input
              id="ep-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="hello-gpu"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Lowercase letters, digits, hyphens. Becomes part of the public URL.
            </p>
          </div>

          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <div>
              <Label htmlFor="ep-gpu-toggle" className="cursor-pointer text-sm">
                Use GPU
              </Label>
              <p className="text-xs text-muted-foreground">
                Off = CPU-only. On enforces memory + SM limits.
              </p>
            </div>
            <Switch id="ep-gpu-toggle" checked={useGpu} onCheckedChange={setUseGpu} />
          </div>

          {useGpu && (
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ep-gpu">GPU</Label>
                <Select
                  value={String(gpuIndex)}
                  onValueChange={(v) => setGpuIndex(Number(v))}
                  disabled={gpus.length === 0}
                >
                  <SelectTrigger id="ep-gpu" className="w-full">
                    <SelectValue placeholder="No GPUs" />
                  </SelectTrigger>
                  <SelectContent>
                    {gpus.map((g) => (
                      <SelectItem key={g.index} value={String(g.index)}>
                        GPU {g.index}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ep-mem">Memory</Label>
                <Input
                  id="ep-mem"
                  value={memory}
                  onChange={(e) => setMemory(e.target.value)}
                  placeholder="4g"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ep-sm">SM %</Label>
                <Input
                  id="ep-sm"
                  type="number"
                  min={1}
                  max={100}
                  value={smLimit}
                  onChange={(e) => setSmLimit(Number(e.target.value))}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={deploying}>
              Cancel
            </Button>
            <Button type="submit" disabled={deploying || !nameValid}>
              {deploying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
              {deploying ? 'Booting…' : 'Deploy'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
