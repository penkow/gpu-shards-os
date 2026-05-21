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

[Unreleased]: https://github.com/penkow/gpu-shards-os/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/penkow/gpu-shards-os/releases/tag/v0.1.0
