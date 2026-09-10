// Refined Calibrated Developer Palette with:
// 1. BOLD Table Headings (Prominent & high-contrast)
// 2. CPU Usage column added alongside Memory
// 3. Clean status badges and routes

const reset = "\x1b[0m";
const bold = "\x1b[1m";
const dim = "\x1b[2m";
const underline = "\x1b[4m";

const cyan = "\x1b[36m";
const green = "\x1b[32m";
const yellow = "\x1b[33m";
const red = "\x1b[31m";
const white = "\x1b[37m";

console.clear();

console.log("\n" + bold + cyan + "══════════════════════════════════════════════════════════════════" + reset);
console.log(bold + cyan + "       ☁  AEROCLOUD CLI — TABLE WITH CPU & BOLD HEADERS            " + reset);
console.log(bold + cyan + "══════════════════════════════════════════════════════════════════\n" + reset);

console.log(bold + cyan + "☁  AeroCloud Deployments " + reset + dim + "(2 active)" + reset);
console.log();

// 1. Table Headers in BOLD WHITE
const hSub = bold + white + "SUBDOMAIN".padEnd(16) + reset;
const hStat = bold + white + "STATUS".padEnd(14) + reset;
const hPort = bold + white + "PORT".padEnd(9) + reset;
const hCpu = bold + white + "CPU".padEnd(10) + reset;
const hMem = bold + white + "MEMORY".padEnd(14) + reset;
const hUrl = bold + white + "LIVE ROUTE" + reset;

console.log(`  ${hSub}${hStat}${hPort}${hCpu}${hMem}${hUrl}`);
console.log(dim + "  ────────────────────────────────────────────────────────────────────────────────────────" + reset);

// 2. Table Rows with live CPU & Memory
console.log(
    "  " + bold + white + "my-service".padEnd(16) + reset +
    bold + green + "● running".padEnd(14) + reset +
    dim + ":4028".padEnd(9) + reset +
    yellow + "0.4%".padEnd(10) + reset +
    dim + "42.50MB".padEnd(14) + reset +
    cyan + underline + "http://my-service.localhost:8080" + reset
);

console.log(
    "  " + bold + white + "test-app-11".padEnd(16) + reset +
    dim + "○ stopped".padEnd(14) + reset +
    dim + "-".padEnd(9) + reset +
    dim + "0.0%".padEnd(10) + reset +
    dim + "0.00MB".padEnd(14) + reset +
    dim + "http://test-app-11.localhost:8080" + reset
);
