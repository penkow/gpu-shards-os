import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-10 text-center">
      <h1 className="text-3xl font-bold tracking-tight">Not found</h1>
      <p className="text-muted-foreground">
        The page you tried to open doesn&rsquo;t exist on this panel.
      </p>
      <Button asChild>
        <Link href="/">Go to overview</Link>
      </Button>
    </div>
  )
}
