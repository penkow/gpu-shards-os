import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

function buildScript(installUrl: string): string {
  return `#!/usr/bin/env bash
#
# GPU Shards OS — one-line installer
#
# Usage:
#   curl -fsSL ${installUrl}/install.sh | bash
#
# Target: Ubuntu 22.04+ with an NVIDIA GPU.
# Installs: Docker, NVIDIA Container Toolkit, Python 3.10+, Node.js 20,
# project source, Python venv, frontend dependencies. Builds the HAMi
# libvgpu image and prints how to launch the backend + frontend.
#
set -euo pipefail

INSTALL_URL="\${INSTALL_URL:-${installUrl}}"
INSTALL_DIR="\${INSTALL_DIR:-$HOME/gpu-shards-os}"
NODE_MAJOR="\${NODE_MAJOR:-20}"
SKIP_BUILD="\${SKIP_BUILD:-0}"

C_RESET=$'\\033[0m'; C_BOLD=$'\\033[1m'; C_DIM=$'\\033[2m'
C_RED=$'\\033[31m'; C_GREEN=$'\\033[32m'; C_YELLOW=$'\\033[33m'; C_CYAN=$'\\033[36m'

log()  { printf '%s==>%s %s\\n' "$C_CYAN" "$C_RESET" "$*"; }
ok()   { printf '%s ✓%s %s\\n' "$C_GREEN" "$C_RESET" "$*"; }
warn() { printf '%s ! %s %s\\n' "$C_YELLOW" "$C_RESET" "$*"; }
die()  { printf '%s ✗ %s %s\\n' "$C_RED" "$C_RESET" "$*" >&2; exit 1; }

need_root() {
  if [ "$(id -u)" -eq 0 ]; then SUDO=""; return; fi
  if command -v sudo >/dev/null 2>&1; then SUDO="sudo"; return; fi
  die "this installer needs root or sudo"
}

require_ubuntu() {
  if [ ! -r /etc/os-release ]; then die "cannot detect OS — /etc/os-release missing"; fi
  . /etc/os-release
  case "\${ID:-}" in
    ubuntu|debian) ok "detected $PRETTY_NAME";;
    *) warn "untested OS ($ID) — proceeding anyway";;
  esac
}

# ---- Docker ---------------------------------------------------------------
install_docker() {
  if command -v docker >/dev/null 2>&1; then
    ok "docker already installed ($(docker --version))"
    return
  fi
  log "installing Docker Engine"
  $SUDO install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | $SUDO gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  $SUDO chmod a+r /etc/apt/keyrings/docker.gpg
  ARCH="$(dpkg --print-architecture)"
  CODENAME="$(. /etc/os-release && echo \${VERSION_CODENAME})"
  echo "deb [arch=$ARCH signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $CODENAME stable" \\
    | $SUDO tee /etc/apt/sources.list.d/docker.list >/dev/null
  $SUDO apt-get update -y
  $SUDO apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  $SUDO systemctl enable --now docker
  if [ -n "\${SUDO_USER:-$USER}" ] && [ "\${SUDO_USER:-$USER}" != "root" ]; then
    $SUDO usermod -aG docker "\${SUDO_USER:-$USER}" || true
    warn "you may need to log out/in for the docker group to take effect"
  fi
  ok "docker installed"
}

# ---- NVIDIA Container Toolkit --------------------------------------------
install_nvidia_toolkit() {
  if ! command -v nvidia-smi >/dev/null 2>&1; then
    warn "nvidia-smi not found on host — install the NVIDIA driver before running GPU containers"
  fi
  if [ -f /etc/docker/daemon.json ] && grep -q "nvidia" /etc/docker/daemon.json 2>/dev/null; then
    ok "nvidia container runtime already configured"
    return
  fi
  log "installing NVIDIA Container Toolkit"
  curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \\
    | $SUDO gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
  curl -fsSL https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \\
    | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \\
    | $SUDO tee /etc/apt/sources.list.d/nvidia-container-toolkit.list >/dev/null
  $SUDO apt-get update -y
  $SUDO apt-get install -y nvidia-container-toolkit
  $SUDO nvidia-ctk runtime configure --runtime=docker
  $SUDO systemctl restart docker
  ok "nvidia-container-toolkit installed"
}

# ---- system packages, Python, Node ---------------------------------------
install_base_packages() {
  log "installing base packages"
  $SUDO apt-get update -y
  $SUDO apt-get install -y --no-install-recommends \\
    ca-certificates curl gnupg lsb-release tar git \\
    python3 python3-venv python3-pip
  ok "base packages installed"
}

install_node() {
  if command -v node >/dev/null 2>&1; then
    local v
    v="$(node -v 2>/dev/null | sed 's/^v//;s/\\..*//')"
    if [ "$v" -ge "$NODE_MAJOR" ] 2>/dev/null; then
      ok "node already installed ($(node -v))"
      return
    fi
  fi
  log "installing Node.js $NODE_MAJOR"
  curl -fsSL "https://deb.nodesource.com/setup_\${NODE_MAJOR}.x" | $SUDO -E bash -
  $SUDO apt-get install -y nodejs
  ok "node installed ($(node -v))"
}

# ---- fetch source --------------------------------------------------------
fetch_source() {
  log "downloading project source from $INSTALL_URL/source.tar.gz"
  if [ -d "$INSTALL_DIR" ] && [ -n "$(ls -A "$INSTALL_DIR" 2>/dev/null || true)" ]; then
    warn "$INSTALL_DIR already exists — refreshing in place"
  fi
  mkdir -p "$INSTALL_DIR"
  curl -fsSL "$INSTALL_URL/source.tar.gz" | tar -xz -C "$INSTALL_DIR"
  ok "source unpacked at $INSTALL_DIR"
}

# ---- Python deps ---------------------------------------------------------
setup_python() {
  log "creating Python virtualenv"
  python3 -m venv "$INSTALL_DIR/.venv"
  # shellcheck disable=SC1091
  source "$INSTALL_DIR/.venv/bin/activate"
  pip install --upgrade pip wheel >/dev/null
  pip install -r "$INSTALL_DIR/requirements.txt"
  deactivate
  ok "python deps installed"
}

# ---- frontend deps -------------------------------------------------------
setup_frontend() {
  log "installing frontend dependencies"
  (cd "$INSTALL_DIR/frontend" && npm install --no-audit --no-fund)
  if [ "$SKIP_BUILD" = "0" ]; then
    log "building frontend (production bundle)"
    (cd "$INSTALL_DIR/frontend" && npm run build) || warn "frontend build failed — \`npm run dev\` still works"
  fi
  ok "frontend ready"
}

# ---- HAMi libvgpu image --------------------------------------------------
build_hami_image() {
  if [ "$SKIP_BUILD" = "1" ]; then
    warn "SKIP_BUILD=1 — not building hami-core-demo image"
    return
  fi
  log "building hami-core-demo:latest (this can take a few minutes)"
  if (cd "$INSTALL_DIR" && $SUDO docker build -t hami-core-demo:latest -f Dockerfile .); then
    ok "hami-core-demo:latest built"
  else
    warn "docker build failed — re-run later with: cd $INSTALL_DIR && docker build -t hami-core-demo:latest -f Dockerfile ."
  fi
}

# ---- run -----------------------------------------------------------------
main() {
  need_root
  require_ubuntu
  install_base_packages
  install_docker
  install_nvidia_toolkit
  install_node
  fetch_source
  setup_python
  setup_frontend
  build_hami_image

  cat <<EOF

$C_BOLD$C_GREEN✓ GPU Shards OS installed at $INSTALL_DIR$C_RESET

$C_BOLD Start the stack:$C_RESET
    cd $INSTALL_DIR
    source .venv/bin/activate
    ./run.sh

  Then open: $C_CYAN http://localhost:3000 $C_RESET

$C_DIM Backend listens on :8000, frontend on :3000.
 Configure with HAMI_BACKEND_PORT, HAMI_API_KEY, DOCKER_HOST, etc.$C_RESET
EOF
}

main "$@"
`
}

function originFromRequest(req: NextRequest): string {
  const envUrl = process.env.HAMI_PUBLIC_URL
  if (envUrl) return envUrl.replace(/\/$/, '')

  const forwardedProto = req.headers.get('x-forwarded-proto')
  const forwardedHost = req.headers.get('x-forwarded-host')
  const host = forwardedHost || req.headers.get('host') || 'localhost:3000'
  const proto =
    forwardedProto ||
    (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https')
  return `${proto}://${host}`
}

export async function GET(req: NextRequest) {
  const script = buildScript(originFromRequest(req))
  return new Response(script, {
    status: 200,
    headers: {
      'Content-Type': 'text/x-shellscript; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}
