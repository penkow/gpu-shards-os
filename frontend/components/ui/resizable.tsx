'use client'

import { GripVertical } from 'lucide-react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import { cn } from '@/lib/utils'

function ResizablePanelGroup({
  className,
  ...props
}: React.ComponentProps<typeof Group>) {
  return (
    <Group
      data-slot="resizable-panel-group"
      className={cn(
        'flex h-full w-full data-[orientation=vertical]:flex-col',
        className,
      )}
      {...props}
    />
  )
}

function ResizablePanel({
  className,
  ...props
}: React.ComponentProps<typeof Panel>) {
  return (
    <Panel
      data-slot="resizable-panel"
      className={cn('min-h-0', className)}
      {...props}
    />
  )
}

function ResizableHandle({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof Separator> & {
  withHandle?: boolean
}) {
  return (
    <Separator
      data-slot="resizable-handle"
      className={cn(
        // Visible 1px line spanning the cross-axis, in the border colour.
        'group/handle relative flex shrink-0 items-center justify-center bg-border outline-none transition-colors hover:bg-border/70',
        // Horizontal orientation (default): thin vertical line.
        'w-px',
        // Vertical orientation: thin horizontal line.
        'data-[orientation=vertical]:h-px data-[orientation=vertical]:w-full',
        // Wider invisible hit target so the handle is easy to grab.
        'after:absolute after:inset-y-0 after:left-1/2 after:w-2 after:-translate-x-1/2 after:content-[""]',
        'data-[orientation=vertical]:after:inset-x-0 data-[orientation=vertical]:after:left-auto data-[orientation=vertical]:after:top-1/2 data-[orientation=vertical]:after:h-2 data-[orientation=vertical]:after:w-full data-[orientation=vertical]:after:-translate-y-1/2 data-[orientation=vertical]:after:translate-x-0',
        // Focus ring.
        'focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1',
        className,
      )}
      {...props}
    >
      {withHandle && (
        <div className="z-10 flex h-4 w-6 items-center justify-center rounded-sm border bg-background shadow-sm transition-colors group-hover/handle:bg-accent data-[orientation=vertical]:h-6 data-[orientation=vertical]:w-6">
          <GripVertical className="h-3 w-3 text-muted-foreground" />
        </div>
      )}
    </Separator>
  )
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle }
