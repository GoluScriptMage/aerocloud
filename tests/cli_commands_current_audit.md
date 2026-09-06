# AeroCloud CLI Commands — Current State Audit Report

**Date:** September 5, 2026  
**Audited Binary:** `/opt/homebrew/bin/aerocloud` (symlinked to `/Users/goludhakad/Desktop/aerocloud/cli/dist/index.js`)  
**Server Target:** `http://localhost:3000` (Node.js/Express with SQLite & Dockerode)  
**Environment:** macOS (Node v24.9.0, Docker Desktop)

---

## Executive Summary

An end-to-end operational audit was conducted across all commands exposed by the AeroCloud CLI (`init`, `deploy`, `list`, `stop`, `destroy`, `logs`, `auth`, `link`, and `--help`). 

### Critical Blockers Identified
1. **Broken Command (`aerocloud stop <subdomain>`)**: Missing a forward slash in the URL endpoint (`/stop${subdomain}` vs `/stop/${subdomain}` in `cli/src/index.ts:184`), causing a 404 HTML response from Express and an unhandled crash: `SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON`.
2. **Crash on Unauthenticated State**: `stop`, `destroy`, and `logs` perform unchecked property access on `getToken(false).apiKey`. If the user is unauthenticated, `getToken(false)` returns `null`, throwing `TypeError: Cannot read properties of null (reading 'apiKey')` and dumping an unhandled stack trace.
3. **Silent Error Exit Codes**: Commands that fail due to missing authentication (`deploy`, `list`) or missing resources (`destroy` 404) exit with status code `0` instead of a non-zero error code (`1`), breaking CI/CD pipelines and script automation.
4. **Filesystem Pollution**: `deploy` generates a persistent `test.zip` in the current working directory (`process.cwd()`) and never removes it upon completion or failure.
5. **Docker Stream Header Corruption in Logs**: Static logs (`aerocloud logs <subdomain>`) dump raw 8-byte multiplex headers from Docker, rendering unprintable characters and random punctuation (`%`, `&`) with irregular indentation.
6. **Noisy Logger & Inverted Semantics**: Every line is timestamped with `chalk.gray(HH:MM:SS AM/PM)` and loud badges (`[INFO]`, `[SUCCESS]`). Debug statements (`[DEBUG]`) print unconditionally in production stdout. `aerocloud logs` without `--follow` prints `"Fetching logs in real-time"`, inverting user expectations.

---

## 1. Global & Architectural Findings

| Category | Observation | File & Line Reference | Impact |
| :--- | :--- | :--- | :--- |
| **Logger Overhead** | Every log prepends `new Date().toLocaleTimeString()` and colored tags (`[INFO]`, `[SUCCESS]`, `[ERROR]`, `[WARN]`, `[DEBUG]`). | [`cli/src/utils/logger.ts:20-43`](file:///Users/goludhakad/Desktop/aerocloud/cli/src/utils/logger.ts#L20-L43) | Severe terminal noise; poor scriptability and piping. |
| **Unconditional Debug Output** | `Logger.debug` prints in normal execution without requiring a `-v` or `--verbose` flag. | [`cli/src/utils/linkHelper.ts:16`](file:///Users/goludhakad/Desktop/aerocloud/cli/src/utils/linkHelper.ts#L16) | Leaks internal parsing details to standard stdout. |
| **Missing Version Flag** | `program.version(...)` is not registered on Commander. | [`cli/src/index.ts:21-23`](file:///Users/goludhakad/Desktop/aerocloud/cli/src/index.ts#L21-L23) | `aerocloud -v` or `--version` fails with unknown option error. |
| **Missing Try/Catch on Fetch** | `fetch(...)` calls lack try/catch handlers for connection errors (`ECONNREFUSED`). | [`cli/src/index.ts:88,142,184,208,237,259`](file:///Users/goludhakad/Desktop/aerocloud/cli/src/index.ts#L88) | Node crashes with unhandled promise rejection when server is down. |
| **Unsafe Response Parsing** | `await response.json()` is called without verifying `response.ok` or `content-type: application/json`. | [`cli/src/index.ts:192,216,245`](file:///Users/goludhakad/Desktop/aerocloud/cli/src/index.ts#L192) | Crashes with HTML `SyntaxError` on 404/502/500 proxy responses. |

---

## 2. Command-by-Command Audit

---

### Command: `aerocloud --help` / `aerocloud -h`

#### Exact Output
```
Usage: aerocloud [options] [command]

Deploy your application to aerocloud

Options:
  -h, --help                  display help for command

Commands:
  init                        Initialize the aerocloud configuration file
  deploy                      Deploy your application to aerocloud
  list                        List all deployments
  stop <subdomain>            Stop a deployment by subdomain
  destroy <subdomain>         Destroy a deployment by subdomain
  logs [options] <subdomain>  Fetch logs for a deployment by subdomain
  auth                        Authenticate with GitHub
  link                        Link your GitHub repository to aerocloud
  help [command]              display help for command
```

#### Formatting & Noise Analysis
- **Exit Code:** `0` (Success)
- **Strengths:** Standard clean Commander output.
- **Issues:**
  - Lacks version option (`-v, --version`).
  - Subcommands lack short flags or aliases (e.g., `ls` for `list`).
  - Top-level description `"Deploy your application to aerocloud"` conflates the entire CLI with the `deploy` subcommand.

---

### Command: `aerocloud init`

#### Exact Output (First Run — No existing config)
```
Checking for existing config file at: /private/tmp/test-cli-init/aerocloud.json
3:45:17 PM [SUCCESS] Config file 'aerocloud.json' has been initialized in the current directory.
```

#### Exact Output (Second Run — Config already exists)
```
Checking for existing config file at: /private/tmp/test-cli-init/aerocloud.json
3:45:21 PM [SUCCESS] Config file 'aerocloud.json' has been initialized in the current directory.
```

#### Generated File (`aerocloud.json`)
```json
{
    "name": "test-cli-init",
    "publish": ".",
    "buildCommand": "",
    "repo": "",
    "branch": "main"
}
```

#### Formatting & Noise Analysis
- **Exit Code:** `0`
- **Issues:**
  - **Inconsistent Logging:** Line 1 uses `console.log(chalk.blue(...))` without timestamps or badges, while Line 2 uses `Logger.success(...)` with timestamp and `[SUCCESS]`.
  - **False Positive Reporting:** On subsequent runs, `initConfigFile()` does not overwrite an existing file, yet it still logs `"Config file 'aerocloud.json' has been initialized"`. It should detect the existing file and log an informational notice (or offer `--force`).
  - **No Interactive Prompts:** `init` does not prompt for project name, build command, or publish folder; it immediately writes hardcoded defaults.

---

### Command: `aerocloud deploy`

#### Exact Output (Standard Successful Deployment)
```
3:45:31 PM [INFO] Deploying your application to aerocloud...
Checking for existing config file at: /private/tmp/audit-test-app/aerocloud.json
3:45:31 PM [SUCCESS] Config file 'aerocloud.json' has been initialized in the current directory.
3:45:31 PM [INFO] Finalizing archive from directory: .
3:45:31 PM [SUCCESS] Archive created successfully: /private/tmp/audit-test-app/test.zip
3:45:31 PM [INFO] Sending deployment request to aerocloud server...
Step 1/8 : FROM node:20-alpine
 ---> fb4cd12c85ee
Step 2/8 : WORKDIR /app
 ---> Using cache
 ---> 4d6143590820
Step 3/8 : COPY package*json ./
 ---> 2d8cf27d5c13
Step 4/8 : RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
 ---> Running in 7d16ec6957c5

up to date, audited 1 package in 393ms

found 0 vulnerabilities
 ---> Removed intermediate container 7d16ec6957c5
 ---> bb3a357ae8b1
Step 5/8 : COPY . .
 ---> 82e44b79fb17
Step 6/8 : RUN npm run build --if-present
 ---> Running in 222612bb0b6a
 ---> Removed intermediate container 222612bb0b6a
 ---> 183a50bc09ed
Step 7/8 : EXPOSE 3000
 ---> Running in 12b8315a337a
 ---> Removed intermediate container 12b8315a337a
 ---> 5ad2d9b95679
Step 8/8 : CMD ["npm", "start"]
 ---> Running in 405235e3c99a
 ---> Removed intermediate container 405235e3c99a
 ---> 829788bdb71a
Successfully built 829788bdb71a
Successfully tagged aerocloud/audit-test-01:latest
3:45:36 PM [SUCCESS] Deployment successful! Subdomain: audit-test-01, Image: aerocloud/audit-test-01:latest
3:45:36 PM [INFO] 🌐 Live URL: http://audit-test-01.localhost:8080
```

#### Exact Output (Unauthenticated User)
```
3:46:29 PM [INFO] Deploying your application to aerocloud...
Checking for existing config file at: /private/tmp/audit-test-app/aerocloud.json
3:46:29 PM [SUCCESS] Config file 'aerocloud.json' has been initialized in the current directory.
3:46:29 PM [INFO] Finalizing archive from directory: .
3:46:29 PM [SUCCESS] Archive created successfully: /private/tmp/audit-test-app/test.zip
3:46:29 PM [INFO] Sending deployment request to aerocloud server...
3:46:29 PM [ERROR] You must authenticate first. Please run 'aerocloud auth' to authenticate.
```
*(Exit code: 0)*

#### Exact Output (Invalid Subdomain Name)
```
3:46:50 PM [INFO] Deploying your application to aerocloud...
Checking for existing config file at: /private/tmp/invalid-name-test/aerocloud.json
3:46:50 PM [SUCCESS] Config file 'aerocloud.json' has been initialized in the current directory.
3:46:50 PM [INFO] Finalizing archive from directory: .
3:46:50 PM [SUCCESS] Archive created successfully: /private/tmp/invalid-name-test/test.zip
3:46:50 PM [ERROR] Invalid inputs: Invalid_Name!. Only lowercase letters, numbers and hypens are allowed.
```
*(Exit code: 1)*

#### Exact Output (Missing Build Directory / Publish Target)
```
3:46:55 PM [INFO] Deploying your application to aerocloud...
Checking for existing config file at: /private/tmp/publish-fail-test/aerocloud.json
3:46:55 PM [SUCCESS] Config file 'aerocloud.json' has been initialized in the current directory.
3:46:55 PM [ERROR] Build directory 'nonexistent_folder' does not exist. Please check your configuration.
file:///Users/goludhakad/Desktop/aerocloud/cli/dist/utils/archieve.js:28
            reject(new Error(`Build directory '${buildDir}' does not exist.`));
                   ^

Error: Build directory 'nonexistent_folder' does not exist.
    at file:///Users/goludhakad/Desktop/aerocloud/cli/dist/utils/archieve.js:28:20
    at new Promise (<anonymous>)
    at createArchive (file:///Users/goludhakad/Desktop/aerocloud/cli/dist/utils/archieve.js:8:12)
    at Command.<anonymous> (file:///Users/goludhakad/Desktop/aerocloud/cli/dist/index.js:33:33)
...
```
*(Exit code: 1)*

#### Formatting & Noise Analysis
- **Inverted Execution Flow:** 
  1. Config file is checked and created.
  2. The entire archive (`test.zip`) is compressed and saved to disk.
  3. Only AFTER compression does it validate the subdomain and check for authentication!
- **Artifact Leakage:** `test.zip` is left permanently inside the project working directory.
- **Out-of-Order Console Logging:** Due to asynchronous write stream events in `archieve.ts`, `Logger.info("Finalizing archive...")` is printed before `Logger.success("Archive created successfully...")`, but the archive output message appears interleaved.
- **Raw Docker Daemon Output:** Dumps verbose internal Docker build details (`---> Removed intermediate container 7d16ec6957c5`) straight to `process.stdout` with no spinner, indentation, or structured step rendering.
- **Uncaught Rejection Crash:** When `publish` directory is missing, `createArchive` promise rejection is uncaught in `cli/src/index.ts`, printing raw Node.js stack traces to user.
- **Misleading Success Exit on Auth Failure:** Exits with status `0` when auth check fails.

---

### Command: `aerocloud list`

#### Exact Output (Multiple Deployments)
```
3:44:36 PM [INFO] Fetching deployments list from aerocloud...
3:44:37 PM [INFO] Deployments:
{
  "subdomain": "test-app-11",
  "port": 4001,
  "status": "deployed",
  "createdAt": "2026-09-05 10:09:05",
  "containerStatus": "running",
  "memoryUsage": "19.59MB"
}
3:44:37 PM [INFO] Deployments:
{
  "subdomain": "test-app",
  "port": 4000,
  "status": "deployed",
  "createdAt": "2026-08-30 10:49:24",
  "containerStatus": "exited",
  "memoryUsage": "N/A"
}
```

#### Exact Output (Unauthenticated User)
```
3:46:25 PM [INFO] Fetching deployments list from aerocloud...
3:46:25 PM [ERROR] You must authenticate first. Please run 'aerocloud auth' to authenticate.
```
*(Exit code: 0)*

#### Formatting & Noise Analysis
- **JSON Dump Anti-Pattern:** Instead of a formatted CLI table with columns (`SUBDOMAIN`, `STATUS`, `PORT`, `MEMORY`, `CREATED`), it dumps raw JSON objects via `JSON.stringify(..., null, 2)`.
- **Repetitive Header:** Precedes every single JSON object with `3:44:37 PM [INFO] Deployments:`.
- **Unauthenticated Exit Code:** Exits with `0` despite failure.
- **Missing URL Column:** Users cannot see the reachable URLs of their deployed instances.

---

### Command: `aerocloud stop <subdomain>`

#### Exact Output (Attempting to Stop Any Deployment)
```
3:44:57 PM [INFO] Stopping deployment for subdomain: test-app-11...
<anonymous_script>:1
<!DOCTYPE html>
^

SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON
    at JSON.parse (<anonymous>)
    at parseJSONFromBytes (node:internal/deps/undici/undici:6433:19)
    at successSteps (node:internal/deps/undici/undici:6414:27)
    at readAllBytes (node:internal/deps/undici/undici:5380:13)
    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)

Node.js v24.9.0
```
*(Exit code: 1)*

#### Exact Output (Unauthenticated User)
```
3:46:33 PM [INFO] Stopping deployment for subdomain: test-app...
file:///Users/goludhakad/Desktop/aerocloud/cli/dist/index.js:162
            'Authorization': `Bearer ${getToken(false).apiKey}` // Include the API key in the Authorization header
                                                      ^

TypeError: Cannot read properties of null (reading 'apiKey')
    at Command.<anonymous> (file:///Users/goludhakad/Desktop/aerocloud/cli/dist/index.js:162:55)
...
```
*(Exit code: 1)*

#### Exact Output (Missing Subdomain Argument)
```
error: missing required argument 'subdomain'
```
*(Exit code: 1)*

#### Formatting & Noise Analysis
- **CRITICAL BUG (Route Mismatch):** Line 184 in `cli/src/index.ts` is:
  ```ts
  const response = await fetch(`http://localhost:3000/stop${subdomain}`, ...);
  ```
  Missing slash converts `/stop/:subdomain` into `/stoptest-app-11`. Express returns standard 404 HTML, causing `await response.json()` to crash.
- **CRITICAL BUG (Unauthenticated Crash):** Unchecked `getToken(false).apiKey` causes instant `TypeError`.
- **Verified Server Behavior:** When requested directly via `http://localhost:3000/stop/audit-test-01`, server properly returns `{"message":"Container stopped successfully."}`.

---

### Command: `aerocloud destroy <subdomain>`

#### Exact Output (Existing Stopped Deployment)
```
3:46:00 PM [INFO] Destroying deployment for subdomain: audit-test-01...
3:46:00 PM [SUCCESS] Container, image, and files destroyed successfully.
```
*(Exit code: 0)*

#### Exact Output (Non-existent Subdomain)
```
3:45:07 PM [INFO] Destroying deployment for subdomain: nonexistent-xyz-999...
3:45:07 PM [ERROR] Failed to destroy deployment: Deployment not found.
```
*(Exit code: 0)*

#### Exact Output (Unauthenticated User)
```
3:46:35 PM [INFO] Destroying deployment for subdomain: test-app...
file:///Users/goludhakad/Desktop/aerocloud/cli/dist/index.js:182
            'Authorization': `Bearer ${getToken(false).apiKey}` // Include the API key in the Authorization header
                                                      ^

TypeError: Cannot read properties of null (reading 'apiKey')
    at Command.<anonymous> (file:///Users/goludhakad/Desktop/aerocloud/cli/dist/index.js:182:55)
...
```
*(Exit code: 1)*

#### Formatting & Noise Analysis
- **Missing Confirmation Safety:** Destroys containers, images, and SQLite records with zero confirmation prompt (`--yes` or interactive confirmation).
- **False Zero Exit Code on 404:** When deployment is not found, logs `[ERROR]` but returns without setting exit code, exiting with status `0`.
- **Unchecked Auth Crash:** Same `TypeError: Cannot read properties of null (reading 'apiKey')` when unauthenticated.

---

### Command: `aerocloud logs [options] <subdomain>`

#### Exact Output (Static Logs — Default without `-f`)
```
3:44:41 PM [INFO] Fetching logs in real-time for subdomain: test-app-11
Logs for deployment test-app-11:
       %Logging real time test - 10:13:01 AM
       %Logging real time test - 10:13:02 AM
       %Logging real time test - 10:13:03 AM
...
```

#### Exact Output (Streaming Logs — with `-f / --follow`)
```
3:44:46 PM [INFO] Streaming logs for deployment test-app-11 (Press Ctrl+C to stop):
Logging real time test - 10:13:06 AM
Logging real time test - 10:13:07 AM
Logging real time test - 10:13:08 AM
...
```

#### Exact Output (Unauthenticated User)
```
3:46:37 PM [INFO] Fetching logs in real-time for subdomain: test-app
file:///Users/goludhakad/Desktop/aerocloud/cli/dist/index.js:206
                "Authorization": `Bearer ${getToken(false).apiKey}` // Include the API key in the Authorization header
                                                          ^

TypeError: Cannot read properties of null (reading 'apiKey')
```
*(Exit code: 1)*

#### Formatting & Noise Analysis
- **Inverted Status Text:** Running without `-f` logs `"Fetching logs in real-time for subdomain"`, when it is actually performing a static snapshot fetch of the last 100 lines.
- **Docker Multiplex Header Corruption:** Non-demuxed Docker stream header bytes (`[1, 0, 0, 0, size...]`) are converted directly to UTF-8 in `server/src/routes/logs.ts:47`, prepending random characters like `%` or `&` and 7 whitespace padding bytes to every single log line.
- **Excessive Dimming:** Static logs are rendered in `chalk.dim(...)`, making logs difficult to read on dark terminal backgrounds.
- **Missing Tail Control:** No option to specify line count (e.g., `-n, --tail 50`).

---

### Command: `aerocloud auth`

#### Exact Output (Fresh Authentication Flow)
```
3:46:03 PM [INFO] Authenticating with GitHub...
3:46:03 PM [INFO] Please complete the authentication in your browser. Waiting for callback...
3:46:06 PM [SUCCESS] Session credentials securely cached locally.
3:46:06 PM [SUCCESS] Authentication successful! Token and API Key saved.
```
*(Exit code: 0)*

#### Exact Output (Already Authenticated within 8-hour window)
```
3:46:14 PM [INFO] Authenticating with GitHub...
3:46:14 PM [SUCCESS] You are already authenticated with GitHub.
3:46:14 PM [INFO] Username: GoluScriptMage
```
*(Exit code: 0)*

#### Formatting & Noise Analysis
- **Premature Action Log:** Always outputs `"Authenticating with GitHub..."` before checking if a cached token exists.
- **Hardcoded Local Port & Race Risk:** CLI listens on port `3001` unconditionally. If `3001` is occupied, Node.js throws an unhandled `EADDRINUSE`.
- **Platform-Specific Browser Launch:** Calls `exec("open ...")`, which only functions on macOS, failing on Linux (`xdg-open`) and Windows (`start`).
- **Typo in Codebase:** Token timestamp is spelled `authenciatedAt` across `authHelper.ts` and `index.ts`.

---

### Command: `aerocloud link`

#### Exact Output (In Git Repository with existing linked remote)
```
3:46:20 PM [INFO] Linking your GitHub repository to aerocloud...
3:46:21 PM [DEBUG] Detected local Git repository: GoluScriptMage/aerocloud: aerocloud
3:46:21 PM [INFO] This repository GoluScriptMage/aerocloud is already linked to AeroCloud!
```
*(Exit code: 0)*

#### Exact Output (In Non-Git Directory — Interactive UI)
```
3:46:17 PM [INFO] Linking your GitHub repository to aerocloud...

┌─────────────────────────────────────────────────────────────┐
│  AeroCloud › Link Repository                                │
│  Select a GitHub repository to deploy with this folder      │
└─────────────────────────────────────────────────────────────┘

? Search repository: … 
no matches found? Search repository: › 
❯   aerocloud-landing         feature/deeper-aerocloud-landing  🔒 private
    GoluScriptMage            main
    aerocloud-landing-2       main  🔒 private
    lcr                       main
    aerocloud                 master  (linked)
    crumb                     master
    FocusGuard                main
    proto-redis               main
    noline-app                main
  ↓ thekua-backend            main  🔒 private✖ Search repository: › aerocloud-landing         feature/deeper-aerocloud-landing  🔒 private
3:46:18 PM [WARN] Repository linking cancelled.
```
*(Exit code: 0)*

#### Formatting & Noise Analysis
- **Unfiltered Debug Output:** `[DEBUG] Detected local Git repository: ...` is logged to standard terminal output without `--debug`.
- **Formatting Glitch:** String interpolation `${fullName}: ${name}` renders awkwardly as `GoluScriptMage/aerocloud: aerocloud`.
- **Prompt Cancellation Noise:** Pressing Ctrl+C or Escape logs `[WARN] Repository linking cancelled.` and dumps raw terminal escape sequence artifacts.

---

## 3. Comprehensive Defect & Recommendations Matrix

| # | Command | Defect Type | Root Cause | Recommended Fix |
| :---: | :--- | :--- | :--- | :--- |
| **1** | `stop` | **Fatal Crash** | Line 184: `http://localhost:3000/stop${subdomain}` missing slash. | Change to `/stop/${subdomain}`. |
| **2** | `stop`, `destroy`, `logs` | **Fatal Crash** | Unchecked dereference: `getToken(false).apiKey` when null. | Add standard guard: `const auth = getToken(false); if (!auth?.apiKey) { Logger.error(...); process.exit(1); }`. |
| **3** | `deploy`, `list`, `destroy` | **Exit Code Defect** | Function returns without setting `process.exitCode = 1` or calling `process.exit(1)`. | Standardize exit codes: `process.exit(1)` on any operational failure. |
| **4** | `deploy` | **Disk Littering** | `archieve.ts` writes hardcoded `test.zip` in `process.cwd()` without cleanup. | Write to OS temp directory (`os.tmpdir()`) or delete file in `finally {}` block. |
| **5** | `deploy` | **Inverted Logic** | Validation & auth checks run after creating the zip archive. | Check auth, sanitize subdomain, and verify directory existence BEFORE archiving. |
| **6** | `deploy` | **Unhandled Rejection** | `createArchive()` rejection not caught in `deploy`. | Wrap deployment execution in `try / catch (err)` and log clean error. |
| **7** | `list` | **Format Anti-Pattern** | Dumps raw multi-line JSON objects with repetitive `[INFO] Deployments:` headers. | Format as an ANSI table (e.g., using `cli-table3` or formatted columns with status colors). |
| **8** | `logs` | **Data Corruption** | Server does not demux Docker 8-byte multiplex header on non-streaming logs. | Demux logs or strip Docker 8-byte header before returning string; remove `chalk.dim`. |
| **9** | `logs` | **Inverted Message** | Non-streaming logs say `"Fetching logs in real-time"`. | Fix prompt string: `"Fetching recent logs..."` vs `"Streaming real-time logs..."`. |
| **10** | `init` | **False Success** | Always reports file initialized even if file already existed. | Check `fs.existsSync(targetFilePath)` first; if exists, report notice without overwriting. |
| **11** | `auth` | **Port Conflict Risk** | Hardcoded port `3001` with no fallback. | Dynamically bind to available port (`server.listen(0)`) and pass dynamic port to OAuth query. |
| **12** | Global | **Terminal Noise** | Timestamps on all user-facing CLI messages. | Reserve timestamps for verbose/debug logs; user CLI commands should follow modern CLI aesthetics (clean icons, minimal banners). |

