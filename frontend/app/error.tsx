'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-10 text-center">
      <h1 className="text-3xl font-bold tracking-tight">Something broke</h1>
      <p className="max-w-xl break-words font-mono text-xs text-muted-foreground">
        {error.message}
      </p>
      <Button onClick={reset}>Try again</Button>
    </div>
  )
}
