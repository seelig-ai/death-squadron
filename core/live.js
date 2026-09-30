import { join } from "node:path";
import { discoverSessions } from "./discover.js";
import { createTranscriptReader } from "./transcripts.js";

const MIN = 60_000;
const ENDED_HOLD = 8000;
const HISTORY = 60 * MIN;

/**
 * @typedef {import("./state.js").Session} Session
 * @typedef {import("./state.js").SessionState} SessionState
 * @typedef {import("./state.js").Span} Span
 */

/**
 * @param {string} status
 * @param {number} statusSince
 * @param {number} now
 * @param {number} idleAfterMs
 * @returns {SessionState}
 */
export function stateFromStatus(status, statusSince, now, idleAfterMs) {
  if (status === "idle") return now - statusSince < idleAfterMs ? "waiting" : "idle";
  return "working";
}

/** @param {SessionState} state @returns {import("./state.js").SpanType|null} */
const spanTypeOf = (state) => (state === "working" ? "busy" : state === "waiting" ? "turn" : null);

/**
 * @param {{ claudeDir: string, launchCwd?: string, idleAfterMs?: number, alive?: (pid: number) => boolean, transcripts?: boolean }} opts
 */
export function createLiveSource(opts) {
  const idleAfterMs = opts.idleAfterMs ?? 10 * MIN;
  /** @type {Map<string, { spans: Span[], state: SessionState, since: number, endedAt: number, base: Session }>} */
  const known = new Map();
  const transcripts = opts.transcripts === false ? null : createTranscriptReader({ projectsDir: join(opts.claudeDir, "projects") });

  return {
    mode: "live",
    reader: transcripts ? "transcripts" : "discovery",
    launchCwd: opts.launchCwd || "",
    /** @param {number} now */
    read(now) {
      const files = discoverSessions(opts.claudeDir, { alive: opts.alive });
      const present = new Set();
      for (const f of files) {
        present.add(f.id);
        const state = f.alive ? stateFromStatus(f.status, f.statusSince, now, idleAfterMs) : "ended";
        let k = known.get(f.id);
        if (!k) {
          const since = state === "ended" ? now : f.statusSince || now;
          k = { spans: [], state, since, endedAt: state === "ended" ? now - ENDED_HOLD - 1 : 0, base: /** @type {Session} */ ({}) };
          const t = spanTypeOf(state);
          if (t) k.spans.push([since, null, t]);
          known.set(f.id, k);
        } else if (k.state !== state) {
          const open = k.spans[k.spans.length - 1];
          if (open && open[1] == null) open[1] = now;
          const t = spanTypeOf(state);
          if (t) k.spans.push([now, null, t]);
          k.state = state;
          k.since = now;
          if (state === "ended") k.endedAt = now;
        }
        k.spans = k.spans.filter((s) => s[1] == null || s[1] > now - HISTORY);
        k.base = {
          id: f.id,
          name: f.name,
          folder: f.folder,
          cwd: f.cwd,
          state,
          since: k.since,
          lastActive: state === "working" ? now : Math.max(f.updatedAt, f.statusSince),
          tool: "",
          spans: k.spans,
          marks: [],
          subagents: [],
        };
      }
      for (const [id, k] of known) {
        if (!present.has(id) && k.state !== "ended") {
          k.state = "ended";
          k.endedAt = now;
          const open = k.spans[k.spans.length - 1];
          if (open && open[1] == null) open[1] = now;
          k.base = { ...k.base, state: "ended", since: now };
        }
      }
      /** @type {Session[]} */
      const sessions = [];
      for (const [id, k] of known) {
        if (k.state === "ended" && now - k.endedAt > ENDED_HOLD) {
          if (!present.has(id)) known.delete(id);
          continue;
        }
        sessions.push(k.base);
      }
      const flights = transcripts ? transcripts.enrich(sessions, now, idleAfterMs) : [];
      return { sessions, flights };
    },
    stop() {},
  };
}
