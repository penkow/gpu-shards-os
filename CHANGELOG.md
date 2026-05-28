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

## [0.8.0] — 2026-05-28

### Changed

- `run.sh` now binds both servers to all interfaces so the panel and API
  are reachable from the whole internal network, not just localhost:
  - `HAMI_BACKEND_HOST` defaults to `0.0.0.0` (was `127.0.0.1`).
  - The Next.js dev server is launched with `-H 0.0.0.0`.
  - `HAMI_ALLOWED_ORIGINS` defaults to `*` so a browser loading the panel
    from `http://<host-ip>:3000` isn't CORS-blocked when it calls the API.
    Safe because CORS runs with `allow_credentials=False` and auth is
    header/token-based. All three remain env-overridable.
- `run.sh` prints the detected LAN URLs for the frontend and backend on
  startup.

### Notes

- Exposing the backend on `0.0.0.0` makes the Docker-control API reachable
  by anyone on the network. It ships with no API key by default — set
  `HAMI_API_KEY` and/or narrow `HAMI_ALLOWED_ORIGINS` before using this on
  an untrusted network.
- The panel's default backend URL is still `http://localhost:8000`. When
  opening the panel from another machine, point the backend URL at the
  host (Settings dialog, or `NEXT_PUBLIC_HAMI_BACKEND_URL`).

## [0.7.0] — 2026-05-28

### Added

#### Install page & one-line installer

- New public `/install` landing page (`InstallLanding` + `InstallChrome`):
  hero, a copy-to-clipboard `curl -fsSL <origin>/install.sh | bash`
  command box, a requirements strip (Ubuntu 22.04+, NVIDIA + driver,
  Docker, ports 3000/8000), and a link to the manual instructions. The
  origin is read from `window.location.origin` at runtime so the command
  always points at the serving host.
- New `/install/manual` page (`ManualInstall`): eight step-by-step cards
  (Docker Engine, NVIDIA Container Toolkit, Python 3 + Node 20, fetch
  source, Python venv, frontend build, build the HAMi libvgpu image,
  launch the stack), each with a copyable code block.
- New `GET /install.sh` route handler serves a dynamically generated bash
  installer. It detects its own public URL from `HAMI_PUBLIC_URL` or the
  request's `x-forwarded-proto`/`x-forwarded-host`/`host` headers, then
  installs Docker, the NVIDIA Container Toolkit, base packages, and
  Node 20; fetches the source tarball; creates the Python venv; installs
  and builds the frontend; and builds `hami-core-demo:latest`. Honors
  `INSTALL_DIR`, `NODE_MAJOR`, and `SKIP_BUILD` env overrides and is
  served `no-store` as `text/x-shellscript`.
- New `GET /source.tar.gz` route handler streams a gzip tarball of the
  project (via spawned `tar`), excluding `.git`, `.claude`,
  `node_modules`, `.next`, `.venv`, `__pycache__`, `.DS_Store`,
  `tsconfig.tsbuildinfo`, and `CLAUDE.md`.

#### Branding

- New `GPU Shards` logo mark replaces the old shadcn-admin glyph in the
  `Logo` component; the sidebar `AppTitle` now renders it instead of the
  lucide `Boxes` icon.
- Added `public/logo.svg` and `public/favicon.svg`; `layout.tsx` wires up
  the SVG favicon (with `.ico` fallback) and apple-touch icon.

## [0.6.0] — 2026-05-21

### Added

#### `/images` page becomes a real page

- New `GET /api/images` returns `ImagesResponse {images: ImageInfo[]}` —
  each `ImageInfo` carries `{id, tags, size_bytes, created_at, architecture,
  used_by}`. `used_by` is computed server-side by cross-referencing each
  image's `RepoTags` against the managed-container list. Dangling images
  (no tags) are filtered out.
- `GET /api/images/{ref:path}/inspect` returns the raw `docker inspect`
  payload (`ImageInspect.data`).
- `DELETE /api/images/{ref:path}` removes the image — blocked with 409
  when any managed container still references it (no `?force=true` in
  v0.6.0).
- `StateResponse.images: list[str]` is unchanged for backwards
  compatibility; only the new `/images` page uses the rich payload.

#### Frontend

- New `frontend/features/images/components/images-page.tsx` replaces the
  flat list. Table with columns Tag(s) / ID / Size / Age / Used by /
  Actions. Filter input narrows by tag or id. Polls every 5s.
- Per-row actions: **Deploy** (routes to `/deploy?image=<tag>` and
  pre-selects), **Use in editor** (sets a one-shot `gpu-shards.preferred-
  image` localStorage key, navigates to `/editor`; the Deploy-as-Endpoint
  dialog reads + clears it on open), **Inspect** (modal with raw JSON +
  copy), **Remove** (disabled with tooltip listing the using containers
  when `used_by.length > 0`; otherwise a confirm dialog).
- **Recent builds** card lists the last 10 in-memory builds with
  status / tag / started / duration, and a Logs button that opens a new
  `BuildLogsDialog` replaying the SSE stream from
  `/api/images/builds/{id}/stream`.
- **Templates** button opens `DockerfileTemplatesDialog` with 4 curated
  starting points (Diffusers + transformers, Whisper ASR, vLLM server,
  ComfyUI). Picking one opens `BuildImageDialog` prefilled with the
  suggested tag and Dockerfile.
- `BuildImageDialog` now accepts optional `initialTag` / `initialDockerfile`
  props (used by the templates dialog). Re-opens reset to the seed each
  time, matching the existing reset-on-open behavior.
- `/deploy` form honors `?image=<tag>` query and pre-selects.
- Old `frontend/features/panel/components/images-page.tsx` is now a
  re-export shim of the new feature-folder component so any stray import
  keeps working.

### Changed

- **`BuildImageDialog` is now phase-gated.** Edit phase shows only the tag
  input + Dockerfile editor (taller, `h-80`); build phase shows only the
  status pill + xterm (`h-96`). Failed builds offer **Edit Dockerfile** to
  go back without losing the Dockerfile in progress.
- **Multi-session shell sidebar is fixed-width** (`w-56`) instead of a
  resizable panel — fits the session label cleanly at any viewport size.
- **Container detail page uses editor-style margins** (`h-svh` + `p-4`,
  no `<Card>` wrappers around tab content) so the Shell / Logs panes fill
  the viewport instead of being capped at `max-w-7xl`.

### Removed

- **`ShellTray` floating chips** (the bottom-right "Connected" pills). The
  global tray now exists only as a hidden parking host for terminal DOMs
  across route changes — session switching lives entirely inside the
  per-container `ShellPane`'s left rail.

## [0.5.0] — 2026-05-21

### Added

#### Custom Docker image builds

- `POST /api/images/builds` — kicks off a Docker build from a `{tag, dockerfile}`
  payload. Writes the Dockerfile to a temp build context and streams build
  events into an in-memory ring per build.
- `GET /api/images/builds`, `GET /api/images/builds/{build_id}` — list/inspect
  recent in-memory builds (status, image id, error, timestamps).
- `GET /api/images/builds/{build_id}/stream` — SSE stream of Docker build
  events (`stream` / `error` / `aux`). Late subscribers replay buffered events
  (up to 500) then tail live ones.
- New `ImageBuildService` owns the in-memory build registry; state resets on
  backend restart by design.
- Frontend: `/images` page gains a **Build image** button that opens a new
  `BuildImageDialog` with a tag input, a Monaco Dockerfile editor (prepopulated
  with a `FROM gpu-shards-editor-gpu:latest` + `pip install` starter), and an
  embedded xterm streaming the build output. Successful builds offer a
  "Use \<tag\>" shortcut.

#### Custom image for endpoints

- `EndpointCreateRequest.image: str` (optional) — empty means use the default
  CPU/GPU editor image; non-empty overrides.
- `EndpointDetail.image_used: str` — populated from per-endpoint stats (when
  available) or `container.image.tags`. Surfaced in the endpoint detail page
  header.
- Deploy-as-Endpoint dialog gains an **Image** select listing every tag on the
  daemon plus a `(default)` sentinel, and a **Build new image…** link that
  opens the build dialog inline; on success the new tag is auto-selected.

#### Named request templates per endpoint

- `GET/PUT/DELETE /api/endpoints/{name}/templates[/{id}]` — CRUD for per-endpoint
  request templates. `id` is a kebab-case slug (`^[a-z][a-z0-9-]{0,63}$`); the
  display `name` and `body` are stored at
  `<endpoint_dir>/templates/<id>.json`. Survives backend + container restarts.
- Endpoint detail page Try-it panel: a template `Select` above the textarea,
  a **Save as…** dialog (slugifies the display name), **Update** for the
  selected template, and **Delete**. A dirty-dot indicates unsaved edits to
  the selected template. On initial load, the first template (if any) is
  applied to the textarea automatically.

#### Multi-session shells per container

- `frontend/stores/shell-sessions.ts` re-keyed from `cid -> session` to
  `sessionId -> session`. Each session now carries `{sessionId, cid, label,
  containerName, ...}`. `openShellSession(cid, name, label?)` always creates a
  new session (one click = one fresh PTY); `closeShellSession(sessionId)` and
  `useShellSessionsForCid(cid)` are the new helpers. Backend unchanged —
  `/api/containers/{cid}/shell` already starts a fresh `docker exec` per WS
  connect, so concurrent sessions naturally get independent PTYs.
- New `ShellPane` (`features/panel/components/shell-pane.tsx`) renders inside
  the Container detail page's **Shell** tab: a left rail listing sessions for
  that container (status dot, label, kill X), a **+ New session** button at
  top, and a right viewport binding to the selected session. The active
  session is synced to `?sid=...` so reload + deep links restore it.
- Global `ShellTray` chips now show `containerName/label` and link to the
  detail page with the right `sid`.

### Changed

- `EndpointDetail.image_used` added (additive).
- Sidebar / pages otherwise unchanged.

## [0.4.0] — 2026-05-21

### Added

#### Endpoints (Function-as-a-Service)

- `POST /api/endpoints` — promote editor code (`handler(event, context)`) into a
  persistent containerized HTTP endpoint. Container runs a stdlib `http.server`
  that imports the user's `handler` and serves it at `/invoke`. Container port
  `8080` is published to an ephemeral host port; the backend proxies to it.
- `GET /api/endpoints`, `GET /api/endpoints/{name}`,
  `DELETE /api/endpoints/{name}` — list / inspect / remove deployed endpoints.
  Endpoints are label-discoverable (`gpu-shards.endpoint.name=<name>`) so they
  survive backend restarts (invocation counts do not).
- `POST /api/fn/{name}/invoke` — public, unauthenticated gateway that forwards
  the request body to the endpoint container and returns the handler result.
  Demo-grade only — no auth, no quotas, no queue.
- New `EndpointService` with in-memory invocation counters + last-20 latency
  samples for p50 display.
- New env var `HAMI_DOCKER_HOST_IP` (default `127.0.0.1`) — the IP the backend
  uses to reach published container ports. Set this to the GPU host's reachable
  IP when running the backend against a remote daemon.

#### Frontend

- New `/endpoints` page with a polling table (name, status, GPU, invocation
  count, last-invoked-relative) and a row-level Delete.
- New `/endpoints/[name]` detail page: invocation stats, copyable invoke URL +
  `curl` snippet, a Try-it panel (JSON body in / JSON result out with handler
  + gateway durations), and a live container-logs pane via the existing
  `LogsView`.
- Editor toolbar gains **Deploy as Endpoint** (modal with name / GPU /
  memory / SM%) and **Templates** (Hello GPU, Tiny LLM completion via
  distilgpt2, Echo + sleep) buttons.
- Overview dashboard gets a 5th KPI card: **Endpoints** (count + total
  invocations).
- Container detail page shows an **Endpoint: \<name\>** badge linking back to
  `/endpoints/<name>` when the container is an endpoint worker.
- Sidebar gains an **Endpoints** entry.

### Changed

- `ContainerDetail.endpoint_name` added (empty string when the container is not
  an endpoint worker). Additive — old clients ignore it.

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
