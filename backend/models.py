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
