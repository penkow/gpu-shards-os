import { getBackendConfig } from '@/lib/backend-config'
import type {
  EndpointCreateRequest,
  EndpointDetail,
  EndpointsListResponse,
  InvokeResult,
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

export function createEndpoint(payload: EndpointCreateRequest): Promise<EndpointDetail> {
  return request<EndpointDetail>('/api/endpoints', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function listEndpoints(): Promise<EndpointsListResponse> {
  return request<EndpointsListResponse>('/api/endpoints')
}

export function getEndpoint(name: string): Promise<EndpointDetail> {
  return request<EndpointDetail>(`/api/endpoints/${encodeURIComponent(name)}`)
}

export function deleteEndpoint(name: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/api/endpoints/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  })
}

export function invokeEndpoint(name: string, body: unknown): Promise<InvokeResult> {
  return request<InvokeResult>(`/api/fn/${encodeURIComponent(name)}/invoke`, {
    method: 'POST',
    body: JSON.stringify(body ?? {}),
  })
}

/** Public absolute URL for the invoke endpoint — used for curl snippets. */
export function invokeUrl(name: string): string {
  const { url } = getBackendConfig()
  return `${url}/api/fn/${encodeURIComponent(name)}/invoke`
}
