import { test } from "node:test";
import assert from "node:assert/strict";
import { createFixtureSource } from "../core/fixture.js";
import { Fleet, pickFlagship } from "../core/state.js";
import { parseArgs, openCommand } from "../core/cli.js";

const T0 = 1790000000000;

test("the fixture shows every legend state across one loop", () => {
  const src = createFixtureSource({ start: T0 });
  const seen = new Set();
  let flights = 0, launched = false, compact = false;
  for (let s = 0; s < 90; s++) {
    const f = src.read(T0 + s * 1000);
    for (const x of f.sessions) {
      seen.add(x.state);
      if (x.marks.some((m) => m[1] === "compact")) compact = true;
      if (x.subagents.some((a) => a.description.startsWith("scout"))) launched = true;
    }
    flights += f.flights.length;
  }
  for (const st of ["working", "thinking", "waiting", "gate", "idle", "ended"]) assert.ok(seen.has(st), st);
  assert.ok(flights > 0 && launched && compact);
});

test("fixture spans are ordered and only the last one is open", () => {
  const f = createFixtureSource({ start: T0 }).read(T0 + 37_000);
  for (const s of f.sessions) {
    const open = s.spans.filter((x) => x[1] == null);
    assert.ok(open.length <= 1, `${s.name} has ${open.length} open spans`);
    for (const [a, b] of s.spans) if (b != null) assert.ok(b >= a);
  }
});

test("diffs carry only what changed", () => {
  const src = createFixtureSource({ start: T0 });
  const fleet = new Fleet();
  const first = fleet.diff(src.read(T0 + 1000));
  assert.ok(first.upsert.length >= 5);
  const again = fleet.diff(src.read(T0 + 1000));
  assert.equal(again.upsert.length, 0);
  const later = fleet.diff(src.read(T0 + 40_000));
  assert.ok(later.remove.includes("fx-06"));
});

test("flagship: launch folder first, then most working subagents, then most recent", () => {
  const base = { folder: "", tool: "", spans: [], marks: [], since: 0 };
  const sub = { id: "a", type: "t", description: "", state: /** @type {const} */ ("working"), since: 0, spans: [] };
  const a = { ...base, id: "a", name: "a", cwd: "/x/one", state: /** @type {const} */ ("working"), lastActive: 5, subagents: [] };
  const b = { ...base, id: "b", name: "b", cwd: "/x/two", state: /** @type {const} */ ("working"), lastActive: 1, subagents: [sub] };
  const c = { ...base, id: "c", name: "c", cwd: "/x/three", state: /** @type {const} */ ("idle"), lastActive: 9, subagents: [] };
  assert.equal(pickFlagship([a, b, c], "/x/one/"), "a");
  assert.equal(pickFlagship([a, b, c], "/elsewhere"), "b");
  assert.equal(pickFlagship([a, c], ""), "c");
  assert.equal(pickFlagship([], ""), null);
});

test("cli flags parse and reject nonsense", () => {
  const o = parseArgs(["--skin", "bridge", "--port=8123", "--no-open", "--flagship", "fx-02"]);
  assert.equal(o.skin, "bridge");
  assert.equal(o.port, 8123);
  assert.equal(o.open, false);
  assert.equal(o.flagship, "fx-02");
  assert.throws(() => parseArgs(["--skin", "rebel"]));
  assert.throws(() => parseArgs(["--port", "x"]));
  assert.throws(() => parseArgs(["--hyperdrive"]));
});

test("the browser opener uses the absolute cmd.exe and escapes & on Windows", () => {
  const url = "http://127.0.0.1:7777/?skin=fleet&flagship=fx-02";
  const [cmd, args] = openCommand("win32", url, "D:\\WinNT");
  assert.equal(cmd, "D:\\WinNT\\System32\\cmd.exe");
  assert.deepEqual(args, ["/c", "start", "", "http://127.0.0.1:7777/?skin=fleet^&flagship=fx-02"]);
  assert.equal(openCommand("win32", url)[0], "C:\\Windows\\System32\\cmd.exe");
  assert.deepEqual(openCommand("darwin", url), ["open", [url]]);
  assert.deepEqual(openCommand("linux", url), ["xdg-open", [url]]);
});
