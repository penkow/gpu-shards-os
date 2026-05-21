# ---- Stage 1: build libvgpu.so from HAMi-core ----
FROM nvidia/cuda:12.6.3-devel-ubuntu22.04 AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
        git cmake make gcc g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN git clone --depth 1 https://github.com/Project-HAMi/HAMi-core /src
WORKDIR /src
RUN make

# ---- Stage 2: runtime image with nvidia-smi ----
FROM nvidia/cuda:12.6.3-base-ubuntu22.04

COPY --from=builder /src/build/libvgpu.so /libvgpu/build/libvgpu.so

# Sanity: confirm the lib is present at expected path
RUN test -f /libvgpu/build/libvgpu.so

CMD ["nvidia-smi"]
