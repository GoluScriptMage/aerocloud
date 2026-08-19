# Contributing to AeroCloud

Thank you for your interest in contributing to AeroCloud! We welcome contributions from systems engineers, backend developers, and open-source enthusiasts.

---

## 🏛️ Ground Rules & Code Standards

1. **First-Principles Thinking:** We write systems-level, lean, and type-safe code. Avoid heavy unnecessary runtime bloat or dependencies.
2. **TypeScript Strict Mode:** All TypeScript code must be strict. Never use `any` without an explicit, documented architectural justification.
3. **No Closure Heap Escapes in Go:** For embedded Go code (like `goportscan`), write package-level pointer functions to avoid heap allocation overhead.
4. **Defense-in-Depth:** Every route must be protected with appropriate input sanitization (RFC-1123 DNS checks), rate limiting, and parameter binding.
5. **Conventional Commits:** All commits must follow the [Conventional Commits](https://www.conventionalcommits.org/) standard:
   - `feat: add git-push webhook auto-deploy`
   - `fix: resolve port allocation race condition`
   - `docs: update architecture diagrams in README`
   - `refactor: modularize docker build stream logic`

---

## 🛠️ Local Development Setup

AeroCloud is structured as a mono-repository containing three core services: `cli/`, `server/`, and `proxy/`.

### 1. Clone & Install
```bash
git clone https://github.com/GoluScriptMage/aerocloud.git
cd aerocloud

# Install dependencies across all modules
cd cli && npm install
cd ../server && npm install
cd ../proxy && npm install
```

### 2. Configure Environment
Create `server/.env` with your GitHub OAuth credentials:
```env
PORT=3000
GITHUB_CLIENT_ID=your_id
GITHUB_CLIENT_SECRET=your_secret
GITHUB_REDIRECT_URI=http://localhost:3000/auth/github/callback
```

### 3. Start Development Services (3 Terminals)
```bash
# Terminal 1: Orchestrator Server
cd server && npm run dev

# Terminal 2: Subdomain Proxy Gateway
cd proxy && npm run dev

# Terminal 3: Test CLI commands
cd cli && aerocloud deploy
```

---

## 🧪 Testing Your Changes

Before submitting a Pull Request, verify:
* **TypeScript Compilation:** Run `npx tsc --noEmit` inside `server/`, `cli/`, and `proxy/`.
* **Container Lifecycle:** Test deploying a sample Node.js app and verify `http://<subdomain>.localhost:8080` resolves cleanly.
* **Teardown:** Test `aerocloud stop <name>` and `aerocloud destroy <name>` to ensure DB rows and Docker images are properly purged.

---

## 📬 Pull Request Process

1. Create a descriptive feature branch from `master`:
   ```bash
   git checkout -b feat/my-new-feature
   ```
2. Make clean, isolated commits.
3. Push to your fork and open a Pull Request against `master`.
4. Provide a clear description of the problem solved, architectural changes made, and steps to reproduce testing.

---

## 📄 License
By contributing to AeroCloud, you agree that your contributions will be licensed under the project's [ISC License](LICENSE).
