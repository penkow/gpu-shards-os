'use client'

import { useQuery } from '@tanstack/react-query'
import { useLayout } from '@/context/layout-provider'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from '@/components/ui/sidebar'
import { fetchState } from '@/features/panel/api'
import type { PanelState } from '@/features/panel/types'
import { AppTitle } from './app-title'
import { sidebarData } from './data/sidebar-data'
import { NavGroup } from './nav-group'

export function AppSidebar() {
  const { collapsible, variant } = useLayout()
  const state = useQuery<PanelState>({
    queryKey: ['panel', 'state'],
    queryFn: fetchState,
    refetchInterval: 5000,
  }).data
  const target =
    state?.connected && state.docker_target ? state.docker_target : 'disconnected'

  return (
    <Sidebar collapsible={collapsible} variant={variant}>
      <SidebarHeader>
        <AppTitle />
      </SidebarHeader>
      <SidebarContent>
        {sidebarData.navGroups.map((props) => (
          <NavGroup key={props.title} {...props} />
        ))}
      </SidebarContent>
      <SidebarFooter>
        <div className="px-3 py-2 text-xs text-sidebar-foreground/70">
          <div className="font-semibold">HAMi panel</div>
          <div className="truncate font-mono text-[10px] text-sidebar-foreground/60">
            {target}
          </div>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
