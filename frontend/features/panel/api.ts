import type {
  ContainerDetail,
  DeployRequest,
  DeployResponse,
  PanelState,
} from './types'

export const BACKEND_URL = (
  process.env.NEXT_PUBLIC_HAMI_BACKEND_URL ?? 'http://localhost:8000'
).replace(/\/$/, '')

export const API_KEY = process.env.NEXT_PUBLIC_HAMI_API_KEY ?? ''

const DEFAULT_HEADERS: Record<string, string> = API_KEY
  ? { 'X-API-Key': API_KEY }
  : {}

async function request<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...init,
    headers: {
      ...DEFAULT_HEADERS,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  })
  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const body = (await res.json()) as { detail?: string }
      if (body?.detail) detail = body.detail
    } catch {
      const text = await res.text().catch(() => '')
      if (text) detail = text
    }
    throw new Error(detail)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export function fetchState(): Promise<PanelState> {
  return request<PanelState>('/api/state')
}

export function deployContainer(
  payload: DeployRequest
): Promise<DeployResponse> {
  return request<DeployResponse>('/api/deploy', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function fetchLogs(cid: string): Promise<{ cid: string; logs: string }> {
  return request<{ cid: string; logs: string }>(
    `/api/containers/${encodeURIComponent(cid)}/logs`
  )
}

export function inspectContainer(cid: string): Promise<ContainerDetail> {
  return request<ContainerDetail>(`/api/containers/${encodeURIComponent(cid)}`)
}

export function stopContainer(cid: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(
    `/api/containers/${encodeURIComponent(cid)}/stop`,
    { method: 'POST' }
  )
}

export function restartContainer(cid: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(
    `/api/containers/${encodeURIComponent(cid)}/restart`,
    { method: 'POST' }
  )
}

export function removeContainer(cid: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(
    `/api/containers/${encodeURIComponent(cid)}`,
    { method: 'DELETE' }
  )
}

export function shellWebSocketUrl(cid: string): string {
  const url = new URL(BACKEND_URL)
  const scheme = url.protocol === 'https:' ? 'wss' : 'ws'
  const path = `/api/containers/${encodeURIComponent(cid)}/shell`
  const qs = API_KEY ? `?token=${encodeURIComponent(API_KEY)}` : ''
  return `${scheme}://${url.host}${path}${qs}`
}

export function logsStreamUrl(cid: string): string {
  const path = `/api/containers/${encodeURIComponent(cid)}/logs/stream`
  const qs = API_KEY ? `?token=${encodeURIComponent(API_KEY)}` : ''
  return `${BACKEND_URL}${path}${qs}`
}
