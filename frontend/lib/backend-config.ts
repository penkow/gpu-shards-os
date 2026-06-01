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

// NEXT_PUBLIC_HAMI_BACKEND_URL is read at build time. If unset we fall back to
// the serving host's origin so a remote browser (panel served over LAN) hits
// the right backend out of the box — without it, default would be the client's
// own localhost.
const ENV_URL = (process.env.NEXT_PUBLIC_HAMI_BACKEND_URL ?? '').replace(/\/$/, '')

const ENV_DEFAULT: BackendConfig = {
  url: ENV_URL,
  apiKey: process.env.NEXT_PUBLIC_HAMI_API_KEY ?? '',
}

function defaultUrl(): string {
  if (ENV_URL) return ENV_URL
  if (typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:8000`
  }
  return 'http://localhost:8000'
}

export function getBackendConfig(): BackendConfig {
  if (typeof window === 'undefined') {
    return { url: ENV_URL || 'http://localhost:8000', apiKey: ENV_DEFAULT.apiKey }
  }
  const fallbackUrl = defaultUrl()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { url: fallbackUrl, apiKey: ENV_DEFAULT.apiKey }
    const parsed = JSON.parse(raw) as Partial<BackendConfig>
    return {
      url:
        typeof parsed.url === 'string' && parsed.url.length > 0
          ? parsed.url.replace(/\/$/, '')
          : fallbackUrl,
      apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : ENV_DEFAULT.apiKey,
    }
  } catch {
    return { url: fallbackUrl, apiKey: ENV_DEFAULT.apiKey }
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
  return { url: defaultUrl(), apiKey: ENV_DEFAULT.apiKey }
}
