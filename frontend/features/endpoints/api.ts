import { getBackendConfig } from '@/lib/backend-config'
import type {
  EndpointCreateRequest,
  EndpointDetail,
  EndpointsListResponse,
  InvokeResult,
  RequestTemplate,
  TemplatesResponse,
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

/** Public absolute URL for the invoke endpoint — used for curl snippets.
 *
 * When an API key is configured, includes it as a ?token= query param so the
 * snippet works copy-pasted (the invoke route accepts header OR token). The
 * caller (endpoint detail page) is responsible for warning the user that this
 * URL contains a secret and shouldn't be shared publicly. */
export function invokeUrl(name: string): string {
  const { url, apiKey } = getBackendConfig()
  const base = `${url}/api/fn/${encodeURIComponent(name)}/invoke`
  if (!apiKey) return base
  return `${base}?token=${encodeURIComponent(apiKey)}`
}

/** Whether the displayed invoke URL embeds an API key (i.e. is a secret). */
export function invokeUrlContainsKey(): boolean {
  return !!getBackendConfig().apiKey
}

export function listTemplates(name: string): Promise<TemplatesResponse> {
  return request<TemplatesResponse>(
    `/api/endpoints/${encodeURIComponent(name)}/templates`,
  )
}

export function upsertTemplate(
  endpointName: string,
  id: string,
  payload: { name: string; body: string },
): Promise<RequestTemplate> {
  return request<RequestTemplate>(
    `/api/endpoints/${encodeURIComponent(endpointName)}/templates/${encodeURIComponent(id)}`,
    { method: 'PUT', body: JSON.stringify(payload) },
  )
}

export function deleteTemplate(endpointName: string, id: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(
    `/api/endpoints/${encodeURIComponent(endpointName)}/templates/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  )
}

/** kebab-case slug for a template display name. */
export function slugifyTemplateName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'template'
}
