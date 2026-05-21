'use client'

import { cn } from '@/lib/utils'
import { SearchProvider } from '@/context/search-provider'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { ConnectingOverlay } from '@/features/panel/components/connecting-overlay'
import { ContainerEventsListener } from '@/features/panel/components/container-events-listener'
import { DisconnectedBanner } from '@/features/panel/components/disconnected-banner'
import { SkipToMain } from '@/components/skip-to-main'

export function AppShell({
  sidebarDefaultOpen,
  children,
}: {
  sidebarDefaultOpen: boolean
  children: React.ReactNode
}) {
  return (
    <SearchProvider>
      <SidebarProvider defaultOpen={sidebarDefaultOpen}>
        <SkipToMain />
        <AppSidebar />
        <SidebarInset
          className={cn(
            '@container/content',
            'has-data-[layout=fixed]:h-svh',
            'peer-data-[variant=inset]:has-data-[layout=fixed]:h-[calc(100svh-(var(--spacing)*4))]'
          )}
        >
          <ContainerEventsListener />
          <DisconnectedBanner />
          {children}
          <ConnectingOverlay />
        </SidebarInset>
      </SidebarProvider>
    </SearchProvider>
  )
}
