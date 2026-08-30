# 🧪 AeroCloud Level 4.5 — Manual Verification & Testing Checklist

Mark `[x]` as you test and verify each pipeline end-to-end.

---

### 🔐 1. Authentication & GitHub App Linking
- [x] **`aerocloud auth`**: Logs in via GitHub App, receives API key, and saves config in `~/.aerocloud/config.json`.
- [x] **`aerocloud link`**: Interactive CLI prompt selects repository, generates `aerocloud.json`, saves project in SQLite, and auto-registers GitHub Webhook via API.
- [ x] **Continuous Deployment on `git push`**: Push commit to GitHub $\rightarrow$ Server receives webhook $\rightarrow$ Streams tarball with 50MB SizeGuard $\rightarrow$ Builds Docker image $\rightarrow$ Deploys container on free port $\rightarrow$ Zero-downtime swap.

---

### 🚀 2. Local Zero-Config Deployment (`aerocloud deploy`)
- [ ] **Local Packaging & Upload**: CLI creates zip (ignoring `node_modules`, `.git`, `.env`), uploads to `POST /deploy`.
- [ ] **Dockerfile Auto-Detection**: If Dockerfile missing, `ensureDockerFile()` automatically generates optimized Node/Go Dockerfile.
- [ ] **Port Scanner**: Go port finder finds free port ($O(\log N)$ search) without colliding with active containers.
- [ ] **Resource Limits (cgroups)**: Container runs with 512MB RAM and 1 CPU core limits.
- [ ] **Proxy Routing (`:8080`)**: Visiting `http://<subdomain>.localhost:8080` in browser renders the application cleanly.

---

### 📡 3. Observability & Log Streaming
- [ ] **`aerocloud list`**: Displays all active deployments, statuses, subdomains, and ports in an ASCII table.
- [ ] **`aerocloud logs <subdomain>`**: Fetches historical container stdout/stderr.
- [ ] **`aerocloud logs <subdomain> -f`**: Live streams container stdout/stderr in real-time with zero buffering.

---

### 🧹 4. Container Lifecycle & Teardown
- [ ] **`aerocloud stop <subdomain>`**: Gracefully stops Docker container; updates status to `stopped`.
- [ ] **`aerocloud destroy <subdomain>`**:
  - [ ] Stops and removes Docker container.
  - [ ] Removes Docker image `aerocloud/<subdomain>:latest`.
  - [ ] Deletes `server/deployments/<subdomain>/` folder from disk.
  - [ ] Removes deployment record from SQLite database.

---

### 🛡️ 5. Security & Error Boundaries
- [ ] **HMAC Signature Check**: Webhook rejects fake or altered signatures with `401 Unauthorized`.
- [ ] **SizeGuard (< 50MB)**: Stream aborts and rolls back if archive exceeds 50MB.
- [ ] **Rollback on Error**: If Docker build or start fails, server cleans up temp files and frees allocated port.
