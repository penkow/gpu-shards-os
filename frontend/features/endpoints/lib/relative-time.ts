/** Tiny relative-time formatter — "just now", "12s ago", "3m ago", "2h ago". */
export function formatRelative(isoTimestamp: string): string {
  if (!isoTimestamp) return ''
  const t = Date.parse(isoTimestamp)
  if (Number.isNaN(t)) return isoTimestamp
  const diffMs = Date.now() - t
  if (diffMs < 5_000) return 'just now'
  const sec = Math.floor(diffMs / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  return `${day}d ago`
}
