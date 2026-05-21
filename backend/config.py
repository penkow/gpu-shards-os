"""Runtime configuration. All values are env-driven with sane defaults."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path


def _split_csv(value: str) -> list[str]:
    return [v.strip() for v in value.split(",") if v.strip()]


def _default_editor_workspace() -> str:
    return os.environ.get(
        "HAMI_EDITOR_WORKSPACE_DIR",
        str(Path.home() / ".gpu-shards" / "editor-workspace"),
    )


@dataclass(frozen=True)
class Settings:
    host: str = field(default_factory=lambda: os.environ.get("HAMI_BACKEND_HOST", "0.0.0.0"))
    port: int = field(default_factory=lambda: int(os.environ.get("HAMI_BACKEND_PORT", "8000")))
    api_key: str = field(default_factory=lambda: os.environ.get("HAMI_API_KEY", ""))
    allowed_origins: list[str] = field(
        default_factory=lambda: _split_csv(
            os.environ.get("HAMI_ALLOWED_ORIGINS", "http://localhost:8080,http://127.0.0.1:8080")
        )
    )
    log_level: str = field(default_factory=lambda: os.environ.get("HAMI_LOG_LEVEL", "INFO"))

    # Domain constants (intentionally not env-tunable — they're contract, not config)
    label_key: str = "hami-panel.managed"
    label_value: str = "true"
    editor_label_key: str = "gpu-shards.editor.run"
    editor_label_value: str = "true"
    default_image: str = "hami-core-demo:latest"
    nvidia_probe_image: str = "nvidia/cuda:12.2.2-base-ubuntu22.04"
    libvgpu_path: str = "/libvgpu/build/libvgpu.so"

    # Editor execution
    editor_workspace_dir: str = field(default_factory=_default_editor_workspace)
    editor_workspace_mount: str = "/workspace"
    editor_image_cpu: str = field(
        default_factory=lambda: os.environ.get("HAMI_EDITOR_IMAGE_CPU", "gpu-shards-editor-cpu:latest")
    )
    editor_image_gpu: str = field(
        default_factory=lambda: os.environ.get("HAMI_EDITOR_IMAGE_GPU", "gpu-shards-editor-gpu:latest")
    )


settings = Settings()
