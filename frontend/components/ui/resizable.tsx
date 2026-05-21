'use client'

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
        // Transparent gutter: the panels keep their own borders and breathe;
        // only the grip badge in the centre is visible.
        'group/handle relative flex shrink-0 items-center justify-center outline-none',
        // Vertical separator (between horizontally-arranged panels): vertical gutter spanning full height.
        'aria-[orientation=vertical]:h-full aria-[orientation=vertical]:w-3',
        // Horizontal separator (between vertically-arranged panels): horizontal gutter spanning full width.
        'aria-[orientation=horizontal]:h-3 aria-[orientation=horizontal]:w-full',
        // Focus ring.
        'focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1',
        className,
      )}
      {...props}
    >
      {withHandle && (
        <div
          className={cn(
            'rounded-full bg-border transition-colors group-hover/handle:bg-muted-foreground/60',
            // Horizontal separator: wide, short pill.
            'group-aria-[orientation=horizontal]/handle:h-1 group-aria-[orientation=horizontal]/handle:w-10',
            // Vertical separator: tall, narrow pill.
            'group-aria-[orientation=vertical]/handle:h-10 group-aria-[orientation=vertical]/handle:w-1',
          )}
        />
      )}
    </Separator>
  )
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle }
