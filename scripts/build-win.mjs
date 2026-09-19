#!/usr/bin/env node
/**
 * Builds the Windows distributables: an NSIS installer and a portable .exe.
 *
 * electron-builder normally pulls the Electron runtime and its own toolchain
 * (NSIS, winCodeSign) from GitHub releases. On networks where GitHub is blocked
 * or TLS-intercepted that download fails, so this script defaults those URLs to
 * the npmmirror binary CDN. Any variable already present in the environment wins,
 * so you can point them at your own mirror.
 *
 * Code signing is optional and off by default. To sign, supply a certificate:
 *
 *   $env:CSC_LINK = "C:\path\to\cert.pfx"     # or a base64 blob / https URL
 *   $env:CSC_KEY_PASSWORD = "..."
 *   npm run dist:win
 *
 * Without those, the build still succeeds and the exe is left unsigned (Windows
 * SmartScreen will warn about an unknown publisher).
 *
 *   npm run dist:win
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const defaults = {
  ELECTRON_MIRROR: "https://cdn.npmmirror.com/binaries/electron/",
  ELECTRON_BUILDER_BINARIES_MIRROR:
    "https://cdn.npmmirror.com/binaries/electron-builder-binaries/",
  // There is no code-signing certificate in this project; stop electron-builder
  // from searching the certificate store for one.
  CSC_IDENTITY_AUTO_DISCOVERY: "false",
};

const env = { ...process.env };
for (const [key, value] of Object.entries(defaults)) {
  if (!env[key]) env[key] = value;
}

const isWindows = process.platform === "win32";

/** Prefer the locally installed CLI over anything on PATH. */
function bin(name) {
  const local = path.join(root, "node_modules", ".bin", isWindows ? `${name}.cmd` : name);
  return existsSync(local) ? local : name;
}

function run(label, command, args) {
  return new Promise((resolve, reject) => {
    console.log(`\n=== ${label} ===`);
    // stdio "inherit" streams straight to this terminal; nothing is piped.
    const child = spawn(command, args, {
      cwd: root,
      env,
      stdio: "inherit",
      shell: isWindows,
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${label} failed with exit code ${code}`)),
    );
  });
}

await run("Type-check", bin("tsc"), []);
await run("Bundle renderer", bin("vite"), ["build"]);

console.log(
  env.CSC_LINK || env.WIN_CSC_LINK
    ? "\n=== Signing with the provided certificate ==="
    : "\n=== No signing certificate set; building unsigned ===",
);
await run("Package for Windows", bin("electron-builder"), ["--win"]);

console.log("\nDone. Artifacts written to ./release");
