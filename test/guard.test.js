import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { scanText, termRules, loadTermRules } from "../scripts/guard.js";

const GUARD = fileURLToPath(new URL("../scripts/guard.js", import.meta.url));
const UUID = ["00000000", "0000", "4000", "8000", "00000000abcd"].join("-");
const WIN_PATH = ["C:", "Users", "someone"].join("\\");
const TERMS = { substring: ["Globex Payroll"], word: ["gx"], regex: [{ source: "(?<!ad)vent", flags: "i" }] };

const TEMP = mkdtempSync(join(tmpdir(), "ds-guard-"));
after(() => rmSync(TEMP, { recursive: true, force: true }));

let tempCount = 0;
const tempTerms = (body) => {
  const path = join(TEMP, `terms-${++tempCount}.json`);
  writeFileSync(path, body);
  return path;
};

const runGuard = (termsPath) => {
  try {
    const stdout = execFileSync(process.execPath, [GUARD], { env: { ...process.env, DEATH_SQUADRON_GUARD_TERMS: termsPath }, stdio: "pipe" });
    return { code: 0, out: stdout.toString("utf8") };
  } catch (err) {
    return { code: err.status, out: `${err.stdout}${err.stderr}` };
  }
};

test("guard flags user paths and ids without a term list", () => {
  assert.ok(scanText("a.md", WIN_PATH).length);
  assert.ok(scanText("a.md", UUID).length);
  assert.equal(scanText("a.md", "Globex Payroll").length, 0);
});

test("term rules catch substrings, whole short words and patterns", () => {
  const rules = termRules(TERMS);
  assert.ok(scanText("a.md", "the globex payroll export", { rules }).length);
  assert.ok(scanText("a.md", "the gx site", { rules }).length);
  assert.ok(scanText("a.md", "Vent Education", { rules }).length);
  assert.ok(scanText("a.md", "vent-workspace", { rules }).length);
  assert.equal(scanText("a.md", "an adventure for the fleet", { rules }).length, 0);
  assert.equal(scanText("a.js", "var thgxo=1", { rules }).length, 0);
});

test("guard lets fixtures through", () => {
  assert.equal(scanText("test/fixtures/claude/x.json", UUID).length, 0);
});

test("dist may only reference localhost and XML namespaces", () => {
  assert.ok(scanText("dist/a.js", "fetch('https://example.com/x')", { dist: true }).length);
  assert.equal(scanText("dist/a.js", "'http://www.w3.org/2000/svg' 'http://localhost:7777/'", { dist: true }).length, 0);
});

test("the term list loads from a file and is optional", () => {
  assert.equal(loadTermRules(join(tmpdir(), "ds-guard-missing", "terms.json")), null);
  const rules = loadTermRules(tempTerms(JSON.stringify(TERMS)));
  assert.ok(rules && scanText("a.md", "Globex Payroll", { rules }).length);
});

test("a broken term list fails without echoing its contents", () => {
  assert.throws(() => loadTermRules(tempTerms('{"substring": ["Globex Payroll"')), (err) => !err.message.includes("Globex"));
  assert.throws(() => loadTermRules(tempTerms('{"regex": [{"source": "Globex(("}]}')), (err) => !err.message.includes("Globex"));
  assert.throws(() => loadTermRules(tempTerms('{"word": ["Globex", 7]}')), (err) => !err.message.includes("Globex"));
});

test("a term list with the wrong keys or no terms fails instead of checking nothing", () => {
  for (const body of ['{"substrings": ["Globex"]}', "[]", "{}", '{"substring": []}', "null"]) {
    assert.throws(() => loadTermRules(tempTerms(body)), /wrong shape/, body);
  }
});

test("a term list saved with a byte-order mark still loads", () => {
  const rules = loadTermRules(tempTerms(`\uFEFF${JSON.stringify(TERMS)}`));
  assert.ok(rules && scanText("a.md", "Globex Payroll", { rules }).length);
});

test("the guard CLI skips term rules with a note when the list is missing", () => {
  const { code, out } = runGuard(join(tmpdir(), "ds-guard-missing", "terms.json"));
  assert.equal(code, 0);
  assert.match(out, /term rules skipped/);
});

test("the guard CLI exits on a broken term list without echoing it", () => {
  const { code, out } = runGuard(tempTerms('{"substring": ["Globex"'));
  assert.equal(code, 1);
  assert.match(out, /cannot parse/);
  assert.doesNotMatch(out, /Globex/);
});

test("the guard CLI fails on a listed term found in the repo", () => {
  const { code, out } = runGuard(tempTerms(JSON.stringify({ substring: ["Permission is hereby granted"] })));
  assert.equal(code, 1);
  assert.match(out, /LICENSE:\d+ {2}term #1/);
  assert.doesNotMatch(out, /term rules skipped/);
});
