import { win32 } from "node:path";
import { DEFAULT_PORT } from "./server.js";

export const SKINS = ["fleet", "bridge", "plain"];

export const HELP = `death-squadron: a Star Wars live view of your Claude Code sessions

Usage: npx death-squadron [options]

  --skin <fleet|bridge|plain>  scene to open with (default fleet)
  --port <n>                   first port to try (default ${DEFAULT_PORT}, walks up if busy, never 3001)
  --no-open                    print the URL, do not open a browser
  --flagship <sessionId>       pin the flagship session
  --claude-dir <path>          Claude folder (default CLAUDE_CONFIG_DIR, else ~/.claude)
  --idle-after <minutes>       a finished turn counts as "your turn" for this long, then idle (default 10)
  --fixture                    play a synthetic demo fleet instead of reading sessions
  -v, --version                print the version
  -h, --help                   print this help

Read-only and local-only: it reads session files Claude Code already writes, binds 127.0.0.1, and sends nothing anywhere.`;

/**
 * @param {string} platform
 * @param {string} url
 * @param {string} [systemRoot]
 * @returns {[string, string[]]}
 */
export function openCommand(platform, url, systemRoot) {
  if (platform === "win32") return [win32.join(systemRoot || "C:\\Windows", "System32", "cmd.exe"), ["/c", "start", "", url.replace(/&/g, "^&")]];
  if (platform === "darwin") return ["open", [url]];
  return ["xdg-open", [url]];
}

/**
 * @param {string[]} argv
 */
export function parseArgs(argv) {
  /** @type {{ skin: string, port: number, open: boolean, flagship: string, claudeDir: string, idleAfter: number, fixture: boolean, help: boolean, version: boolean }} */
  const o = { skin: "fleet", port: DEFAULT_PORT, open: true, flagship: "", claudeDir: "", idleAfter: 10, fixture: false, help: false, version: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const [flag, inline] = a.startsWith("--") && a.includes("=") ? [a.slice(0, a.indexOf("=")), a.slice(a.indexOf("=") + 1)] : [a, undefined];
    const val = () => {
      const v = inline ?? argv[++i];
      if (v == null) throw new Error(`${flag} needs a value`);
      return v;
    };
    switch (flag) {
      case "--skin": o.skin = val(); break;
      case "--port": o.port = Number(val()); break;
      case "--no-open": o.open = false; break;
      case "--flagship": o.flagship = val(); break;
      case "--claude-dir": o.claudeDir = val(); break;
      case "--idle-after": o.idleAfter = Number(val()); break;
      case "--fixture": o.fixture = true; break;
      case "-h": case "--help": o.help = true; break;
      case "-v": case "--version": o.version = true; break;
      default: throw new Error(`unknown option ${a}`);
    }
  }
  if (!SKINS.includes(o.skin)) throw new Error(`--skin must be one of ${SKINS.join(", ")}`);
  if (!Number.isInteger(o.port) || o.port < 1 || o.port > 65535) throw new Error("--port must be a port number");
  if (!(o.idleAfter > 0)) throw new Error("--idle-after must be a positive number of minutes");
  return o;
}
