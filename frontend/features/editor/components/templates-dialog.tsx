'use client'

import { Cpu, MessageSquare, Sparkles } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type Template = {
  id: string
  title: string
  description: string
  icon: React.ReactNode
  code: string
}

const TEMPLATES: Template[] = [
  {
    id: 'hello-gpu',
    title: 'Hello GPU',
    description: 'Probe CUDA availability and report free memory on the assigned shard.',
    icon: <Cpu className="h-5 w-5" />,
    code: `def handler(event, context):
    """Hello-GPU: confirm CUDA is reachable and report what the shard sees."""
    try:
        import torch
    except Exception as e:
        return {"cuda_available": False, "error": f"torch import failed: {e}"}

    if not torch.cuda.is_available():
        return {"cuda_available": False, "note": "Running on CPU."}

    idx = torch.cuda.current_device()
    free, total = torch.cuda.mem_get_info(idx)
    return {
        "cuda_available": True,
        "device": torch.cuda.get_device_name(idx),
        "free_mb": free // (1024 * 1024),
        "total_mb": total // (1024 * 1024),
        "endpoint": context.get("endpoint"),
    }
`,
  },
  {
    id: 'tiny-completion',
    title: 'Tiny LLM completion',
    description: 'Loads distilgpt2 once and streams completions on every call.',
    icon: <MessageSquare className="h-5 w-5" />,
    code: `# Loads once at endpoint boot — every invocation reuses the same model.
from functools import lru_cache


@lru_cache(maxsize=1)
def _pipeline():
    from transformers import pipeline  # type: ignore
    return pipeline("text-generation", model="distilgpt2")


def handler(event, context):
    prompt = (event or {}).get("prompt", "Hello, my name is")
    max_new_tokens = int((event or {}).get("max_new_tokens", 30))
    gen = _pipeline()(prompt, max_new_tokens=max_new_tokens, do_sample=True)
    return {"prompt": prompt, "completion": gen[0]["generated_text"]}
`,
  },
  {
    id: 'echo-sleep',
    title: 'Echo + sleep',
    description: 'Sleeps 2s then echoes the input. Useful for demoing the GPU sparkline + queue.',
    icon: <Sparkles className="h-5 w-5" />,
    code: `import base64
import time


def handler(event, context):
    """Simulated image-gen: sleeps so the GPU sparkline visibly ticks, then echoes."""
    prompt = (event or {}).get("prompt", "a cat")
    time.sleep(2)
    placeholder = base64.b64encode(prompt.encode()).decode()
    return {
        "prompt": prompt,
        "image_b64": placeholder,
        "endpoint": context.get("endpoint"),
    }
`,
  },
]

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (code: string) => void
}

export function TemplatesDialog({ open, onOpenChange, onPick }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Templates</DialogTitle>
          <DialogDescription>
            Pick a starting point. The current editor contents will be replaced.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-2">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                onPick(t.code)
                onOpenChange(false)
              }}
              className="flex items-start gap-3 rounded-md border bg-background p-3 text-left transition-colors hover:border-foreground/40 hover:bg-accent/30"
            >
              <div className="mt-0.5 text-muted-foreground">{t.icon}</div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{t.title}</div>
                <p className="text-xs text-muted-foreground">{t.description}</p>
              </div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
