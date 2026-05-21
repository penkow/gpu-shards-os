#!/usr/bin/env python3
"""HAMi Control Panel — NiceGUI UI talking to the FastAPI backend.

Backend URL is configured via env (defaults to http://localhost:8000):

    HAMI_BACKEND_URL=http://gpu-host:8000 \\
    HAMI_API_KEY=secret \\
    python panel.py
"""

from __future__ import annotations

import asyncio
import html
import json
import logging
import os
from dataclasses import dataclass, field
from typing import Optional
from urllib.parse import urlparse

import httpx
import websockets
from nicegui import ui


BACKEND_URL = os.environ.get("HAMI_BACKEND_URL", "http://localhost:8000").rstrip("/")
API_KEY = os.environ.get("HAMI_API_KEY", "")
PANEL_PORT = int(os.environ.get("HAMI_PANEL_PORT", "8080"))
DEFAULT_IMAGE = "hami-core-demo:latest"
REFRESH_SECONDS = 5.0
REQUEST_TIMEOUT = 30.0

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s — %(message)s")
log = logging.getLogger("hami.panel")


# ----------------------------------------------------------------------
# Local view-state cache (mirror of last backend response)
# ----------------------------------------------------------------------

@dataclass
class Gpu:
    index: int
    name: str
    memory_total_mb: int
    memory_used_mb: int
    utilization_pct: int
    allocated_mb: int = 0


@dataclass
class ManagedContainer:
    id: str
    name: str
    status: str
    image: str
    gpu_index: str
    memory_limit_mb: int
    memory_limit_raw: str
    sm_limit: str


@dataclass
class State:
    connected: bool = False
    docker_target: str = ""
    error: str = ""
    gpus: list[Gpu] = field(default_factory=list)
    containers: list[ManagedContainer] = field(default_factory=list)
    images: list[str] = field(default_factory=list)


state = State()


# ----------------------------------------------------------------------
# Backend client
# ----------------------------------------------------------------------

def _headers() -> dict[str, str]:
    return {"X-API-Key": API_KEY} if API_KEY else {}


def _ws_url(path: str) -> str:
    parsed = urlparse(BACKEND_URL)
    scheme = "wss" if parsed.scheme == "https" else "ws"
    netloc = parsed.netloc or parsed.path
    return f"{scheme}://{netloc}{path}"


class BackendClient:
    """Thin async wrapper around the backend REST API."""

    def __init__(self, base_url: str) -> None:
        self._base = base_url
        self._client = httpx.AsyncClient(
            base_url=base_url,
            timeout=REQUEST_TIMEOUT,
            headers=_headers(),
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    async def get_state(self) -> dict:
        r = await self._client.get("/api/state")
        r.raise_for_status()
        return r.json()

    async def deploy(self, payload: dict) -> dict:
        r = await self._client.post("/api/deploy", json=payload)
        if r.status_code >= 400:
            detail = _detail(r)
            raise BackendError(detail, status_code=r.status_code)
        return r.json()

    async def get_logs(self, cid: str) -> str:
        r = await self._client.get(f"/api/containers/{cid}/logs")
        r.raise_for_status()
        return r.json().get("logs", "")

    async def stop(self, cid: str) -> None:
        r = await self._client.post(f"/api/containers/{cid}/stop")
        r.raise_for_status()

    async def remove(self, cid: str) -> None:
        r = await self._client.delete(f"/api/containers/{cid}")
        r.raise_for_status()


class BackendError(Exception):
    def __init__(self, message: str, status_code: int = 500) -> None:
        super().__init__(message)
        self.status_code = status_code


def _detail(resp: httpx.Response) -> str:
    try:
        body = resp.json()
        if isinstance(body, dict):
            return str(body.get("detail") or body)
        return str(body)
    except Exception:
        return resp.text or f"HTTP {resp.status_code}"


client = BackendClient(BACKEND_URL)


# ----------------------------------------------------------------------
# WebSocket shell client
# ----------------------------------------------------------------------

class ShellWS:
    """xterm <-> backend PTY over websockets."""

    def __init__(self) -> None:
        self._ws: Optional[websockets.WebSocketClientProtocol] = None
        self._reader: Optional[asyncio.Task] = None
        self._closed = False

    async def open(self, cid: str, on_bytes) -> None:
        path = f"/api/containers/{cid}/shell"
        if API_KEY:
            path = f"{path}?token={API_KEY}"
        url = _ws_url(path)
        self._ws = await websockets.connect(url, max_size=None)
        self._closed = False

        async def pump() -> None:
            try:
                async for msg in self._ws:                              # type: ignore[union-attr]
                    if isinstance(msg, (bytes, bytearray)):
                        on_bytes(bytes(msg))
                    elif isinstance(msg, str):
                        on_bytes(msg.encode("utf-8", errors="replace"))
            except Exception as e:
                log.debug("shell ws reader ended: %s", e)

        self._reader = asyncio.create_task(pump())

    async def send_input(self, data: str) -> None:
        if not self._ws or self._closed:
            return
        try:
            await self._ws.send(json.dumps({"input": data}))
        except Exception:
            pass

    async def send_resize(self, rows: int, cols: int) -> None:
        if not self._ws or self._closed:
            return
        try:
            await self._ws.send(json.dumps({"resize": {"rows": int(rows), "cols": int(cols)}}))
        except Exception:
            pass

    async def close(self) -> None:
        self._closed = True
        if self._reader:
            self._reader.cancel()
            self._reader = None
        if self._ws:
            try:
                await self._ws.close()
            except Exception:
                pass
            self._ws = None


# ----------------------------------------------------------------------
# UI
# ----------------------------------------------------------------------

CUSTOM_CSS = """
<style>
body, .q-page { background: #0a0e1f !important; color: #e2e8f0; }
.glass {
    background: rgba(16, 22, 45, 0.6) !important;
    backdrop-filter: blur(10px);
    border: 1px solid rgba(70, 95, 160, 0.25) !important;
}
.card-gpu {
    background: linear-gradient(135deg, rgba(20, 30, 60, 0.7) 0%, rgba(10, 16, 35, 0.7) 100%) !important;
    border: 1px solid rgba(70, 95, 160, 0.4) !important;
    backdrop-filter: blur(10px);
    transition: border-color 0.2s;
}
.card-gpu:hover { border-color: rgba(110, 231, 183, 0.5) !important; }
.bar {
    height: 8px; border-radius: 4px; overflow: hidden;
    background: rgba(0, 0, 0, 0.4);
}
.bar > div { height: 100%; transition: width 0.4s ease; }
.bar-used  { background: linear-gradient(90deg, #34d399, #10b981); }
.bar-alloc { background: linear-gradient(90deg, #fbbf24, #f59e0b); }
.bar-over  { background: linear-gradient(90deg, #f87171, #ef4444); }
.dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
.dot-on  { background: #10b981; box-shadow: 0 0 10px #10b981; }
.dot-off { background: #ef4444; box-shadow: 0 0 10px #ef4444; }
.pill {
    padding: 3px 10px; border-radius: 999px; font-size: 10px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.6px; display: inline-block;
}
.pill-running { background: rgba(16, 185, 129, 0.2); color: #6ee7b7; }
.pill-exited  { background: rgba(100, 116, 139, 0.3); color: #cbd5e1; }
.pill-created { background: rgba(245, 158, 11, 0.2); color: #fcd34d; }
.section-label {
    font-size: 11px; font-weight: 700; color: #94a3b8;
    text-transform: uppercase; letter-spacing: 1.2px;
}
</style>
"""


def _apply_state(payload: dict) -> None:
    """Replace local cache from a /api/state response."""
    state.connected = bool(payload.get("connected"))
    state.docker_target = payload.get("docker_target", "")
    state.error = payload.get("error", "")
    state.gpus = [Gpu(**g) for g in payload.get("gpus", [])]
    state.containers = [ManagedContainer(**c) for c in payload.get("containers", [])]
    state.images = list(payload.get("images", []))


async def _fetch_state() -> None:
    try:
        payload = await client.get_state()
        _apply_state(payload)
    except httpx.HTTPError as e:
        state.connected = False
        state.docker_target = ""
        state.gpus = []
        state.containers = []
        state.error = f"Backend unreachable at {BACKEND_URL}: {e}"


@ui.page("/")
def page():
    ui.dark_mode().enable()
    ui.add_head_html(CUSTOM_CSS)

    # ----- header -----
    with ui.row().classes("w-full items-center justify-between px-6 py-4 glass"):
        with ui.row().classes("items-center gap-3"):
            ui.icon("memory", size="2rem").classes("text-emerald-400")
            with ui.column().classes("gap-0"):
                ui.label("HAMi Control Panel").classes("text-xl font-bold text-slate-100")
                ui.label("GPU-shared Docker workloads").classes("text-xs text-slate-400")
        with ui.row().classes("items-center gap-3"):
            docker_dot = ui.element("div").classes("dot dot-off")
            docker_label = ui.label("Disconnected").classes("text-sm text-red-400")
            refresh_btn = ui.button(icon="refresh").props("flat round dense").classes("text-slate-300")

    body = ui.column().classes("w-full max-w-7xl mx-auto px-6 py-6 gap-6")
    with body:
        error_card = ui.card().classes("w-full border border-red-700 bg-red-900/30")
        with error_card:
            error_label = ui.label("").classes("text-red-300 text-sm")
        error_card.visible = False

        ui.label("GPUs").classes("section-label")
        gpu_row = ui.row().classes("w-full gap-4 flex-wrap")

        ui.label("Deploy Container").classes("section-label mt-2")
        with ui.card().classes("w-full glass p-5"):
            with ui.row().classes("w-full gap-3 items-end"):
                image_in = ui.select(
                    [DEFAULT_IMAGE], value=DEFAULT_IMAGE, label="Image",
                ).classes("flex-1 min-w-48")
                name_in = ui.input("Container name (optional)").classes("flex-1 min-w-48")
                gpu_select = ui.select({}, label="GPU").classes("min-w-40")
                mem_in = ui.input("Memory limit", value="4g").classes("w-28").props("hint='4g / 512m / 2048'")
                sm_in = ui.number("SM %", value=100, min=1, max=100, step=1).classes("w-24")
            with ui.row().classes("w-full gap-3 items-end mt-2"):
                cmd_in = ui.input("Command (optional)", placeholder="nvidia-smi").classes("flex-1")
                deploy_btn = ui.button("Deploy", icon="rocket_launch").props("color=primary unelevated").classes("h-12 px-6")

        ui.label("Managed Containers").classes("section-label mt-2")
        containers_card = ui.card().classes("w-full glass p-0 overflow-hidden")
        with containers_card:
            containers_body = ui.column().classes("w-full p-0 gap-0")

    # ----- logs modal -----
    log_target = {"cid": "", "name": ""}
    with ui.dialog() as logs_dialog, ui.card().classes("glass w-full max-w-5xl"):
        with ui.row().classes("w-full items-center justify-between"):
            with ui.column().classes("gap-0"):
                logs_title = ui.label("").classes("text-lg font-bold text-slate-100")
                logs_subtitle = ui.label("").classes("text-xs text-slate-500 font-mono")
            with ui.row().classes("gap-1"):
                logs_reload_btn = ui.button(icon="refresh") \
                    .props("flat round dense").classes("text-slate-300").tooltip("Reload")
                ui.button(icon="close", on_click=logs_dialog.close) \
                    .props("flat round dense").classes("text-slate-300")
        logs_html = ui.html("")

    # ----- shell modal -----
    shell_target = {"cid": "", "name": ""}
    shell = ShellWS()

    async def close_shell_dialog():
        await shell.close()
        shell_dialog.close()

    with ui.dialog() as shell_dialog, ui.card().classes("glass w-full max-w-5xl"):
        with ui.row().classes("w-full items-center justify-between"):
            with ui.column().classes("gap-0"):
                shell_title = ui.label("").classes("text-lg font-bold text-slate-100")
                shell_subtitle = ui.label("").classes("text-xs text-slate-500 font-mono")
            ui.button(icon="close", on_click=close_shell_dialog) \
                .props("flat round dense").classes("text-slate-300")
        xterm = ui.xterm(options={
            "theme": {"background": "#020617", "foreground": "#e2e8f0", "cursor": "#34d399"},
            "cursorBlink": True,
            "fontFamily": "ui-monospace, Menlo, Consolas, monospace",
            "fontSize": 13,
            "convertEol": False,
            "scrollback": 5000,
        }).classes("w-full").style("height: 65vh;")
    shell_dialog.on("hide", lambda _: asyncio.create_task(shell.close()))

    # ----- renderers -----
    def render_status():
        if state.connected:
            docker_dot.classes(replace="dot dot-on")
            docker_label.text = f"Connected · {state.docker_target}"
            docker_label.classes(replace="text-sm text-emerald-300")
        else:
            docker_dot.classes(replace="dot dot-off")
            docker_label.text = "Disconnected"
            docker_label.classes(replace="text-sm text-red-400")
        error_card.visible = bool(state.error)
        error_label.text = state.error

    def render_gpus():
        gpu_row.clear()
        with gpu_row:
            if not state.gpus:
                with ui.card().classes("w-full glass p-6"):
                    ui.label("No GPUs detected — probing through Docker daemon…").classes("text-slate-500 italic")
                return
            for gpu in state.gpus:
                with ui.card().classes("card-gpu p-4 min-w-72 flex-1"):
                    with ui.row().classes("w-full items-baseline justify-between"):
                        ui.label(f"GPU {gpu.index}").classes("text-2xl font-bold text-emerald-300")
                        ui.label(f"{gpu.utilization_pct}% util").classes("text-xs text-slate-400")
                    ui.label(gpu.name).classes("text-xs text-slate-400 truncate mb-3")

                    pct_used = (gpu.memory_used_mb / gpu.memory_total_mb * 100) if gpu.memory_total_mb else 0
                    pct_alloc = (gpu.allocated_mb / gpu.memory_total_mb * 100) if gpu.memory_total_mb else 0

                    with ui.row().classes("w-full justify-between text-xs text-slate-300"):
                        ui.label("Memory used")
                        ui.label(f"{gpu.memory_used_mb:,} / {gpu.memory_total_mb:,} MB")
                    with ui.element("div").classes("bar w-full"):
                        ui.element("div").classes("bar-used").style(f"width: {min(pct_used, 100):.1f}%")

                    with ui.row().classes("w-full justify-between text-xs text-amber-300 mt-3"):
                        ui.label("Allocated by panel")
                        ui.label(f"{gpu.allocated_mb:,} MB ({pct_alloc:.0f}%)")
                    with ui.element("div").classes("bar w-full"):
                        cls = "bar-over" if pct_alloc > 100 else "bar-alloc"
                        ui.element("div").classes(cls).style(f"width: {min(pct_alloc, 100):.1f}%")

    def render_containers():
        containers_body.clear()
        with containers_body:
            if not state.containers:
                ui.label("No managed containers — deploy one above").classes("text-slate-500 italic p-6 text-center")
                return
            with ui.row().classes("w-full px-4 py-3 text-xs text-slate-500 uppercase tracking-wider border-b border-slate-700/60"):
                ui.label("Name").classes("flex-[2]")
                ui.label("Image").classes("flex-[2]")
                ui.label("GPU").classes("w-16")
                ui.label("Memory").classes("w-24")
                ui.label("SM").classes("w-16")
                ui.label("Status").classes("w-28")
                ui.label("").classes("w-36")
            for c in state.containers:
                row = ui.row().classes("w-full px-4 py-3 items-center border-b border-slate-800/40 hover:bg-slate-800/30 cursor-pointer")
                row.on("click", lambda _, x=c.id, n=c.name: handle_show_logs(x, n))
                with row:
                    ui.label(c.name).classes("flex-[2] text-slate-200 truncate font-medium")
                    ui.label(c.image).classes("flex-[2] text-slate-400 text-sm truncate")
                    ui.label(str(c.gpu_index)).classes("w-16 text-slate-300")
                    ui.label(c.memory_limit_raw).classes("w-24 text-slate-300")
                    ui.label(str(c.sm_limit)).classes("w-16 text-slate-300")
                    with ui.row().classes("w-28"):
                        cls = {"running": "pill-running", "exited": "pill-exited"}.get(c.status, "pill-created")
                        ui.label(c.status).classes(f"pill {cls}")
                    actions = ui.row().classes("w-36 gap-1")
                    actions.on("click.stop", lambda _: None)
                    with actions:
                        cid = c.id
                        if c.status == "running":
                            ui.button(icon="terminal",
                                      on_click=lambda _, x=cid, n=c.name: handle_show_shell(x, n)) \
                                .props("flat dense round").classes("text-emerald-400").tooltip("Shell")
                            ui.button(icon="stop", on_click=lambda _, x=cid: handle_stop(x)) \
                                .props("flat dense round").classes("text-amber-400").tooltip("Stop")
                        ui.button(icon="delete", on_click=lambda _, x=cid: handle_remove(x)) \
                            .props("flat dense round").classes("text-red-400").tooltip("Remove")

    def sync_image_select():
        opts = list(dict.fromkeys([DEFAULT_IMAGE, "hami-pytorch:latest"] + state.images))
        prev = image_in.value
        if prev and prev not in opts:
            opts.append(prev)
        image_in.set_options(opts)
        if prev in opts:
            image_in.value = prev
        else:
            image_in.value = DEFAULT_IMAGE

    def sync_gpu_select():
        opts = {g.index: f"GPU {g.index} — {g.name[:24]}" for g in state.gpus}
        prev = gpu_select.value
        gpu_select.set_options(opts)
        if prev in opts:
            gpu_select.value = prev
        elif opts:
            gpu_select.value = next(iter(opts))
        else:
            gpu_select.value = None

    # ----- handlers -----
    async def do_refresh():
        await _fetch_state()
        render_status()
        render_gpus()
        render_containers()
        sync_gpu_select()
        sync_image_select()

    async def handle_deploy():
        if gpu_select.value is None:
            ui.notify("Pick a GPU first", type="warning")
            return
        deploy_btn.disable()
        try:
            await client.deploy({
                "image": (image_in.value or "").strip() or DEFAULT_IMAGE,
                "name": name_in.value.strip(),
                "gpu_index": int(gpu_select.value),
                "memory": mem_in.value.strip(),
                "sm_limit": int(sm_in.value or 100),
                "command": cmd_in.value.strip(),
            })
            ui.notify(f"Deployed on GPU {gpu_select.value}", type="positive")
            await do_refresh()
        except BackendError as e:
            ui.notify(f"Deploy failed: {e}", type="negative", multi_line=True, close_button=True)
        except httpx.HTTPError as e:
            ui.notify(f"Backend error: {e}", type="negative", multi_line=True, close_button=True)
        finally:
            deploy_btn.enable()

    PRE_STYLE = (
        "max-height:65vh;overflow:auto;white-space:pre-wrap;"
        "word-break:break-word;font-size:11px;line-height:1.4;"
        "background:rgba(0,0,0,0.35);padding:12px;border-radius:6px;"
        "font-family:ui-monospace,Menlo,Consolas,monospace;width:100%;"
    )

    async def load_logs():
        cid = log_target["cid"]
        if not cid:
            return
        logs_html.set_content(f'<pre style="{PRE_STYLE}color:#94a3b8;">Loading…</pre>')
        try:
            logs = await client.get_logs(cid)
        except httpx.HTTPError as e:
            logs = f"Backend error: {e}"
        text = (logs or "").strip() or "(no logs yet)"
        logs_html.set_content(
            f'<pre style="{PRE_STYLE}color:#cbd5e1;">{html.escape(text)}</pre>'
        )

    logs_reload_btn.on_click(load_logs)

    async def handle_show_logs(cid, name):
        log_target["cid"] = cid
        log_target["name"] = name
        logs_title.text = f"Logs — {name}"
        logs_subtitle.text = cid
        logs_dialog.open()
        await load_logs()

    # NiceGUI's xterm event shape varies across versions — accept both forms.
    def _xterm_input(e):
        data = getattr(e, "data", None)
        if data is None and isinstance(getattr(e, "args", None), dict):
            data = e.args.get("data", "")
        if data is None and isinstance(getattr(e, "args", None), str):
            data = e.args
        if data:
            asyncio.create_task(shell.send_input(data))

    def _xterm_resize(e):
        rows = getattr(e, "rows", None)
        cols = getattr(e, "cols", None)
        if rows is None and isinstance(getattr(e, "args", None), dict):
            rows = e.args.get("rows")
            cols = e.args.get("cols")
        if rows and cols:
            asyncio.create_task(shell.send_resize(rows, cols))

    xterm.on_data(_xterm_input)
    xterm.on_resize(_xterm_resize)

    async def handle_show_shell(cid, name):
        await shell.close()
        shell_target["cid"] = cid
        shell_target["name"] = name
        shell_title.text = f"Shell — {name}"
        shell_subtitle.text = cid
        shell_dialog.open()
        await asyncio.sleep(0.2)
        try:
            await xterm.run_terminal_method("reset")
        except Exception:
            pass
        try:
            await xterm.fit()
            rows = await xterm.get_rows()
            cols = await xterm.get_columns()
        except Exception:
            rows, cols = 24, 80

        try:
            await shell.open(cid, lambda b: xterm.write(b))
            await shell.send_resize(rows, cols)
            xterm.run_method("focus")
        except Exception as e:
            xterm.write(f"\r\n\x1b[31mFailed to start shell: {e}\x1b[0m\r\n".encode())

    async def handle_stop(cid):
        try:
            await client.stop(cid)
        except httpx.HTTPError as e:
            ui.notify(f"Stop failed: {e}", type="negative")
        await do_refresh()

    async def handle_remove(cid):
        try:
            await client.remove(cid)
        except httpx.HTTPError as e:
            ui.notify(f"Remove failed: {e}", type="negative")
        await do_refresh()

    refresh_btn.on_click(do_refresh)
    deploy_btn.on_click(handle_deploy)

    ui.timer(0.1, do_refresh, once=True)
    ui.timer(REFRESH_SECONDS, do_refresh)


ui.run(port=PANEL_PORT, title="HAMi Control Panel", dark=True, show=False, reload=False)
