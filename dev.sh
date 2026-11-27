#!/usr/bin/env bash
set -e

CYAN='\033[1;36m'
GREEN='\033[1;32m'
YELLOW='\033[1;33m'
RED='\033[1;31m'
NC='\033[0m'

log_sys()  { echo -e "${CYAN}[Dev.sh]${NC} $1"; }
log_ok()   { echo -e "${GREEN}[Dev.sh]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[Dev.sh]${NC} $1"; }
log_err()  { echo -e "${RED}[Dev.sh]${NC} $1"; }

kill_port() {
    local port=$1
    local pids
    pids=$(lsof -ti :"$port" 2>/dev/null || true)
    if [[ -n "$pids" ]]; then
        log_warn "Port :$port already in use — cleaning up old process..."
        echo "$pids" | xargs kill -9 2>/dev/null || true
    fi
}

# Array to store PIDs of background processes
PIDS=()
cleanup() {
    echo ""
    log_warn "Shutting down AeroCloud Services..."
    for pid in "${PIDS[@]}"; do
        kill "$pid" 2>/dev/null || true
    done
    rm -f /tmp/aerocloud.sock
    log_ok "All services stopped cleanly."
}
trap cleanup EXIT INT TERM

# 1. Docker Guard
if ! docker info >/dev/null 2>&1; then
    log_warn "Docker is not running. Starting Docker Desktop..."
    open -a Docker
    for i in {1..20}; do
        if docker info >/dev/null 2>&1; then
            log_ok "Docker is running."
            break
        fi
        sleep 2
    done
    if ! docker info >/dev/null 2>&1; then
        log_err "Docker failed to start. Exiting..."
        exit 1
    fi
fi

log_sys "Starting AeroCloud Services..."

# Clean up any orphan daemon/proxy from a previous unclean exit
pkill -f "/tmp/aerocloud-daemon" 2>/dev/null || true
pkill -f "/tmp/aerocloud-proxy" 2>/dev/null || true
rm -f /tmp/aerocloud.sock
kill_port 8080
kill_port 8081

# 2. Build & Start Go Port Daemon
log_sys "Building and starting Go Daemon..."
(cd daemon && go build -o /tmp/aerocloud-daemon .)
/tmp/aerocloud-daemon &
PIDS+=($!)
while [ ! -S /tmp/aerocloud.sock ]; do sleep 0.3; done
log_ok "Go Daemon ready (/tmp/aerocloud.sock)."

# 3. Build & Start Go Reverse Proxy
log_sys "Building and starting Proxy Server..."
(cd proxy && go build -o /tmp/aerocloud-proxy .)
(cd proxy && exec /tmp/aerocloud-proxy) &
PIDS+=($!)
sleep 1
log_ok "Proxy Server ready (:8080 / :8081)."

# 4. Optional Live Cloudflare Tunnel
if [[ "$1" == "--tunnel" || "$1" == "--live" ]]; then
    log_sys "Starting Live Cloudflare Tunnel (aerohost)..."
    cloudflared tunnel run aerohost &
    PIDS+=($!)
fi

# 5. Start Control Plane in foreground
log_sys "Starting AeroCloud Control Plane..."
cd server && npm run dev
