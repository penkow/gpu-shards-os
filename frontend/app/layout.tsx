import { Suspense } from 'react'
import type { Metadata } from 'next'
import { cookies } from 'next/headers'
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
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: 'any' },
    ],
    apple: '/favicon.svg',
  },
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const cookieStore = await cookies()
  const sidebarDefaultOpen = cookieStore.get('sidebar_state')?.value !== 'false'

  return (
    <html
      lang="en"
      className={`${inter.variable} ${manrope.variable} font-inter`}
      suppressHydrationWarning
    >
      <body>
        <Providers>
          <Suspense fallback={null}>
            <AppShell sidebarDefaultOpen={sidebarDefaultOpen}>{children}</AppShell>
          </Suspense>
          <ShellTray />
        </Providers>
      </body>
    </html>
  )
}
