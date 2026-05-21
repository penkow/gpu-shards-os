'use client'

import { useContainerChangeToasts } from '../hooks'

/** Headless component that watches the polled state and toasts on state changes. */
export function ContainerEventsListener() {
  useContainerChangeToasts()
  return null
}
