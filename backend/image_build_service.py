"""Docker image build orchestration.

A Build = ephemeral asyncio task that streams `client.api.build(...)` events
into per-subscriber queues. State is in-memory and lost on restart. Events
are buffered (bounded) so late subscribers still see the full output.
"""

from __future__ import annotations

import asyncio
import json
import logging
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, AsyncGenerator, Optional
from uuid import uuid4

from .docker_service import DockerError, DockerService
from .models import BuildStatus

log = logging.getLogger(__name__)


_MAX_BUFFER_EVENTS = 500
_MAX_RETAINED_BUILDS = 25


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class _BuildState:
    """One in-flight (or completed) build."""

    def __init__(self, build_id: str, tag: str) -> None:
        self.build_id = build_id
        self.tag = tag
        self.status = "running"  # running | succeeded | failed
        self.started_at = _now_iso()
        self.finished_at = ""
        self.image_id = ""
        self.error = ""
        # Buffered events (bounded) — also serves as the replay log for late subscribers.
        self.buffer: list[dict[str, Any]] = []
        # Live subscribers' queues. `None` is the end-of-stream sentinel.
        self.subscribers: set[asyncio.Queue[Optional[dict[str, Any]]]] = set()
        self.done_event = asyncio.Event()

    def snapshot(self) -> BuildStatus:
        return BuildStatus(
            build_id=self.build_id,
            tag=self.tag,
            status=self.status,
            started_at=self.started_at,
            finished_at=self.finished_at,
            image_id=self.image_id,
            error=self.error,
        )

    def push(self, event: dict[str, Any]) -> None:
        # Capture aux events to find the final image id.
        aux = event.get("aux") if isinstance(event, dict) else None
        if isinstance(aux, dict):
            iid = aux.get("ID") or aux.get("id")
            if iid:
                self.image_id = iid

        self.buffer.append(event)
        if len(self.buffer) > _MAX_BUFFER_EVENTS:
            del self.buffer[: len(self.buffer) - _MAX_BUFFER_EVENTS]
        for q in list(self.subscribers):
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                pass

    def close(self, error: str = "") -> None:
        if self.status == "running":
            self.status = "failed" if error else "succeeded"
            self.error = error
            self.finished_at = _now_iso()
        for q in list(self.subscribers):
            try:
                q.put_nowait(None)
            except asyncio.QueueFull:
                pass
        self.done_event.set()


class ImageBuildService:
    def __init__(self, docker: DockerService) -> None:
        self._docker = docker
        self._builds: dict[str, _BuildState] = {}
        self._order: list[str] = []  # insertion order, oldest first

    # ---- public API -----------------------------------------------------

    async def start_build(self, *, tag: str, dockerfile: str) -> BuildStatus:
        client = await self._docker.client()  # validates we can reach Docker

        build_id = uuid4().hex[:12]
        state = _BuildState(build_id, tag)
        self._builds[build_id] = state
        self._order.append(build_id)
        # Trim retention.
        while len(self._order) > _MAX_RETAINED_BUILDS:
            old = self._order.pop(0)
            self._builds.pop(old, None)

        loop = asyncio.get_running_loop()
        asyncio.create_task(self._run_build(state, dockerfile, client, loop))
        log.info("[image-build] start build_id=%s tag=%s", build_id, tag)
        return state.snapshot()

    def get_status(self, build_id: str) -> BuildStatus:
        state = self._builds.get(build_id)
        if state is None:
            raise DockerError(f"build not found: {build_id}", status_code=404)
        return state.snapshot()

    def list_builds(self) -> list[BuildStatus]:
        # Newest first.
        return [self._builds[bid].snapshot() for bid in reversed(self._order) if bid in self._builds]

    async def subscribe(self, build_id: str) -> AsyncGenerator[dict[str, Any], None]:
        state = self._builds.get(build_id)
        if state is None:
            raise DockerError(f"build not found: {build_id}", status_code=404)

        # Replay buffered events first.
        for ev in list(state.buffer):
            yield ev

        if state.status != "running":
            # Already finished — nothing more to send.
            return

        queue: asyncio.Queue[Optional[dict[str, Any]]] = asyncio.Queue(maxsize=1024)
        state.subscribers.add(queue)
        try:
            while True:
                ev = await queue.get()
                if ev is None:
                    return
                yield ev
        finally:
            state.subscribers.discard(queue)

    # ---- worker --------------------------------------------------------

    async def _run_build(self, state: _BuildState, dockerfile: str, client, loop: asyncio.AbstractEventLoop) -> None:
        with tempfile.TemporaryDirectory(prefix=f"gpu-shards-build-{state.build_id}-") as td:
            try:
                (Path(td) / "Dockerfile").write_text(dockerfile, encoding="utf-8")
            except Exception as e:
                state.close(error=f"failed to stage Dockerfile: {e}")
                return

            def _drain() -> Optional[str]:
                try:
                    for raw in client.api.build(
                        path=td, tag=state.tag, rm=True, decode=True, pull=False, forcerm=True,
                    ):
                        ev = raw if isinstance(raw, dict) else {"stream": str(raw)}
                        # Marshal back onto the event loop for buffering / fan-out.
                        loop.call_soon_threadsafe(state.push, ev)
                        if isinstance(ev.get("error"), str):
                            return ev["error"]
                except Exception as e:
                    return str(e)
                return None

            err = await asyncio.to_thread(_drain)
            if err:
                state.push({"error": err})
                state.close(error=err)
                log.warning("[image-build] failed build_id=%s tag=%s: %s", state.build_id, state.tag, err)
            else:
                state.close()
                log.info(
                    "[image-build] succeeded build_id=%s tag=%s image_id=%s",
                    state.build_id, state.tag, state.image_id,
                )

    @staticmethod
    def event_to_sse_text(event: dict[str, Any]) -> str:
        """Serialize a build event into one SSE `data:` payload. Each line in the
        original event (e.g. a multi-line `stream`) becomes its own SSE line so
        the EventSource client can write it directly to a terminal."""
        try:
            return json.dumps(event, default=str)
        except Exception:
            return json.dumps({"stream": repr(event)})
