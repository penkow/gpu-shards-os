import { type SVGProps } from 'react'
import { cn } from '@/lib/utils'

export function Logo({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox='0 0 500 500'
      xmlns='http://www.w3.org/2000/svg'
      fill='currentColor'
      className={cn('size-6', className)}
      {...props}
    >
      <title>GPU Shards</title>
      <path d='M 245.874 492.821 L 134.684 386.687 L 51.462 75.817 L 248.602 10.767 L 444.377 82.665 L 417.775 165.519 L 247.238 101.154 L 148.327 137.443 L 202.898 345.603 L 244.509 387.372 L 287.485 346.973 L 307.949 271.652 L 248.602 270.967 L 226.092 203.177 L 404.815 201.808 L 355.699 388.056 L 245.874 492.821 Z' />
    </svg>
  )
}
