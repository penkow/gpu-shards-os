import { getBackendConfig } from '@/lib/backend-config'
import type {
  BuildImageRequest,
  BuildStatus,
  BuildsListResponse,
  ImageInspectResponse,
  ImagesResponse,
} from './types'

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { url, apiKey } = getBackendConfig()
  const defaultHeaders: Record<string, string> = apiKey ? { 'X-API-Key': apiKey } : {}
  const res = await fetch(`${url}${path}`, {
    ...init,
    headers: {
      ...defaultHeaders,
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

export function startBuild(payload: BuildImageRequest): Promise<BuildStatus> {
  return request<BuildStatus>('/api/images/builds', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function listBuilds(): Promise<BuildsListResponse> {
  return request<BuildsListResponse>('/api/images/builds')
}

export function getBuildStatus(buildId: string): Promise<BuildStatus> {
  return request<BuildStatus>(`/api/images/builds/${encodeURIComponent(buildId)}`)
}

export function buildStreamUrl(buildId: string): string {
  const { url: base, apiKey } = getBackendConfig()
  const path = `/api/images/builds/${encodeURIComponent(buildId)}/stream`
  const qs = apiKey ? `?token=${encodeURIComponent(apiKey)}` : ''
  return `${base}${path}${qs}`
}

// Image refs (tags / short ids) can contain "/" and ":" — emit them verbatim so
// FastAPI's `{ref:path}` converter sees the literal value. Encoded slashes break it.
function encodeRef(ref: string): string {
  return encodeURI(ref)
}

export function listImages(): Promise<ImagesResponse> {
  return request<ImagesResponse>('/api/images')
}

export function inspectImage(ref: string): Promise<ImageInspectResponse> {
  return request<ImageInspectResponse>(`/api/images/${encodeRef(ref)}/inspect`)
}

export function removeImage(ref: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/api/images/${encodeRef(ref)}`, {
    method: 'DELETE',
  })
}
