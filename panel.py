#!/usr/bin/env python3
"""HAMi Control Panel — GPU-shared Docker container manager.

Run with:
    DOCKER_HOST=ssh://user@gpu-host python panel.py
or with a configured docker context active:
    docker context use gpu-host && python panel.py
"""

import json
import os
import re
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import docker
from docker.errors import APIError, DockerException, ImageNotFound, NotFound
from docker.types import DeviceRequest
from nicegui import run, ui


LABEL_KEY = "hami-panel.managed"
LABEL_VALUE = "true"
DEFAULT_IMAGE = "hami-core-demo:latest"
NVIDIA_PROBE_IMAGE = "nvidia/cuda:12.2.2-base-ubuntu22.04"
LIBVGPU_PATH = "/libvgpu/build/libvgpu.so"
REFRESH_SECONDS = 5.0


# ----------------------------------------------------------------------
# Data
# ----------------------------------------------------------------------

@dataclass
class Gpu:
    index: int
    name: str
    memory_total_mb: int
    memory_used_mb: int
    utilization_pct: int
    allocated_mb: int = 0  # sum of memory limits across managed containers on this GPU


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
    client: Optional[docker.DockerClient] = None
    gpus: list[Gpu] = field(default_factory=list)
    containers: list[ManagedContainer] = field(default_factory=list)
    error: str = ""
    docker_target: str = ""


state = State()


# ----------------------------------------------------------------------
# Backend helpers
# ----------------------------------------------------------------------

def memory_to_mb(s: str) -> int:
    if not s:
        return 0
    m = re.match(r"^(\d+(?:\.\d+)?)\s*([kmgtKMGT]?)i?[bB]?$", s.strip())
    if not m:
        return 0
    val = float(m.group(1))
    unit = (m.group(2) or "").lower()
    mult = {
        "": 1 / (1024 * 1024),
        "k": 1 / 1024,
        "m": 1,
        "g": 1024,
        "t": 1024 * 1024,
    }[unit]
    return int(val * mult)


def docker_host_from_context() -> Optional[str]:
    """If DOCKER_HOST is unset, derive endpoint from the active docker context."""
    if os.environ.get("DOCKER_HOST"):
        return None
    try:
        cfg = json.loads((Path.home() / ".docker" / "config.json").read_text())
        ctx_name = cfg.get("currentContext", "default")
        if ctx_name in ("default", ""):
            return None
        out = subprocess.check_output(
            ["docker", "context", "inspect", ctx_name,
             "--format", "{{.Endpoints.docker.Host}}"],
            text=True, stderr=subprocess.DEVNULL,
        ).strip()
        return out or None
    except Exception:
        return None


def connect_docker() -> Optional[docker.DockerClient]:
    host = docker_host_from_context()
    try:
        client = docker.DockerClient(base_url=host) if host else docker.from_env()
        client.ping()
        return client
    except DockerException:
        return None


def detect_gpus(client) -> list[Gpu]:
    """Probe GPUs by running nvidia-smi inside a throwaway container on the daemon."""
    try:
        out = client.containers.run(
            image=NVIDIA_PROBE_IMAGE,
            command=[
                "nvidia-smi",
                "--query-gpu=index,name,memory.total,memory.used,utilization.gpu",
                "--format=csv,noheader,nounits",
            ],
            remove=True,
            device_requests=[DeviceRequest(count=-1, capabilities=[["gpu"]])],
        )
        text = out.decode() if isinstance(out, bytes) else str(out)
        gpus = []
        for line in text.strip().splitlines():
            parts = [p.strip() for p in line.split(",")]
            if len(parts) >= 5:
                gpus.append(Gpu(
                    index=int(parts[0]),
                    name=parts[1],
                    memory_total_mb=int(parts[2]),
                    memory_used_mb=int(parts[3]),
                    utilization_pct=int(parts[4]),
                ))
        return gpus
    except Exception as e:
        state.error = f"GPU probe failed: {e}"
        return []


def list_managed(client) -> list[ManagedContainer]:
    cs = client.containers.list(all=True, filters={"label": f"{LABEL_KEY}={LABEL_VALUE}"})
    result = []
    for c in cs:
        env = {}
        for item in (c.attrs.get("Config", {}).get("Env") or []):
            if "=" in item:
                k, v = item.split("=", 1)
                env[k] = v
        raw = env.get("CUDA_DEVICE_MEMORY_LIMIT", "0")
        result.append(ManagedContainer(
            id=c.short_id,
            name=c.name,
            status=c.status,
            image=(c.image.tags[0] if c.image.tags else c.image.short_id) or "",
            gpu_index=env.get("HAMI_GPU_INDEX") or env.get("NVIDIA_VISIBLE_DEVICES", "?"),
            memory_limit_mb=memory_to_mb(raw),
            memory_limit_raw=raw,
            sm_limit=env.get("CUDA_DEVICE_SM_LIMIT", "-"),
        ))
    return result


def refresh_state():
    state.error = ""
    state.client = connect_docker()
    if not state.client:
        state.gpus = []
        state.containers = []
        state.docker_target = ""
        state.error = "Docker daemon unreachable. Set DOCKER_HOST or `docker context use <name>`."
        return
    try:
        state.docker_target = state.client.info().get("Name", "unknown")
    except Exception:
        state.docker_target = "unknown"
    state.gpus = detect_gpus(state.client)
    state.containers = list_managed(state.client)
    # accumulate allocated memory per GPU from running managed containers
    by_idx = {g.index: g for g in state.gpus}
    for g in state.gpus:
        g.allocated_mb = 0
    for c in state.containers:
        if c.status != "running":
            continue
        try:
            idx = int(c.gpu_index)
        except (ValueError, TypeError):
            continue
        if idx in by_idx:
            by_idx[idx].allocated_mb += c.memory_limit_mb


def deploy(image, name, gpu_index, memory, sm_limit, command):
    if not state.client:
        raise RuntimeError("Docker not connected")
    env = {
        "NVIDIA_VISIBLE_DEVICES": str(gpu_index),
        "NVIDIA_DRIVER_CAPABILITIES": "compute,utility",
        "LD_PRELOAD": LIBVGPU_PATH,
        "CUDA_DEVICE_MEMORY_LIMIT": memory,
        "CUDA_DEVICE_SM_LIMIT": str(sm_limit),
        "HAMI_GPU_INDEX": str(gpu_index),
    }
    return state.client.containers.run(
        image=image,
        name=(name or None),
        command=(command.split() if command.strip() else None),
        detach=True,
        environment=env,
        device_requests=[DeviceRequest(
            device_ids=[str(gpu_index)],
            capabilities=[["gpu"]],
        )],
        labels={LABEL_KEY: LABEL_VALUE},
    )


def stop_container(cid):
    try:
        state.client.containers.get(cid).stop(timeout=10)
    except (NotFound, AttributeError):
        pass


def remove_container(cid):
    try:
        state.client.containers.get(cid).remove(force=True)
    except (NotFound, AttributeError):
        pass


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
        # ----- error banner -----
        error_card = ui.card().classes("w-full border border-red-700 bg-red-900/30")
        with error_card:
            error_label = ui.label("").classes("text-red-300 text-sm")
        error_card.visible = False

        # ----- GPU section -----
        ui.label("GPUs").classes("section-label")
        gpu_row = ui.row().classes("w-full gap-4 flex-wrap")

        # ----- Deploy section -----
        ui.label("Deploy Container").classes("section-label mt-2")
        with ui.card().classes("w-full glass p-5"):
            with ui.row().classes("w-full gap-3 items-end"):
                image_in = ui.input("Image", value=DEFAULT_IMAGE).classes("flex-1 min-w-48")
                name_in = ui.input("Container name (optional)").classes("flex-1 min-w-48")
                gpu_select = ui.select({}, label="GPU").classes("min-w-40")
                mem_in = ui.input("Memory limit", value="4g").classes("w-28").props("hint='4g / 512m / 2048'")
                sm_in = ui.number("SM %", value=100, min=1, max=100, step=1).classes("w-24")
            with ui.row().classes("w-full gap-3 items-end mt-2"):
                cmd_in = ui.input("Command (optional)", placeholder="nvidia-smi").classes("flex-1")
                deploy_btn = ui.button("Deploy", icon="rocket_launch").props("color=primary unelevated").classes("h-12 px-6")

        # ----- Containers section -----
        ui.label("Managed Containers").classes("section-label mt-2")
        containers_card = ui.card().classes("w-full glass p-0 overflow-hidden")
        with containers_card:
            containers_body = ui.column().classes("w-full p-0 gap-0")

    # ----- renderers -----
    def render_status():
        if state.client:
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
            # column header
            with ui.row().classes("w-full px-4 py-3 text-xs text-slate-500 uppercase tracking-wider border-b border-slate-700/60"):
                ui.label("Name").classes("flex-[2]")
                ui.label("Image").classes("flex-[2]")
                ui.label("GPU").classes("w-16")
                ui.label("Memory").classes("w-24")
                ui.label("SM").classes("w-16")
                ui.label("Status").classes("w-28")
                ui.label("").classes("w-28")
            for c in state.containers:
                with ui.row().classes("w-full px-4 py-3 items-center border-b border-slate-800/40 hover:bg-slate-800/30"):
                    ui.label(c.name).classes("flex-[2] text-slate-200 truncate font-medium")
                    ui.label(c.image).classes("flex-[2] text-slate-400 text-sm truncate")
                    ui.label(str(c.gpu_index)).classes("w-16 text-slate-300")
                    ui.label(c.memory_limit_raw).classes("w-24 text-slate-300")
                    ui.label(str(c.sm_limit)).classes("w-16 text-slate-300")
                    with ui.row().classes("w-28"):
                        cls = {"running": "pill-running", "exited": "pill-exited"}.get(c.status, "pill-created")
                        ui.label(c.status).classes(f"pill {cls}")
                    with ui.row().classes("w-28 gap-1"):
                        cid = c.id
                        if c.status == "running":
                            ui.button(icon="stop", on_click=lambda _, x=cid: handle_stop(x)) \
                                .props("flat dense round").classes("text-amber-400").tooltip("Stop")
                        ui.button(icon="delete", on_click=lambda _, x=cid: handle_remove(x)) \
                            .props("flat dense round").classes("text-red-400").tooltip("Remove")

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
        await run.io_bound(refresh_state)
        render_status()
        render_gpus()
        render_containers()
        sync_gpu_select()

    async def handle_deploy():
        if gpu_select.value is None:
            ui.notify("Pick a GPU first", type="warning")
            return
        deploy_btn.disable()
        try:
            await run.io_bound(
                deploy,
                image_in.value.strip(),
                name_in.value.strip(),
                int(gpu_select.value),
                mem_in.value.strip(),
                int(sm_in.value or 100),
                cmd_in.value.strip(),
            )
            ui.notify(f"Deployed on GPU {gpu_select.value}", type="positive")
            await do_refresh()
        except ImageNotFound:
            ui.notify(f"Image not found: {image_in.value}", type="negative")
        except APIError as e:
            msg = getattr(e, "explanation", None) or str(e)
            ui.notify(f"Docker: {msg}", type="negative", multi_line=True, close_button=True)
        except Exception as e:
            ui.notify(f"Deploy failed: {e}", type="negative", multi_line=True, close_button=True)
        finally:
            deploy_btn.enable()

    async def handle_stop(cid):
        await run.io_bound(stop_container, cid)
        await do_refresh()

    async def handle_remove(cid):
        await run.io_bound(remove_container, cid)
        await do_refresh()

    refresh_btn.on_click(do_refresh)
    deploy_btn.on_click(handle_deploy)

    # initial render + periodic refresh
    ui.timer(0.1, do_refresh, once=True)
    ui.timer(REFRESH_SECONDS, do_refresh)


ui.run(port=8080, title="HAMi Control Panel", dark=True, show=False, reload=False)
