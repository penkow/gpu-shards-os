'use client'

import { useEffect, useState } from 'react'
import { Save } from 'lucide-react'
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
import { slugifyTemplateName } from '../api'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Existing template ids — used to warn about overwrites. */
  existingIds: string[]
  onSave: (id: string, name: string) => Promise<void> | void
}

export function SaveTemplateAsDialog({ open, onOpenChange, existingIds, onSave }: Props) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setName('')
      setSaving(false)
    }
  }, [open])

  const slug = slugifyTemplateName(name)
  const isExisting = existingIds.includes(slug) && name.trim().length > 0

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const display = name.trim()
    if (!display) return
    setSaving(true)
    try {
      await onSave(slug, display)
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Save request template</DialogTitle>
          <DialogDescription>
            The current request body will be saved under this name and reload-survivable.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="tpl-name">Name</Label>
            <Input
              id="tpl-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="happy path"
              autoFocus
            />
            {name.trim() && (
              <p className={`text-xs ${isExisting ? 'text-amber-600' : 'text-muted-foreground'}`}>
                Saved as <code className="font-mono">{slug}</code>
                {isExisting ? ' (will overwrite the existing template with this id)' : ''}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || saving}>
              <Save className="h-4 w-4" />
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
