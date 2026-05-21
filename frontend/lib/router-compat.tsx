'use client'

import * as React from 'react'
import NextLink from 'next/link'
import {
  useRouter as useNextRouter,
  usePathname,
  useSearchParams as useNextSearchParams,
  useParams as useNextParams,
} from 'next/navigation'

type SearchObject = Record<string, unknown>
type SearchInput =
  | SearchObject
  | ((prev: SearchObject) => SearchObject | undefined)
  | undefined

function tryNumber(v: string): number | string {
  if (v === '' || v === null || v === undefined) return v
  if (/^-?\d+(\.\d+)?$/.test(v)) {
    const n = Number(v)
    if (!Number.isNaN(n)) return n
  }
  return v
}

function parseSearchParams(sp: URLSearchParams | null): SearchObject {
  const obj: Record<string, unknown> = {}
  if (!sp) return obj
  for (const k of new Set(Array.from(sp.keys()))) {
    const all = sp.getAll(k)
    if (all.length > 1) {
      obj[k] = all.map(tryNumber)
    } else {
      obj[k] = tryNumber(all[0])
    }
  }
  return obj
}

function searchObjectToString(obj: SearchObject | undefined): string {
  if (!obj) return ''
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '') continue
    if (Array.isArray(v)) {
      if (v.length === 0) continue
      v.forEach((vv) => {
        if (vv !== undefined && vv !== null) params.append(k, String(vv))
      })
    } else if (typeof v === 'object') {
      params.append(k, JSON.stringify(v))
    } else {
      params.append(k, String(v))
    }
  }
  const s = params.toString()
  return s ? `?${s}` : ''
}

function resolveSearch(
  input: SearchInput,
  current: SearchObject
): SearchObject {
  if (input === undefined) return current
  if (typeof input === 'function') {
    return (input as (p: SearchObject) => SearchObject)(current) ?? {}
  }
  return input
}

type LinkAnyProps = Omit<React.ComponentProps<typeof NextLink>, 'href'> & {
  to?: string
  href?: string
  search?: SearchInput
  params?: unknown
  preload?: unknown
  disabled?: boolean
  activeProps?: unknown
  activeOptions?: unknown
}

export function Link({
  to,
  href,
  search,
  params: _params,
  preload: _preload,
  disabled,
  activeProps: _activeProps,
  activeOptions: _activeOptions,
  children,
  ...rest
}: LinkAnyProps) {
  const sp = useNextSearchParams()
  const target = (to ?? href ?? '#') as string
  let finalHref: string = target
  if (search !== undefined) {
    const current = parseSearchParams(
      new URLSearchParams(sp?.toString() ?? '')
    )
    const newSearch = resolveSearch(search, current)
    finalHref = target + searchObjectToString(newSearch)
  }
  if (disabled) {
    return (
      <span {...(rest as React.HTMLAttributes<HTMLSpanElement>)} aria-disabled>
        {children}
      </span>
    )
  }
  return (
    <NextLink href={finalHref} {...rest}>
      {children}
    </NextLink>
  )
}

export type LinkProps = LinkAnyProps

type NavigateOpts = {
  to?: string
  search?: SearchInput
  replace?: boolean
  params?: unknown
  hash?: string
  from?: string
}

export function useNavigate() {
  const router = useNextRouter()
  const pathname = usePathname()
  const sp = useNextSearchParams()
  return React.useCallback(
    (opts: NavigateOpts = {}) => {
      const target = (opts.to ?? pathname ?? '/') as string
      const current = parseSearchParams(
        new URLSearchParams(sp?.toString() ?? '')
      )
      const newSearch = resolveSearch(opts.search, current)
      const url =
        target +
        searchObjectToString(newSearch) +
        (opts.hash ? `#${opts.hash}` : '')
      if (opts.replace) router.replace(url)
      else router.push(url)
    },
    [router, pathname, sp]
  )
}

type Location = {
  pathname: string
  href: string
  search: SearchObject
  searchStr: string
}

export function useLocation<T = Location>(opts?: {
  select?: (loc: Location) => T
}): T {
  const pathname = usePathname() ?? '/'
  const sp = useNextSearchParams()
  const searchStr = sp?.toString() ?? ''
  const loc: Location = {
    pathname,
    href: pathname + (searchStr ? '?' + searchStr : ''),
    search: parseSearchParams(new URLSearchParams(searchStr)),
    searchStr,
  }
  return (opts?.select ? opts.select(loc) : (loc as unknown as T)) as T
}

export function useRouter() {
  const router = useNextRouter()
  return {
    history: {
      go: (n: number) => {
        if (n < 0) {
          for (let i = 0; i < -n; i++) router.back()
        } else if (n > 0) {
          for (let i = 0; i < n; i++) router.forward()
        }
      },
      back: () => router.back(),
      forward: () => router.forward(),
    },
    navigate: (opts: NavigateOpts) => {
      const url =
        (opts.to ?? '/') + searchObjectToString(opts.search as SearchObject)
      if (opts.replace) router.replace(url)
      else router.push(url)
    },
  }
}

export function useRouterState<T = { status: 'idle' | 'pending' }>(opts?: {
  select?: (s: { status: 'idle' | 'pending' }) => T
}): T {
  // Next.js App Router doesn't expose a clean global "pending" state; report idle.
  const state = { status: 'idle' as const }
  return (opts?.select ? opts.select(state) : (state as unknown as T)) as T
}

export function useSearch<T = SearchObject>(_opts?: unknown): T {
  const sp = useNextSearchParams()
  return parseSearchParams(
    new URLSearchParams(sp?.toString() ?? '')
  ) as unknown as T
}

export function useParams<T = Record<string, string>>(_opts?: unknown): T {
  return useNextParams() as unknown as T
}

export function getRouteApi(_path: string) {
  return {
    useSearch,
    useNavigate,
    useParams,
    useLoaderData: () => undefined as unknown,
  }
}

export function Outlet({ children }: { children?: React.ReactNode }) {
  return <>{children ?? null}</>
}

export function createFileRoute(_path: string) {
  return (_config: unknown) => ({})
}

export function createRootRouteWithContext<_T>() {
  return (_config: unknown) => ({})
}

export function redirect(opts: unknown): never {
  throw opts as Error
}
