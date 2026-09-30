/**
 * @typedef {"working"|"thinking"|"waiting"|"gate"|"idle"|"ended"} SessionState
 * @typedef {"think"|"shell"|"read"|"edit"|"web"|"sub"|"turn"|"gate"|"busy"} SpanType
 * @typedef {[number, number|null, SpanType]} Span
 * @typedef {[number, "compact"|"error", number?]} Mark
 * @typedef {{ id: string, type: string, description: string, state: "working"|"done", since: number, spans: Span[] }} Subagent
 * @typedef {{ id: string, name: string, folder: string, cwd?: string, state: SessionState, since: number, lastActive: number, tool: string, spans: Span[], marks: Mark[], subagents: Subagent[] }} Session
 * @typedef {{ id: string, from: string, to: string, kind: "task"|"message"|"result", t: number }} Flight
 * @typedef {{ sessions: Session[], flights: Flight[] }} Frame
 */

export const STATES = ["working", "thinking", "waiting", "gate", "idle", "ended"];

/**
 * @param {Session[]} sessions
 * @param {string} [launchCwd]
 * @returns {string|null}
 */
export function pickFlagship(sessions, launchCwd) {
  const live = sessions.filter((s) => s.state !== "ended");
  if (!live.length) return null;
  if (launchCwd) {
    const norm = (/** @type {string} */ p) => p.replace(/[\\/]+$/, "").toLowerCase();
    const here = live.filter((s) => s.cwd && norm(s.cwd) === norm(launchCwd));
    if (here.length) return mostActive(here).id;
  }
  const maxSubs = Math.max(...live.map(working));
  if (maxSubs > 0) return mostActive(live.filter((s) => working(s) === maxSubs)).id;
  return mostActive(live).id;
}

/** @param {Session} s */
function working(s) {
  return s.subagents.filter((a) => a.state === "working").length;
}

/** @param {Session[]} list */
function mostActive(list) {
  return list.reduce((a, b) => (b.lastActive > a.lastActive ? b : a));
}

/** @param {Session} s */
export function publicSession(s) {
  const { cwd, ...rest } = s;
  return rest;
}

export class Fleet {
  constructor() {
    /** @type {Map<string, string>} */
    this.last = new Map();
    /** @type {Set<string>} */
    this.sentFlights = new Set();
  }

  /**
   * @param {Frame} frame
   * @returns {{ upsert: object[], remove: string[], flights: Flight[] }}
   */
  diff(frame) {
    const seen = new Set();
    /** @type {object[]} */
    const upsert = [];
    for (const s of frame.sessions) {
      const pub = publicSession(s);
      const json = JSON.stringify(pub);
      seen.add(s.id);
      if (this.last.get(s.id) !== json) {
        this.last.set(s.id, json);
        upsert.push(pub);
      }
    }
    const remove = [...this.last.keys()].filter((id) => !seen.has(id));
    for (const id of remove) this.last.delete(id);
    const flights = frame.flights.filter((f) => !this.sentFlights.has(f.id));
    for (const f of flights) this.sentFlights.add(f.id);
    if (this.sentFlights.size > 500) this.sentFlights = new Set(frame.flights.map((f) => f.id));
    return { upsert, remove, flights };
  }

  /** @param {Frame} frame */
  reset(frame) {
    this.last.clear();
    this.sentFlights.clear();
    for (const s of frame.sessions) this.last.set(s.id, JSON.stringify(publicSession(s)));
    for (const f of frame.flights) this.sentFlights.add(f.id);
  }
}
