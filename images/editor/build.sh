#!/usr/bin/env bash
# Build the editor runtime images used by /api/editor/runs.
#
# Usage:
#   bash images/editor/build.sh [cpu|gpu|both]
#
# Defaults to "both". The CPU image is small; the GPU image is large (~6GB)
# and only needed if you'll use the GPU toggle in the editor UI.

set -euo pipefail

target="${1:-both}"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

build_cpu() {
  echo ">> building gpu-shards-editor-cpu:latest"
  docker build -t gpu-shards-editor-cpu:latest -f "$script_dir/Dockerfile.cpu" "$script_dir"
}

build_gpu() {
  echo ">> building gpu-shards-editor-gpu:latest"
  docker build -t gpu-shards-editor-gpu:latest -f "$script_dir/Dockerfile.gpu" "$script_dir"
}

case "$target" in
  cpu)  build_cpu ;;
  gpu)  build_gpu ;;
  both) build_cpu; build_gpu ;;
  *)    echo "usage: $0 [cpu|gpu|both]" >&2; exit 2 ;;
esac

echo "done."
