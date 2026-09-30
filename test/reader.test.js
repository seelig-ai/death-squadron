import { test } from "node:test";
import assert from "node:assert/strict";
import { join, extname, basename } from "node:path";
import { discoverSessions, folderOf } from "../core/discover.js";
import { observeOpens, readJson, listFiles } from "../core/fsguard.js";
import { createLiveSource, stateFromStatus } from "../core/live.js";
import { tempClaudeDir, fingerprint, KEY_NAME } from "./helpers.js";

test("discovery opens only .json files and never the .key file", () => {
  const dir = tempClaudeDir();
  const opened = [];
  const stop = observeOpens((p) => opened.push(p));
  const sessions = discoverSessions(dir, { alive: () => true });
  stop();
  assert.equal(sessions.length, 4);
  assert.ok(opened.length >= 4);
  for (const p of opened) assert.ok([".json", ".jsonl"].includes(extname(p)), `opened ${p}`);
  assert.ok(!opened.some((p) => basename(p) === KEY_NAME));
});

test("the guard refuses to open anything but .json and .jsonl", () => {
  const dir = tempClaudeDir();
  assert.throws(() => readJson(join(dir, "sessions", KEY_NAME)), /refused/);
  assert.throws(() => listFiles(join(dir, "sessions"), ".key"), /refused/);
  assert.throws(() => readJson(join(dir, "settings.local")), /refused/);
});

test("reading changes nothing in the Claude folder", () => {
  const dir = tempClaudeDir();
  const before = fingerprint(dir);
  const src = createLiveSource({ claudeDir: dir, alive: () => true });
  for (let i = 0; i < 3; i++) src.read(1790000400000 + i * 1000);
  assert.deepEqual(fingerprint(dir), before);
});

test("status maps to states, an old finished turn becomes idle", () => {
  assert.equal(stateFromStatus("busy", 0, 10, 600000), "working");
  assert.equal(stateFromStatus("idle", 0, 60000, 600000), "waiting");
  assert.equal(stateFromStatus("idle", 0, 700000, 600000), "idle");
});

test("live frames carry the folder name and a dead pid ends the session", () => {
  const dir = tempClaudeDir();
  const now = 1790000400000;
  let deadPid = 0;
  const src = createLiveSource({ claudeDir: dir, alive: (pid) => pid !== deadPid });
  const f1 = src.read(now);
  const cond = f1.sessions.find((s) => s.name === "conductor");
  assert.equal(cond?.folder, "command-deck");
  assert.equal(cond?.state, "working");
  assert.equal(f1.sessions.find((s) => s.name === "blog")?.state, "waiting");
  assert.equal(f1.sessions.find((s) => s.folder === "star-charts")?.state, "idle");
  deadPid = 41004;
  const f2 = src.read(now + 1000);
  assert.equal(f2.sessions.find((s) => s.name === "cleanup")?.state, "ended");
  const f3 = src.read(now + 20000);
  assert.equal(f3.sessions.find((s) => s.name === "cleanup"), undefined);
});

test("folderOf keeps only the last path segment", () => {
  assert.equal(folderOf("/home/pilot/command-deck/"), "command-deck");
  assert.equal(folderOf("D:\\work\\launch-pad"), "launch-pad");
});
