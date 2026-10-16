// Root startup file for Hostinger Node.js app (Passenger).
// Set this file as the "Application startup file". It launches the built API
// server, which also serves the exported frontend on the same domain.
//
// If the server cannot start (missing build, bad env, native module problem...), instead of the host's
// opaque "503 Service Unavailable" we keep a tiny responder alive that says so and writes the (redacted)
// error to startup-error.txt next to this file. Set STARTUP_DEBUG=true to also show it on the page.
// Normalise env values that hosting panels often capitalise ("TRUE", "PRODUCTION").
for (const k of ["NODE_ENV", "AUTO_MIGRATE", "LITE_MODE", "TRUST_PROXY", "STARTUP_DEBUG", "SETUP_DEBUG", "CLAUDE_MODEL"]) {
  if (typeof process.env[k] === "string") process.env[k] = process.env[k].trim().toLowerCase();
}
const http = require("http");
const fs = require("fs");
const path = require("path");

function redact(msg) {
  return String(msg).replace(/[a-z][a-z0-9+.-]*:\/\/[^\s"']+/gi, "<url>").replace(/\s+/g, " ").slice(0, 600);
}

let started = false;
globalThis.__aiosFallback = function fallback(err) {
  if (started) return;
  started = true;
  const msg = redact((err && err.message) || err);
  const code = err && err.code ? ` [${err.code}]` : "";
  console.error("[aiOS] STARTUP FAILED:", msg + code);
  try { fs.writeFileSync(path.join(__dirname, "startup-error.txt"), `${new Date().toISOString()}\nnode ${process.version}\n${msg}${code}\n`); } catch (_) {}
  const detail = process.env.STARTUP_DEBUG === "true" ? `<p><code>${msg.replace(/[<>&]/g, "")}${code}</code></p>` : "<p>Details are in <code>startup-error.txt</code> (File Manager, app root) and the Node.js app log. Set <code>STARTUP_DEBUG=true</code> to show them here temporarily.</p>";
  const raw = process.env.PORT || "4000";
  try {
    http.createServer((req, res) => {
      res.writeHead(503, { "content-type": req.url === "/health" ? "application/json" : "text/html; charset=utf-8", "cache-control": "no-store" });
      res.end(req.url === "/health" ? '{"ok":false,"startupFailed":true}' : `<!doctype html><meta charset="utf-8"><title>aiOS — startup failed</title><body style="font-family:system-ui;max-width:640px;margin:12vh auto;padding:0 20px"><h1>aiOS could not start</h1><p>The application process is running, but the server failed during startup.</p>${detail}</body>`);
    }).listen(/^\d+$/.test(raw) ? { port: Number(raw), host: "0.0.0.0" } : { path: raw });
  } catch (e) { console.error("[aiOS] fallback listener failed:", e && e.message); process.exit(1); }
};

try {
  require("./apps/api/dist/server.js");
} catch (e) {
  globalThis.__aiosFallback(e);
}
process.on("uncaughtException", (e) => { if (!started) globalThis.__aiosFallback(e); else console.error(e); });
