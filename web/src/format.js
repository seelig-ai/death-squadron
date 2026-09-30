export const SPAN_NAMES = {
  think: "Thinking",
  shell: "Shell",
  read: "Read",
  edit: "Edit",
  web: "Web",
  sub: "Subagent",
  turn: "Your turn",
  gate: "Waiting at gate",
  busy: "Working, tool unknown",
};

export function mmss(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  if (m >= 100) return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function mins(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  return m >= 90 ? `${Math.round(m / 60)}h` : `${m}m`;
}

export function kTokens(n) {
  return n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
}

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function workingSubs(s) {
  return s.subagents.filter((a) => a.state === "working").length;
}

export function statusLine(s, now, skin) {
  const craft = skin === "bridge" ? "drone" : skin === "plain" ? "subagent" : "TIE";
  const subs = workingSubs(s);
  const out = subs ? ` · ${subs} ${craft}${subs > 1 ? "s" : ""} out` : "";
  switch (s.state) {
    case "working":
      return `${s.tool || "working"}${out}`;
    case "thinking":
      return `thinking${out}`;
    case "waiting":
      return `your turn ${mmss(now - s.since)}`;
    case "gate":
      return `clearance ${mmss(now - s.since)}`;
    case "idle":
      return `standby ${mins(now - s.since)}`;
    case "ended":
      return "jumped to hyperspace";
    default:
      return s.state;
  }
}
