import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { Fleet as CoreFleet } from "./vendor/live-core/index.js";

const SUB_DONE_AFTER = 5 * 60_000;
const SUB_KEEP = 30 * 60_000;
const MAX_SUBS = 8;
const FLIGHT_WINDOW = 5000;
const WALK_EVERY = 30_000;
const SPAN_TYPES = new Set(["think", "shell", "read", "edit", "web", "sub", "turn", "gate"]);

/**
 * @typedef {import("./state.js").Session} Session
 * @typedef {import("./state.js").SessionState} SessionState
 * @typedef {import("./state.js").Span} Span
 * @typedef {import("./state.js").Mark} Mark
 * @typedef {import("./state.js").Subagent} Subagent
 * @typedef {import("./state.js").Flight} Flight
 */

/** @param {string} cwd */
export const encodeCwd = (cwd) => cwd.replace(/[^a-zA-Z0-9]/g, "-");

/** @param {any[]} spans @returns {Span[]} */
export function mapSpans(spans) {
  return spans.map((s) => /** @type {Span} */ ([s.s, s.open ? null : s.e, SPAN_TYPES.has(s.c) ? s.c : "busy"]));
}

/**
 * @param {any} sum
 * @param {number} now
 * @param {number} idleAfterMs
 * @returns {{ state: SessionState, since: number, tool: string } | null}
 */
export function stateFromSummary(sum, now, idleAfterMs) {
  if (sum.openTool) return { state: "working", since: sum.openTool.s, tool: sum.openTool.tool || "" };
  if (sum.genStart != null) return { state: "thinking", since: sum.genStart, tool: "" };
  if (sum.turnEnded && sum.endAt != null) return { state: now - sum.endAt < idleAfterMs ? "waiting" : "idle", since: sum.endAt, tool: "" };
  return null;
}

/**
 * @param {{ meta: any, summary: any }} sub
 * @param {number} now
 * @returns {Subagent}
 */
export function mapSubagent(sub, now) {
  const sum = sub.summary;
  const last = sum.lastTs ?? sub.meta.mtimeMs;
  const done = sum.turnEnded || now - last > SUB_DONE_AFTER;
  return {
    id: sub.meta.agentId,
    type: sub.meta.agentType || "subagent",
    description: sub.meta.description || "",
    state: done ? "done" : "working",
    since: sum.firstTs ?? sub.meta.mtimeMs,
    spans: mapSpans(sum.spans),
  };
}

/**
 * @param {{ projectsDir: string }} opts
 */
export function createTranscriptReader(opts) {
  const core = new CoreFleet();
  /** @type {Map<string, string>} */
  const found = new Map();
  /** @type {Map<string, number>} */
  const missSince = new Map();

  /** @param {string} id @param {string} cwd @param {number} now */
  function locate(id, cwd, now) {
    const hit = found.get(id);
    if (hit && existsSync(hit)) return hit;
    const guess = cwd ? join(opts.projectsDir, encodeCwd(cwd), `${id}.jsonl`) : "";
    if (guess && existsSync(guess)) {
      found.set(id, guess);
      return guess;
    }
    const last = missSince.get(id);
    if (last != null && now - last < WALK_EVERY) return null;
    missSince.set(id, now);
    let dirs = [];
    try {
      dirs = readdirSync(opts.projectsDir);
    } catch {
      return null;
    }
    for (const d of dirs) {
      const p = join(opts.projectsDir, d, `${id}.jsonl`);
      if (existsSync(p) && statSync(p).isFile()) {
        found.set(id, p);
        missSince.delete(id);
        return p;
      }
    }
    return null;
  }

  return {
    /**
     * @param {Session[]} sessions
     * @param {number} now
     * @param {number} idleAfterMs
     * @returns {Flight[]}
     */
    enrich(sessions, now, idleAfterMs) {
      const live = sessions.filter((s) => s.state !== "ended");
      const inputs = live.map((s) => ({ id: s.id, file: locate(s.id, s.cwd || "", now) }));
      const out = core.poll(inputs, now);
      const byId = new Map(sessions.map((s) => [s.id, s]));
      const byName = new Map(sessions.filter((s) => s.name).map((s) => [s.name, s.id]));
      /** @type {Flight[]} */
      const flights = [];
      for (const row of out) {
        const s = byId.get(row.id);
        if (!s || !row.summary) continue;
        const sum = row.summary;
        const st = stateFromSummary(sum, now, idleAfterMs);
        if (st) {
          s.state = st.state;
          s.since = st.since;
          s.tool = st.tool;
        }
        if (sum.lastTs != null) s.lastActive = s.state === "working" || s.state === "thinking" ? now : sum.lastTs;
        s.spans = mapSpans(sum.spans);
        if (s.state === "waiting" && sum.endAt != null) s.spans.push([sum.endAt, null, "turn"]);
        /** @type {Mark[]} */
        const marks = [];
        for (const c of sum.compactions) marks.push(c.preTokens != null ? [c.ts, "compact", c.preTokens] : [c.ts, "compact"]);
        for (const e of sum.errors) marks.push([e.ts, "error"]);
        s.marks = marks.sort((a, b) => a[0] - b[0]);
        const subs = row.subagents
          .map((sub) => ({ sub, mapped: mapSubagent(sub, now) }))
          .filter(({ sub, mapped }) => mapped.state === "working" || now - (sub.summary.lastTs ?? sub.meta.mtimeMs) < SUB_KEEP)
          .slice(-MAX_SUBS);
        s.subagents = subs.map((x) => x.mapped);
        const subIds = new Set(s.subagents.map((x) => x.id));
        for (const sp of sum.spawns) {
          if (now - sp.at > FLIGHT_WINDOW) continue;
          flights.push({ id: `task-${sp.toolUseId}`, from: s.id, to: sp.agentId && subIds.has(sp.agentId) ? sp.agentId : s.id, kind: "task", t: sp.at });
        }
        for (const m of sum.messages) {
          const to = byName.get(m.to) || (byId.has(m.to) ? m.to : "");
          if (!to || to === s.id || now - m.at > FLIGHT_WINDOW) continue;
          flights.push({ id: `msg-${m.toolUseId}`, from: s.id, to, kind: "message", t: m.at });
        }
        for (const { sub } of subs) {
          const end = sub.summary.endAt;
          if (sub.summary.turnEnded && end != null && now - end <= FLIGHT_WINDOW) {
            flights.push({ id: `done-${sub.meta.agentId}-${end}`, from: sub.meta.agentId, to: s.id, kind: "result", t: end });
          }
        }
      }
      return flights;
    },
  };
}
