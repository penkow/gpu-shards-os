# Changelog

All notable changes to GPU Shards OS are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Versioning policy

The **frontend** (`frontend/package.json`) and the **backend**
(`backend/__init__.py` → `__version__`) ship as a single product and share one
version number. Bump both together.

- **MAJOR** — breaking changes to the HTTP/WebSocket wire contract between
  panel and backend (renamed/removed endpoints, removed model fields,
  changed required request shapes), or breaking changes to user-facing URLs.
- **MINOR** — new endpoints, new model fields (additive only), new pages or
  flows, dependency upgrades that change observable behavior.
- **PATCH** — bug fixes, UX polish, internal refactors, dependency bumps with
  no observable behavior change.

Pre-1.0: minor version may include breaking changes; patch is reserved for
fixes.

Each released entry below corresponds to a git tag `v<MAJOR>.<MINOR>.<PATCH>`.

## [Unreleased]

## [0.3.0] — 2026-05-21

### Added

#### Editor feature

- `POST /api/editor/runs` — start a containerized run from user-supplied Python
  code. Backend writes `main.py` + a tiny handler-invoking runner into a shared
  workspace and launches a fresh `auto_remove` container.
- `GET /api/editor/files`, `POST /api/editor/files` (multipart),
  `DELETE /api/editor/files/{name}` — list / upload / delete files in the
  editor workspace bind-mounted into runs at `/workspace`.
- `EditorService` orchestrates run scripts and file CRUD; filename
  sanitization rejects path traversal (`/`, `\`, `..`, `\x00`).
- Two runtime images under `images/editor/`:
  `gpu-shards-editor-cpu:latest` (python:3.11-slim) and
  `gpu-shards-editor-gpu:latest` (pytorch:2.4-cuda12.4-runtime). Build with
  `bash images/editor/build.sh [cpu|gpu|both]`.
- Editor page (`/editor`) with Monaco code editor, xterm live log terminal,
  workspace file panel, CPU/GPU switch and per-run GPU index dropdown.
- Vertical resizable editor/terminal split using
  [`react-resizable-panels`](https://www.npmjs.com/package/react-resizable-panels)
  v4 via new `components/ui/resizable.tsx`.

#### Settings dialog

- Sidebar-footer Settings button now opens a Dialog with two sections: Theme
  (Light / Dark / System) and Backend configuration (URL, API key, Test
  connection, Save, Default).
- Backend URL and API key persist in localStorage and are read by the API
  client at request time, allowing the panel to point at different backends
  without rebuilding (`lib/backend-config.ts`).

### Changed

- `DockerService`: extracted `_run_container_sync` helper supporting
  `volumes`, optional `device_requests`, `auto_remove`, and arbitrary
  `labels`. `deploy` uses it; editor runs reuse it via new async
  `run_container()`.
- `LogsView`: accepts `showHeader` to suppress the status / pause / refresh /
  download strip; viewport is now flex-friendly so the parent's height
  governs it.
- App shell: removed the top Header (Search / SidebarTrigger / ThemeSwitch).
  Editor page consumes full `100svh`.
- Sidebar title: "GPU Shards" / "Open Source" with a `Boxes` icon brand mark.
- Sidebar footer: "HAMi panel" / docker target text replaced with the
  Settings entry (same styling as nav items).
- `app/layout.tsx` is now async and reads the sidebar cookie via `cookies()`
  from `next/headers`, passing `sidebarDefaultOpen` to `AppShell` as a prop.

### Fixed

- File upload / delete contention: `/api/editor/files` POST and DELETE
  handlers now run their disk IO on a worker thread via `asyncio.to_thread`,
  so a large upload no longer blocks other requests.
- SSE log stream no longer emits `(container no longer exists)` when the
  editor's auto-removed container exits — the stream now ends silently.
- Hydration mismatch on `<Sidebar>`: default-open state is derived
  server-side from the cookie, so server- and client-rendered `data-state` /
  `data-collapsible` attributes match.

### Removed

- `BACKEND_URL` / `API_KEY` module exports from `features/panel/api.ts`.
  Callers now use `getBackendConfig()` from `lib/backend-config.ts`.
- Top header bar (Search, SidebarTrigger, ThemeSwitch) — replaced by direct
  page content under the sidebar and the in-Settings theme picker.

## [0.2.0] — 2026-05-21

### Changed

- Sidebar layout is now hard-coded to `floating` variant + `icon` collapsible
  (Compact). The previous in-app selectors for sidebar style, layout density,
  and text direction are gone.
- Default theme switched from `system` to `light`. The header sun/moon
  dropdown still toggles Light / Dark / System.

### Removed

- Theme Settings drawer (`ConfigDrawer` Sheet) — the gear button in the header
  now opens a "to be implemented" toast instead of a selector panel.
- `LayoutProvider` / `useLayout` and the `layout_collapsible` / `layout_variant`
  cookies. Sidebar variant and collapsible mode are no longer user-configurable
  at runtime.
- Unused custom icons under `assets/custom/` (sidebar / layout / theme / dir
  preview tiles that only fed the removed drawer).

## [0.1.1] — 2026-05-21

### Fixed

- Overview page: GPU and utilization-sparkline cards now share the same grid
  as the top KPI cards (`sm:grid-cols-2 lg:grid-cols-4`) and use a matching
  `space-y-4` vertical gap, so columns and gutters line up across rows.

## [0.1.0] — 2026-05-21

First tagged release of the unified panel + backend.

### Added

#### Backend (`/api/*`)

- `POST /api/containers/{cid}/restart` — graceful restart of a managed
  container.
- `GET /api/containers/{cid}` — full inspect, returning a new
  `ContainerDetail` model with env, command, created/started/finished
  timestamps, exit code, restart count, and restart policy.
- `GET /api/containers/{cid}/logs/stream` — Server-Sent Events live log
  stream. Token authenticated via `?token=` because `EventSource` cannot
  send headers. Blocking docker SDK iterator is wrapped in
  `asyncio.to_thread` + queue so the event loop keeps serving the 5s state
  poll.
- `Gpu.allocated_sm_pct` field — sum of `CUDA_DEVICE_SM_LIMIT` across
  running managed containers on each GPU, computed in `_state_sync`.

#### Frontend

- **New IA.** Sidebar reduced to a single navigation group:
  Overview · GPUs · Containers · Deploy · Images.
- **Overview** (`/`) — KPI cards (GPU count, running containers, average
  utilization, allocated MB), GPU cards with utilization sparklines.
- **GPUs** (`/gpus`) — per-GPU memory + allocation cards plus 5-minute
  rolling utilization sparklines fed by the existing state poll.
- **Containers** (`/containers`) — rewritten with `@tanstack/react-table`
  and the existing `components/data-table/*` primitives:
  global search, faceted filters on status and GPU index, sortable
  headers, pagination, bulk-select with Stop / Restart / Remove actions.
- **Container detail page** (`/containers/[id]`) with tabbed view:
  - **Logs** — live SSE tail with pause/resume and a download button for
    the buffered transcript.
  - **Shell** — xterm shell that survives route changes via a global shell
    tray (`stores/shell-sessions.ts` + `features/panel/components/shell-tray.tsx`)
    that adopts/returns the terminal DOM node across mounts.
  - **Metadata** — image, GPU, memory/SM limits, timestamps, exit code,
    restart policy, command, and full environment listing from the new
    inspect endpoint.
  - **Actions** — Stop, Restart, Remove with confirmation.
- **Deploy** (`/deploy`) — original deploy form hoisted out of the legacy
  control-panel layout.
- **Images** (`/images`) — flat list of images reported by the daemon.
- **Connection status** chip in the header (live), and **disconnected
  banner** Alert that surfaces backend reachability problems on every page.
- **Container state-change toasts** via sonner: diffs the polled state and
  fires `running → exited` (error), `created → running` (success), and
  generic transitions.

### Changed

- `Gpu` model gained `allocated_sm_pct` (additive; existing clients unaffected).
- React Query mutations centralized in `features/panel/mutations.ts`:
  bulk actions fire in parallel via `Promise.allSettled` and trigger a
  single `['panel', 'state']` invalidation after settlement.
- `ContainersTable` no longer opens log/shell as modals — row clicks
  navigate to `/containers/[id]`, and the actions menu opens the global
  shell session.

### Removed

- Template/demo features: `features/{tasks,users,chats,apps,dashboard,settings,auth,errors}`.
- Mock authentication entirely: `stores/auth-store.ts`, `app/(auth)/`,
  `app/(authenticated)/` route group, sign-in/up/otp/forgot-password
  routes, `SignOutDialog`, `ProfileDropdown`, `NavUser`, `TeamSwitcher`.
- Unused `components/ui/calendar.tsx` and `components/date-picker.tsx`
  (broken against the current react-day-picker; no consumers).
- `components/sign-out-dialog.tsx`, `assets/clerk-logo.tsx`,
  `app/(errors)/` boilerplate.
- The legacy `LogsDialog` / `ShellDialog` modals — replaced by
  `LogsView` / `ShellView` reusable components rendered inside the
  per-container detail page.

### Notes

- `lib/cookies.ts` is retained — used by `ThemeProvider`, `LayoutProvider`,
  `DirectionProvider`, `FontProvider`, and the sidebar `defaultOpen`.
- `lib/router-compat.tsx` is retained — surviving consumers are
  `nav-group`, `top-nav`, `command-menu`, `navigation-progress`,
  `app-title`. New code uses Next.js native `next/link` and
  `next/navigation`.
- All authentication code paths are removed. The backend still accepts an
  optional `HAMI_API_KEY`; the frontend forwards it via `X-API-Key` and
  `?token=` query params on WS/SSE — there is no UI for entering one.
- Frontend build target: Next.js 16.2.6 (App Router) + React 19.

[Unreleased]: https://github.com/penkow/gpu-shards-os/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/penkow/gpu-shards-os/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/penkow/gpu-shards-os/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/penkow/gpu-shards-os/releases/tag/v0.1.0
