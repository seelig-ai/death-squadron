const FLIGHT_MS = 3000;
const OVERRIDE_KEY = "death-squadron.flagship";

function readOverride() {
  try {
    return localStorage.getItem(OVERRIDE_KEY) || "";
  } catch {
    return "";
  }
}

export function createStore() {
  const sessions = new Map();
  const firstSeen = new Map();
  let order = 0;
  let skew = 0;
  let serverFlagship = null;
  let override = readOverride();
  let meta = { mode: "", reader: "", rangeMin: 60, defaults: { skin: "fleet", flagship: "" } };
  let flights = [];
  const listeners = new Set();

  const emit = () => listeners.forEach((fn) => fn());
  const now = () => Date.now() + skew;

  function upsert(list) {
    for (const s of list) {
      if (!firstSeen.has(s.id)) firstSeen.set(s.id, order++);
      sessions.set(s.id, s);
    }
  }

  function flagshipId() {
    const live = (id) => id && sessions.has(id) && sessions.get(id).state !== "ended";
    if (live(override)) return override;
    if (live(meta.defaults.flagship)) return meta.defaults.flagship;
    return live(serverFlagship) ? serverFlagship : null;
  }

  return {
    now,
    get meta() {
      return meta;
    },
    apply(msg) {
      skew = msg.now - Date.now();
      if (msg.type === "snapshot") {
        meta = { mode: msg.mode, reader: msg.reader, rangeMin: msg.rangeMin, defaults: msg.defaults };
        sessions.clear();
        upsert(msg.sessions);
        flights = msg.flights || [];
      } else {
        upsert(msg.upsert || []);
        for (const id of msg.remove || []) sessions.delete(id);
        flights = flights.concat(msg.flights || []);
      }
      serverFlagship = msg.flagshipId;
      const t = now();
      flights = flights.filter((f) => t - f.t < FLIGHT_MS);
      emit();
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    flagshipId,
    promote(id) {
      override = id;
      try {
        localStorage.setItem(OVERRIDE_KEY, id);
      } catch {}
      emit();
    },
    ordered() {
      const flag = flagshipId();
      const list = [...sessions.values()].sort((a, b) => firstSeen.get(a.id) - firstSeen.get(b.id));
      const i = list.findIndex((s) => s.id === flag);
      if (i > 0) list.unshift(...list.splice(i, 1));
      return list.map((s, k) => ({ ...s, code: String(k + 1).padStart(2, "0"), flagship: s.id === flag }));
    },
    activeFlights() {
      const t = now();
      return flights.filter((f) => t - f.t >= 0 && t - f.t < FLIGHT_MS);
    },
  };
}

export { FLIGHT_MS };
