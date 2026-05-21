"""PTY shell bridge between a docker exec session and a WebSocket client.

Client wire protocol (JSON text frames in, binary frames out):

    client -> server   {"input": "<text>"}                    keystrokes
    client -> server   {"resize": {"rows": N, "cols": M}}     window size
    server -> client   <binary frame>                         raw PTY bytes
"""

from __future__ import annotations

import asyncio
import logging
import threading
from typing import Optional

import docker

log = logging.getLogger(__name__)


class ShellSession:
    """One docker-exec PTY plus a reader thread that pumps bytes back out."""

    def __init__(self) -> None:
        self.exec_id: Optional[str] = None
        self._sock = None
        self._reader: Optional[threading.Thread] = None
        self._stop = threading.Event()

    def start(
        self,
        client: docker.DockerClient,
        cid: str,
        on_data,                                # Callable[[bytes], None] — thread-safe
    ) -> None:
        api = client.api
        info = api.exec_create(
            container=cid,
            cmd=["/bin/bash", "-l"],
            stdin=True, tty=True, stdout=True, stderr=True,
            environment=["TERM=xterm-256color", "COLORTERM=truecolor"],
        )
        self.exec_id = info["Id"]
        sock_holder = api.exec_start(
            self.exec_id, tty=True, stream=False, socket=True, demux=False,
        )
        raw = getattr(sock_holder, "_sock", sock_holder)
        self._sock = raw
        self._stop.clear()

        def reader() -> None:
            while not self._stop.is_set():
                try:
                    data = raw.recv(4096)
                except OSError:
                    break
                if not data:
                    break
                try:
                    on_data(data)
                except Exception as e:
                    log.debug("shell on_data callback raised: %s", e)
                    break

        self._reader = threading.Thread(target=reader, daemon=True)
        self._reader.start()

    def send(self, data: str) -> None:
        if not self._sock:
            return
        try:
            self._sock.sendall(data.encode("utf-8"))
        except OSError:
            pass

    def resize(self, client: docker.DockerClient, rows: int, cols: int) -> None:
        if not self.exec_id:
            return
        try:
            client.api.exec_resize(self.exec_id, height=rows, width=cols)
        except Exception as e:
            log.debug("exec_resize failed: %s", e)

    def stop(self) -> None:
        self._stop.set()
        if self._sock:
            try:
                self._sock.shutdown(2)
            except OSError:
                pass
            try:
                self._sock.close()
            except OSError:
                pass
            self._sock = None
        self.exec_id = None
        self._reader = None


async def bridge_websocket(websocket, client: docker.DockerClient, cid: str) -> None:
    """Pump bytes between an open WebSocket and a fresh ShellSession.

    Returns when either side closes. The caller is responsible for the
    initial ``websocket.accept()``.
    """
    import json
    from fastapi import WebSocketDisconnect

    session = ShellSession()
    loop = asyncio.get_running_loop()
    out_queue: asyncio.Queue[bytes] = asyncio.Queue()

    def on_bytes(data: bytes) -> None:
        # Called from the reader thread — hop back to the loop.
        loop.call_soon_threadsafe(out_queue.put_nowait, data)

    try:
        await asyncio.to_thread(session.start, client, cid, on_bytes)
    except Exception as e:
        log.warning("failed to start shell for %s: %s", cid, e)
        try:
            await websocket.send_bytes(f"\r\n\x1b[31mFailed to start shell: {e}\x1b[0m\r\n".encode())
        finally:
            await websocket.close()
        return

    async def pump_out() -> None:
        try:
            while True:
                data = await out_queue.get()
                await websocket.send_bytes(data)
        except Exception:
            pass

    out_task = asyncio.create_task(pump_out())

    try:
        while True:
            msg = await websocket.receive_text()
            try:
                payload = json.loads(msg)
            except json.JSONDecodeError:
                continue
            if "input" in payload and isinstance(payload["input"], str):
                session.send(payload["input"])
            elif "resize" in payload and isinstance(payload["resize"], dict):
                r = payload["resize"]
                rows = int(r.get("rows", 24))
                cols = int(r.get("cols", 80))
                await asyncio.to_thread(session.resize, client, rows, cols)
    except WebSocketDisconnect:
        pass
    except Exception as e:
        log.debug("shell websocket loop ended: %s", e)
    finally:
        out_task.cancel()
        await asyncio.to_thread(session.stop)
        try:
            await websocket.close()
        except Exception:
            pass
