# 🚀 AeroCloud Landing Page Revision Specification

> **Mission:** Enhance the existing landing page design with authoritative systems architecture, dual-workflow continuous deployment, and cryptographic security specifications while preserving 100% of the editorial, tactile, and retro-terminal visual aesthetic.

---

## 🎨 1. Aesthetic & Vibe Evaluation (Keep & Double Down)

- **The Tilted Cards & Floating Windows (10/10 Vibe):** The 3° to 5° subtle rotation on the config file (`aerocloud.json`) and the browser preview window gives an editorial, tactile, and artisan feel (reminiscent of Stripe Press, Linear, and Raycast). **Keep this completely intact.**
- **Typography Pairing (10/10 Vibe):** The contrast between the high-contrast italic serif accent headers (`from the terminal.`, `harder, safer`, `open.`) paired with the clean mono terminal outputs feels authentic and crafted, not like a generic AI template.
- **Palette & Lighting:** The warm cream/eggshell background (`#F9F8F6`) paired with dark slate terminal containers (`#111827`) provides exceptional readability and modern retro appeal.

---

## 🛠️ 2. Critical Content & Technical Revisions

### Section 01: Hero Section (The Core Value Proposition)
- **Current Headline:** `Deploy apps from the terminal.`
- **Enhanced Headline:**
  > **Deploy from the terminal.**  
  > *Or push to git.*
- **Subheadline:**  
  *A local-first, self-hosted PaaS in Go and TypeScript that containerizes apps, allocates subdomains, and streams deployment lifecycles in plain sight. No cloud bills. No black boxes.*
- **Interactive Terminal Enhancements:**
  - Add a subtle two-way tab toggle above the terminal mock:
    - `[ 💻 Local CLI Deploy ]` $\rightarrow$ shows `$ aerocloud deploy` (packaging, Go port scan, Docker container start on `:8080`).
    - `[ 🐙 Git Push Webhook ]` $\rightarrow$ shows `$ git push origin main` $\rightarrow$ `webhook received` $\rightarrow$ `HMAC verified` $\rightarrow$ `zero-downtime swap`.

---

### Section 02: Configuration & The Dual-Workflow
- **Header:** `Keep your setup small enough to understand.`
- **Content:** Highlight that AeroCloud supports two zero-friction modes:
  1. **Zero-Config Local Deploy:** Run `aerocloud deploy` inside any directory with a `package.json` or `Dockerfile`.
  2. **Interactive Git Linking:** Run `aerocloud link` to bind the directory to a remote GitHub repository. From then on, every `git push` automatically rebuilds and deploys in the background.

```json
// aerocloud.json
{
  "name": "my-service",
  "publish": ".",
  "buildCommand": "npm run build",
  "memoryLimit": "512MB"
}
```

---

### Section 03: The Command Surface (Full CLI Suite)
Update the sidebar tabs to reflect the full developer toolset:
- `aerocloud deploy`: Package local directory into in-memory tar stream and deploy to Docker.
- `aerocloud link`: Interactive GitHub App linking with OAuth loopback listener.
- `aerocloud list`: Real-time deployment registry querying local SQLite WAL state.
- `aerocloud logs <subdomain>`: Stream live stdout/stderr from container via Dockerode multiplexed stream.
- `aerocloud stop <subdomain>`: Clean teardown engine removing container, image, and route.

---

### Section 04: Under the Hood (Architecture Deep Dive)
Upgrade the architecture diagram and text to showcase the **hardcore systems engineering**:

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        DEVELOPER INGRESS                               │
│   [ CLI: `aerocloud deploy` ]        [ GitHub Webhook: `git push` ]    │
└──────────────────┬──────────────────────────────────┬──────────────────┘
                   │ Tarball Stream                   │ HMAC-SHA256 Webhook
                   ▼                                  ▼
┌────────────────────────────────────────────────────────────────────────┐
│                  TYPESCRIPT ORCHESTRATION ENGINE                       │
│   • Transform Stream SizeGuard (<50MB Decompression Bomb Protection)   │
│   • AES-256-GCM AEAD Token Decryption at Rest                          │
│   • SQLite WAL State Machine & Atomic Rollback Engine                  │
└──────────────────┬──────────────────────────────────┬──────────────────┘
                   │                                  │
                   ▼                                  ▼
┌───────────────────────────────────┐  ┌─────────────────────────────────┐
│   🐹 GO PORT ALLOCATION ENGINE    │  │   🐳 DOCKERODE & CGROUPS        │
│   • O(log N) Binary Port Search   │  │   • Memory: 512MB hard limit    │
│   • In-Memory Bitset & Sockets    │  │   • Isolated bridge network     │
└──────────────────┬────────────────┘  └──────────────┬──────────────────┘
                   │                                  │
                   └─────────────────┬────────────────┘
                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│          ⚡ REVERSE PROXY GATEWAY (`subdomain.localhost:8080`)         │
│   • Dynamic Host-header SNI routing                                    │
│   • Sub-millisecond internal container port proxying                   │
└────────────────────────────────────────────────────────────────────────┘
```

---

### Section 05: Built-in Guardrails (Defense-in-Depth Security)
Replace generic bullet points with concrete systems specifications:

1. **Streaming Transform SizeGuard (<50MB):**
   * *Intercepts tarball streams chunk-by-chunk in memory. Destroys the pipeline immediately if unpacked bytes exceed 50MB, completely neutralizing Decompression Bomb DoS attacks.*
2. **AES-256-GCM AEAD Encryption at Rest:**
   * *Developer GitHub OAuth tokens are encrypted using a 12-byte cryptographic IV and validated with a 16-byte authentication tag to guarantee zero tampering.*
3. **Constant-Time HMAC-SHA256 Webhook Verification:**
   * *Webhook signatures are verified using `crypto.timingSafeEqual` to eliminate side-channel timing attack vectors.*
4. **Linux Kernel cgroups Sandboxing:**
   * *Every container runs in an isolated Linux cgroup with 512MB RAM and 1 CPU core limits. Rogue user code is terminated by the kernel OOM-killer without degrading host performance.*
5. **1.5s Boot Liveness Latch (Anti-Ghost Deployments):**
   * *Container startups enter a 1,500ms post-boot health verification phase. If a crash occurs, traffic is instantly rolled back to the prior healthy container.*

---

### Section 06: The Hardening Path (Seven Pillars Roadmap)
*(Keep the existing 7-item accordion, it is already master-tier!)*
- **01. Persistent Go Micro-Daemon:** Long-lived port leases & Unix Domain Socket (`/tmp/aerocloud.sock`) IPC.
- **02. Dynamic Ports & Secret Vault:** Auto-discover ports and encrypt runtime environment variables.
- **03. Container Sandboxing & Network Isolation:** Read-only root filesystems and dedicated Docker bridge networks.
- **04. High-Throughput Go Reverse Proxy:** Goroutine worker pool supporting WebSockets and circuit breakers.
- **05. Custom Domains & Automated TLS:** Automatic Let's Encrypt certificates via ACME/Caddy.
- **06. Real-Time Telemetry & Observability:** Terminal live dashboards (`aerocloud status --live`) and Sentry alerts.
- **07. Governance, Quotas & Dynamic Blocklists:** Token bucket IP rate-limiting and user quota enforcement.

---

### Section 07: Footer & Terminal Quickstart
- **Command Box:**
  ```bash
  git clone https://github.com/GoluScriptMage/aerocloud.git
  cd aerocloud && npm run setup
  aerocloud deploy
  ```
- **Tagline:**
  *Crafted with TypeScript, Go, Docker, and first-principles systems engineering.*
