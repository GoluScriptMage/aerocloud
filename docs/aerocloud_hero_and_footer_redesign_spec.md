# 🚀 AeroCloud: Redesigned Hero Control Plane & Live Server Terminal Spec

> **Design Goal:** Transform the Hero Section from a static CLI snippet into a **Live, Breathing AeroCloud Orchestration Server (`:3000`)** that visually intercepts requests, runs zero-downtime swaps, and responds in real-time. Redesign the footer from a boring `git clone` box into an **Interactive Live Deployment Test Sandbox**.

---

## 🎨 1. Color Palette & New Visual Identity (The "Cyan + Amber + Slate" Vibe)

Introduce a striking new accent palette to make the terminal feel like high-end mission control:
- **Base Canvas:** Warm Cream Eggshell (`#F6F5F0`) with subtle sub-pixel grid lines.
- **Server Shell (Hero Window):** Deep Obsidian Matte Slate (`#0B0F17`) with glowing 1px border (`rgba(56, 189, 248, 0.2)`).
- **Signal Accents:**
  - 🟢 **Live Green (`#10B981`):** Active container status, 200 OK responses, healthy latch.
  - 🔵 **Electric Cyan (`#06B6D4` / `#38BDF8`):** Incoming Webhook packets, HMAC validation, route assignment.
  - 🟠 **Warm Amber (`#F59E0B`):** Go port scan allocation, tarball byte-metering, zero-downtime container swap.
  - 🟣 **Neon Indigo (`#818CF8`):** SQLite WAL transaction write, OAuth token encryption.

---

## 🖥️ 2. HERO SECTION REDESIGN: "The Live Running Orchestration Server"

Instead of a basic user prompt `$ aerocloud deploy`, the hero window is now titled:
`● ● ● aerocloud-server :3000 [PID 4192] · daemon: live · proxy :8080`

### 🔄 Auto-Looping Animation Sequence (Runs autonomously with zero user click needed):

The server terminal loops through **3 cinematic lifecycle events**, showing the exact low-level depth of AeroCloud:

```text
┌───────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ ● ● ● aerocloud-core :3000 · [WAL: active] · [proxy :8080] · [cgroups: 512MB]          ● LIVE STREAM │
├───────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                       │
│ [14:42:01] ⚡ INGRESS  POST /api/webhooks/github  (event: push, branch: main)                        │
│            ├── Headers: x-hub-signature-256 [sha256:7f8a9...]                                        │
│            ├── HMAC: crypto.timingSafeEqual() ──► [VERIFIED ✓]                                       │
│            └── Response: 200 OK in 14ms (Async Worker Dispatched)                                    │
│                                                                                                       │
│ [14:42:02] 🐹 PORT ALLOC  findAvailablePort() via Go O(log N) scanner                                │
│            └── Leased ephemeral host port :4028 (locked in-memory bitset)                            │
│                                                                                                       │
│ [14:42:03] 📦 BUILD       Piping tarball stream (SizeGuard: 14.2MB / 50MB ceiling)                   │
│            ├── Dockerode build image aerocloud/my-app:rev-4                                          │
│            └── cgroups enforced: Memory=512MB, Swap=1GB, NanoCPUs=1.0                               │
│                                                                                                       │
│ [14:42:05] 🚀 CONTAINER   Spawning container my-app-7f2a on port :4028                              │
│            ├── Boot latch: waiting 1500ms for health check...                                        │
│            └── State.Running: true [HEALTHY ✓]                                                       │
│                                                                                                       │
│ [14:42:07] 🔀 ZERO-DOWNTIME SWAP (my-app.localhost:8080)                                             │
│            ├── Proxy route swapped: :4012 ──► :4028 (0 dropped connections)                           │
│            └── Teardown: graceful SIGTERM to old container my-app-3e1b (PID 8910 reaped)             │
│                                                                                                       │
│ ───────────────────────────────────────────────────────────────────────────────────────────────────── │
│ 🌐 ROUTE ACTIVE: http://my-app.localhost:8080 ──► Host :4028 [node:3000]                             │
└───────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Visual Micro-Details:
- Live pulsating green indicator dot at top-right (`● LIVE STREAM`).
- Small badge counter showing: `Active Containers: 03` | `RAM: 184MB / 1.5GB` | `Proxy Latency: 0.8ms`.
- Subtle glowing highlight on the log line currently being executed.

---

## ⚡ 3. FOOTER REDESIGN: "The Zero-Install Live Verification Rail"

### What was wrong with the old footer:
The old footer was just a boring blue box with `$ git clone ...`. Developers don't get hyped by cloning an empty repo; they want to **feel the runtime power immediately.**

### The New Footer: "The Launchpad & Live Telemetry Sandbox"

Replace the flat blue banner with a **two-column Split Command Deck**:

#### Column A (Left): "Try the Control Loop"
- Headline:  
  **"Your infrastructure should answer in milliseconds."**
- Subtext:  
  *Run a live test against our local instance, or download the single standalone Go+Node binary.*
- Quick-copy command box:
  ```bash
  curl -fsSL https://aerocloud.run/install.sh | bash
  aerocloud deploy
  ```
- Secondary Action: `View on GitHub ↗` (with real live star badge & release tag `v0.4.5-alpha`).

#### Column B (Right): "Interactive Runtime Card"
A tactile, interactive inspection card titled `SYSTEM HEALTH & ROUTING TABLE`:
- **Subdomain:** `my-portfolio.localhost:8080`
- **Allocated Port:** `TCP 4028` (Go bitset leased)
- **Memory Ceiling:** `Progress Bar: 42.5MB / 512MB`
- **Proxy Status:** `200 OK · 1.2ms latency`
- **Teardown Action:** Interactive button `[ Destroy Container ]` that shows an inline 1-click visual simulation of container stopping, image pruning, and SQLite row unlinking!

---

## 📋 4. Direct Prompt to Give the AI Builder (Copy-Paste Ready)

```text
Please redesign the AeroCloud landing page with these 2 major structural upgrades:

1. HERO SECTION:
   - Replace the static CLI deploy terminal with a dynamic, auto-playing "Live Orchestration Server Terminal" running on :3000.
   - It should simulate an active server intercepting events in real-time:
     a) GitHub Webhook push arriving -> HMAC-SHA256 timing-safe verified -> 200 OK async ACK.
     b) Go port scanner allocating an ephemeral host port (e.g. :4028).
     c) Dockerode building the image with cgroups 512MB RAM limits.
     d) 1.5s Boot Liveness Latch passing with [HEALTHY] state.
     e) Zero-downtime proxy swap: routing my-app.localhost:8080 from old port to new port and tearing down the old container.
   - Use Obsidian Slate background with Cyan (#06B6D4) and Amber (#F59E0B) syntax highlights and a glowing "LIVE STREAM" badge.

2. FOOTER SECTION:
   - Remove the plain blue git clone box.
   - Redesign into a Split Command Deck: Left side has clean installation snippet (curl -fsSL aerocloud.run/install.sh | bash) + GitHub button; Right side has an interactive "Runtime Health Card" showing real live metrics (Memory: 42.5/512MB, Port: 4028, Proxy: 8080, Status: Running).
```
