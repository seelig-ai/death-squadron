import { cpSync, mkdirSync, rmSync, writeFileSync, readdirSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const FILES = ["types.ts", "categorize.ts", "ingest.ts", "chat.ts", "file-guard.ts", "tail.ts", "subagents.ts", "reader.ts"];
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = process.argv[2];
const commit = process.argv[3] || "unknown";
if (!src) {
  console.error("usage: node scripts/vendor-core.js <live-core dir> <commit>");
  process.exit(2);
}

const stage = join(root, ".vendor-src");
const out = join(root, "core", "vendor", "live-core");
rmSync(stage, { recursive: true, force: true });
rmSync(out, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
for (const f of FILES) cpSync(join(src, f), join(stage, f));

const tsc = join(root, "node_modules", "typescript", "bin", "tsc");
try {
  execFileSync(process.execPath, [tsc, "-p", join(root, "tsconfig.vendor.json")], { stdio: "inherit" });
} finally {
  rmSync(stage, { recursive: true, force: true });
}

const PRAGMA = "// @ts-nocheck\n";
for (const f of readdirSync(out)) {
  if (!f.endsWith(".js")) continue;
  const p = join(out, f);
  writeFileSync(p, PRAGMA + readFileSync(p, "utf8"));
}

const index = FILES.filter((f) => f !== "types.ts").map((f) => `export * from "./${f.replace(/\.ts$/, ".js")}";`).join("\n");
writeFileSync(join(out, "index.js"), `${PRAGMA}${index}\n`);
writeFileSync(join(out, "SOURCE"), `live-core ${commit}\n`);
console.log(`vendored ${readdirSync(out).length} files from ${commit}`);
