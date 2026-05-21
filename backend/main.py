"""FastAPI app: REST endpoints + WebSocket for the PTY shell."""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import (
    Depends, FastAPI, File, Header, HTTPException, Query, Request, UploadFile,
    WebSocket, WebSocketException, status,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from . import __version__
from .config import settings
from .docker_service import DockerError, DockerService
from .editor_service import EditorService
from .models import (
    ContainerDetail, DeployRequest, DeployResponse, EditorFile,
    EditorFilesResponse, EditorRunRequest, EditorRunResponse, LogsResponse,
    OkResponse, StateResponse,
)
from .shell_service import bridge_websocket

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
log = logging.getLogger("hami.backend")


service = DockerService()
editor = EditorService(service)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    log.info("backend starting, version=%s", __version__)
    try:
        yield
    finally:
        log.info("backend shutting down")
        await service.close()


app = FastAPI(
    title="HAMi Control Backend",
    version=__version__,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins or ["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


# ---- auth ----------------------------------------------------------------

def require_api_key(x_api_key: Optional[str] = Header(default=None)) -> None:
    if not settings.api_key:
        return
    if x_api_key != settings.api_key:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid API key")


def _require_ws_api_key(token: Optional[str]) -> None:
    if not settings.api_key:
        return
    if token != settings.api_key:
        raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION)


def _require_sse_api_key(token: Optional[str]) -> None:
    """EventSource can't send headers, so accept the key via ?token=."""
    if not settings.api_key:
        return
    if token != settings.api_key:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid API key")


# ---- error handler -------------------------------------------------------

@app.exception_handler(DockerError)
async def _docker_error_handler(_req: Request, exc: DockerError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"detail": str(exc)})


# ---- routes --------------------------------------------------------------

@app.get("/api/health", response_model=OkResponse, tags=["meta"])
async def health() -> OkResponse:
    return OkResponse()


@app.get(
    "/api/state",
    response_model=StateResponse,
    tags=["state"],
    dependencies=[Depends(require_api_key)],
)
async def get_state() -> StateResponse:
    return await service.get_state()


@app.post(
    "/api/deploy",
    response_model=DeployResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["containers"],
    dependencies=[Depends(require_api_key)],
)
async def deploy(req: DeployRequest) -> DeployResponse:
    return await service.deploy(
        image=req.image.strip(),
        name=req.name.strip(),
        gpu_index=req.gpu_index,
        memory=req.memory.strip(),
        sm_limit=req.sm_limit,
        command=req.command.strip(),
    )


@app.get(
    "/api/containers/{cid}/logs",
    response_model=LogsResponse,
    tags=["containers"],
    dependencies=[Depends(require_api_key)],
)
async def get_logs(cid: str) -> LogsResponse:
    return LogsResponse(cid=cid, logs=await service.get_logs(cid))


@app.get(
    "/api/containers/{cid}/logs/stream",
    tags=["containers"],
)
async def stream_logs(cid: str, token: Optional[str] = Query(default=None)) -> StreamingResponse:
    _require_sse_api_key(token)

    async def event_source():
        async for chunk in service.stream_logs(cid):
            try:
                text = chunk.decode("utf-8", errors="replace") if isinstance(chunk, (bytes, bytearray)) else str(chunk)
            except Exception:
                text = repr(chunk)
            for line in text.splitlines() or [""]:
                yield f"data: {line}\n\n"

    return StreamingResponse(
        event_source(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get(
    "/api/containers/{cid}",
    response_model=ContainerDetail,
    tags=["containers"],
    dependencies=[Depends(require_api_key)],
)
async def inspect_container(cid: str) -> ContainerDetail:
    return await service.inspect(cid)


@app.post(
    "/api/containers/{cid}/stop",
    response_model=OkResponse,
    tags=["containers"],
    dependencies=[Depends(require_api_key)],
)
async def stop(cid: str) -> OkResponse:
    await service.stop(cid)
    return OkResponse()


@app.post(
    "/api/containers/{cid}/restart",
    response_model=OkResponse,
    tags=["containers"],
    dependencies=[Depends(require_api_key)],
)
async def restart(cid: str) -> OkResponse:
    await service.restart(cid)
    return OkResponse()


@app.delete(
    "/api/containers/{cid}",
    response_model=OkResponse,
    tags=["containers"],
    dependencies=[Depends(require_api_key)],
)
async def remove(cid: str) -> OkResponse:
    await service.remove(cid)
    return OkResponse()


# ---- editor --------------------------------------------------------------

@app.post(
    "/api/editor/runs",
    response_model=EditorRunResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["editor"],
    dependencies=[Depends(require_api_key)],
)
async def editor_run(req: EditorRunRequest) -> EditorRunResponse:
    return await editor.start_run(
        code=req.code,
        use_gpu=req.use_gpu,
        gpu_index=req.gpu_index,
    )


@app.get(
    "/api/editor/files",
    response_model=EditorFilesResponse,
    tags=["editor"],
    dependencies=[Depends(require_api_key)],
)
async def editor_list_files() -> EditorFilesResponse:
    files = await asyncio.to_thread(editor.list_files)
    return EditorFilesResponse(files=files)


@app.post(
    "/api/editor/files",
    response_model=EditorFile,
    status_code=status.HTTP_201_CREATED,
    tags=["editor"],
    dependencies=[Depends(require_api_key)],
)
async def editor_upload_file(file: UploadFile = File(...)) -> EditorFile:
    if not file.filename:
        raise HTTPException(status_code=400, detail="filename missing")
    # Run the blocking chunked write on a worker thread so the event loop stays
    # free to serve other requests (e.g. DELETE of a different file).
    return await asyncio.to_thread(editor.save_file, file.filename, file.file)


@app.delete(
    "/api/editor/files/{name}",
    response_model=OkResponse,
    tags=["editor"],
    dependencies=[Depends(require_api_key)],
)
async def editor_delete_file(name: str) -> OkResponse:
    await asyncio.to_thread(editor.delete_file, name)
    return OkResponse()


@app.websocket("/api/containers/{cid}/shell")
async def shell_ws(websocket: WebSocket, cid: str, token: Optional[str] = Query(default=None)) -> None:
    _require_ws_api_key(token)
    try:
        client = await service.client()
    except DockerError as e:
        await websocket.accept()
        await websocket.send_bytes(f"\r\n\x1b[31m{e}\x1b[0m\r\n".encode())
        await websocket.close()
        return
    if not await service.container_exists(cid):
        await websocket.accept()
        await websocket.send_bytes(b"\r\n\x1b[31mContainer not found\x1b[0m\r\n")
        await websocket.close()
        return
    await websocket.accept()
    await bridge_websocket(websocket, client, cid)


def main() -> None:
    """Entry point: ``python -m backend``."""
    import uvicorn

    uvicorn.run(
        "backend.main:app",
        host=settings.host,
        port=settings.port,
        log_level=settings.log_level.lower(),
        reload=False,
    )


if __name__ == "__main__":
    main()
