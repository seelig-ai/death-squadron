const MIN = 60_000;
const SEC = 1000;
const LOOP = 90;

/**
 * @typedef {import("./state.js").Session} Session
 * @typedef {import("./state.js").Span} Span
 * @typedef {import("./state.js").Flight} Flight
 */

/**
 * @param {number} t0
 * @param {Array<[number, number|null, import("./state.js").SpanType]>} rel
 * @returns {Span[]}
 */
const spansAt = (t0, rel) => rel.map(([a, b, type]) => [t0 + a * MIN, b == null ? null : t0 + b * MIN, type]);

/**
 * @param {{ start?: number }} [opts]
 */
export function createFixtureSource(opts = {}) {
  const t0 = opts.start ?? Date.now();
  return {
    mode: "fixture",
    reader: "fixture",
    launchCwd: "",
    /** @param {number} now */
    read(now) {
      const e = Math.max(0, (now - t0) / SEC);
      const loop = Math.floor(e / LOOP);
      const p = e - loop * LOOP;
      const ls = t0 + loop * LOOP * SEC;
      const at = (/** @type {number} */ sec) => ls + sec * SEC;

      /** @type {Session[]} */
      const sessions = [];
      /** @type {Flight[]} */
      const flights = [];

      const scoutUp = p >= 8;
      const scoutDone = p >= 50;
      const conductor = {
        id: "fx-01",
        name: "conductor",
        folder: "command-deck",
        state: /** @type {const} */ ("working"),
        since: t0 - 25 * MIN,
        lastActive: now,
        tool: "subagent",
        spans: spansAt(t0, [[-60, -55, "think"], [-55, -51, "read"], [-51, -36, "sub"], [-36, -33, "think"], [-33, -27, "edit"], [-27, -25, "think"], [-25, null, "sub"]]),
        marks: /** @type {import("./state.js").Mark[]} */ ([[t0 - 44 * MIN, "compact", 171000]]),
        subagents: [
          { id: "fx-01a", type: "Explore", description: "recon of the build scripts", state: /** @type {const} */ ("done"), since: t0 - 36 * MIN, spans: spansAt(t0, [[-51, -45, "read"], [-45, -40, "web"], [-40, -36, "read"]]) },
          { id: "fx-01b", type: "general-purpose", description: "verify the release notes", state: /** @type {const} */ ("working"), since: t0 - 25 * MIN, spans: spansAt(t0, [[-25, -17, "read"], [-17, -10, "shell"], [-10, null, "read"]]) },
        ],
      };
      if (scoutUp) {
        /** @type {Span[]} */
        const sp = scoutDone ? [[at(8), at(30), "read"], [at(30), at(50), "web"]] : p < 30 ? [[at(8), null, "read"]] : [[at(8), at(30), "read"], [at(30), null, "web"]];
        conductor.subagents.push({ id: `fx-01c-${loop}`, type: "Explore", description: "scout the star charts", state: scoutDone ? "done" : "working", since: scoutDone ? at(50) : at(8), spans: sp });
      }
      sessions.push(conductor);

      const thinkPhase = p % 16 < 5;
      /** @type {Span[]} */
      const ticketLive = [];
      for (let c = 0; c * 16 < p; c++) {
        const a = at(c * 16), mid = at(c * 16 + 5), b = at(c * 16 + 16);
        ticketLive.push([a, mid > now ? null : mid, "think"]);
        if (mid <= now) ticketLive.push([mid, b > now ? null : b, "shell"]);
      }
      sessions.push({
        id: "fx-02",
        name: "tickets",
        folder: "support-desk",
        state: thinkPhase ? "thinking" : "working",
        since: thinkPhase ? at(Math.floor(p / 16) * 16) : at(Math.floor(p / 16) * 16 + 5),
        lastActive: now,
        tool: thinkPhase ? "thinking" : "shell",
        spans: [...spansAt(t0, [[-58, -54, "think"], [-54, -46, "web"], [-46, -40, "edit"], [-40, -37, "turn"], [-37, -34, "think"], [-34, -31, "shell"], [-31, -12, "edit"], [-12, -5, "read"], [-5, 0, "shell"]]), ...ticketLive],
        marks: [[t0 - 18 * MIN, "compact", 168000], [t0 - 31 * MIN, "error"]],
        subagents: [{ id: "fx-02a", type: "general-purpose", description: "draft the reply", state: "done", since: t0 - 12 * MIN, spans: spansAt(t0, [[-34, -30, "think"], [-30, -16, "edit"], [-16, -12, "read"]]) }],
      });

      sessions.push({
        id: "fx-03",
        name: "blog",
        folder: "field-notes",
        state: "waiting",
        since: t0 - 252 * SEC,
        lastActive: t0 - 252 * SEC,
        tool: "",
        spans: spansAt(t0, [[-60, -52, "read"], [-52, -48, "think"], [-48, -30, "edit"], [-30, -22, "web"], [-22, -10, "edit"], [-10, -4.2, "think"], [-4.2, null, "turn"]]),
        marks: [],
        subagents: [],
      });

      sessions.push({
        id: "fx-04",
        name: "deploy",
        folder: "launch-pad",
        state: "gate",
        since: t0 - 543 * SEC,
        lastActive: t0 - 543 * SEC,
        tool: "shell",
        spans: spansAt(t0, [[-56, -46, "edit"], [-46, -38, "shell"], [-38, -34, "think"], [-34, -26, "read"], [-26, -9.05, "shell"], [-9.05, null, "gate"]]),
        marks: [],
        subagents: [],
      });

      sessions.push({
        id: "fx-05",
        name: "analysis",
        folder: "star-charts",
        state: "idle",
        since: t0 - 27 * MIN,
        lastActive: t0 - 27 * MIN,
        tool: "",
        spans: spansAt(t0, [[-60, -50, "web"], [-50, -42, "read"], [-42, -38, "think"], [-38, -29, "edit"], [-29, -27, "turn"]]),
        marks: [],
        subagents: [],
      });

      const present = p < 36 || p >= 70;
      if (present) {
        const ended = p >= 30 && p < 36;
        const arrived = p >= 70 ? at(70) : t0 - 14 * MIN;
        sessions.push({
          id: "fx-06",
          name: "cleanup",
          folder: "dry-dock",
          state: ended ? "ended" : "working",
          since: ended ? at(30) : arrived,
          lastActive: ended ? at(30) : now,
          tool: ended ? "" : "edit",
          spans: ended ? [[t0 - 14 * MIN, at(30), "edit"]] : [[arrived, null, "edit"]],
          marks: [],
          subagents: [],
        });
      }

      if (p >= 8 && p < 11) flights.push({ id: `task-${loop}`, from: "fx-01", to: `fx-01c-${loop}`, kind: "task", t: at(8) });
      if (p >= 12 && p < 15) flights.push({ id: `msg-${loop}`, from: "fx-01", to: "fx-02", kind: "message", t: at(12) });
      if (p >= 40 && p < 43) flights.push({ id: `res-${loop}`, from: "fx-02", to: "fx-01", kind: "result", t: at(40) });
      if (p >= 50 && p < 53) flights.push({ id: `done-${loop}`, from: `fx-01c-${loop}`, to: "fx-01", kind: "result", t: at(50) });

      return { sessions, flights };
    },
    stop() {},
  };
}
