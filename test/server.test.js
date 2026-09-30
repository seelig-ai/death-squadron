import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request } from "node:http";
import { startServer, candidatePorts, hostAllowed } from "../core/server.js";
import { createFixtureSource } from "../core/fixture.js";
import { createLiveSource } from "../core/live.js";
import { tempClaudeDir } from "./helpers.js";

function distDir() {
  const d = mkdtempSync(join(tmpdir(), "ds-dist-"));
  writeFileSync(join(d, "index.html"), "<!doctype html><title>x</title>");
  return d;
}

/** @returns {Promise<{ status: number, body: string, headers: import("node:http").IncomingHttpHeaders }>} */
function get(port, path, host = `localhost:${port}`) {
  return new Promise((ok, fail) => {
    const req = request({ host: "127.0.0.1", port, path, headers: { Host: host } }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => ok({ status: res.statusCode || 0, body, headers: res.headers }));
    });
    req.on("error", fail);
    req.end();
  });
}

test("port walk never offers 3001", () => {
  assert.ok(!candidatePorts(3001).includes(3001));
  assert.equal(candidatePorts(3001)[0], 3002);
  assert.equal(candidatePorts(7777)[0], 7777);
  assert.equal(candidatePorts(7777).at(-1), 7799);
});

test("host header check blocks rebinding names", () => {
  assert.ok(hostAllowed("localhost:7777", 7777));
  assert.ok(hostAllowed("127.0.0.1:7777", 7777));
  assert.ok(!hostAllowed("evil.example:7777", 7777));
  assert.ok(!hostAllowed("localhost:7778", 7777));
  assert.ok(!hostAllowed(undefined, 7777));
});

test("binds 127.0.0.1, walks to the next port when busy", async () => {
  const d = distDir();
  const a = await startServer({ source: createFixtureSource(), distDir: d, port: 17777 });
  const b = await startServer({ source: createFixtureSource(), distDir: d, port: 17777 });
  try {
    assert.equal(a.port, 17777);
    assert.equal(b.port, 17778);
    const addr = a.server.address();
    assert.equal(typeof addr === "object" && addr?.address, "127.0.0.1");
  } finally {
    await a.close();
    await b.close();
  }
});

test("refuses foreign Host headers and serves the snapshot to localhost", async () => {
  const srv = await startServer({ source: createFixtureSource(), distDir: distDir(), port: 17801 });
  try {
    const bad = await get(srv.port, "/snapshot", `attacker.example:${srv.port}`);
    assert.equal(bad.status, 403);
    const ok = await get(srv.port, "/snapshot");
    assert.equal(ok.status, 200);
    const snap = JSON.parse(ok.body);
    assert.equal(snap.type, "snapshot");
    assert.equal(snap.mode, "fixture");
    assert.ok(snap.sessions.length >= 5);
    const states = new Set(snap.sessions.map((s) => s.state));
    for (const st of ["working", "waiting", "gate", "idle"]) assert.ok(states.has(st), `fixture shows ${st}`);
    const page = await get(srv.port, "/");
    assert.match(String(page.headers["content-security-policy"]), /default-src 'self'/);
    const trav = await get(srv.port, "/..%2f..%2fpackage.json");
    assert.equal(trav.status, 404);
  } finally {
    await srv.close();
  }
});

test("live snapshot sends folder names, never the full working directory", async () => {
  const src = createLiveSource({ claudeDir: tempClaudeDir(), alive: () => true });
  const srv = await startServer({ source: src, distDir: distDir(), port: 17811 });
  try {
    const snap = JSON.parse((await get(srv.port, "/snapshot")).body);
    assert.equal(snap.reader, "discovery");
    for (const s of snap.sessions) assert.equal(s.cwd, undefined);
    assert.ok(!JSON.stringify(snap).includes("/home/pilot"));
  } finally {
    await srv.close();
  }
});

test("the stream ticks only while a tab is connected", async () => {
  const srv = await startServer({ source: createFixtureSource(), distDir: distDir(), port: 17821, tickMs: 50 });
  try {
    assert.equal(srv.ticking(), false);
    const first = await new Promise((ok, fail) => {
      const req = request({ host: "127.0.0.1", port: srv.port, path: "/events", headers: { Host: `localhost:${srv.port}` } }, (res) => {
        let buf = "";
        res.on("data", (c) => {
          buf += c;
          const i = buf.indexOf("\n\n");
          if (i > 0) {
            const msg = JSON.parse(buf.slice(6, i));
            assert.equal(srv.ticking(), true);
            req.destroy();
            ok(msg);
          }
        });
      });
      req.on("error", (e) => (/** @type {any} */ (e).code === "ECONNRESET" ? null : fail(e)));
      req.end();
    });
    assert.equal(/** @type {any} */ (first).type, "snapshot");
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(srv.clientCount(), 0);
    assert.equal(srv.ticking(), false);
  } finally {
    await srv.close();
  }
});
