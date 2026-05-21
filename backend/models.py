"""Pydantic request/response schemas — the wire contract with the panel."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class Gpu(BaseModel):
    model_config = ConfigDict(extra="forbid")
    index: int
    name: str
    memory_total_mb: int
    memory_used_mb: int
    utilization_pct: int
    allocated_mb: int = 0
    allocated_sm_pct: int = 0


class ManagedContainer(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    name: str
    status: str
    image: str
    gpu_index: str
    memory_limit_mb: int
    memory_limit_raw: str
    sm_limit: str


class ContainerDetail(ManagedContainer):
    model_config = ConfigDict(extra="forbid")
    env: dict[str, str] = Field(default_factory=dict)
    command: list[str] = Field(default_factory=list)
    created_at: str = ""
    started_at: str = ""
    finished_at: str = ""
    exit_code: int = 0
    restart_count: int = 0
    restart_policy: str = ""
    # If the container is the worker of a FaaS endpoint, the endpoint name.
    endpoint_name: str = ""


class StateResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    connected: bool
    docker_target: str
    error: str
    gpus: list[Gpu]
    containers: list[ManagedContainer]
    images: list[str]


class DeployRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    image: str = Field(min_length=1, max_length=512)
    name: str = ""
    gpu_index: int = Field(ge=0)
    memory: str = Field(min_length=1, max_length=32)
    sm_limit: int = Field(ge=1, le=100)
    command: str = ""


class DeployResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    name: str


class LogsResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    cid: str
    logs: str


class OkResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ok: bool = True


class EditorRunRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: str = Field(min_length=1, max_length=1_000_000)
    use_gpu: bool = False
    gpu_index: int = Field(default=0, ge=0)


class EditorRunResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    run_id: str
    container_id: str
    container_name: str


class EditorFile(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str
    size: int
    uploaded_at: str


class EditorFilesResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    files: list[EditorFile]


# ---- endpoints (FaaS) ----------------------------------------------------

class EndpointCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=32, pattern=r"^[a-z][a-z0-9-]{0,31}$")
    code: str = Field(min_length=1, max_length=1_000_000)
    use_gpu: bool = True
    gpu_index: int = Field(default=0, ge=0)
    memory: str = Field(default="4g", min_length=1, max_length=32)
    sm_limit: int = Field(default=50, ge=1, le=100)
    # Optional override — empty means use the editor_image_gpu/cpu default.
    image: str = Field(default="", max_length=512)


class EndpointSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str
    container_id: str
    container_name: str
    status: str
    gpu_index: str
    host_port: int
    invocation_count: int
    last_invoked_at: str
    invoke_url: str
    created_at: str


class EndpointDetail(EndpointSummary):
    model_config = ConfigDict(extra="forbid")
    code: str
    memory_limit_raw: str
    sm_limit: str
    use_gpu: bool
    image_used: str = ""
    recent_latencies_ms: list[int] = Field(default_factory=list)


class EndpointsListResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    endpoints: list[EndpointSummary]


class InvokeResult(BaseModel):
    """Returned from /api/fn/{name}/invoke. Mostly a passthrough of the user
    runner's response, plus a gateway-side duration measurement."""
    model_config = ConfigDict(extra="allow")
    gateway_duration_ms: int = 0


# ---- request templates (per endpoint) -----------------------------------

class RequestTemplate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1, max_length=64, pattern=r"^[a-z][a-z0-9-]{0,63}$")
    name: str = Field(min_length=1, max_length=128)
    body: str = Field(max_length=1_000_000)


class RequestTemplateUpsert(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=128)
    body: str = Field(max_length=1_000_000)


class TemplatesResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    templates: list[RequestTemplate]


# ---- image builds --------------------------------------------------------

class BuildImageRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tag: str = Field(min_length=1, max_length=256, pattern=r"^[a-z0-9][a-z0-9._/-]*(:[a-zA-Z0-9._-]+)?$")
    dockerfile: str = Field(min_length=1, max_length=200_000)


class BuildStatus(BaseModel):
    model_config = ConfigDict(extra="forbid")
    build_id: str
    tag: str
    status: str  # "running" | "succeeded" | "failed"
    started_at: str
    finished_at: str = ""
    image_id: str = ""
    error: str = ""


class BuildsListResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    builds: list[BuildStatus]


class ImageInfo(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str  # short id (12 hex chars), no "sha256:" prefix
    tags: list[str]
    size_bytes: int = 0
    created_at: str = ""
    architecture: str = ""
    # Container short_ids that currently reference this image (running or stopped).
    used_by: list[str] = Field(default_factory=list)


class ImagesResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    images: list[ImageInfo]


class ImageInspect(BaseModel):
    """Raw passthrough of docker.Image.attrs — schema is whatever Docker returns."""
    model_config = ConfigDict(extra="allow")
    data: dict[str, "object"] = Field(default_factory=dict)
