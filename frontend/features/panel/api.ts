import { getBackendConfig } from '@/lib/backend-config'
import type {
  ContainerDetail,
  DeployRequest,
  DeployResponse,
  EditorFile,
  EditorFilesResponse,
  EditorRunRequest,
  EditorRunResponse,
  PanelState,
} from './types'

async function request<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const { url, apiKey } = getBackendConfig()
  const defaultHeaders: Record<string, string> = apiKey
    ? { 'X-API-Key': apiKey }
    : {}
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
  const { url: base, apiKey } = getBackendConfig()
  const url = new URL(base)
  const scheme = url.protocol === 'https:' ? 'wss' : 'ws'
  const path = `/api/containers/${encodeURIComponent(cid)}/shell`
  const qs = apiKey ? `?token=${encodeURIComponent(apiKey)}` : ''
  return `${scheme}://${url.host}${path}${qs}`
}

export function logsStreamUrl(cid: string): string {
  const { url: base, apiKey } = getBackendConfig()
  const path = `/api/containers/${encodeURIComponent(cid)}/logs/stream`
  const qs = apiKey ? `?token=${encodeURIComponent(apiKey)}` : ''
  return `${base}${path}${qs}`
}

// ---- editor --------------------------------------------------------------

export function editorRun(payload: EditorRunRequest): Promise<EditorRunResponse> {
  return request<EditorRunResponse>('/api/editor/runs', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function editorListFiles(): Promise<EditorFilesResponse> {
  return request<EditorFilesResponse>('/api/editor/files')
}

export function editorDeleteFile(name: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(
    `/api/editor/files/${encodeURIComponent(name)}`,
    { method: 'DELETE' }
  )
}

/**
 * XHR-based multipart upload so we can drive a per-file progress bar.
 * Resolves with the saved EditorFile (parsed from the JSON response body).
 */
export function editorUploadFile(
  file: File,
  onProgress?: (pct: number) => void
): Promise<EditorFile> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const form = new FormData()
    form.append('file', file, file.name)

    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable && onProgress) {
        onProgress(Math.round((ev.loaded / ev.total) * 100))
      }
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as EditorFile)
        } catch (e) {
          reject(e instanceof Error ? e : new Error(String(e)))
        }
      } else {
        let detail = `HTTP ${xhr.status}`
        try {
          const body = JSON.parse(xhr.responseText) as { detail?: string }
          if (body?.detail) detail = body.detail
        } catch {}
        reject(new Error(detail))
      }
    }
    xhr.onerror = () => reject(new Error('upload failed'))

    const { url, apiKey } = getBackendConfig()
    xhr.open('POST', `${url}/api/editor/files`)
    if (apiKey) xhr.setRequestHeader('X-API-Key', apiKey)
    xhr.send(form)
  })
}
