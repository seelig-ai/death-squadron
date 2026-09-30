import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";

export const ALLOWED_EXT = new Set([".json", ".jsonl"]);

/** @type {Set<(path: string) => void>} */
const observers = new Set();

/**
 * @param {(path: string) => void} fn
 * @returns {() => void}
 */
export function observeOpens(fn) {
  observers.add(fn);
  return () => observers.delete(fn);
}

/** @param {string} path */
function assertAllowed(path) {
  const ext = extname(path).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) throw new Error(`refused to open ${ext || "extensionless"} file`);
  for (const fn of observers) fn(path);
}

/**
 * @param {string} dir
 * @param {string} ext
 * @returns {string[]}
 */
export function listFiles(dir, ext) {
  if (!ALLOWED_EXT.has(ext)) throw new Error(`refused to list ${ext} files`);
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names.filter((n) => extname(n).toLowerCase() === ext).map((n) => join(dir, n));
}

/**
 * @param {string} path
 * @returns {unknown}
 */
export function readJson(path) {
  assertAllowed(path);
  return JSON.parse(readFileSync(path, { encoding: "utf8", flag: "r" }));
}

/**
 * @param {string} path
 * @returns {number}
 */
export function sizeOf(path) {
  assertAllowed(path);
  return statSync(path).size;
}
