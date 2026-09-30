#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "../core/server.js";
import { parseArgs, HELP } from "../core/cli.js";
import { createLiveSource } from "../core/live.js";
import { createFixtureSource } from "../core/fixture.js";

const PKG_ROOT = fileURLToPath(new URL("..", import.meta.url));
/** @param {string} url */
function openBrowser(url) {
  const [cmd, args] =
    process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  try {
    const child = spawn(cmd, args, { stdio: "ignore", detached: true, windowsHide: true });
    child.on("error", () => {});
    child.unref();
  } catch {}
}

async function main() {
  let o;
  try {
    o = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`death-squadron: ${/** @type {Error} */ (err).message}\n\n${HELP}`);
    process.exit(2);
  }
  if (o.help) return console.log(HELP);
  if (o.version) return console.log(JSON.parse(readFileSync(join(PKG_ROOT, "package.json"), "utf8")).version);

  const distDir = join(PKG_ROOT, "dist");
  if (!existsSync(join(distDir, "index.html"))) {
    console.error("death-squadron: the web client is missing (dist/). From a git checkout run npm run build first.");
    process.exit(1);
  }
  const claudeDir = o.claudeDir || process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
  const source = o.fixture
    ? createFixtureSource()
    : createLiveSource({ claudeDir, launchCwd: process.cwd(), idleAfterMs: o.idleAfter * 60_000 });

  const srv = await startServer({ source, distDir, port: o.port, defaults: { skin: o.skin, flagship: o.flagship } });
  const url = `${srv.url}?skin=${o.skin}${o.flagship ? `&flagship=${encodeURIComponent(o.flagship)}` : ""}`;
  console.log(`death-squadron ${o.fixture ? "(synthetic fixture)" : `reading ${claudeDir}`}`);
  console.log(`  ${url}`);
  console.log("  Ctrl+C to stop");
  if (o.open) openBrowser(url);

  const shutdown = () => {
    srv.close().then(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main();
