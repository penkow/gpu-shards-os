'use client'

import { getCookie } from '@/lib/cookies'
import { cn } from '@/lib/utils'
import { SearchProvider } from '@/context/search-provider'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { Header } from '@/components/layout/header'
import { ConfigDrawer } from '@/components/config-drawer'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { ConnectingOverlay } from '@/features/panel/components/connecting-overlay'
import { ContainerEventsListener } from '@/features/panel/components/container-events-listener'
import { DisconnectedBanner } from '@/features/panel/components/disconnected-banner'
import { SkipToMain } from '@/components/skip-to-main'

export function AppShell({ children }: { children: React.ReactNode }) {
  const defaultOpen = getCookie('sidebar_state') !== 'false'
  return (
    <SearchProvider>
      <SidebarProvider defaultOpen={defaultOpen}>
        <SkipToMain />
        <AppSidebar />
        <SidebarInset
          className={cn(
            '@container/content',
            'has-data-[layout=fixed]:h-svh',
            'peer-data-[variant=inset]:has-data-[layout=fixed]:h-[calc(100svh-(var(--spacing)*4))]'
          )}
        >
          <Header>
            <Search className="me-auto" />
            <ThemeSwitch />
            <ConfigDrawer />
          </Header>
          <ContainerEventsListener />
          <DisconnectedBanner />
          {children}
          <ConnectingOverlay />
        </SidebarInset>
      </SidebarProvider>
    </SearchProvider>
  )
}
