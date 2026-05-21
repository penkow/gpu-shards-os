'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Rocket } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { deployContainer } from '../api'
import type { Gpu } from '../types'

const DEFAULT_IMAGE = 'hami-core-demo:latest'
const SUGGESTED_IMAGES = [DEFAULT_IMAGE, 'hami-pytorch:latest']

type Props = {
  gpus: Gpu[]
  images: string[]
  onDeployed: () => void
}

export function DeployForm({ gpus, images, onDeployed }: Props) {
  const search = useSearchParams()
  const imageOptions = Array.from(
    new Set([...SUGGESTED_IMAGES, ...images])
  )

  const [image, setImage] = useState(imageOptions[0] ?? DEFAULT_IMAGE)

  // Honor /deploy?image=<tag> as a one-time pre-selection, as soon as the
  // requested tag is present in the available options.
  useEffect(() => {
    const preset = search.get('image')
    if (preset && imageOptions.includes(preset) && preset !== image) {
      setImage(preset)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, images])
  const [name, setName] = useState('')
  const [gpuIndex, setGpuIndex] = useState<string>('')
  const [memory, setMemory] = useState('4g')
  const [smLimit, setSmLimit] = useState(100)
  const [command, setCommand] = useState('')
  const [deploying, setDeploying] = useState(false)

  useEffect(() => {
    if (gpus.length === 0) {
      setGpuIndex('')
      return
    }
    setGpuIndex((prev) => {
      if (prev && gpus.some((g) => String(g.index) === prev)) return prev
      return String(gpus[0].index)
    })
  }, [gpus])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!gpuIndex) {
      toast.warning('Pick a GPU first')
      return
    }
    setDeploying(true)
    try {
      await deployContainer({
        image: image.trim() || DEFAULT_IMAGE,
        name: name.trim(),
        gpu_index: Number(gpuIndex),
        memory: memory.trim() || '4g',
        sm_limit: Number(smLimit) || 100,
        command: command.trim(),
      })
      toast.success(`Deployed on GPU ${gpuIndex}`)
      setName('')
      setCommand('')
      onDeployed()
    } catch (err) {
      toast.error(
        err instanceof Error ? `Deploy failed: ${err.message}` : 'Deploy failed'
      )
    } finally {
      setDeploying(false)
    }
  }

  return (
    <Card>
      <CardContent>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1.5 lg:col-span-2">
              <Label htmlFor="panel-image">Image</Label>
              <Select value={image} onValueChange={setImage}>
                <SelectTrigger id="panel-image" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {imageOptions.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 lg:col-span-2">
              <Label htmlFor="panel-name">Container name (optional)</Label>
              <Input
                id="panel-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="my-job"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="panel-gpu">GPU</Label>
              <Select
                value={gpuIndex}
                onValueChange={setGpuIndex}
                disabled={gpus.length === 0}
              >
                <SelectTrigger id="panel-gpu" className="w-full">
                  <SelectValue placeholder="No GPUs" />
                </SelectTrigger>
                <SelectContent>
                  {gpus.map((g) => (
                    <SelectItem key={g.index} value={String(g.index)}>
                      GPU {g.index} — {g.name.slice(0, 24)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1.5">
              <Label htmlFor="panel-mem">Memory</Label>
              <Input
                id="panel-mem"
                value={memory}
                onChange={(e) => setMemory(e.target.value)}
                placeholder="4g / 512m / 2048"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="panel-sm">SM %</Label>
              <Input
                id="panel-sm"
                type="number"
                min={1}
                max={100}
                step={1}
                value={smLimit}
                onChange={(e) => setSmLimit(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5 lg:col-span-2">
              <Label htmlFor="panel-cmd">Command (optional)</Label>
              <Input
                id="panel-cmd"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="nvidia-smi"
              />
            </div>
            <div className="flex items-end">
              <Button
                type="submit"
                disabled={deploying}
                className="w-full"
                size="lg"
              >
                <Rocket />
                {deploying ? 'Deploying…' : 'Deploy'}
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
