/**
 * Runtime backend connection config persisted in localStorage so users can
 * change the backend URL / API key from the Settings dialog without rebuilding.
 *
 * The frontend api.ts reads this on every request, so a save takes effect for
 * subsequent calls without a reload.
 */

const STORAGE_KEY = 'gpu-shards.backend-config'

export type BackendConfig = {
  url: string
  apiKey: string
}

const ENV_DEFAULT: BackendConfig = {
  url: (process.env.NEXT_PUBLIC_HAMI_BACKEND_URL ?? 'http://localhost:8000').replace(/\/$/, ''),
  apiKey: process.env.NEXT_PUBLIC_HAMI_API_KEY ?? '',
}

export function getBackendConfig(): BackendConfig {
  if (typeof window === 'undefined') return ENV_DEFAULT
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return ENV_DEFAULT
    const parsed = JSON.parse(raw) as Partial<BackendConfig>
    return {
      url:
        typeof parsed.url === 'string' && parsed.url.length > 0
          ? parsed.url.replace(/\/$/, '')
          : ENV_DEFAULT.url,
      apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : ENV_DEFAULT.apiKey,
    }
  } catch {
    return ENV_DEFAULT
  }
}

export function setBackendConfig(config: BackendConfig): void {
  if (typeof window === 'undefined') return
  const normalized: BackendConfig = {
    url: config.url.replace(/\/$/, ''),
    apiKey: config.apiKey,
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
  window.dispatchEvent(new CustomEvent('gpu-shards:backend-config-changed'))
}

export function getDefaultBackendConfig(): BackendConfig {
  return { ...ENV_DEFAULT }
}
