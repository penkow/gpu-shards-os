"""Editor-run orchestration.

A Run = write user code + a tiny handler-invoking runner into the shared
workspace, then start a fresh container that bind-mounts the workspace at
/workspace and executes the runner. The container is `auto_remove=True`,
so it disappears once the code exits. Logs are streamed via the existing
/api/containers/{cid}/logs/stream SSE endpoint while it's alive.
"""

from __future__ import annotations

import logging
import os
import shutil
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import BinaryIO
from uuid import uuid4

from docker.types import DeviceRequest

from .config import settings
from .docker_service import DockerError, DockerService
from .models import EditorFile, EditorRunResponse

log = logging.getLogger(__name__)


_MAX_FILENAME_LEN = 255
_RUNS_SUBDIR = "runs"
_RUN_RETENTION_S = 3600


def _safe_filename(raw: str) -> str:
    """Reject path traversal / separators. Returns the cleaned name or raises."""
    name = (raw or "").strip().lstrip(".")
    if not name:
        raise DockerError("filename is empty", status_code=400)
    if len(name) > _MAX_FILENAME_LEN:
        raise DockerError("filename too long", status_code=400)
    if "/" in name or "\\" in name or ".." in name or "\x00" in name:
        raise DockerError("invalid filename", status_code=400)
    return name


_RUNNER_TEMPLATE = '''\
"""Auto-generated runner. Loads user's main.py and invokes handler()."""
import json
import sys
import traceback

sys.path.insert(0, "/workspace")

try:
    from main import handler  # type: ignore
except Exception:
    print("[runner] failed to import handler from /workspace/main.py:", file=sys.stderr)
    traceback.print_exc()
    sys.exit(1)

event: dict = {}
context: dict = {"requestId": "__RUN_ID__"}

try:
    result = handler(event, context)
except Exception:
    print("[runner] handler raised:", file=sys.stderr)
    traceback.print_exc()
    sys.exit(1)

print(json.dumps(result, default=str, indent=2))
'''


class EditorService:
    def __init__(self, docker: DockerService) -> None:
        self._docker = docker

    # ---- workspace -------------------------------------------------------

    def _workspace_path(self) -> Path:
        return Path(settings.editor_workspace_dir).expanduser()

    def ensure_workspace(self) -> Path:
        p = self._workspace_path()
        p.mkdir(parents=True, exist_ok=True)
        return p

    # ---- files -----------------------------------------------------------

    def _run_dir(self, run_id: str) -> Path:
        return self._workspace_path() / _RUNS_SUBDIR / run_id

    def _prune_old_runs(self) -> None:
        """Best-effort cleanup of per-run subdirs older than _RUN_RETENTION_S.

        Editor containers are `auto_remove=True` so we don't get a finish
        callback; without this the runs/ tree would grow unbounded."""
        runs_root = self._workspace_path() / _RUNS_SUBDIR
        if not runs_root.exists():
            return
        cutoff = time.time() - _RUN_RETENTION_S
        for d in runs_root.iterdir():
            if not d.is_dir():
                continue
            try:
                if d.stat().st_mtime < cutoff:
                    shutil.rmtree(d, ignore_errors=True)
            except FileNotFoundError:
                pass

    def list_files(self) -> list[EditorFile]:
        root = self.ensure_workspace()
        out: list[EditorFile] = []
        for entry in sorted(root.iterdir()):
            if not entry.is_file():
                continue
            if entry.name.startswith("."):
                continue
            if entry.name in ("main.py", "_runner.py"):
                continue
            st = entry.stat()
            out.append(EditorFile(
                name=entry.name,
                size=st.st_size,
                uploaded_at=datetime.fromtimestamp(st.st_mtime, tz=timezone.utc).isoformat(),
            ))
        return out

    def save_file(self, raw_name: str, stream: BinaryIO) -> EditorFile:
        name = _safe_filename(raw_name)
        root = self.ensure_workspace()
        target = root / name
        with target.open("wb") as f:
            while True:
                chunk = stream.read(1 << 20)
                if not chunk:
                    break
                f.write(chunk)
        st = target.stat()
        return EditorFile(
            name=name,
            size=st.st_size,
            uploaded_at=datetime.fromtimestamp(st.st_mtime, tz=timezone.utc).isoformat(),
        )

    def delete_file(self, raw_name: str) -> None:
        name = _safe_filename(raw_name)
        target = self.ensure_workspace() / name
        if not target.exists():
            raise DockerError(f"file not found: {name}", status_code=404)
        if not target.is_file():
            raise DockerError("not a file", status_code=400)
        target.unlink()

    # ---- run -------------------------------------------------------------

    async def start_run(self, code: str, use_gpu: bool, gpu_index: int) -> EditorRunResponse:
        if not code.strip():
            raise DockerError("code is empty", status_code=400)

        self.ensure_workspace()
        self._prune_old_runs()
        run_id = uuid4().hex[:12]
        run_dir = self._run_dir(run_id)
        run_dir.mkdir(parents=True, exist_ok=True)

        # Per-run subdir mirrors endpoint_service._endpoint_dir — concurrent Runs
        # no longer race on a shared workspace/main.py. Each container sees only
        # its own main.py at /workspace/main.py.
        (run_dir / "main.py").write_text(code, encoding="utf-8")
        (run_dir / "_runner.py").write_text(
            _RUNNER_TEMPLATE.replace("__RUN_ID__", run_id), encoding="utf-8",
        )

        image = settings.editor_image_gpu if use_gpu else settings.editor_image_cpu
        labels = {
            settings.label_key: settings.label_value,
            settings.editor_label_key: settings.editor_label_value,
            "gpu-shards.editor.run_id": run_id,
        }
        environment: dict[str, str] = {"PYTHONUNBUFFERED": "1"}
        device_requests: list[DeviceRequest] | None = None
        if use_gpu:
            environment["NVIDIA_VISIBLE_DEVICES"] = str(gpu_index)
            environment["NVIDIA_DRIVER_CAPABILITIES"] = "compute,utility"
            device_requests = [DeviceRequest(
                device_ids=[str(gpu_index)],
                capabilities=[["gpu"]],
            )]

        host_run_dir = str(run_dir.resolve())
        volumes = {
            host_run_dir: {"bind": settings.editor_workspace_mount, "mode": "rw"},
        }

        name = f"editor-run-{run_id}"
        container_id, container_name = await self._docker.run_container(
            image=image,
            name=name,
            command=["python", f"{settings.editor_workspace_mount}/_runner.py"],
            environment=environment,
            device_requests=device_requests,
            volumes=volumes,
            labels=labels,
            auto_remove=True,
        )
        log.info(
            "editor run started run_id=%s container=%s image=%s gpu=%s",
            run_id, container_name, image, use_gpu,
        )
        return EditorRunResponse(
            run_id=run_id,
            container_id=container_id,
            container_name=container_name,
        )
