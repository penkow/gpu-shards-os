# Backend control plane — FastAPI + docker-py SDK.
#
# The container talks to the host's Docker daemon over the mounted unix socket
# (see docker-compose.yml) and creates editor / endpoint / managed containers
# on it. No docker CLI is needed inside; the SDK speaks to /var/run/docker.sock
# directly.
#
# Build context: project root (we need requirements.txt + backend/).
# syntax=docker/dockerfile:1.6

FROM python:3.11-slim

WORKDIR /app

# tini gives us PID-1 init for clean signal handling. Nothing else is needed
# at runtime — all docker operations go through the mounted socket.
RUN apt-get update \
    && apt-get install -y --no-install-recommends tini \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend ./backend

ENV PYTHONUNBUFFERED=1 \
    HAMI_BACKEND_HOST=0.0.0.0 \
    HAMI_BACKEND_PORT=8000

EXPOSE 8000

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["python", "-m", "backend"]
