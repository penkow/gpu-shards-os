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
from .endpoint_service import EndpointService
from .image_build_service import ImageBuildService
from .models import (
    BuildImageRequest, BuildStatus, BuildsListResponse,
    ContainerDetail, DeployRequest, DeployResponse, EditorFile,
    EditorFilesResponse, EditorRunRequest, EditorRunResponse,
    EndpointCreateRequest, EndpointDetail, EndpointsListResponse,
    ImageInspect, ImagesResponse,
    InvokeResult, LogsResponse, OkResponse, RequestTemplate,
    RequestTemplateUpsert, StateResponse, TemplatesResponse,
)
from .shell_service import bridge_websocket

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
log = logging.getLogger("hami.backend")


service = DockerService()
editor = EditorService(service)
endpoints = EndpointService(service)
image_builds = ImageBuildService(service)


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


def _require_invoke_api_key(
    x_api_key: Optional[str] = Header(default=None),
    token: Optional[str] = Query(default=None),
) -> None:
    """Same as require_api_key, but also accepts ?token= so a curl snippet
    copy-pasted out of the panel works without a header flag."""
    if not settings.api_key:
        return
    if x_api_key == settings.api_key or token == settings.api_key:
        return
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


# ---- image builds --------------------------------------------------------

@app.post(
    "/api/images/builds",
    response_model=BuildStatus,
    status_code=status.HTTP_201_CREATED,
    tags=["images"],
    dependencies=[Depends(require_api_key)],
)
async def start_image_build(req: BuildImageRequest) -> BuildStatus:
    return await image_builds.start_build(tag=req.tag.strip(), dockerfile=req.dockerfile)


@app.get(
    "/api/images/builds",
    response_model=BuildsListResponse,
    tags=["images"],
    dependencies=[Depends(require_api_key)],
)
async def list_image_builds() -> BuildsListResponse:
    return BuildsListResponse(builds=image_builds.list_builds())


@app.get(
    "/api/images/builds/{build_id}",
    response_model=BuildStatus,
    tags=["images"],
    dependencies=[Depends(require_api_key)],
)
async def get_image_build(build_id: str) -> BuildStatus:
    return image_builds.get_status(build_id)


@app.get(
    "/api/images/builds/{build_id}/stream",
    tags=["images"],
)
async def stream_image_build(build_id: str, token: Optional[str] = Query(default=None)) -> StreamingResponse:
    _require_sse_api_key(token)

    async def event_source():
        async for ev in image_builds.subscribe(build_id):
            yield f"data: {ImageBuildService.event_to_sse_text(ev)}\n\n"

    return StreamingResponse(
        event_source(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ---- image lifecycle -----------------------------------------------------

@app.get(
    "/api/images",
    response_model=ImagesResponse,
    tags=["images"],
    dependencies=[Depends(require_api_key)],
)
async def list_images() -> ImagesResponse:
    return ImagesResponse(images=await service.list_images_detailed())


@app.get(
    "/api/images/{ref:path}/inspect",
    response_model=ImageInspect,
    tags=["images"],
    dependencies=[Depends(require_api_key)],
)
async def inspect_image(ref: str) -> ImageInspect:
    data = await service.inspect_image(ref)
    return ImageInspect(data=data)


@app.delete(
    "/api/images/{ref:path}",
    response_model=OkResponse,
    tags=["images"],
    dependencies=[Depends(require_api_key)],
)
async def remove_image(ref: str) -> OkResponse:
    await service.remove_image(ref)
    return OkResponse()


# ---- endpoints (FaaS) ----------------------------------------------------

@app.post(
    "/api/endpoints",
    response_model=EndpointDetail,
    status_code=status.HTTP_201_CREATED,
    tags=["endpoints"],
    dependencies=[Depends(require_api_key)],
)
async def create_endpoint(req: EndpointCreateRequest) -> EndpointDetail:
    return await endpoints.create(
        name=req.name,
        code=req.code,
        use_gpu=req.use_gpu,
        gpu_index=req.gpu_index,
        memory=req.memory,
        sm_limit=req.sm_limit,
        image=req.image,
    )


@app.get(
    "/api/endpoints",
    response_model=EndpointsListResponse,
    tags=["endpoints"],
    dependencies=[Depends(require_api_key)],
)
async def list_endpoints() -> EndpointsListResponse:
    return EndpointsListResponse(endpoints=await endpoints.list())


@app.get(
    "/api/endpoints/{name}",
    response_model=EndpointDetail,
    tags=["endpoints"],
    dependencies=[Depends(require_api_key)],
)
async def get_endpoint(name: str) -> EndpointDetail:
    return await endpoints.get(name)


@app.delete(
    "/api/endpoints/{name}",
    response_model=OkResponse,
    tags=["endpoints"],
    dependencies=[Depends(require_api_key)],
)
async def delete_endpoint(name: str) -> OkResponse:
    await endpoints.delete(name)
    return OkResponse()


@app.get(
    "/api/endpoints/{name}/templates",
    response_model=TemplatesResponse,
    tags=["endpoints"],
    dependencies=[Depends(require_api_key)],
)
async def list_endpoint_templates(name: str) -> TemplatesResponse:
    return TemplatesResponse(templates=await endpoints.list_templates(name))


@app.put(
    "/api/endpoints/{name}/templates/{tid}",
    response_model=RequestTemplate,
    tags=["endpoints"],
    dependencies=[Depends(require_api_key)],
)
async def upsert_endpoint_template(
    name: str, tid: str, req: RequestTemplateUpsert,
) -> RequestTemplate:
    return await endpoints.upsert_template(
        name, tid, display=req.name, body=req.body,
    )


@app.delete(
    "/api/endpoints/{name}/templates/{tid}",
    response_model=OkResponse,
    tags=["endpoints"],
    dependencies=[Depends(require_api_key)],
)
async def delete_endpoint_template(name: str, tid: str) -> OkResponse:
    await endpoints.delete_template(name, tid)
    return OkResponse()


@app.post(
    "/api/fn/{name}/invoke",
    response_model=InvokeResult,
    tags=["endpoints"],
    dependencies=[Depends(_require_invoke_api_key)],
)
async def invoke_endpoint(name: str, request: Request) -> InvokeResult:
    try:
        body = await request.json()
    except Exception:
        body = {}
    return await endpoints.invoke(name, body)


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
