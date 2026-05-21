'use client'

import '@xterm/xterm/css/xterm.css'

import { useEffect, useRef } from 'react'
import { registerTrayHost } from '@/stores/shell-sessions'

/**
 * Hidden global parking spot for shell terminals. When a per-container Shell
 * view is mounted, it adopts the session's host div from this tray. When
 * unmounted, the div returns here so the xterm Terminal keeps its
 * scrollback/state across route changes.
 *
 * No visible UI — session switching lives inside `<ShellPane />` on the
 * container detail page.
 */
export function ShellTray() {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    registerTrayHost(hostRef.current)
    return () => registerTrayHost(null)
  }, [])

  return (
    <div
      ref={hostRef}
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 -z-10 size-px overflow-hidden opacity-0"
    />
  )
}
