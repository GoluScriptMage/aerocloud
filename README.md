# ☁️ AeroCloud

> **A terminal-first, self-hosted Platform-as-a-Service (PaaS) orchestrator designed to sandbox, build, and route containerized web workloads on bare-metal infrastructure with zero cloud vendor lock-in.**

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D24.0.0-brightgreen.svg)](https://nodejs.org/)
[![Go Version](https://img.shields.io/badge/go-%3E%3D1.22-00ADD8.svg)](https://golang.org/)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](LICENSE)
[![Architecture: Control + Data Plane](https://img.shields.io/badge/Architecture-Control%20%2B%20Data%20Plane-blueviolet.svg)](#-architecture--internals)

---

## 🏛️ What is AeroCloud?

AeroCloud is a self-hosted, CLI-driven PaaS (a local-first alternative to Vercel/Render). It lets developers deploy applications directly from their terminal or via GitHub push webhooks—automating Docker builds, port leasing, container sandboxing, and subdomain reverse proxying without Kubernetes or manual proxy configs.

```text
                                 AEROCLOUD PIPELINE

  $ aerocloud deploy
          │
          ├──► 1. Smart Archive Bundle (.zip excluding node_modules/.git)
          ├──► 2. SHA-256 Auth, Rate Limiter & Zip-Slip / Size Guards
          ├──► 3. O(1) Port Lease via Go Micro-Daemon (/tmp/aerocloud.sock)
          ├──► 4. Dockerfile Detection & Real-Time Chunked Build Logs
          ├──► 5. Sandboxed Container Launch (aerocloud-net, ReadonlyRootfs, cgroups)
          ├──► 6. 1.5s Boot Liveness Check + Automatic Rollback on Failure
          └──► 7. Dynamic Go Reverse Proxy (:8080) & Optional HTTPS Tunnel (*.aerohost.tech)
```

---

## ✨ Engineering Highlights

* 🚀 **Terminal-First & Git-Push Deploys:** Deploy directly via `aerocloud deploy` or link a GitHub repo (`aerocloud link`) for HMAC-SHA256 verified webhook auto-deploys with zero-downtime container swaps.
* ⚡ **O(1) Unix-Socket Port Allocator (`daemon/`):** Background Go micro-daemon listening on `/tmp/aerocloud.sock` using a thread-safe 64-bit bitset (`[1000]uint64`) to lease and release container ports in $<0.1\text{ms}$ without SQLite lock contention.
* 🌐 **High-Throughput Go Reverse Proxy (`proxy/`):** Dual-server Go proxy (`:8080` data plane, `:8081` admin API `POST/DELETE /routes`) backed by an in-memory `sync.RWMutex` routing table hydrated from SQLite on boot.
* 🐳 **Sovereign Container Sandboxing:** Enforces dedicated `aerocloud-net` bridge isolation, `ReadonlyRootfs`, ephemeral `tmpfs` (`/tmp`), and Linux cgroups caps (`512MB RAM`, `1.0 CPU`).
* 🔐 **Zero-Trust Security & Secret Vault:**
  * **Encrypted Env Vars:** Environment secrets encrypted at rest using **AES-256-GCM AEAD**.
  * **Constant-Time Auth:** `crypto.timingSafeEqual` for API key / bearer verification + GitHub OAuth.
  * **Ingress Guards:** RFC-1123 subdomain sanitization, 25MB/100MB Zip-Bomb & Zip-Slip checks, IP/user blocklists, and multi-tier rate limiting.
* 🩺 **Preflight & Self-Healing Rollbacks:** Server startup verifies Docker daemon, Unix socket, and Proxy `:8081` readiness; failed builds or boot crashes automatically release leased ports, delete stale DB/directory state, and purge proxy routes.

---

## 📊 Reverse Proxy Benchmarks (Autocannon)

Load-tested at **10,000 requests** and **100 concurrent connections** comparing the legacy SQLite-backed Node.js proxy against the in-memory Go Reverse Proxy:

| Metric | Legacy Node/SQLite Proxy | Go Reverse Proxy (`proxy/`) | Improvement |
| :--- | :--- | :--- | :--- |
| **Average Latency** | `4.21 ms` | `2.01 ms` | **-52.2%** |
| **Median Latency (p50)** | `4.00 ms` | `1.00 ms` | **-75.0%** |
| **Max / Tail Latency** | `222.00 ms` | `31.00 ms` | **-86.0%** |
| **Latency StdDev** | `9.11 ms` | `3.47 ms` | **-61.9%** |

---

## 🏗️ Architecture & Internals

```text
[Internet / Browser] ──HTTPS──▶ [Cloudflare Edge] ──(Tunnel)──▶ [cloudflared (--tunnel)]
                                                                         │
[Local Client] ────────HTTP────────────────────────────────────▶ [Go Proxy :8080]
                                                                         ▲
[Go Port Daemon (/tmp/aerocloud.sock)] ◀─IPC─ [Node Server :3000] ───────┴── (:8081 Admin)
                                                     │
                                              [Docker Engine] ──▶ [Sandboxed Containers]
```

---

## 🛠️ Tech Stack & Directory Structure

```text
aerocloud/
├── dev.sh               # Single-command orchestrator (Docker guard, orphan cleanup, --tunnel)
├── cli/                 # Developer Terminal CLI (Commander, Prompts, Archiver)
├── server/              # TypeScript Control Plane (:3000) (Express, Dockerode, SQLite WAL)
│   ├── src/config/      # SQLite schemas, Docker socket binding
│   ├── src/routes/      # Auth, Deploy, Webhook CD, Lifecycle (stop, destroy, logs)
│   └── src/utils/       # DeployEngine, Daemon IPC client, Security guards, Rate limiters
├── daemon/              # Go Port Allocator Micro-Daemon (/tmp/aerocloud.sock)
└── proxy/               # Go Reverse Proxy (:8080 Data Plane, :8081 Admin API)
```

| Component | Language / Runtime | Core Tech |
| :--- | :--- | :--- |
| **CLI** | TypeScript (Node v24+) | `commander`, `prompts`, `archiver`, `chalk` |
| **Control Plane** | TypeScript (Node v24+) | `express`, `dockerode`, `better-sqlite3` (WAL), `tar`, `multer` |
| **Port Daemon** | Go 1.22+ | Unix Domain Sockets (`/tmp/aerocloud.sock`), 64-bit Bitset Allocator |
| **Reverse Proxy** | Go 1.22+ | `net/http/httputil`, `sync.RWMutex`, `go-sqlite3` |

---

## 🚀 Getting Started

### Prerequisites
* **Node.js** $\ge \text{v24.0.0}$ & **Go** $\ge \text{1.22}$
* **Docker Desktop** / Docker Engine
* **Cloudflared** *(optional, for live `*.aerohost.tech` HTTPS tunneling)*

### 1. Installation & Environment Setup
```bash
git clone https://github.com/GoluScriptMage/aerocloud.git
cd aerocloud

(cd cli && npm install)
(cd server && npm install)
```

Create `server/.env`:
```env
SERVER_PORT=3000
GITHUB_CLIENT_ID=your_github_oauth_client_id
GITHUB_CLIENT_SECRET=your_github_oauth_client_secret
GITHUB_REDIRECT_URI=http://localhost:3000/auth/github/callback
WEBHOOK_SECRET=your_webhook_secret
```

### 2. Single-Command Launch (`dev.sh`)
Start Docker (auto-launches on macOS if closed), Go Port Daemon, Go Reverse Proxy, and the Control Plane in one command:

```bash
# Local mode (*.localhost:8080)
./dev.sh

# Live HTTPS mode via Cloudflare Tunnel (*.aerohost.tech)
./dev.sh --tunnel
```

*(Press `Ctrl+C` to gracefully stop all background Go processes and clean `/tmp/aerocloud.sock`.)*

---

## 💻 CLI Commands Reference

| Command | Usage | Description |
| :--- | :--- | :--- |
| `aerocloud auth` | `aerocloud auth` | Authenticates CLI via local HTTP loopback GitHub OAuth. |
| `aerocloud init` | `aerocloud init` | Generates an `aerocloud.json` project configuration file. |
| `aerocloud deploy` | `aerocloud deploy` | Bundles, streams build logs, sandboxes, and routes the container. |
| `aerocloud link` | `aerocloud link` | Interactive GitHub repo selector for webhook auto-deploys. |
| `aerocloud list` | `aerocloud list` | Lists active deployments with RAM usage, ports, and status. |
| `aerocloud logs` | `aerocloud logs <name>` | Streams live stdout/stderr logs (`-f` to follow). |
| `aerocloud stop` | `aerocloud stop <name>` | Gracefully stops the container and releases its leased port. |
| `aerocloud destroy` | `aerocloud destroy <name>` | Removes container, image, proxy route, and DB record. |

---

## ⚙️ Configuration (`aerocloud.json`)

```json
{
  "name": "my-portfolio",
  "publish": ".",
  "buildCommand": "npm run build",
  "branch": "main"
}
```

---

## 🛡️ Security Policy

* Parameterized SQLite prepared statements across all queries.
* AES-256-GCM encryption for stored environment variables and OAuth tokens.
* 25MB upload / 100MB decompression ceilings with Zip-Slip path boundary checks.
* Hard container cgroups limits (`512MB RAM`, `1 CPU`), `ReadonlyRootfs`, and `aerocloud-net` isolation.
* RFC-1123 DNS subdomain validation (`/^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$/`).

---

## 📄 License

Distributed under the **ISC License**. See `LICENSE` for more information.

---

*Crafted from first principles by Chitranshu (Golu) Dhakad.*
