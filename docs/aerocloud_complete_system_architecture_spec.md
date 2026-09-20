# 🛸 AeroCloud: Complete Technical Architecture & System Specification

> **Classification:** Authoritative Technical Reference Manual  
> **Source Code:** `/Users/goludhakad/Desktop/aerocloud`  
> **Target Audiences:** Systems Engineers, Infrastructure Architects, AI System Designers  
> **Format:** 100% Factual Systems Specification (Zero Opinion / Complete Implementation Ground Truth)

---

## 📑 TABLE OF CONTENTS
1. [System Topology & Port Allocations](#1-system-topology--port-allocations)
2. [Database Engine & Complete SQLite Schema](#2-database-engine--complete-sqlite-schema)
3. [CLI Client Command Surface & Network Protocols](#3-cli-client-command-surface--network-protocols)
   - `aerocloud auth`
   - `aerocloud init`
   - `aerocloud link`
   - `aerocloud deploy`
   - `aerocloud list`
   - `aerocloud logs`
   - `aerocloud stop`
   - `aerocloud destroy`
4. [GitHub Webhook Ingress & Continuous Deployment Pipeline](#4-github-webhook-ingress--continuous-deployment-pipeline)
5. [Reverse Proxy Gateway Engine (:8080)](#5-reverse-proxy-gateway-engine-8080)
6. [Defense-in-Depth Security & Cryptographic Controls](#6-defense-in-depth-security--cryptographic-controls)
7. [Level 5 Production Evolution Master Matrix](#7-level-5-production-evolution-master-matrix)

---

## 1. SYSTEM TOPOLOGY & PORT ALLOCATIONS

AeroCloud is a distributed, local-first Platform-as-a-Service (PaaS) composed of five distinct interacting processes:

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                    AEROCLOUD TOPOLOGY                                  │
│                                                                                        │
│   [ Developer CLI ] ──(Multipart HTTP/REST)──► [ Orchestrator Server (:3000) ]        │
│                                                        │                               │
│   [ GitHub Webhook ] ──(HMAC-SHA256 Push)──────────────┤                               │
│                                                        ▼                               │
│                                              [ SQLite WAL (aerocloud.db) ]             │
│                                                        │                               │
│                                       ┌────────────────┴───────────────┐               │
│                                       ▼                                ▼               │
│                            [ Go Port Finder Binary ]        [ Docker Daemon Socket ]   │
│                            (O(log N) Stdin Search)          (/var/run/docker.sock)     │
│                                       │                                │               │
│                                       ▼                                ▼               │
│                            Allocates Ephemeral Port        Spawns Container (:3000)    │
│                            (e.g., Host :4001)              cgroups: 512MB RAM          │
│                                       │                                │               │
│                                       └────────────────┬───────────────┘               │
│                                                        ▼                               │
│   [ Browser Client ] ──(Host: sub.localhost:8080)──► [ Reverse Proxy Gateway (:8080) ] │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### Port Matrix
| Port | Process / Service | Protocol | Responsibility |
| :--- | :--- | :--- | :--- |
| **`3000`** | AeroCloud Orchestration Server | HTTP / Express | REST API, CLI ingress, GitHub webhook receiver, deployment lifecycle manager. |
| **`3001`** | CLI Auth Callback Listener | HTTP / Native Node | Ephemeral local loopback listener capturing OAuth callback tokens. |
| **`8080`** | AeroCloud Reverse Proxy | HTTP / `http-proxy` | Dynamic Host-header routing (`<subdomain>.localhost:8080` $\rightarrow$ `localhost:<port>`). |
| **`4000+`** | Ephemeral Container Host Ports | TCP / Docker bridge | Dynamic ports bound to container internal port `3000/tcp`. |
| **`3000/tcp`**| Container Internal Application Port | TCP / Internal | The standard exposed port where deployed user applications listen. |

---

## 2. DATABASE ENGINE & COMPLETE SQLITE SCHEMA

### Database Configuration
- **Engine:** `better-sqlite3` (Server) / `node:sqlite` (Proxy)
- **Path:** `/Users/goludhakad/Desktop/aerocloud/server/aerocloud.db`
- **Concurrency PRAGMAs:**
  ```sql
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  ```

### Complete Schema DDL (`server/src/config/db.ts`)
```sql
CREATE TABLE IF NOT EXISTS users (
    githubId TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    email TEXT NULL,
    apiKeyHash TEXT UNIQUE NULL,
    encryptedAccessToken TEXT NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS projects (
    name TEXT PRIMARY KEY,
    repoFullName TEXT NULL,
    branch TEXT DEFAULT 'main',
    userId TEXT NOT NULL,
    envVars TEXT NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(userId) REFERENCES users(githubId)
);

CREATE TABLE IF NOT EXISTS deployments (
    subdomain TEXT PRIMARY KEY,
    containerId TEXT NULL,
    port INTEGER NULL,
    status TEXT, -- 'deploying' | 'deployed' | 'stopped' | 'failed'
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    envVars TEXT NULL,
    userId TEXT NULL,
    FOREIGN KEY(userId) REFERENCES users(githubId)
);

CREATE TABLE IF NOT EXISTS blocklist (
    type TEXT, -- 'ip' | 'user'
    value TEXT PRIMARY KEY,
    reason TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_projects_userId ON projects(userId);
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_repoFullName ON projects(repoFullName) WHERE repoFullName IS NOT NULL;
```

---

## 3. CLI CLIENT COMMAND SURFACE & NETWORK PROTOCOLS

The CLI is implemented with `commander` in `/Users/goludhakad/Desktop/aerocloud/cli/src/index.ts`.

### Command 1: `aerocloud auth`
* **Purpose:** Authenticate the developer with GitHub and store encrypted credentials.
* **Execution Flow:**
  1. CLI checks `~/.aerocloud/config.json`. If authenticated $< 8$ hours ago, aborts early.
  2. CLI binds an ephemeral local HTTP server to `http://localhost:3001`.
  3. CLI executes system call `open http://localhost:3000/auth/github?port=3001`.
  4. Server initiates GitHub OAuth 2.0 flow:
     - Redirects browser to: `https://github.com/login/oauth/authorize?client_id=...&scope=repo,user:email`
  5. GitHub redirects user back to Server: `GET /auth/github/callback?code=...`
  6. Server exchanges `code` for GitHub `access_token` via `https://github.com/login/oauth/access_token`.
  7. Server encrypts `access_token` using **AES-256-GCM**, generates random 32-byte `apiKey`, computes SHA-256 `apiKeyHash`, and persists record into `users` table:
     ```sql
     INSERT INTO users (githubId, username, email, apiKeyHash, encryptedAccessToken) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(githubId) DO UPDATE SET ...
     ```
  8. Server redirects user's browser to local CLI loopback listener:
     ```http
     GET http://localhost:3001/callback?token=<rawAccessToken>&apiKey=<apiKey>&username=<username>
     ```
  9. CLI loopback server handles `/callback`:
     - Writes token to `~/.aerocloud/config.json`:
       ```json
       {
         "token": "gho_...",
         "username": "octocat",
         "apiKey": "a8f3...",
         "authenciatedAt": 1788431361000
       }
       ```
     - Emits 200 HTML response: `<h1>Authentication successful! You can close this window.</h1>`
     - Gracefully terminates local server (`server.close()`) and exits.

---

### Command 2: `aerocloud init`
* **Purpose:** Generate a local project manifest file `./aerocloud.json`.
* **Behavior:** Checks current working directory. If `./aerocloud.json` does not exist, generates:
  ```json
  {
    "name": "<sanitized-cwd-directory-name>",
    "publish": ".",
    "buildCommand": "npm run build"
  }
  ```

---

### Command 3: `aerocloud link`
* **Purpose:** Interactively bind current local directory to a remote GitHub repository for automatic Continuous Deployment.
* **Execution Flow:**
  1. Reads `apiKey` and `token` from `~/.aerocloud/config.json`.
  2. Runs concurrent API lookups:
     - `GET https://api.github.com/user/repos?sort=pushed&per_page=30` (Headers: `Authorization: token <token>`)
     - `GET http://localhost:3000/projects` (Headers: `Authorization: Bearer <apiKey>`)
  3. **Auto-Detection Pass:** Runs `git config --get remote.origin.url`. If origin remote exists:
     - Compares remote `fullName` against `projects` table.
     - If matched, prompts user: `Detected Git remote owner/repo. Link to this repository? (Y/n)`.
  4. If manual selection required: Renders interactive `prompts` autocomplete menu. Disables already-linked repositories.
  5. Updates local `./aerocloud.json`:
     ```json
     {
       "name": "my-app",
       "repo": "owner/my-app",
       "branch": "main"
     }
     ```
  6. Sends sync request to Server:
     - **Request:**
       ```http
       POST http://localhost:3000/projects/link
       Authorization: Bearer <apiKey>
       Content-Type: application/json

       {
         "name": "my-app",
         "repoFullName": "owner/my-app",
         "branch": "main"
       }
       ```
     - **Server Execution:**
       ```sql
       INSERT INTO projects (name, repoFullName, branch, userId) VALUES (?, ?, ?, ?)
       ON CONFLICT(name) DO UPDATE SET repoFullName = excluded.repoFullName, branch = excluded.branch;
       ```
     - **Response:** `200 OK` `{"message": "Project linked successfully"}`

---

### Command 4: `aerocloud deploy`
* **Purpose:** Package local workspace, build Docker container, pre-allocate host port, and deploy live on `:8080`.
* **Execution Flow & Wire Contract:**
  1. CLI calls `createArchive()`: Packages current directory into a `.zip` buffer, excluding `node_modules`, `.git`, `.aerocloud`, `.env`.
  2. Reads/creates subdomain `name` from `./aerocloud.json` (or generates random `app-xxxxxx`).
  3. Validates subdomain against regex: `^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$`.
  4. Reads `.env` file if present.
  5. Constructs `multipart/form-data` payload:
     - Field `file`: Zip binary blob.
     - Field `name`: Subdomain string.
     - Field `envVars`: Raw `.env` content string.
  6. **Network Request:**
     ```http
     POST http://localhost:3000/deploy
     Authorization: Bearer <apiKey>
     Content-Type: multipart/form-data; boundary=----WebKitFormBoundary...
     ```
  7. **Server Processing (`server/src/routes/deploy.ts`):**
     - Executes `deployRateLimiter` middleware (max 10 deploys per window).
     - Validates authentication token via `authenticateUser` middleware.
     - Runs `checkZipForSecurity()` (Zip Slip verification: rejects paths escaping extraction boundary or unpacked size $> 100\text{MB}$).
     - Extracts zip archive into `/deployments/<subdomain>`.
     - Detects or generates `Dockerfile` via `ensureDockerFile()` (Node.js LTS template with package caching).
     - Creates uncompressed tar stream in-memory (`tar.c`), omitting `node_modules`.
     - Invokes Go port scanner: `findAvailablePort()`.
     - Persists database record with status `'deploying'`:
       ```sql
       INSERT INTO deployments (subdomain, port, status, envVars, userId) VALUES (?, ?, 'deploying', ?, ?)
       ```
     - Initiates chunked streaming response to CLI:
       ```http
       HTTP/1.1 200 OK
       Content-Type: text/plain; charset=utf-8
       Transfer-Encoding: chunked
       ```
     - Calls Dockerode `docker.buildImage(tarStream, { t: 'aerocloud/<subdomain>:latest' })`.
     - Multiplexes Docker daemon build log stream into line-delimited JSON chunks:
       ```json
       {"type": "docker_build_output", "message": "Step 1/5 : FROM node:18-alpine\n"}
       {"type": "docker_build_output", "message": " ---> using cache\n"}
       ```
     - Instantiates container:
       ```javascript
       docker.createContainer({
         Image: "aerocloud/<subdomain>:latest",
         name: "<subdomain>-<randomHex>",
         Env: ["PORT=3000", ...parsedEnv],
         ExposedPorts: { "3000/tcp": {} },
         HostConfig: {
           Memory: 512 * 1024 * 1024,      // 512MB RAM Hard Ceiling
           MemorySwap: 1024 * 1024 * 1024, // 1GB Memory + Disk Swap
           NanoCpus: 1000000000,          // 1 CPU Core
           PortBindings: { "3000/tcp": [{ HostPort: dockerPort.toString() }] }
         }
       });
       ```
     - Starts container: `await container.start()`.
     - **1.5-Second Boot Liveness Latch:**
       - Executes `setTimeout(1500)`.
       - Calls `await container.inspect()`.
       - If `!inspectData.State.Running`:
         - Extracts container crash logs (`container.logs({ tail: 100 })`).
         - Invokes `rollbackDeployment(targetDir, subDomain, userId)` (deletes container, disk folder, and database record).
         - Streams failure frame:
           ```json
           {"type": "result", "status": "failed", "message": "Container crashed after starting. Exit code: 1. Logs: ..."}
           ```
       - If `inspectData.State.Running`:
         - Updates SQLite record to status `'deployed'`:
           ```sql
           UPDATE deployments SET containerId = ?, status = 'deployed', port = ? WHERE subdomain = ?
           ```
         - Streams final success frame:
           ```json
           {"type": "result", "status": "success", "subDomain": "my-app", "imageName": "aerocloud/my-app:latest"}
           ```
  8. **CLI Output Rendering:**
     - CLI pipes `docker_build_output` chunks to terminal stdout in real-time.
     - On receiving success frame: prints green URL: `http://<subdomain>.localhost:8080`.

---

### Command 5: `aerocloud list`
* **Purpose:** List all active and past deployments owned by the authenticated user.
* **Request:**
  ```http
  GET http://localhost:3000/list
  Authorization: Bearer <apiKey>
  ```
* **Response:**
  ```json
  [
    {
      "subdomain": "my-app",
      "port": 4001,
      "status": "deployed",
      "createdAt": "2026-09-03T10:00:00.000Z",
      "containerStatus": "running",
      "memoryUsage": "42.5 MB"
    }
  ]
  ```

---

### Command 6: `aerocloud logs <subdomain> [-f|--follow]`
* **Purpose:** Inspect container stdout/stderr.
* **Static Mode (`aerocloud logs <subdomain>`):**
  - **Request:** `GET http://localhost:3000/deployments/:subdomain/logs`
  - **Response:** `200 OK` `{"logs": "[Server] Listening on port 3000\n[Database] Connected\n"}`
* **Follow Mode (`aerocloud logs <subdomain> -f`):**
  - **Request:** `GET http://localhost:3000/deployments/:subdomain/logs?follow=true`
  - **Server Processing:** Attaches Docker log stream via `container.logs({ follow: true, stdout: true, stderr: true })`.
  - **Wire Format:** Chunked raw text stream piped directly to CLI `readline` interface.

---

### Command 7: `aerocloud stop <subdomain>`
* **Purpose:** Gracefully halt a running deployment.
* **Request:** `GET http://localhost:3000/stop/:subdomain` (Headers: `Authorization: Bearer <apiKey>`)
* **Server Action:**
  - Queries `deployments` table for `containerId`.
  - Executes `container.stop({ t: 5 })` (5-second graceful SIGTERM before SIGKILL).
  - Updates database status to `'stopped'`.
* **Response:** `200 OK` `{"message": "Deployment <subdomain> stopped successfully"}`

---

### Command 8: `aerocloud destroy <subdomain>`
* **Purpose:** Comprehensive teardown of deployment resources.
* **Request:** `GET http://localhost:3000/destroy/:subdomain` (Headers: `Authorization: Bearer <apiKey>`)
* **Server Action:**
  1. Stops container if running (`container.stop()`).
  2. Removes container (`container.remove({ force: true })`).
  3. Removes associated Docker image (`docker.getImage('aerocloud/<subdomain>:latest').remove()`).
  4. Deletes directory `/deployments/<subdomain>` recursively from host filesystem.
  5. Executes database purge:
     ```sql
     DELETE FROM deployments WHERE subdomain = ? AND userId = ?;
     ```
* **Response:** `200 OK` `{"message": "Deployment <subdomain> destroyed and purged successfully"}`

---

## 4. GITHUB WEBHOOK INGRESS & CONTINUOUS DEPLOYMENT PIPELINE

### Webhook Specification
* **Endpoints:** `POST /api/webhook/github` and `POST /api/webhooks/github`
* **Ingress Headers Required:**
  - `X-Hub-Signature-256`: `sha256=<64-character-hex-digest>`
  - `X-GitHub-Event`: `push` | `ping`
  - `Content-Type`: `application/json`

### Verification & Processing Lifecycle (`server/src/routes/webhookRoute.ts`)
```text
GitHub Event (Push/Ping)
       │
       ▼
1. Extract Header: `x-hub-signature-256`
       │
       ▼
2. Compute Local HMAC-SHA256 over raw request body:
   HMAC = "sha256=" + crypto.createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex')
       │
       ▼
3. Timing-Safe Constant-Time Verification:
   secureCompare(computedHMAC, signatureHeader) === true?
   ├── [NO]  ──► Emit 401 Unauthorized (`{"error": "Invalid webhook signature"}`)
   └── [YES] ──► Continue
       │
       ▼
4. Event Inspection:
   ├── Event == 'ping' ──► Emit 200 OK (`{"message": "Pong! Verified"}`)
   └── Event == 'push' ──► Query projects table by `repository.full_name`
       │
       ▼
5. Instant 100ms Asynchronous ACK:
   Server emits immediate `200 OK` (`{"success": true, "message": "Deployment triggered"}`)
   (Prevents GitHub 10-second webhook timeout)
       │
       ▼
6. Background Deployment Worker (`deployFromGitTarball`):
   - Decrypts GitHub Access Token using AES-256-GCM.
   - Fetches tarball: `GET https://api.github.com/repos/:owner/:repo/tarball/:branch`
   - Passes stream through 50MB SizeGuard Transform Stream.
   - Extracts files, builds Docker image, runs 1.5s Boot Liveness Latch.
   - Executes Zero-Downtime Container Swap.
```

---

## 5. REVERSE PROXY GATEWAY ENGINE (:8080)

Located at `/Users/goludhakad/Desktop/aerocloud/proxy/src/index.ts`.

### Architecture & Routing Loop
1. **Listener:** Listens on port `8080`.
2. **Host Header Resolution:**
   - Client sends: `GET /api/items HTTP/1.1`, `Host: my-app.localhost:8080`.
   - Proxy extracts subdomain: `const subDomain = req.get('host').split('.')[0];` $\rightarrow$ `"my-app"`.
3. **Database Query:**
   ```sql
   SELECT * FROM deployments WHERE subdomain = 'my-app' AND status = 'deployed';
   ```
4. **Proxy Forwarding:**
   - If row found and `port > 0`:
     - Invokes `http-proxy`: `proxy.web(req, res, { target: 'http://localhost:' + port })`.
     - If internal connection refused: Emits `502 Bad Gateway: Container unreachable`.
   - If row not found:
     - Checks fallback static directory: `/deployments/my-app`.
     - If static folder exists: serves files via `express.static()`.
     - Otherwise: Emits `404 Deployment not found`.

---

## 6. DEFENSE-IN-DEPTH SECURITY & CRYPTOGRAPHIC CONTROLS

| Security Control | Implementation Mechanism | Threat Mitigated |
| :--- | :--- | :--- |
| **AEAD Token Encryption at Rest** | **AES-256-GCM** with random 12-byte IV, 16-byte authentication tag, and scrypt key derivation. | Database theft / plaintext credential exposure. |
| **Timing-Safe Webhook Auth** | **HMAC-SHA256** verified via `crypto.timingSafeEqual` over fixed-length buffer hashes. | Side-channel timing leak attacks. |
| **Decompression Bomb Defense** | **50MB Streaming `Transform` SizeGuard** metering bytes chunk-by-chunk before disk write. | Zip/Tarball bombs exhausting disk / RAM. |
| **Zip Slip Defense** | Resolves target extract paths against root boundary: `path.relative(targetDir, fullPath).startsWith('..')`. | Arbitrary file overwrite / path traversal. |
| **Kernel Container Sandboxing** | Linux **`cgroups`** hard limits: `Memory: 512MB`, `MemorySwap: 1GB`, `NanoCpus: 1 Core`. | Runaway loops / memory leaks crashing host OS. |
| **Anti-Ghost Deployments** | **1.5s Boot Liveness Latch** with `container.inspect()` and automatic rollback engine. | Broken containers reporting false-positive success. |
| **Rate Limiting & Abuse** | `express-rate-limit` (Window: 15 mins, Max: 10 deploys/IP) with `trust proxy = 1`. | DoS / container spawning spam attacks. |
| **Subdomain Sanitization** | Regex check: `^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$`. Rejects uppercase, special characters, dots. | Subdomain injection / directory hopping. |

---

## 7. LEVEL 5 PRODUCTION EVOLUTION MASTER MATRIX

The roadmap for the September 2026 Production Release across the 7 Core Pillars:

| Pillar | Current Level 4 State | Target Level 5 Production State |
| :--- | :--- | :--- |
| **01. Port Management** | Ephemeral Go child-process binary scanning ports on invocation. | **Persistent Go Micro-Daemon** listening on `/tmp/aerocloud.sock` with atomic in-memory bitset leases. |
| **02. Multi-Port & Secrets** | Fixed hardcoded container port `3000`. Text `.env` storage. | **Dynamic Port Discovery** (auto-detects Dockerfile `EXPOSE`) + Encrypted Secrets Vault. |
| **03. Container Sandboxing** | Standard Docker bridge network with cgroups RAM limits. | **Dedicated `aerocloud-net` bridge**, read-only container rootfs, ephemeral `/tmp` volumes. |
| **04. High-Throughput Proxy** | Node.js `http-proxy` on single event loop thread. | **High-Throughput Go Reverse Proxy** with goroutine worker pools, WebSocket support, and circuit breakers. |
| **05. Domains & TLS** | Wildcard `subdomain.localhost:8080` (HTTP only). | **Custom Domains + Automated ACME / Caddy** issuance for valid Let's Encrypt SSL/TLS certs. |
| **06. Observability** | Terminal text logs via `aerocloud logs`. | **Real-Time Telemetry Engine** (`aerocloud status --live`) with CPU/RAM streams and Sentry integration. |
| **07. Governance & Quotas** | Local SQLite `blocklist` table. | **Distributed Token-Bucket Rate Limiter**, per-user container quotas, dynamic IP banning. |
