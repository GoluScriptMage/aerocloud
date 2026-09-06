# 🎯 PHASE 2: AeroCloud Architectural Scenarios & Deep Dives (Levels 1 - 4.5)

**Instructions:** Provide structured, first-principles engineering explanations for each scenario. Focus on systems physics, OS/networking mechanics, failure modes, and architectural trade-offs.

---

### Question 1: Trade-off Analysis — Native `fetch` vs. GitHub `Octokit` SDK
Analyze the architectural trade-offs between using Node's native `fetch` versus the GitHub `Octokit` SDK.
* Why did we choose raw `fetch` for AeroCloud?
* How does native `fetch` enable direct stream piping (`Readable.fromWeb`) through our custom `SizeGuard` Transform stream without buffer encapsulation?
* What are the bundle size, dependency graph, and vendor lock-in implications?

---

### Question 2: Disaster Recovery — The 2GB Decompression Bomb Attack
A malicious actor links a repository containing a 2GB compressed tarball designed to exhaust host memory and disk space upon webhook push.
* Trace step-by-step how AeroCloud's multi-layered defense neutralizes this attack.
* Explain the role of HMAC verification, the 100ms async HTTP 200 acknowledgment, the streaming `SizeGuard` byte counter, and Linux `cgroups` in preventing host denial-of-service.

---

### Question 3: Concurrency & State Machine — Local CLI Deploy vs. Webhook Push Collision
Suppose User A runs `aerocloud deploy` locally (uploading a ZIP) at the exact same second that GitHub fires a Webhook push (`POST /api/webhook/github`) for the same project.
* What happens at the database layer (SQLite WAL mode) and filesystem layer (`server/deployments/<subdomain>`)?
* How does the system prevent build context race conditions, port collision, or leaving orphaned ghost containers?

---

### Question 4: Port Binding Physics — Single-Port vs. Multi-Port Collision
During our sprint, attempting to bind both `3000/tcp` and `8080/tcp` to the same host port caused a fatal Docker networking error (`Bind for 0.0.0.0:PORT failed: port is already allocated`).
* Explain the exact TCP socket and Linux network namespace mechanics that caused this failure.
* Clearly differentiate between the **Container Internal Port**, the **Host Mapped Port**, and the **Reverse Proxy Listener Port**.

---

### Question 5: Scale Evolution — What Breaks at 10,000 Requests/Second?
Analyze the current single-node architecture (Node.js Reverse Proxy + SQLite + Local Docker Daemon).
* What are the exact bottlenecks when traffic spikes to 10,000 req/sec (Event loop lag, SQLite write locks, socket descriptor limits, Docker bridge overhead)?
* Outline the Level 5 migration path to Rust (`Tokio`/`Axum`) + Postgres/Redis + Distributed Container Orchestration to handle this scale.
