import { Boxes, Code2, Cpu, LayoutDashboard, Package, Rocket } from 'lucide-react'
import { type SidebarData } from '../types'

export const sidebarData: SidebarData = {
  navGroups: [
    {
      title: 'General',
      items: [
        { title: 'Overview', url: '/', icon: LayoutDashboard },
        { title: 'GPUs', url: '/gpus', icon: Cpu },
        { title: 'Containers', url: '/containers', icon: Boxes },
        { title: 'Deploy', url: '/deploy', icon: Rocket },
        { title: 'Images', url: '/images', icon: Package },
        { title: 'Editor', url: '/editor', icon: Code2 },
      ],
    },
  ],
}
