#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

export const TERMS_PATH =
  process.env.DEATH_SQUADRON_GUARD_TERMS || join(homedir(), ".claude", "private", "death-squadron-guard-terms.json");

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const RULES = [{ name: "Windows user path", re: /[A-Za-z]:(\\\\|\\|\/)+Users/i }];

const isStringList = (v) => Array.isArray(v) && v.every((t) => typeof t === "string" && t.length > 0);

const TERM_KEYS = new Set(["substring", "word", "regex"]);

export function termRules(terms) {
  const isObject = terms !== null && typeof terms === "object" && !Array.isArray(terms);
  const { substring = [], word = [], regex = [] } = isObject ? terms : {};
  if (
    !isObject ||
    !Object.keys(terms).every((k) => TERM_KEYS.has(k)) ||
    !isStringList(substring) ||
    !isStringList(word) ||
    !Array.isArray(regex) ||
    !regex.every((r) => r && typeof r.source === "string" && r.source.length > 0) ||
    substring.length + word.length + regex.length === 0
  ) {
    throw new Error("guard: term list has the wrong shape, expected a non-empty { substring: [], word: [], regex: [{ source, flags }] }");
  }
  return [
    ...substring.map((t, i) => ({ name: `term #${i + 1}`, re: new RegExp(escapeRe(t), "i") })),
    ...word.map((t, i) => ({ name: `short term #${i + 1}`, re: new RegExp(`(?<![A-Za-z0-9_$])${escapeRe(t)}(?![A-Za-z0-9_$])`, "i") })),
    ...regex.map((r, i) => ({ name: `pattern #${i + 1}`, re: new RegExp(r.source, String(r.flags ?? "i").replace(/[gy]/g, "")) })),
  ];
}

export function loadTermRules(path = TERMS_PATH) {
  if (!existsSync(path)) return null;
  let terms;
  try {
    terms = JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    throw new Error(`guard: cannot parse the term list at ${path}`);
  }
  try {
    return termRules(terms);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("guard:")) throw err;
    throw new Error(`guard: the term list at ${path} holds an invalid pattern`);
  }
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const URL_RE = /https?:\/\/[^\s"'`)<>]*/gi;
const URL_ALLOW = [/^https?:\/\/(localhost|127\.0\.0\.1)([:/]|$)/i, /^http:\/\/www\.w3\.org\//i];

const BINARY_EXT = new Set([".ttf", ".woff", ".woff2", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".glb", ".tgz", ".ico"]);
const isBinary = (p) => BINARY_EXT.has(p.slice(p.lastIndexOf(".")).toLowerCase());
const isFixture = (p) => p.split(/[\\/]/).slice(0, 2).join("/") === "test/fixtures";

export function scanText(path, text, { dist = false, rules = RULES } = {}) {
  const hits = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const rule of rules) {
      if (rule.re.test(line)) hits.push({ path, line: i + 1, rule: rule.name });
    }
    if (!isFixture(path) && UUID_RE.test(line)) hits.push({ path, line: i + 1, rule: "UUID-shaped string outside test/fixtures" });
    if (dist) {
      for (const m of line.matchAll(URL_RE)) {
        if (!URL_ALLOW.some((re) => re.test(m[0]))) hits.push({ path, line: i + 1, rule: `external URL in dist: ${m[0].slice(0, 60)}` });
      }
    }
  });
  return hits;
}

function trackedFiles() {
  const out = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: ROOT });
  return out.toString("utf8").split("\0").filter(Boolean);
}

function walk(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files.push(...walk(p));
    else files.push(p);
  }
  return files;
}

function main() {
  const args = process.argv.slice(2);
  let termList;
  try {
    termList = loadTermRules();
  } catch (err) {
    console.error(err instanceof Error ? err.message : "guard: cannot load the term list");
    process.exit(1);
  }
  if (!termList) console.log(`guard: no private term list at ${TERMS_PATH}, term rules skipped`);
  const rules = [...RULES, ...(termList ?? [])];
  const hits = [];
  for (const rel of trackedFiles()) {
    const abs = join(ROOT, rel);
    if (!existsSync(abs) || isBinary(rel)) continue;
    hits.push(...scanText(rel.split(sep).join("/"), readFileSync(abs, "utf8"), { rules }));
  }
  const distDir = join(ROOT, "dist");
  if (args.includes("--dist") || existsSync(distDir)) {
    if (existsSync(distDir)) {
      for (const abs of walk(distDir)) {
        const rel = relative(ROOT, abs).split(sep).join("/");
        if (isBinary(rel)) continue;
        hits.push(...scanText(rel, readFileSync(abs, "utf8"), { dist: true, rules }));
      }
    } else if (args.includes("--dist")) {
      console.error("guard: dist/ is missing, run npm run build first");
      process.exit(1);
    }
  }
  if (hits.length) {
    console.error(`guard: ${hits.length} finding(s)`);
    for (const h of hits.slice(0, 50)) console.error(`  ${h.path}:${h.line}  ${h.rule}`);
    process.exit(1);
  }
  console.log("guard: clean");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
