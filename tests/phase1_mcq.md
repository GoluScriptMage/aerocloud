# 🎯 PHASE 1: AeroCloud Systems & Architecture MCQs (Levels 1 - 4.5)

**Instructions:** Click to tick `[x]` the correct option for each question directly in this markdown file.

---

### Question 1: Docker Tar Stream & Dynamic Packaging
When deploying via the `aerocloud deploy` CLI, why is an in-memory tar stream packed dynamically rather than copying the directory to a disk-based build context before sending it to the Docker daemon?
- [ ] **A)** An in-memory stream bypasses the Docker daemon’s default size limits on build contexts.
- [ ] **B)** Disk-based builds require root privileges to preserve file permissions, whereas tar streams natively abstract OS-level ownership.
- [x] **C)** Pumping an in-memory tar stream over the Docker socket avoids massive disk I/O thrashing and allows precise algorithmic filtering (like omitting `node_modules`), vastly reducing context transfer time.
- [ ] **D)** The Docker socket only accepts `application/x-tar` streams if they are compressed via gzip in real-time.

---

### Question 2: Go Port Scanner & Stdin Search
In AeroCloud's Go-based port scanner, checking for available host ports by searching a sorted list of active ports in $O(\log N)$ time via Stdin is superior to spawning child processes (`netstat`/`lsof`) or binding trial sockets because:
- [ ] **A)** Spawning child processes creates zombie processes and linear scans take $O(N^2)$ time.
- [x] **B)** Passing state via Stdin to a highly concurrent Go routine and doing binary search guarantees near-zero kernel context switches and prevents ephemeral port collision races during parallel scale-ups.
- [ ] **C)** Trial socket binding (`net.Listen`) modifies the host TCP stack permanently, leading to port exhaustion.
- [ ] **D)** Go's $O(\log N)$ search algorithm operates directly on the CPU L1 cache, bypassing RAM entirely.

---

### Question 3: Reverse Proxy & Host Header Routing
How does the Node.js reverse proxy intelligently route a request for `subdomain.localhost:8080` to the correct internal Docker container without any local DNS server modifications?
- [ ] **A)** The proxy reads the TLS SNI (Server Name Indication) and modifies the `/etc/hosts` file dynamically.
- [x] **B)** The proxy extracts the `Host` header from the HTTP request, queries SQLite for the corresponding internal container IP/port mapped to `subdomain`, and proxies the TCP stream directly to that target.
- [ ] **C)** It broadcasts an ARP request to the Docker bridge network to find the container matching the subdomain name.
- [ ] **D)** Node.js natively intercepts `.localhost` TLDs at the OS level and maps them using Docker's internal DNS (`127.0.0.11`).

---

### Question 4: SQLite WAL Mode & Concurrency
Enabling `PRAGMA journal_mode = WAL` and `synchronous = NORMAL` in SQLite enhances AeroCloud's concurrency model by:
- [ ] **A)** Locking the entire database during writes but keeping reads completely lock-free via memory mapping.
- [x] **B)** Appending writes to a Write-Ahead Log without blocking concurrent readers, while `synchronous=NORMAL` reduces `fsync()` calls to the disk, balancing corruption safety with high write throughput.
- [ ] **C)** Disabling the page cache entirely so that readers fetch directly from disk, preventing memory overflow.
- [ ] **D)** Forcing all transactions to execute sequentially in memory before flushing to the disk in a single batch to avoid `SQLITE_BUSY`.

---

### Question 5: AES-256-GCM AEAD at Rest
Why is AES-256-GCM preferred over AES-256-CBC for encrypting GitHub tokens at rest in SQLite, and why is the 16-byte Auth Tag critical?
- [x] **A)** GCM uses a 16-byte Auth Tag to mathematically prove the ciphertext has not been tampered with (Authenticated Encryption), preventing padding oracle attacks and silent data corruption inherent in CBC/ECB.
- [ ] **B)** GCM requires less CPU overhead because it doesn't need an Initialization Vector (IV), whereas CBC requires a 12-byte IV.
- [ ] **C)** The Auth Tag automatically rotates the encryption key every 16 bytes to prevent cryptanalysis.
- [ ] **D)** GCM encrypts the data directly into a base64 string, skipping the binary buffer translation phase needed by CBC.

---

### Question 6: HMAC-SHA256 Webhook Verification
When verifying a GitHub webhook payload, why is `crypto.timingSafeEqual` strictly required instead of a standard string comparison (`===`)?
- [ ] **A)** Standard string comparisons are too slow for high-throughput webhook processing.
- [x] **B)** Standard string comparisons short-circuit and return `false` at the first mismatched character, allowing an attacker to brute-force the HMAC signature byte-by-byte by observing response timing variations.
- [ ] **C)** `crypto.timingSafeEqual` applies the Avalanche effect to the payload to ensure identical lengths before comparison.
- [ ] **D)** Standard string comparisons in JavaScript cannot handle binary buffer data, which HMAC-SHA256 produces.

---

### Question 7: Streaming SizeGuard & Decompression Bomb DoS
How does AeroCloud's Node.js `Transform` stream defend against a malicious 2GB compressed tarball (Decompression Bomb) pushed from a linked repository?
- [ ] **A)** It downloads the entire file to `/tmp`, checks the file size metadata, and deletes it if it exceeds the limit.
- [ ] **B)** It runs the tarball through a Go-based scanner that counts the files before extracting.
- [x] **C)** The `Transform` stream intercepts the incoming data pipe in real-time, incrementing a byte counter per chunk. If the counter exceeds the hard limit, it forcefully destroys the socket connection *before* the data reaches the disk or memory limits.
- [ ] **D)** It relies on Docker's `--storage-opt` flag to prevent the container from growing beyond the configured filesystem size.

---

### Question 8: Linux cgroups & Memory Swap Sandboxing
When configuring a container with `Memory: 512MB` and `MemorySwap: 1GB`, what exactly is enforced by the Linux kernel, and what happens upon memory exhaustion?
- [ ] **A)** The container can use 512MB of RAM; if exceeded, it borrows 512MB from other containers. If that is exceeded, it gracefully shuts down.
- [x] **B)** The container is hard-capped at 512MB of physical RAM and 512MB of disk swap (Total: 1GB). If the application allocates beyond 1GB, the kernel's OOM Killer forcefully sends a `SIGKILL` to the container process.
- [ ] **C)** The container is given 1GB of physical RAM, but only 512MB is guaranteed.
- [ ] **D)** Swap space is disabled, and the container is killed immediately upon exceeding 512MB of RAM.

---

### Question 9: 1.5s Boot Liveness Latch (Anti-Ghost Deployments)
Why does AeroCloud implement a 1.5s grace period with a subsequent `container.inspect()` check after `await container.start()`?
- [x] **A)** Docker API's `start()` method returns asynchronously before the container OS fully boots. A container might crash immediately (e.g., missing start script, missing env vars). The latch waits and inspects the `State.Running` flag to prevent routing traffic to a dead "ghost" deployment.
- [ ] **B)** Node.js requires exactly 1.5s to establish a TCP socket with a newly spawned Docker container.
- [ ] **C)** To allow the SQLite database enough time to commit the transaction before accepting traffic.
- [ ] **D)** It is a required cooldown period enforced by the Docker daemon to prevent API rate limiting.

---

### Question 10: Zero-Downtime Container Swaps & Teardown Order
What is the mathematically correct chronological sequence for a zero-downtime deployment swap in AeroCloud?
- [ ] **A)** 1. Delete Container N $\rightarrow$ 2. Start Container N+1 $\rightarrow$ 3. Update SQLite routing table.
- [ ] **B)** 1. Start Container N+1 $\rightarrow$ 2. Stop Container N $\rightarrow$ 3. Update SQLite routing table.
- [ ] **C)** 1. Update SQLite routing table to N+1 $\rightarrow$ 2. Start Container N+1 $\rightarrow$ 3. Delete Container N.
- [x] **D)** 1. Start Container N+1 $\rightarrow$ 2. Verify Liveness Latch (Wait 1.5s, Inspect) $\rightarrow$ 3. Update SQLite routing table to point to N+1 $\rightarrow$ 4. Teardown/Remove Container N.
