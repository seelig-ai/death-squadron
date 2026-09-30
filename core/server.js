import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { Fleet, pickFlagship, publicSession } from "./state.js";

export const DEFAULT_PORT = 7777;
export const PORT_WALK = 22;
export const FORBIDDEN_PORTS = new Set([3001]);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};

const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";

/**
 * @param {number} preferred
 * @returns {number[]}
 */
export function candidatePorts(preferred) {
  const out = [];
  for (let p = preferred; p <= preferred + PORT_WALK && p < 65536; p++) {
    if (!FORBIDDEN_PORTS.has(p)) out.push(p);
  }
  return out;
}

/**
 * @param {string|undefined} host
 * @param {number} port
 */
export function hostAllowed(host, port) {
  if (!host) return false;
  const h = host.toLowerCase();
  return h === `localhost:${port}` || h === `127.0.0.1:${port}` || h === `[::1]:${port}`;
}

/**
 * @typedef {{ mode: string, reader: string, launchCwd: string, read: (now: number) => import("./state.js").Frame, stop: () => void }} Source
 */

/**
 * @param {{ source: Source, distDir: string, port?: number, tickMs?: number, defaults?: { skin?: string, flagship?: string }, log?: (msg: string) => void }} opts
 */
export async function startServer(opts) {
  const { source, distDir } = opts;
  const root = resolve(distDir);
  const tickMs = opts.tickMs ?? 1000;
  const defaults = { skin: opts.defaults?.skin || "fleet", flagship: opts.defaults?.flagship || "" };
  const fleet = new Fleet();
  /** @type {Set<import("node:http").ServerResponse>} */
  const clients = new Set();
  /** @type {NodeJS.Timeout|null} */
  let timer = null;
  let port = 0;

  const flagshipOf = (/** @type {import("./state.js").Frame} */ frame) => {
    if (defaults.flagship && frame.sessions.some((s) => s.id === defaults.flagship && s.state !== "ended")) return defaults.flagship;
    return pickFlagship(frame.sessions, source.launchCwd);
  };

  const snapshotOf = (/** @type {import("./state.js").Frame} */ frame, /** @type {number} */ now) => ({
    type: "snapshot",
    now,
    mode: source.mode,
    reader: source.reader,
    rangeMin: 60,
    defaults,
    flagshipId: flagshipOf(frame),
    sessions: frame.sessions.map(publicSession),
    flights: frame.flights,
  });

  const send = (/** @type {import("node:http").ServerResponse} */ res, /** @type {object} */ msg) => {
    res.write(`data: ${JSON.stringify(msg)}\n\n`);
  };

  const tick = () => {
    const now = Date.now();
    const frame = source.read(now);
    const d = fleet.diff(frame);
    const msg = { type: "diff", now, flagshipId: flagshipOf(frame), ...d };
    for (const res of clients) send(res, msg);
  };

  const startTicking = () => {
    if (!timer) timer = setInterval(tick, tickMs);
  };
  const stopTicking = () => {
    if (timer) clearInterval(timer);
    timer = null;
    source.stop();
  };

  const server = createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    if (!hostAllowed(req.headers.host, port)) {
      res.writeHead(403, { "Content-Type": "text/plain" });
      res.end("forbidden host");
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { Allow: "GET, HEAD" });
      res.end();
      return;
    }
    const url = new URL(req.url || "/", `http://localhost:${port}`);
    if (url.pathname === "/snapshot") {
      const now = Date.now();
      const body = JSON.stringify(snapshotOf(source.read(now), now));
      res.writeHead(200, { "Content-Type": TYPES[".json"], "Cache-Control": "no-store" });
      res.end(body);
      return;
    }
    if (url.pathname === "/events") {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
      const now = Date.now();
      const frame = source.read(now);
      const d = fleet.diff(frame);
      if (d.upsert.length || d.remove.length || d.flights.length) {
        const msg = { type: "diff", now, flagshipId: flagshipOf(frame), ...d };
        for (const other of clients) send(other, msg);
      }
      send(res, snapshotOf(frame, now));
      clients.add(res);
      startTicking();
      req.on("close", () => {
        clients.delete(res);
        if (!clients.size) stopTicking();
      });
      return;
    }
    await serveStatic(url.pathname, res);
  });

  /**
   * @param {string} pathname
   * @param {import("node:http").ServerResponse} res
   */
  async function serveStatic(pathname, res) {
    let rel;
    try {
      rel = decodeURIComponent(pathname);
    } catch {
      res.writeHead(400);
      res.end();
      return;
    }
    if (rel === "/" || rel === "") rel = "/index.html";
    const file = normalize(join(root, rel));
    if (file !== root && !file.startsWith(root + sep)) {
      res.writeHead(404);
      res.end();
      return;
    }
    try {
      const body = await readFile(file);
      /** @type {Record<string, string>} */
      const headers = { "Content-Type": TYPES[/** @type {keyof typeof TYPES} */ (extname(file).toLowerCase())] || "application/octet-stream" };
      if (file.endsWith(".html")) {
        headers["Content-Security-Policy"] = CSP;
        headers["Cache-Control"] = "no-store";
      } else {
        headers["Cache-Control"] = "max-age=3600";
      }
      res.writeHead(200, headers);
      res.end(body);
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("not found");
    }
  }

  const preferred = opts.port ?? DEFAULT_PORT;
  /** @type {unknown} */
  let lastErr = null;
  for (const p of candidatePorts(preferred)) {
    try {
      await new Promise((ok, fail) => {
        const onErr = (/** @type {Error} */ err) => {
          server.off("listening", onOk);
          fail(err);
        };
        const onOk = () => {
          server.off("error", onErr);
          ok(undefined);
        };
        server.once("error", onErr);
        server.once("listening", onOk);
        server.listen(p, "127.0.0.1");
      });
      port = p;
      break;
    } catch (err) {
      lastErr = err;
      if (/** @type {NodeJS.ErrnoException} */ (err).code !== "EADDRINUSE" && /** @type {NodeJS.ErrnoException} */ (err).code !== "EACCES") throw err;
    }
  }
  if (!port) throw lastErr || new Error("no free port");

  return {
    port,
    url: `http://localhost:${port}/`,
    server,
    clientCount: () => clients.size,
    ticking: () => timer !== null,
    close: () =>
      new Promise((ok) => {
        stopTicking();
        for (const res of clients) res.end();
        clients.clear();
        server.close(() => ok(undefined));
        server.closeAllConnections?.();
      }),
  };
}
