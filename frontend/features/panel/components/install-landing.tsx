'use client'

import { useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { ArrowUpRight, Check, Copy } from 'lucide-react'
import { InstallChrome } from './install-chrome'

const subscribeNoop = () => () => {}

export function InstallLanding() {
  const origin = useSyncExternalStore(
    subscribeNoop,
    () => window.location.origin,
    () => 'http://localhost:3000'
  )
  const [copied, setCopied] = useState(false)

  const command = `curl -fsSL ${origin}/install.sh | bash`

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(command)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard blocked — ignore */
    }
  }

  return (
    <InstallChrome breadcrumb="Install">
      <main className="relative mx-auto flex max-w-6xl flex-col items-center px-6 pt-20 pb-32 text-center sm:pt-28">
        <Pill />

        <h1 className="mt-10 text-[64px] leading-[0.95] font-light tracking-tight text-balance sm:text-[96px] lg:text-[120px]">
          <span className="block font-serif">Built for</span>
          <span className="mt-2 block">
            <span className="text-foreground font-serif italic">GPU sharing</span>
            <span className="text-primary ml-3 inline-block translate-y-1 align-middle">
              <ArrowUpRight strokeWidth={1.5} className="size-12 sm:size-16 lg:size-20" />
            </span>
          </span>
        </h1>

        <p className="text-muted-foreground mt-10 max-w-2xl text-lg leading-relaxed text-balance sm:text-xl">
          Carve one NVIDIA GPU into isolated slices for multiple containers — no Kubernetes,
          no driver patches. Run the installer on any Ubuntu host with an NVIDIA driver and
          the backend, frontend, and HAMi-core libvgpu image are wired up for you.
        </p>

        <CommandBox command={command} copied={copied} onCopy={onCopy} />

        <p className="text-muted-foreground mt-6 text-sm">
          Prefer to do it yourself?{' '}
          <Link
            href="/install/manual"
            className="text-foreground underline underline-offset-4 hover:opacity-80"
          >
            Manual installation instructions
          </Link>
          .
        </p>

        <RequirementsStrip />
      </main>
    </InstallChrome>
  )
}

function Pill() {
  return (
    <span className="border-primary/30 bg-primary/5 text-primary inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs">
      <span className="bg-primary inline-block size-1.5 rotate-45" />
      Local-first
    </span>
  )
}

function CommandBox({
  command,
  copied,
  onCopy,
}: {
  command: string
  copied: boolean
  onCopy: () => void
}) {
  return (
    <div className="mt-14 w-full max-w-2xl">
      <div className="bg-card flex items-center gap-3 rounded-2xl border p-2 shadow-sm">
        <div className="flex flex-1 items-center gap-3 overflow-hidden px-3 font-mono text-sm">
          <span className="text-muted-foreground shrink-0 select-none">$</span>
          <code className="text-foreground flex-1 overflow-x-auto whitespace-nowrap text-left">
            {command}
          </code>
        </div>
        <button
          type="button"
          aria-label={copied ? 'Copied' : 'Copy command'}
          onClick={onCopy}
          className="text-muted-foreground hover:bg-accent hover:text-foreground inline-flex shrink-0 items-center justify-center rounded-md p-2 transition-colors"
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        </button>
      </div>
    </div>
  )
}

function RequirementsStrip() {
  const items = [
    { k: 'OS', v: 'Ubuntu 22.04+' },
    { k: 'GPU', v: 'NVIDIA + driver' },
    { k: 'Runtime', v: 'Docker' },
    { k: 'Ports', v: '3000 / 8000' },
  ]
  return (
    <div
      id="requirements"
      className="bg-border mt-24 grid w-full max-w-3xl grid-cols-2 gap-px overflow-hidden rounded-xl border text-left sm:grid-cols-4"
    >
      {items.map((it) => (
        <div key={it.k} className="bg-card px-5 py-4">
          <div className="text-muted-foreground text-[10px] font-medium tracking-[0.18em] uppercase">
            {it.k}
          </div>
          <div className="text-foreground mt-1 text-sm">{it.v}</div>
        </div>
      ))}
    </div>
  )
}
