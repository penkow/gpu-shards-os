'use client'

import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { handleServerError } from '@/lib/handle-server-error'
import { DirectionProvider } from '@/context/direction-provider'
import { FontProvider } from '@/context/font-provider'
import { ThemeProvider } from '@/context/theme-provider'
import { NavigationProgress } from '@/components/navigation-progress'
import { Toaster } from '@/components/ui/sonner'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: (failureCount) => {
              if (process.env.NODE_ENV !== 'production') return false
              return failureCount <= 3
            },
            refetchOnWindowFocus: process.env.NODE_ENV === 'production',
            staleTime: 10 * 1000,
          },
          mutations: {
            onError: (error) => {
              handleServerError(error)
            },
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <FontProvider>
          <DirectionProvider>
            <NavigationProgress />
            {children}
            <Toaster duration={5000} />
          </DirectionProvider>
        </FontProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
