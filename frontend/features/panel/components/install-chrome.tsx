'use client'

import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import { Logo } from '@/assets/logo'

export function InstallChrome({
  breadcrumb,
  children,
}: {
  breadcrumb: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-background text-foreground fixed inset-0 z-50 overflow-y-auto antialiased">
      <TopNav />
      <Breadcrumb label={breadcrumb} />
      {children}
    </div>
  )
}

function TopNav() {
  const links = [
    { label: 'Overview', href: '/install#overview' },
    { label: 'Requirements', href: '/install#requirements' },
    { label: 'Manual install', href: '/install/manual' },
  ]
  return (
    <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
      <Link href="/install" className="flex items-center gap-2.5 text-base font-medium tracking-tight">
        <Logo className="text-primary size-5" />
        <span>GPU Shards</span>
      </Link>

      <nav className="text-muted-foreground hidden items-center gap-7 text-sm md:flex">
        {links.map((l) => (
          <Link
            key={l.label}
            href={l.href}
            className="hover:text-foreground inline-flex items-center gap-1 transition-colors"
          >
            {l.label}
            <ChevronDown className="size-3.5 opacity-60" strokeWidth={1.75} />
          </Link>
        ))}
      </nav>

      <div className="flex items-center gap-3">
        <Link
          href="/"
          className="text-muted-foreground hover:text-foreground hidden text-sm transition-colors sm:block"
        >
          Open panel
        </Link>
        <Link
          href="/"
          className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-full px-4 py-2 text-sm font-medium transition-colors"
        >
          Try it
        </Link>
      </div>
    </header>
  )
}

function Breadcrumb({ label }: { label: string }) {
  return (
    <div className="bg-muted/30 border-y">
      <div className="text-muted-foreground mx-auto flex max-w-7xl items-center justify-between px-6 py-3 text-xs">
        <div className="flex items-center gap-2">
          <Link href="/install" className="hover:text-foreground transition-colors">
            Product
          </Link>
          <span className="opacity-50">/</span>
          <span className="text-foreground">{label}</span>
        </div>
        <Link
          href="/"
          className="hover:text-foreground inline-flex items-center gap-1 transition-colors"
        >
          Open panel
          <ChevronDown className="size-3.5" strokeWidth={1.75} />
        </Link>
      </div>
    </div>
  )
}

