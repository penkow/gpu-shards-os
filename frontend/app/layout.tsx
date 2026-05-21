import { Suspense } from 'react'
import type { Metadata } from 'next'
import { Inter, Manrope } from 'next/font/google'
import { Providers } from '@/components/providers'
import { ShellTray } from '@/features/panel/components/shell-tray'
import { AppShell } from '@/components/layout/app-shell'
import './globals.css'

export const dynamic = 'force-dynamic'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'GPU Shards OS',
  description: 'HAMi GPU-sharing control panel.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${manrope.variable} font-inter`}
      suppressHydrationWarning
    >
      <body>
        <Providers>
          <Suspense fallback={null}>
            <AppShell>{children}</AppShell>
          </Suspense>
          <ShellTray />
        </Providers>
      </body>
    </html>
  )
}
