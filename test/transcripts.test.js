import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { basename, extname } from "node:path";
import { createLiveSource } from "../core/live.js";
import { encodeCwd } from "../core/transcripts.js";
import { tempClaudeDir, fingerprint, fixtureId, KEY_NAME } from "./helpers.js";

const NOW = Date.parse("2026-09-21T14:20:00.000Z");
const WATCHED = ["openSync", "readFileSync", "statSync", "existsSync", "readdirSync", "createReadStream"];

/** @param {() => void} fn @returns {string[]} */
function recordFs(fn) {
  const seen = [];
  const saved = new Map();
  for (const name of WATCHED) {
    const orig = fs[name];
    saved.set(name, orig);
    fs[name] = (/** @type {any[]} */ ...args) => {
      if (typeof args[0] === "string") seen.push(`${name}:${args[0]}`);
      return orig.apply(fs, args);
    };
  }
  syncBuiltinESMExports();
  try {
    fn();
  } finally {
    for (const [name, orig] of saved) fs[name] = orig;
    syncBuiltinESMExports();
  }
  return seen;
}

test("the transcript reader touches only .json and .jsonl files and never a .key file", () => {
  const dir = tempClaudeDir();
  const seen = recordFs(() => {
    const src = createLiveSource({ claudeDir: dir, alive: () => true });
    src.read(NOW);
    src.read(NOW + 1000);
  });
  const opened = seen.filter((e) => /^(openSync|readFileSync|createReadStream):/.test(e)).map((e) => e.slice(e.indexOf(":") + 1));
  assert.ok(opened.some((p) => p.endsWith(".jsonl")), "a transcript was read");
  for (const p of opened) assert.ok([".json", ".jsonl"].includes(extname(p)), `opened ${p}`);
  assert.ok(!seen.some((e) => basename(e) === KEY_NAME), "a .key file was touched");
});

test("transcript reads change nothing on disk", () => {
  const dir = tempClaudeDir();
  const before = fingerprint(dir);
  const src = createLiveSource({ claudeDir: dir, alive: () => true });
  for (let i = 0; i < 3; i++) src.read(NOW + i * 1000);
  assert.deepEqual(fingerprint(dir), before);
});

test("transcripts drive state, lanes, marks, subagents and flights", () => {
  const src = createLiveSource({ claudeDir: tempClaudeDir(), alive: () => true });
  assert.equal(src.reader, "transcripts");
  const frame = src.read(NOW);
  const cond = frame.sessions.find((s) => s.id === fixtureId(1));
  assert.ok(cond);
  assert.equal(cond.state, "working");
  assert.equal(cond.tool, "Bash");
  assert.ok(cond.spans.some((s) => s[2] === "sub"));
  assert.ok(cond.spans.some((s) => s[2] === "shell" && s[1] === null));
  assert.deepEqual(cond.marks.find((m) => m[1] === "compact"), [Date.parse("2026-09-21T14:12:00.000Z"), "compact", 171000]);
  assert.ok(cond.marks.some((m) => m[1] === "error"));
  assert.equal(cond.subagents.length, 1);
  assert.deepEqual([cond.subagents[0].id, cond.subagents[0].type, cond.subagents[0].state], ["a0001", "scout", "done"]);
  assert.ok(frame.flights.some((f) => f.kind === "message" && f.from === fixtureId(1) && f.to === fixtureId(2)));

  const blog = frame.sessions.find((s) => s.id === fixtureId(2));
  assert.equal(blog?.state, "waiting");
  assert.equal(blog?.since, Date.parse("2026-09-21T14:18:00.000Z"));
  assert.ok(blog?.spans.some((s) => s[2] === "turn" && s[1] === null));
});

test("a finished subagent sends a result flight back to its ship", () => {
  const src = createLiveSource({ claudeDir: tempClaudeDir(), alive: () => true });
  const frame = src.read(Date.parse("2026-09-21T14:15:01.000Z"));
  assert.ok(frame.flights.some((f) => f.kind === "result" && f.from === "a0001" && f.to === fixtureId(1)));
});

test("sessions without a transcript keep the status-file mapping", () => {
  const src = createLiveSource({ claudeDir: tempClaudeDir(), alive: () => true });
  const frame = src.read(NOW);
  const idle = frame.sessions.find((s) => s.folder === "star-charts");
  assert.equal(idle?.state, "idle");
  assert.deepEqual(idle?.marks, []);
});

test("cwd encoding matches the projects folder naming", () => {
  assert.equal(encodeCwd("/home/pilot/command-deck"), "-home-pilot-command-deck");
  assert.equal(encodeCwd("D:\\work\\launch_pad.v2"), "D--work-launch-pad-v2");
});
