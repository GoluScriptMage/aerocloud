# ☁️ AeroCloud

> **A minimalist, terminal-first developer Platform-as-a-Service (PaaS) engine designed to sandbox, build, route, and orchestrate web services with zero configuration.**

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D24.0.0-brightgreen.svg)](https://nodejs.org/)
[![Go Port Scanner](https://img.shields.io/badge/go-%3E%3D1.22-00ADD8.svg)](https://golang.org/)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](LICENSE)
[![Architecture: Multi--Tenant](https://img.shields.io/badge/Architecture-Multi--Tenant-blueviolet.svg)](#-architecture--internals)

---

## 🏛️ What is AeroCloud?

AeroCloud is a self-hosted, lightweight PaaS orchestrator (akin to an open-source, local-first Vercel or Railway). It allows developers to deploy full-stack applications directly from their terminal or via Git pushes without writing complex Kubernetes configurations, configuring reverse proxy tables manually, or dealing with container networking headaches.

```text
                                 AEROCLOUD PIPELINE
                                 
  $ aerocloud deploy
          │
          ├──► 1. Smart Stream Archive (.zip generated excluding build artifacts)
          ├──► 2. SHA-256 Auth & Rate Limit Validation
          ├──► 3. Native Dockerfile Detection / Generation
          ├──► 4. Linux cgroups Sandboxing (512MB RAM / 1 CPU limit)
          ├──► 5. O(log N) Port Scan Allocation via Embedded Go Binary
          ├──► 6. Real-time Chunked Build Log Streaming (SSE)
          └──► 7. Live Subdomain Reverse Proxying (:8080)
```

---

## ✨ Engineering Highlights

* 🚀 **Zero-Config Terminal Deployments:** Run `aerocloud deploy` inside any Node.js/TypeScript project; AeroCloud bundles the repository, prepares build contexts, and provisions isolated containers automatically.
* 🛡️ **Zero-Trust Security & Hardened Vault:**
  * **Timing-Attack Immune:** Constant-time bitwise XOR comparison (`crypto.timingSafeEqual`) for all API keys and bearer tokens.
  * **DNS & Path Traversal Guard:** RFC-1123 DNS regex sanitization stops path traversal and Docker container name hijacking at ingress.
  * **Zip-Bomb & Zip-Slip Defense:** Pre-extraction memory ceilings (25MB) and directory boundary verification prior to uncompressing archives.
  * **Multi-Tier Rate Limiting:** Global sliding-window limiter (100 reqs/15m) + strict deploy rate limiter (5 deploys/15m).
  * **Hybrid IP & User Blacklist:** SQLite-persisted blocklist cached in $O(1)$ in-memory lookup sets.
* ⚡ **High-Performance Port Allocation Engine:** Low-level Go binary (`goportscan`) embedded directly into Node.js via child process pipes, resolving machine-global ports in $O(\log N)$ time to eliminate race conditions.
* 🐳 **Linux cgroups Resource Sandboxing:** Hard runtime quotas enforced on every container (`Memory: 512MB`, `MemorySwap: 1GB`, `NanoCpus: 1.0 CPU`) to prevent noisy neighbor memory exhaustion or rogue crypto-mining.
* 🌐 **Dynamic Subdomain Host Routing:** Integrated reverse proxy on port `8080` dynamically resolves `http://<subdomain>.localhost:8080` by inspecting `Host` headers and mapping traffic to active container sockets.
* 📡 **Real-time Chunked Build Streaming:** Dockerode build tar streams are multiplexed and streamed line-by-line over chunked HTTP to the CLI with ANSI color formatting.

---

## 🏗️ Architecture & Internals

AeroCloud is structured as a modular, three-tier microservice architecture:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                              AEROCLOUD SYSTEM MAP                           │
└─────────────────────────────────────────────────────────────────────────────┘

 [ Terminal Client ] 
        │
        │  POST /deploy (Bearer Token + Multipart ZIP)
        ▼
 ┌───────────────────────────────────────────────────────────────────────────┐
 │  AEROCLOUD SERVER (:3000)                                                 │
 │                                                                           │
 │  [ Ingress Guards ]                                                       │
 │  ├── 1. IP & User Blacklist Guard (In-Memory Set + SQLite)                │
 │  ├── 2. Rate Limiting Middleware (Global & Deploy limits)                 │
 │  └── 3. Constant-Time Auth Middleware (SHA-256 API Key Hash)              │
 │                                                                           │
 │  [ Orchestration Engine ]                                                 │
 │  ├── 4. Archive Auditor (Zip-Slip & 25MB/100MB Decompression limits)      │
 │  ├── 5. Dockerfile Synthesizer (Multi-stage production build templates)    │
 │  ├── 6. Port Allocator (Embedded Go Port Scanner)                         │
 │  └── 7. Container Lifecycle Manager (cgroups 512MB/1CPU enforcement)      │
 └─────────────────┬───────────────────────────────────────┬─────────────────┘
                   │                                       │
                   ▼ (Metadata State)                      ▼ (Docker Socket)
        ┌──────────────────────┐               ┌──────────────────────┐
        │      SQLite DB       │               │    Docker Engine     │
        │  (Users/Deployments) │               │ (Isolated Containers)│
        └──────────┬───────────┘               └──────────┬───────────┘
                   │                                       │
                   └───────────────────┬───────────────────┘
                                       │
                                       ▼ (Proxy Map Query)
 ┌───────────────────────────────────────────────────────────────────────────┐
 │  AEROCLOUD PROXY GATEWAY (:8080)                                          │
 │  Inspects `Host: <subdomain>.localhost:8080` ──► Proxies to Container     │
 └───────────────────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Tech Stack & Directory Structure

```text
aerocloud/
├── cli/                 # Developer Terminal CLI (Commander, Prompts, Archiver)
├── server/              # Central PaaS Orchestrator (Express, Dockerode, SQLite)
│   ├── src/config/      # SQLite schemas, Docker socket binding
│   ├── src/routes/      # Auth, Deploy, Lifecycle (stop, destroy, logs)
│   └── src/utils/       # Security guards, Go port scanner wrapper, Rate limiters
├── proxy/               # Subdomain HTTP Reverse Proxy (:8080)
└── .github/             # GitHub actions & workflows
```

| Component | Language / Runtime | Core Libraries |
| :--- | :--- | :--- |
| **CLI** | TypeScript (Node v24+) | `commander`, `prompts`, `archiver`, `chalk` |
| **Server** | TypeScript (Node v24+) | `express`, `dockerode`, `better-sqlite3`, `multer`, `adm-zip`, `tar` |
| **Port Engine** | Go 1.22+ | Native Go `net` sockets + binary search |
| **Proxy** | TypeScript (Node v24+) | `http-proxy`, native `node:sqlite` |

---

## 🚀 Getting Started

### Prerequisites
* **Node.js** $\ge \text{v24.0.0}$
* **Docker Desktop** / Docker Engine running locally
* **Git**

### 1. Installation

Clone the repository and install dependencies across all three modules:

```bash
git clone https://github.com/GoluScriptMage/aerocloud.git
cd aerocloud

# Install CLI dependencies
cd cli && npm install

# Install Server dependencies
cd ../server && npm install

# Install Proxy dependencies
cd ../proxy && npm install
```

---

### 2. Environment Setup

Create `.env` inside `server/`:

```env
PORT=3000
GITHUB_CLIENT_ID=your_github_oauth_client_id
GITHUB_CLIENT_SECRET=your_github_oauth_client_secret
GITHUB_REDIRECT_URI=http://localhost:3000/auth/github/callback
```

---

### 3. Running AeroCloud Locally

AeroCloud runs via three lightweight terminal processes:

#### Terminal 1: Orchestration Server (:3000)
```bash
cd server
npm run dev
# 🚀 AeroCloud Server running on port 3000
```

#### Terminal 2: Subdomain Reverse Proxy (:8080)
```bash
cd proxy
npm run dev
# 🚀 AeroCloud Proxy Server listening on PORT: 8080
```

#### Terminal 3: Developer CLI
Authenticate your CLI and deploy any application:

```bash
# 1. Login with GitHub OAuth
npx tsx /path/to/aerocloud/cli/src/index.ts auth

# 2. Navigate to your app
cd /path/to/your-app

# 3. Initialize config
npx tsx /path/to/aerocloud/cli/src/index.ts init

# 4. Deploy!
npx tsx /path/to/aerocloud/cli/src/index.ts deploy
```

---

## 💻 CLI Commands Reference

| Command | Usage | Description |
| :--- | :--- | :--- |
| `aerocloud auth` | `aerocloud auth` | Initiates local HTTP loopback and logs in via GitHub OAuth. |
| `aerocloud init` | `aerocloud init` | Generates a clean `aerocloud.json` project configuration file. |
| `aerocloud deploy`| `aerocloud deploy`| Bundles, streams, builds, and launches container deployment. |
| `aerocloud list` | `aerocloud list` | Lists all active deployments with RAM usage, port bindings, and uptime. |
| `aerocloud logs` | `aerocloud logs <name>` | Streams live stdout/stderr logs from the running container. |
| `aerocloud stop` | `aerocloud stop <name>` | Gracefully stops the container without deleting database records. |
| `aerocloud destroy`| `aerocloud destroy <name>` | Shuts down container, deletes images, and purges deployment records. |

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

* `name`: Custom subdomain assigned on deployment (`http://my-portfolio.localhost:8080`).
* `publish`: Target build directory to bundle (e.g. `.` or `dist`).
* `buildCommand`: Pre-deploy build command executed before bundling.

---

## 🛡️ Security Policy

AeroCloud is engineered with defense-in-depth principles:
* All database queries utilize **parameterized prepared statements** preventing SQL injection.
* File uploads enforce **25MB memory ceilings** and recursive path boundary validation to prevent Zip-Slip directory escape.
* Container runtime privileges enforce **cgroups memory/CPU caps** to prevent resource exhaustion.
* Subdomains must strictly match RFC-1123 DNS naming conventions (`/^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$/`).

To report a vulnerability or security flaw, please open a private security advisory on GitHub.

---

## 📄 License

Distributed under the **ISC License**. See `LICENSE` for more information.

---

*Crafted from first principles by Chitranshu (Golu) Dhakad.*