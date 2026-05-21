"""Endpoint-as-a-Service orchestration.

An Endpoint = persistent Docker container running a tiny stdlib HTTP server
that wraps the user's `handler(event, context)`. Container port 8080 is
published to an ephemeral host port; the backend proxies invocations to it.

Demo-grade: state is in-memory, invoke URL is unauthenticated, one container
per endpoint. Persistence across backend restarts only goes as far as the
container surviving (we re-discover them by label).
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import shutil
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import httpx
from docker.errors import NotFound
from docker.types import DeviceRequest

from .config import settings
from .docker_service import DockerError, DockerService, memory_to_mb
from .models import EndpointDetail, EndpointSummary, InvokeResult, RequestTemplate

log = logging.getLogger(__name__)


_ENDPOINT_RUNNER = '''\
"""Auto-generated. Persistent HTTP server wrapping user's handler()."""
import http.server, json, os, socketserver, sys, time, traceback

sys.path.insert(0, "/workspace")
from main import handler  # type: ignore


class H(http.server.BaseHTTPRequestHandler):
    def _json(self, code, body):
        data = json.dumps(body, default=str).encode()
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == "/healthz":
            return self._json(200, {"ok": True})
        return self._json(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/invoke":
            return self._json(404, {"error": "not found"})
        n = int(self.headers.get("content-length", "0") or 0)
        try:
            event = json.loads(self.rfile.read(n) or b"{}")
        except Exception:
            return self._json(400, {"error": "invalid json"})
        ctx = {
            "requestId": self.headers.get("x-request-id", ""),
            "endpoint": os.environ.get("ENDPOINT_NAME", ""),
        }
        t0 = time.monotonic()
        try:
            result = handler(event, ctx)
            self._json(200, {
                "ok": True, "result": result,
                "duration_ms": int((time.monotonic() - t0) * 1000),
            })
        except Exception as e:
            self._json(500, {
                "ok": False, "error": str(e), "trace": traceback.format_exc(),
                "duration_ms": int((time.monotonic() - t0) * 1000),
            })

    def log_message(self, *_a, **_kw):
        return


socketserver.ThreadingTCPServer.allow_reuse_address = True
with socketserver.ThreadingTCPServer(("0.0.0.0", 8080), H) as s:
    print(f"[endpoint] {os.environ.get('ENDPOINT_NAME','?')} listening on 0.0.0.0:8080", flush=True)
    s.serve_forever()
'''


class _Stats:
    __slots__ = ("count", "last_at", "latencies", "created_at", "code", "use_gpu", "memory_raw", "sm_limit", "image")

    def __init__(self, code: str, use_gpu: bool, memory_raw: str, sm_limit: int, image: str = "") -> None:
        self.count: int = 0
        self.last_at: str = ""
        self.latencies: list[int] = []
        self.created_at: str = datetime.now(timezone.utc).isoformat()
        self.code: str = code
        self.use_gpu: bool = use_gpu
        self.memory_raw: str = memory_raw
        self.sm_limit: int = sm_limit
        self.image: str = image

    def record(self, ms: int) -> None:
        self.count += 1
        self.last_at = datetime.now(timezone.utc).isoformat()
        self.latencies.append(ms)
        if len(self.latencies) > 20:
            del self.latencies[: len(self.latencies) - 20]


class EndpointService:
    def __init__(self, docker: DockerService) -> None:
        self._docker = docker
        # name -> _Stats. Reset on backend restart by design.
        self._stats: dict[str, _Stats] = {}

    # ---- paths ----------------------------------------------------------

    def _endpoints_root(self) -> Path:
        root = Path(settings.editor_workspace_dir).expanduser() / "endpoints"
        root.mkdir(parents=True, exist_ok=True)
        return root

    def _endpoint_dir(self, name: str) -> Path:
        return self._endpoints_root() / name

    def _templates_dir(self, name: str) -> Path:
        return self._endpoint_dir(name) / "templates"

    # ---- container discovery -------------------------------------------

    async def _find_container(self, name: str):
        client = await self._docker.client()

        def _do():
            cs = client.containers.list(
                all=True,
                filters={"label": f"{settings.endpoint_label_key}={name}"},
            )
            return cs[0] if cs else None

        return await asyncio.to_thread(_do)

    async def _list_containers(self) -> list[Any]:
        client = await self._docker.client()

        def _do():
            return client.containers.list(
                all=True,
                filters={"label": settings.endpoint_label_key},
            )

        return await asyncio.to_thread(_do)

    @staticmethod
    def _host_port(container) -> int:
        ports = (container.attrs.get("NetworkSettings", {}) or {}).get("Ports", {}) or {}
        binds = ports.get("8080/tcp") or []
        for b in binds:
            hp = (b or {}).get("HostPort")
            if hp:
                try:
                    return int(hp)
                except ValueError:
                    pass
        return 0

    def _invoke_url(self, name: str) -> str:
        return f"/api/fn/{name}/invoke"

    def _summary(self, container, name: str) -> EndpointSummary:
        env: dict[str, str] = {}
        for item in (container.attrs.get("Config", {}).get("Env") or []):
            if "=" in item:
                k, v = item.split("=", 1)
                env[k] = v
        st = self._stats.get(name)
        return EndpointSummary(
            name=name,
            container_id=container.short_id,
            container_name=container.name,
            status=container.status,
            gpu_index=env.get("HAMI_GPU_INDEX") or env.get("NVIDIA_VISIBLE_DEVICES", "?"),
            host_port=self._host_port(container),
            invocation_count=st.count if st else 0,
            last_invoked_at=st.last_at if st else "",
            invoke_url=self._invoke_url(name),
            created_at=st.created_at if st else (container.attrs.get("Created", "") or ""),
        )

    def _detail(self, container, name: str) -> EndpointDetail:
        summary = self._summary(container, name)
        env: dict[str, str] = {}
        for item in (container.attrs.get("Config", {}).get("Env") or []):
            if "=" in item:
                k, v = item.split("=", 1)
                env[k] = v
        st = self._stats.get(name)
        memory_raw = (st.memory_raw if st else env.get("CUDA_DEVICE_MEMORY_LIMIT", "")) or ""
        sm_limit = str(st.sm_limit) if st else env.get("CUDA_DEVICE_SM_LIMIT", "-")
        code = ""
        if st is not None:
            code = st.code
        else:
            try:
                code = (self._endpoint_dir(name) / "main.py").read_text(encoding="utf-8")
            except Exception:
                code = ""
        use_gpu = st.use_gpu if st else ("NVIDIA_VISIBLE_DEVICES" in env)
        if st and st.image:
            image_used = st.image
        else:
            try:
                tags = container.image.tags or []
            except Exception:
                tags = []
            image_used = tags[0] if tags else ""
        return EndpointDetail(
            **summary.model_dump(),
            code=code,
            memory_limit_raw=memory_raw,
            sm_limit=sm_limit,
            use_gpu=use_gpu,
            image_used=image_used,
            recent_latencies_ms=list(st.latencies) if st else [],
        )

    # ---- public API -----------------------------------------------------

    async def list(self) -> list[EndpointSummary]:
        containers = await self._list_containers()
        out: list[EndpointSummary] = []
        for c in containers:
            labels = (c.attrs.get("Config", {}) or {}).get("Labels", {}) or {}
            name = labels.get(settings.endpoint_label_key, "")
            if not name:
                continue
            out.append(self._summary(c, name))
        out.sort(key=lambda s: s.name)
        return out

    async def get(self, name: str) -> EndpointDetail:
        c = await self._find_container(name)
        if c is None:
            raise DockerError(f"endpoint not found: {name}", status_code=404)
        return self._detail(c, name)

    async def create(
        self,
        *,
        name: str,
        code: str,
        use_gpu: bool,
        gpu_index: int,
        memory: str,
        sm_limit: int,
        image: str = "",
    ) -> EndpointDetail:
        existing = await self._find_container(name)
        if existing is not None:
            raise DockerError(f"endpoint already exists: {name}", status_code=409)

        ep_dir = self._endpoint_dir(name)
        ep_dir.mkdir(parents=True, exist_ok=True)
        (ep_dir / "main.py").write_text(code, encoding="utf-8")
        (ep_dir / "_endpoint_runner.py").write_text(_ENDPOINT_RUNNER, encoding="utf-8")

        image = image.strip() or (settings.editor_image_gpu if use_gpu else settings.editor_image_cpu)
        labels = {
            settings.label_key: settings.label_value,
            settings.endpoint_label_key: name,
        }
        environment: dict[str, str] = {
            "PYTHONUNBUFFERED": "1",
            "ENDPOINT_NAME": name,
        }
        device_requests: Optional[list[DeviceRequest]] = None
        if use_gpu:
            environment["NVIDIA_VISIBLE_DEVICES"] = str(gpu_index)
            environment["NVIDIA_DRIVER_CAPABILITIES"] = "compute,utility"
            environment["LD_PRELOAD"] = settings.libvgpu_path
            environment["CUDA_DEVICE_MEMORY_LIMIT"] = memory
            environment["CUDA_DEVICE_SM_LIMIT"] = str(sm_limit)
            environment["HAMI_GPU_INDEX"] = str(gpu_index)
            device_requests = [DeviceRequest(
                device_ids=[str(gpu_index)],
                capabilities=[["gpu"]],
            )]

        host_ws = str(ep_dir.resolve())
        volumes = {host_ws: {"bind": settings.editor_workspace_mount, "mode": "rw"}}

        client = await self._docker.client()

        def _run_with_port():
            kwargs: dict[str, Any] = {
                "image": image,
                "name": f"endpoint-{name}",
                "command": ["python", f"{settings.editor_workspace_mount}/_endpoint_runner.py"],
                "detach": True,
                "labels": labels,
                "environment": environment,
                "volumes": volumes,
                "ports": {"8080/tcp": None},  # publish to ephemeral host port
            }
            if device_requests:
                kwargs["device_requests"] = device_requests
            return client.containers.run(**kwargs)

        try:
            container = await asyncio.to_thread(_run_with_port)
        except Exception as e:
            log.warning("endpoint create failed: %s", e)
            raise DockerError(str(e), status_code=400)

        self._stats[name] = _Stats(
            code=code, use_gpu=use_gpu, memory_raw=memory if use_gpu else "", sm_limit=sm_limit, image=image,
        )

        # Reload container.attrs to pick up published port.
        def _reload():
            container.reload()
            return container

        await asyncio.to_thread(_reload)

        port = self._host_port(container)
        if port <= 0:
            await asyncio.to_thread(lambda: container.remove(force=True))
            self._stats.pop(name, None)
            raise DockerError("failed to publish container port", status_code=500)

        # Health-check the runner before we tell the user we're live.
        ok = await self._wait_healthy(port, timeout_s=15.0)
        if not ok:
            try:
                logs = await asyncio.to_thread(lambda: container.logs(tail=40).decode("utf-8", errors="replace"))
            except Exception:
                logs = ""
            await asyncio.to_thread(lambda: container.remove(force=True))
            self._stats.pop(name, None)
            raise DockerError(
                f"endpoint failed to start within 15s. Runner logs:\n{logs}",
                status_code=500,
            )

        await asyncio.to_thread(_reload)
        log.info("endpoint created name=%s container=%s port=%s gpu=%s", name, container.name, port, use_gpu)
        return self._detail(container, name)

    async def delete(self, name: str) -> None:
        c = await self._find_container(name)
        if c is None:
            raise DockerError(f"endpoint not found: {name}", status_code=404)

        def _do():
            try:
                c.remove(force=True)
            except NotFound:
                pass

        await asyncio.to_thread(_do)
        self._stats.pop(name, None)
        # Best-effort: clean the workspace dir (harmless if it lingers).
        try:
            shutil.rmtree(self._endpoint_dir(name), ignore_errors=True)
        except Exception:
            pass

    async def invoke(self, name: str, body: Any) -> InvokeResult:
        c = await self._find_container(name)
        if c is None:
            raise DockerError(f"endpoint not found: {name}", status_code=404)
        if c.status != "running":
            raise DockerError(f"endpoint {name} is {c.status}", status_code=409)
        port = self._host_port(c)
        if port <= 0:
            raise DockerError("endpoint has no published port", status_code=500)

        url = f"http://{settings.docker_host_ip}:{port}/invoke"
        t0 = time.monotonic()
        try:
            async with httpx.AsyncClient(timeout=300.0) as client:
                resp = await client.post(url, json=body or {})
            data = resp.json()
        except httpx.HTTPError as e:
            raise DockerError(f"upstream error: {e}", status_code=502)
        except ValueError:
            raise DockerError("upstream returned non-JSON response", status_code=502)
        gw_ms = int((time.monotonic() - t0) * 1000)

        st = self._stats.get(name)
        if st is not None:
            st.record(gw_ms)

        if not isinstance(data, dict):
            data = {"result": data}
        data["gateway_duration_ms"] = gw_ms
        return InvokeResult.model_validate(data)

    # ---- helpers --------------------------------------------------------

    async def _wait_healthy(self, port: int, *, timeout_s: float) -> bool:
        deadline = time.monotonic() + timeout_s
        url = f"http://{settings.docker_host_ip}:{port}/healthz"
        async with httpx.AsyncClient(timeout=2.0) as client:
            while time.monotonic() < deadline:
                try:
                    r = await client.get(url)
                    if r.status_code == 200:
                        return True
                except httpx.HTTPError:
                    pass
                await asyncio.sleep(0.5)
        return False

    def get_stats_snapshot(self) -> dict[str, dict[str, Any]]:
        """For overview KPIs."""
        return {
            n: {"count": s.count, "last_at": s.last_at}
            for n, s in self._stats.items()
        }

    # ---- request templates ---------------------------------------------

    _TEMPLATE_ID_RE = re.compile(r"^[a-z][a-z0-9-]{0,63}$")

    async def _require_endpoint(self, name: str) -> None:
        if await self._find_container(name) is None:
            raise DockerError(f"endpoint not found: {name}", status_code=404)

    def _list_templates_sync(self, name: str) -> list[RequestTemplate]:
        tdir = self._templates_dir(name)
        if not tdir.exists():
            return []
        out: list[RequestTemplate] = []
        for f in sorted(tdir.iterdir()):
            if not f.is_file() or f.suffix != ".json":
                continue
            tid = f.stem
            if not self._TEMPLATE_ID_RE.match(tid):
                continue
            try:
                data = json.loads(f.read_text(encoding="utf-8"))
            except Exception:
                continue
            display = str(data.get("name") or tid)
            body = str(data.get("body") or "")
            out.append(RequestTemplate(id=tid, name=display, body=body))
        return out

    async def list_templates(self, name: str) -> list[RequestTemplate]:
        await self._require_endpoint(name)
        return await asyncio.to_thread(self._list_templates_sync, name)

    async def upsert_template(self, name: str, tid: str, *, display: str, body: str) -> RequestTemplate:
        if not self._TEMPLATE_ID_RE.match(tid):
            raise DockerError(
                "invalid template id (lowercase letter then [a-z0-9-], up to 64 chars)",
                status_code=400,
            )
        await self._require_endpoint(name)

        def _do() -> RequestTemplate:
            tdir = self._templates_dir(name)
            tdir.mkdir(parents=True, exist_ok=True)
            payload = json.dumps({"name": display, "body": body}, ensure_ascii=False)
            (tdir / f"{tid}.json").write_text(payload, encoding="utf-8")
            return RequestTemplate(id=tid, name=display, body=body)

        return await asyncio.to_thread(_do)

    async def delete_template(self, name: str, tid: str) -> None:
        if not self._TEMPLATE_ID_RE.match(tid):
            raise DockerError("invalid template id", status_code=400)
        await self._require_endpoint(name)

        def _do() -> None:
            f = self._templates_dir(name) / f"{tid}.json"
            if not f.exists():
                raise DockerError(f"template not found: {tid}", status_code=404)
            f.unlink()

        await asyncio.to_thread(_do)
