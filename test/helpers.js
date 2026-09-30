import { cpSync, mkdtempSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const FIXTURE_CLAUDE = fileURLToPath(new URL("./fixtures/claude", import.meta.url));
export const KEY_NAME = ["41001", "0".repeat(64), "key"].join(".");

/** @param {number} n */
export const fixtureId = (n) => ["00000000", "0000", "4000", "8000", String(n).padStart(12, "0")].join("-");

export function tempClaudeDir() {
  const dir = mkdtempSync(join(tmpdir(), "ds-test-"));
  cpSync(FIXTURE_CLAUDE, dir, { recursive: true });
  const deck = join(dir, "projects", "-home-pilot-command-deck");
  for (const d of [join(dir, "sessions"), deck, join(deck, fixtureId(1), "subagents")]) {
    writeFileSync(join(d, KEY_NAME), "synthetic, must never be opened\n");
  }
  return dir;
}

/** @param {string} dir @returns {Map<string, string>} */
export function fingerprint(dir) {
  const out = new Map();
  const walk = (/** @type {string} */ d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else out.set(p, `${st.size}:${st.mtimeMs}`);
    }
  };
  walk(dir);
  return out;
}
