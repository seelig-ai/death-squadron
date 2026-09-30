import { basename, join } from "node:path";
import { listFiles, readJson } from "./fsguard.js";

/**
 * @typedef {object} SessionFile
 * @property {string} id
 * @property {number} pid
 * @property {string} name
 * @property {string} cwd
 * @property {string} folder
 * @property {string} status
 * @property {number} startedAt
 * @property {number} updatedAt
 * @property {number} statusSince
 * @property {boolean} alive
 */

/** @param {number} pid */
export function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return /** @type {NodeJS.ErrnoException} */ (err).code === "EPERM";
  }
}

/** @param {string} cwd */
export function folderOf(cwd) {
  if (!cwd) return "";
  return basename(cwd.replace(/[\\/]+$/, "")) || cwd;
}

/**
 * @param {string} claudeDir
 * @param {{ alive?: (pid: number) => boolean }} [opts]
 * @returns {SessionFile[]}
 */
export function discoverSessions(claudeDir, opts = {}) {
  const alive = opts.alive || pidAlive;
  /** @type {SessionFile[]} */
  const out = [];
  for (const path of listFiles(join(claudeDir, "sessions"), ".json")) {
    /** @type {any} */
    let d;
    try {
      d = readJson(path);
    } catch {
      continue;
    }
    if (!d || typeof d.sessionId !== "string") continue;
    const cwd = typeof d.cwd === "string" ? d.cwd : "";
    out.push({
      id: d.sessionId,
      pid: Number(d.pid) || 0,
      name: typeof d.name === "string" && d.name ? d.name : folderOf(cwd),
      cwd,
      folder: folderOf(cwd),
      status: typeof d.status === "string" ? d.status : "",
      startedAt: Number(d.startedAt) || 0,
      updatedAt: Number(d.updatedAt) || 0,
      statusSince: Number(d.statusUpdatedAt) || Number(d.updatedAt) || 0,
      alive: alive(Number(d.pid)),
    });
  }
  return out;
}
