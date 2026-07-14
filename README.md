# ✈️ aerocloud

> **A minimalist, terminal-first developer Platform-as-a-Service (PaaS) engine built to run, sandbox, and route projects dynamically.**

---

## 🏛️ System Architecture

`aerocloud` is split into three decoupled subsystems that coordinate over local sockets and HTTP protocols:

```text
  [ aerocloud-cli ]  ──( POST /deploy )──►  [ aerocloud-server ]
         │                                          │
         │                                   ( Extracts to )
         │                                          ▼
  ( Web Request ) ────────────────────────► [  /deployments  ]
         │                                          ▲
  ( Parses Subdomain )                              │
         ▼                                          │
  [ aerocloud-proxy ] ──( Serves Static Folder ) ───┘
```

1.  **`cli/` (Client Command Tool):** A Node.js CLI tool that bundles local workspace directories (excluding dependencies like `node_modules`), compresses them to a ZIP stream, and POSTs them natively to the server.
2.  **`server/` (API Orchestrator Backend):** An Express daemon listening on port `3000`. It receives zip buffers, extracts them into isolated sandbox folders inside `/deployments/`, and maps unique subdomains (e.g. `a1b2c3`).
3.  **`proxy/` (Dynamic HTTP Router):** An Express reverse proxy listening on port `8080`. It intercepts incoming host headers (e.g., `a1b2c3.localhost:8080`), parses the subdomain, and serves files dynamically from the mapped deployments directory.

---

## 🚀 Level 1 MVP: Quick Start

### 1. Boot the Server Backend (Port 3000)
```bash
cd server
npx tsx src/index.ts
```

### 2. Boot the Proxy Router (Port 8080)
```bash
cd proxy
npx tsx src/index.ts
```

### 3. Trigger a Deployment (CLI)
Inside your target project directory:
```bash
npx tsx /path/to/cli/src/index.ts deploy
```
*Output:*
```text
🚀 Archive created successfully
{ status: 'success', subdomain: '5ca393', url: 'http://5ca393.localhost:8080' }
Deployment completed successfully!
```

---

## 🛠️ Tech Stack & Dependencies

*   **Runtime:** Node.js (v24+) + TypeScript
*   **CLI Parsing:** `commander`
*   **Compression:** `archiver` (v8.0.0 ESM Class Instantiation)
*   **API Receiver:** `express` + `multer` (MemoryStorage)
*   **ZIP Extraction:** `adm-zip` (in-memory buffer parsing)
*   **Relative Pathing:** Native Node `import.meta.url` + `fileURLToPath`
