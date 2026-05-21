"""Docker / GPU operations.

All Docker SDK calls are blocking — every public method hops to a thread
via ``asyncio.to_thread`` so FastAPI's event loop stays responsive.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import subprocess
from pathlib import Path
from typing import Any, Optional

import docker
from docker.errors import APIError, DockerException, ImageNotFound, NotFound
from docker.types import DeviceRequest

from .config import settings
from .models import (
    ContainerDetail, DeployResponse, Gpu, ManagedContainer, StateResponse,
)

log = logging.getLogger(__name__)


_MEM_RE = re.compile(r"^(\d+(?:\.\d+)?)\s*([kmgtKMGT]?)i?[bB]?$")
_MEM_MULT = {
    "": 1 / (1024 * 1024),
    "k": 1 / 1024,
    "m": 1.0,
    "g": 1024.0,
    "t": 1024.0 * 1024.0,
}


def memory_to_mb(s: str) -> int:
    if not s:
        return 0
    m = _MEM_RE.match(s.strip())
    if not m:
        return 0
    return int(float(m.group(1)) * _MEM_MULT[(m.group(2) or "").lower()])


def _docker_host_from_context() -> Optional[str]:
    """If DOCKER_HOST isn't set, derive endpoint from active docker context."""
    import os

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


class DockerError(Exception):
    """Raised for user-actionable Docker failures. Carries an HTTP status hint."""

    def __init__(self, message: str, status_code: int = 500) -> None:
        super().__init__(message)
        self.status_code = status_code


class DockerService:
    """Owns the Docker client and exposes async methods used by the API layer."""

    def __init__(self) -> None:
        self._client: Optional[docker.DockerClient] = None
        self._lock = asyncio.Lock()

    # ---- connection ------------------------------------------------------

    def _connect_sync(self) -> Optional[docker.DockerClient]:
        host = _docker_host_from_context()
        try:
            client = docker.DockerClient(base_url=host) if host else docker.from_env()
            client.ping()
            return client
        except DockerException as e:
            log.warning("docker connect failed: %s", e)
            return None

    async def _client_or_none(self) -> Optional[docker.DockerClient]:
        async with self._lock:
            if self._client is not None:
                try:
                    await asyncio.to_thread(self._client.ping)
                    return self._client
                except DockerException:
                    self._client = None
            self._client = await asyncio.to_thread(self._connect_sync)
            return self._client

    async def client(self) -> docker.DockerClient:
        c = await self._client_or_none()
        if c is None:
            raise DockerError(
                "Docker daemon unreachable. Set DOCKER_HOST or `docker context use <name>`.",
                status_code=503,
            )
        return c

    async def close(self) -> None:
        async with self._lock:
            if self._client is not None:
                try:
                    await asyncio.to_thread(self._client.close)
                except Exception:
                    pass
                self._client = None

    # ---- queries ---------------------------------------------------------

    def _detect_gpus_sync(self, client: docker.DockerClient) -> tuple[list[Gpu], str]:
        try:
            out = client.containers.run(
                image=settings.nvidia_probe_image,
                command=[
                    "nvidia-smi",
                    "--query-gpu=index,name,memory.total,memory.used,utilization.gpu",
                    "--format=csv,noheader,nounits",
                ],
                remove=True,
                device_requests=[DeviceRequest(count=-1, capabilities=[["gpu"]])],
            )
            text = out.decode() if isinstance(out, bytes) else str(out)
            gpus: list[Gpu] = []
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
            return gpus, ""
        except Exception as e:
            log.warning("gpu probe failed: %s", e)
            return [], f"GPU probe failed: {e}"

    def _list_images_sync(self, client: docker.DockerClient) -> list[str]:
        tags: set[str] = set()
        try:
            for img in client.images.list():
                for t in (img.tags or []):
                    if t and not t.startswith("<none>"):
                        tags.add(t)
        except Exception as e:
            log.warning("image list failed: %s", e)
        return sorted(tags)

    def _list_managed_sync(self, client: docker.DockerClient) -> list[ManagedContainer]:
        cs = client.containers.list(
            all=True,
            filters={"label": f"{settings.label_key}={settings.label_value}"},
        )
        result: list[ManagedContainer] = []
        for c in cs:
            env: dict[str, str] = {}
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

    def _state_sync(self, client: docker.DockerClient) -> StateResponse:
        try:
            target = client.info().get("Name", "unknown")
        except Exception:
            target = "unknown"
        gpus, err = self._detect_gpus_sync(client)
        containers = self._list_managed_sync(client)
        images = self._list_images_sync(client)
        by_idx = {g.index: g for g in gpus}
        for c in containers:
            if c.status != "running":
                continue
            try:
                idx = int(c.gpu_index)
            except (ValueError, TypeError):
                continue
            g = by_idx.get(idx)
            if g is None:
                continue
            g.allocated_mb += c.memory_limit_mb
            try:
                g.allocated_sm_pct += int(c.sm_limit)
            except (ValueError, TypeError):
                pass
        return StateResponse(
            connected=True,
            docker_target=target,
            error=err,
            gpus=gpus,
            containers=containers,
            images=images,
        )

    async def get_state(self) -> StateResponse:
        client = await self._client_or_none()
        if client is None:
            return StateResponse(
                connected=False,
                docker_target="",
                error="Docker daemon unreachable. Set DOCKER_HOST or `docker context use <name>`.",
                gpus=[], containers=[], images=[],
            )
        return await asyncio.to_thread(self._state_sync, client)

    # ---- mutations -------------------------------------------------------

    def _run_container_sync(
        self,
        client: docker.DockerClient,
        *,
        image: str,
        name: Optional[str] = None,
        command: Optional[list[str]] = None,
        environment: Optional[dict[str, str]] = None,
        device_requests: Optional[list[DeviceRequest]] = None,
        volumes: Optional[dict[str, dict[str, str]]] = None,
        labels: Optional[dict[str, str]] = None,
        auto_remove: bool = False,
    ):
        """Thin wrapper around `containers.run` so callers can share a single
        Docker-SDK invocation surface. Returns the docker.models.containers.Container."""
        kwargs: dict[str, Any] = {
            "image": image,
            "name": name,
            "command": command,
            "detach": True,
            "labels": labels or {},
        }
        if environment:
            kwargs["environment"] = environment
        if device_requests:
            kwargs["device_requests"] = device_requests
        if volumes:
            kwargs["volumes"] = volumes
        if auto_remove:
            kwargs["auto_remove"] = True
        return client.containers.run(**kwargs)

    def _deploy_sync(
        self,
        client: docker.DockerClient,
        image: str,
        name: str,
        gpu_index: int,
        memory: str,
        sm_limit: int,
        command: str,
    ) -> DeployResponse:
        env = {
            "NVIDIA_VISIBLE_DEVICES": str(gpu_index),
            "NVIDIA_DRIVER_CAPABILITIES": "compute,utility",
            "LD_PRELOAD": settings.libvgpu_path,
            "CUDA_DEVICE_MEMORY_LIMIT": memory,
            "CUDA_DEVICE_SM_LIMIT": str(sm_limit),
            "HAMI_GPU_INDEX": str(gpu_index),
        }
        cmd_list = command.split() if command.strip() else None
        c = self._run_container_sync(
            client,
            image=image,
            name=(name or None),
            command=cmd_list,
            environment=env,
            device_requests=[DeviceRequest(
                device_ids=[str(gpu_index)],
                capabilities=[["gpu"]],
            )],
            labels={settings.label_key: settings.label_value},
        )
        return DeployResponse(id=c.short_id, name=c.name)

    async def deploy(
        self,
        image: str,
        name: str,
        gpu_index: int,
        memory: str,
        sm_limit: int,
        command: str,
    ) -> DeployResponse:
        client = await self.client()
        try:
            return await asyncio.to_thread(
                self._deploy_sync, client, image, name, gpu_index, memory, sm_limit, command,
            )
        except ImageNotFound:
            raise DockerError(f"Image not found: {image}", status_code=404)
        except APIError as e:
            raise DockerError(
                getattr(e, "explanation", None) or str(e), status_code=400,
            ) from e

    async def run_container(
        self,
        *,
        image: str,
        name: Optional[str] = None,
        command: Optional[list[str]] = None,
        environment: Optional[dict[str, str]] = None,
        device_requests: Optional[list[DeviceRequest]] = None,
        volumes: Optional[dict[str, dict[str, str]]] = None,
        labels: Optional[dict[str, str]] = None,
        auto_remove: bool = False,
    ) -> tuple[str, str]:
        """Generic detached run. Returns (short_id, name)."""
        client = await self.client()
        try:
            c = await asyncio.to_thread(
                self._run_container_sync,
                client,
                image=image,
                name=name,
                command=command,
                environment=environment,
                device_requests=device_requests,
                volumes=volumes,
                labels=labels,
                auto_remove=auto_remove,
            )
            return c.short_id, c.name
        except ImageNotFound:
            raise DockerError(f"Image not found: {image}", status_code=404)
        except APIError as e:
            raise DockerError(
                getattr(e, "explanation", None) or str(e), status_code=400,
            ) from e

    def _logs_sync(self, client: docker.DockerClient, cid: str) -> str:
        try:
            c = client.containers.get(cid)
            data = c.logs(timestamps=False)
            return data.decode("utf-8", errors="replace")
        except NotFound:
            return "(container no longer exists)"
        except Exception as e:
            return f"Error fetching logs: {e}"

    async def get_logs(self, cid: str) -> str:
        client = await self.client()
        return await asyncio.to_thread(self._logs_sync, client, cid)

    def _inspect_sync(self, client: docker.DockerClient, cid: str) -> ContainerDetail:
        try:
            c = client.containers.get(cid)
        except NotFound:
            raise DockerError(f"container {cid} not found", status_code=404)
        attrs = c.attrs or {}
        cfg = attrs.get("Config", {}) or {}
        state = attrs.get("State", {}) or {}
        host_cfg = attrs.get("HostConfig", {}) or {}
        env: dict[str, str] = {}
        for item in (cfg.get("Env") or []):
            if "=" in item:
                k, v = item.split("=", 1)
                env[k] = v
        raw_mem = env.get("CUDA_DEVICE_MEMORY_LIMIT", "0")
        return ContainerDetail(
            id=c.short_id,
            name=c.name,
            status=c.status,
            image=(c.image.tags[0] if c.image.tags else c.image.short_id) or "",
            gpu_index=env.get("HAMI_GPU_INDEX") or env.get("NVIDIA_VISIBLE_DEVICES", "?"),
            memory_limit_mb=memory_to_mb(raw_mem),
            memory_limit_raw=raw_mem,
            sm_limit=env.get("CUDA_DEVICE_SM_LIMIT", "-"),
            env=env,
            command=list(cfg.get("Cmd") or []),
            created_at=attrs.get("Created", "") or "",
            started_at=state.get("StartedAt", "") or "",
            finished_at=state.get("FinishedAt", "") or "",
            exit_code=int(state.get("ExitCode", 0) or 0),
            restart_count=int(attrs.get("RestartCount", 0) or 0),
            restart_policy=((host_cfg.get("RestartPolicy") or {}).get("Name") or ""),
        )

    async def inspect(self, cid: str) -> ContainerDetail:
        client = await self.client()
        return await asyncio.to_thread(self._inspect_sync, client, cid)

    async def stop(self, cid: str) -> None:
        client = await self.client()

        def _do() -> None:
            try:
                client.containers.get(cid).stop(timeout=10)
            except NotFound:
                pass

        await asyncio.to_thread(_do)

    async def remove(self, cid: str) -> None:
        client = await self.client()

        def _do() -> None:
            try:
                client.containers.get(cid).remove(force=True)
            except NotFound:
                pass

        await asyncio.to_thread(_do)

    async def restart(self, cid: str) -> None:
        client = await self.client()

        def _do() -> None:
            try:
                client.containers.get(cid).restart(timeout=10)
            except NotFound:
                raise DockerError(f"container {cid} not found", status_code=404)
            except APIError as e:
                raise DockerError(
                    getattr(e, "explanation", None) or str(e), status_code=400,
                ) from e

        await asyncio.to_thread(_do)

    # ---- log streaming ---------------------------------------------------

    async def stream_logs(self, cid: str, tail: int = 200):
        """Async generator yielding raw log byte chunks. Wraps the blocking
        docker SDK log iterator with a thread + queue so the event loop
        keeps spinning."""
        client = await self.client()
        loop = asyncio.get_running_loop()
        queue: asyncio.Queue[Optional[bytes]] = asyncio.Queue(maxsize=256)
        stop_flag = {"stop": False}

        def _pump() -> None:
            try:
                stream = client.api.logs(
                    cid, stream=True, follow=True, tail=tail, stdout=True, stderr=True,
                )
                for chunk in stream:
                    if stop_flag["stop"]:
                        break
                    if not chunk:
                        continue
                    asyncio.run_coroutine_threadsafe(queue.put(chunk), loop)
            except NotFound:
                # Container exited and was auto-removed — let the stream end silently.
                pass
            except Exception as e:  # pragma: no cover - best-effort error surfacing
                msg = f"\n[log stream error: {e}]\n".encode()
                asyncio.run_coroutine_threadsafe(queue.put(msg), loop)
            finally:
                asyncio.run_coroutine_threadsafe(queue.put(None), loop)

        task = asyncio.create_task(asyncio.to_thread(_pump))
        try:
            while True:
                chunk = await queue.get()
                if chunk is None:
                    return
                yield chunk
        finally:
            stop_flag["stop"] = True
            task.cancel()

    # ---- shell helper ----------------------------------------------------

    async def container_exists(self, cid: str) -> bool:
        client = await self.client()

        def _check() -> bool:
            try:
                client.containers.get(cid)
                return True
            except NotFound:
                return False

        return await asyncio.to_thread(_check)
