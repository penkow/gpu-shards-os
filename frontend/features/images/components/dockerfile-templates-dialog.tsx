'use client'

import { Boxes, Layers, MessageSquare, Sparkles } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export type DockerfileTemplate = {
  id: string
  title: string
  description: string
  icon: React.ReactNode
  suggestedTag: string
  dockerfile: string
}

export const DOCKERFILE_TEMPLATES: DockerfileTemplate[] = [
  {
    id: 'diffusers',
    title: 'Diffusers + transformers',
    description: 'Image generation / multi-modal models (Stable Diffusion, FLUX, …).',
    icon: <Sparkles className="h-5 w-5" />,
    suggestedTag: 'gpu-shards-diffusers:latest',
    dockerfile: `FROM gpu-shards-editor-gpu:latest
RUN pip install --no-cache-dir \\
    diffusers \\
    transformers \\
    accelerate \\
    safetensors
`,
  },
  {
    id: 'whisper',
    title: 'Whisper ASR',
    description: 'Speech-to-text via OpenAI Whisper. Adds ffmpeg for audio I/O.',
    icon: <MessageSquare className="h-5 w-5" />,
    suggestedTag: 'gpu-shards-whisper:latest',
    dockerfile: `FROM gpu-shards-editor-gpu:latest
RUN apt-get update \\
 && apt-get install -y --no-install-recommends ffmpeg \\
 && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir \\
    openai-whisper \\
    ffmpeg-python
`,
  },
  {
    id: 'vllm',
    title: 'vLLM server',
    description: 'High-throughput LLM inference. Pair with an OpenAI-compatible handler.',
    icon: <Layers className="h-5 w-5" />,
    suggestedTag: 'gpu-shards-vllm:latest',
    dockerfile: `FROM gpu-shards-editor-gpu:latest
RUN pip install --no-cache-dir vllm
`,
  },
  {
    id: 'comfyui',
    title: 'ComfyUI',
    description: 'Node-based diffusion workflow runtime. Clones the official repo.',
    icon: <Boxes className="h-5 w-5" />,
    suggestedTag: 'gpu-shards-comfyui:latest',
    dockerfile: `FROM gpu-shards-editor-gpu:latest
RUN apt-get update \\
 && apt-get install -y --no-install-recommends git \\
 && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 https://github.com/comfyanonymous/ComfyUI /opt/ComfyUI \\
 && pip install --no-cache-dir -r /opt/ComfyUI/requirements.txt
WORKDIR /opt/ComfyUI
`,
  },
]

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (template: DockerfileTemplate) => void
}

export function DockerfileTemplatesDialog({ open, onOpenChange, onPick }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Dockerfile templates</DialogTitle>
          <DialogDescription>
            Pick a curated starting point. The build dialog opens prefilled — you can still tweak before hitting Build.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-2">
          {DOCKERFILE_TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                onPick(t)
                onOpenChange(false)
              }}
              className="flex items-start gap-3 rounded-md border bg-background p-3 text-left transition-colors hover:border-foreground/40 hover:bg-accent/30"
            >
              <div className="mt-0.5 text-muted-foreground">{t.icon}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{t.title}</span>
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                    {t.suggestedTag}
                  </code>
                </div>
                <p className="text-xs text-muted-foreground">{t.description}</p>
              </div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
