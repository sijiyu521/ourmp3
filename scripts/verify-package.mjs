#!/usr/bin/env node
/**
 * Smoke-tests a packaged build: launches the app and inspects the live DOM over
 * the Chrome DevTools Protocol.
 *
 * This catches the failure mode that a plain "does the process start?" check
 * misses — a process can start happily while the renderer shows a blank window
 * because the bundle 404s (which is what happens if Vite's `base` is left at
 * "/" and Electron loads the app over file://).
 *
 * Usage:
 *   node scripts/verify-package.mjs [path-to-exe] [--port 9222] [--attach]
 *
 * With --attach the script does not launch anything; it inspects an app that is
 * already running with --remote-debugging-port. Use that if launching from a
 * script is blocked in your environment.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const argv = process.argv.slice(2);
const attach = argv.includes("--attach");
const portIndex = argv.indexOf("--port");
const PORT = portIndex === -1 ? 9222 : Number(argv[portIndex + 1]);
const exeArg = argv.find((a) => !a.startsWith("--") && a !== String(PORT));
const exe = path.resolve(root, exeArg ?? "release/win-unpacked/OurMP3.exe");

if (!Number.isInteger(PORT) || PORT <= 0 || PORT > 65535) {
  console.error(`Invalid --port value: ${argv[portIndex + 1]}`);
  process.exit(1);
}
if (!attach && !existsSync(exe)) {
  console.error(`Executable not found: ${exe}\nRun "npm run dist:win" first.`);
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let app = null;

/** Kill the launched app and the renderer/GPU children Electron leaves behind. */
function cleanup() {
  if (!app) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(app.pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  try {
    process.kill(-app.pid);
  } catch {
    try {
      app.kill("SIGKILL");
    } catch {
      /* already gone */
    }
  }
}

async function findPage() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const page = (await res.json()).find(
        (t) => t.type === "page" && t.webSocketDebuggerUrl,
      );
      if (page) return page;
    } catch {
      /* endpoint not listening yet */
    }
    await sleep(500);
  }
  return null;
}

let ws;
let failed = false;

try {
  if (!attach) {
    console.log(`Launching ${exe}`);
    app = spawn(exe, [`--remote-debugging-port=${PORT}`], {
      detached: true,
      // No pipes: the child runs independently and its output is not captured.
      stdio: "ignore",
    });
    app.on("error", (e) => console.error(`launch error: ${e.message}`));
    app.unref();
  }

  const page = await findPage();
  if (!page) {
    throw new Error(
      `no debuggable page on port ${PORT}` +
        (attach
          ? " — is the app running with --remote-debugging-port?"
          : " — launching from a script may be blocked here; start the app " +
            `yourself with --remote-debugging-port=${PORT} and rerun with --attach`),
    );
  }

  console.log(`Target: ${page.url}`);

  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });

  let nextId = 1;
  const pending = new Map();
  const rendererErrors = [];

  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
      return;
    }
    if (msg.method === "Runtime.exceptionThrown") {
      rendererErrors.push(
        "EXCEPTION: " +
          (msg.params?.exceptionDetails?.exception?.description ??
            msg.params?.exceptionDetails?.text),
      );
    }
    if (msg.method === "Runtime.consoleAPICalled" && msg.params?.type === "error") {
      rendererErrors.push(
        "CONSOLE.ERROR: " +
          (msg.params.args ?? []).map((a) => a.value ?? a.description).join(" "),
      );
    }
  });

  const send = (method, params) => {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, resolve);
      setTimeout(() => reject(new Error(`${method} timed out`)), 15000);
      ws.send(JSON.stringify({ id, method, params }));
    });
  };

  const evaluate = async (expression) => {
    const res = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.result?.exceptionDetails) {
      throw new Error(
        "eval failed: " +
          (res.result.exceptionDetails.exception?.description ??
            res.result.exceptionDetails.text),
      );
    }
    return res.result.result.value;
  };

  await send("Runtime.enable", {});

  for (let i = 0; i < 40; i++) {
    if ((await evaluate("document.readyState")) === "complete") break;
    await sleep(250);
  }
  await sleep(1000); // let the plugin manager finish mounting

  const state = JSON.parse(
    await evaluate(`JSON.stringify({
      readyState: document.readyState,
      title: document.title,
      url: location.href,
      brand: document.querySelector('.brand-text')?.textContent ?? null,
      tagline: document.querySelector('.brand-tagline')?.textContent ?? null,
      slots: document.querySelectorAll('.slot').length,
      toolbarButtons: [...document.querySelectorAll('.toolbar-btn')].map(b => b.textContent),
      appDisplay: (() => { const el = document.querySelector('.app'); return el ? getComputedStyle(el).display : null; })(),
      scriptSrcs: [...document.querySelectorAll('script[src]')].map(s => s.getAttribute('src')),
    })`),
  );

  console.log(JSON.stringify(state, null, 2));
  if (rendererErrors.length) {
    console.log("\nRenderer errors:");
    for (const e of rendererErrors) console.log("  " + e);
  }

  const checks = [
    ["app loaded from the packaged bundle", !state.url.startsWith("http")],
    ["renderer mounted (brand text present)", state.brand === "OurMP3"],
    ["all 6 plugin slots present", state.slots === 6],
    ["layout stylesheet applied", state.appDisplay !== null],
    ["toolbar plugin rendered", state.toolbarButtons.length > 0],
    [
      "assets referenced relatively",
      state.scriptSrcs.length > 0 &&
        state.scriptSrcs.every((s) => s.startsWith("./assets/")),
    ],
    ["no renderer errors", rendererErrors.length === 0],
  ];

  console.log("");
  for (const [label, pass] of checks) {
    console.log(`  ${pass ? "PASS" : "FAIL"}  ${label}`);
    if (!pass) failed = true;
  }
  console.log(
    failed
      ? "\nFAIL: packaged app is not rendering correctly"
      : "\nPASS: packaged app rendered correctly",
  );
} catch (err) {
  console.error(`\nFAIL: ${err.message}`);
  failed = true;
} finally {
  ws?.close();
  cleanup();
}

process.exit(failed ? 1 : 0);
