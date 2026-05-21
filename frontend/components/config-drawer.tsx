'use client'

import { Settings } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

export function ConfigDrawer() {
  return (
    <Button
      size="icon"
      variant="ghost"
      aria-label="Open settings"
      className="rounded-full"
      onClick={() => toast.info('To be implemented')}
    >
      <Settings aria-hidden="true" />
    </Button>
  )
}
