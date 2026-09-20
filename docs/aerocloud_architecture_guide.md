# 🗺️ AEROCLOUD ARCHITECTURE & SYSTEM FLOWS (L1 – L3)

This document is the canonical visual and logical blueprint of the AeroCloud PaaS. If you return to this codebase after 1 year, this guide will instantly rebuild your mental model of the entire system.

---

## 1. The Big Picture: System Components
Here is how the 4 main components of AeroCloud interact with your local OS and the Docker daemon:

```mermaid
flowchart TD
    %% Styling
    classDef component fill:#0f172a,stroke:#38bdf8,stroke-width:2px,color:#fff;
    classDef storage fill:#1e293b,stroke:#a855f7,stroke-width:2px,color:#fff;
    classDef external fill:#0f172a,stroke:#10b981,stroke-width:2px,color:#fff;

    %% Nodes
    CLI["💻 CLI Client (aerocloud CLI)"]:::component
    Server["⚙️ Orchestrator Server (Express :3000)"]:::component
    Proxy["🌐 Reverse Proxy (http-proxy :8080)"]:::component
    DB[("🗄️ SQLite Database (aerocloud.db)")]:::storage
    Docker["🐳 Docker Daemon (unix:///var/run/docker.sock)"]:::external
    PortScanner["🐹 Port Scanner (Go Binary)"]:::external

    %% Relations
    CLI -- "1. Uploads ZIP / requests logs" --> Server
    Server -- "2. Queries free port" --> PortScanner
    PortScanner -- "3. Checks database occupied ports" --> DB
    Server -- "4. Stores deployment state" --> DB
    Server -- "5. Commands container compilation" --> Docker
    Proxy -- "6. Inspects subdomain mapping" --> DB
    Proxy -- "7. Forwards traffic to container" --> Docker
```

---

## 2. End-to-End Execution Flows

### 🚀 A. Deployment Flow (`aerocloud deploy`)
This sequence diagram shows the step-by-step execution path when you trigger a deployment:

```mermaid
sequenceDiagram
    autonumber
    actor Dev as Developer (CLI)
    participant CLI as CLI Client
    participant Server as Orchestrator Server
    participant Scanner as Go Port Scanner
    participant DB as SQLite DB
    participant Docker as Docker Engine

    Dev->>CLI: aerocloud deploy
    CLI->>CLI: Checks if .env exists (warns if missing)
    CLI->>CLI: Compresses directory (including .env) to test.zip
    CLI->>Server: POST /deploy (Multipart Formdata: file, name)
    
    Server->>Server: Extracts test.zip to deployments/<subdomain>/
    Server->>Server: Parses extracted .env file (if present) via dotenv.parse()
    Server->>DB: Saves status as 'deploying' with envVars JSON string
    
    Server->>Scanner: Spawn port scanner child process (sends DB-used ports via stdin)
    Scanner->>Scanner: Performs binary search check
    Scanner-->>Server: Returns first free host port (e.g. 1024)
    
    Server->>Server: Verifies/Generates dynamic Dockerfile if missing
    Server->>Docker: Packaging tar stream & sends build command
    Docker-->>Server: Streams raw build log lines
    Server-->>CLI: Streams colorized lines via HTTP Chunked SSE
    
    Server->>Docker: createContainer() with Env values & Port Bindings
    Server->>Docker: start()
    Server->>DB: Updates deployment: status = 'deployed', port = 1024, containerId = ID
    Server-->>CLI: Sends final JSON result: Success, live URL
    CLI-->>Dev: Prints successful deploy link (subdomain.localhost:8080)
```

---

## 3. Core Methods & API Reference

### 1. `deploy` (Deployment & Creation)
*   **CLI Trigger:** `aerocloud deploy`
*   **HTTP Endpoint:** `POST /deploy` (accepts multipart file zip upload)
*   **Key Files:**
    *   [`cli/src/utils/archieve.ts`](file:///Users/goludhakad/Desktop/aerocloud/cli/src/utils/archieve.ts): Zips files with `dot: true` (ensuring `.env` gets packaged).
    *   [`server/src/routes/deploy.ts`](file:///Users/goludhakad/Desktop/aerocloud/server/src/routes/deploy.ts): Handles zip extraction, `.env` parsing, database entry, port scanner execution, image compiling, and container initialization.

### 2. `list` / `status` (Telemetry & Stats)
*   **CLI Trigger:** `aerocloud list`
*   **HTTP Endpoint:** `GET /list`
*   **Key Files:**
    *   [`server/src/routes/listDeployments.ts`](file:///Users/goludhakad/Desktop/aerocloud/server/src/routes/listDeployments.ts): Queries SQLite deployments.
    *   **The Logic:**
        1. Fetch all rows from the database.
        2. Loop through rows in parallel using `Promise.all()`.
        3. If container is running, query Docker daemon: `container.inspect()` to get state, and `container.stats({ stream: false })` to get raw memory bytes.
        4. Calculate RAM usage: $\text{MB} = \text{bytes} / (1024 \times 1024)$.
        5. Return unified JSON back to client.

### 3. `logs` (Real-Time App Logs)
*   **CLI Trigger:** `aerocloud logs <subdomain> [-f]`
*   **HTTP Endpoint:** `GET /deployments/:subdomain/logs?follow=true`
*   **Key Files:**
    *   [`server/src/routes/logs.ts`](file:///Users/goludhakad/Desktop/aerocloud/server/src/routes/logs.ts): Streams logs from Docker Engine.
    *   **The Logic:**
        1. Read `follow` query parameters.
        2. Set Express response headers for Server-Sent Events (SSE): `Content-Type: text/event-stream`.
        3. Fetch stream: `container.logs({ follow: true, stdout: true, stderr: true })`.
        4. **Clean Headers:** Docker prefixes logs with 8-byte binary headers. We demux it using `container.modem.demuxStream(logStream, res, res)` which streams clean text directly to Express write pipelines.
        5. **Connection Close:** Listen for `req.on('close')` to invoke `logStream.destroy()` and prevent server memory leaks when developers press `Ctrl+C`.

### 4. `stop` (Graceful Suspend)
*   **CLI Trigger:** `aerocloud stop <subdomain>`
*   **HTTP Endpoint:** `POST /stop/:subdomain`
*   **Key Files:**
    *   [`server/src/routes/stopContainer.ts`](file:///Users/goludhakad/Desktop/aerocloud/server/src/routes/stopContainer.ts)
    *   **The Logic:**
        1. Check container state via `container.inspect()`.
        2. If `State.Running` is true, invoke `container.stop()`. If it is already stopped, do nothing (preventing a Docker 304 conflict crash).
        3. Update database status to `'stopped'`.

### 5. `destroy` (Permanent Purge)
*   **CLI Trigger:** `aerocloud destroy <subdomain>`
*   **HTTP Endpoint:** `POST /destroy/:subdomain`
*   **Key Files:**
    *   [`server/src/routes/stopContainer.ts`](file:///Users/goludhakad/Desktop/aerocloud/server/src/routes/stopContainer.ts)
    *   **The Logic:**
        1. Check container state. Stop if running, then call `container.remove()`.
        2. Delete deployment database record: `deleteDeployment(subdomain)`.
        3. Delete files from disk: `fs.rmSync(targetDir, { recursive: true, force: true })` to free up space.

### 6. `Reverse Proxy` (Request Routing Gateway)
*   **Port:** `:8080`
*   **Key Files:**
    *   [`proxy/src/index.ts`](file:///Users/goludhakad/Desktop/aerocloud/proxy/src/index.ts)
    *   **The Logic:**
        1. Listens for HTTP requests.
        2. Extracts subdomain prefix from the Host header (e.g., `app-criott.localhost`).
        3. Connects to SQLite database synchronously (`DatabaseSync`).
        4. Queries DB for subdomain port.
        5. Dynamically forwards incoming HTTP stream to `http://localhost:<targetPort>` using `http-proxy`.
