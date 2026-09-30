import { SPAN_NAMES, kTokens, esc } from "./format.js";

const MAIN_H = 32, SUB_H = 18, GROUP_GAP = 8, TOP_PAD = 4, AXIS_H = 18;

export const PALETTES = {
  fleet: {
    think: "#d1d4da", read: "#a5aab3", web: "#7b808a", shell: "#484c55", edit: "#14151a", busy: "#8e939c",
    sub: "#14151a", turn: "#c8102e", gate: "#c8102e", track: "#d4d7dd", trackFill: null, grid: "#c3c7cf",
    ink: "#101114", muted: "#7b8089", axis: "#6d717a", now: "#c8102e", idle: "#9a9ea7", alert: "#c8102e", bg: "#f3f4f6", compact: "#3b5bdb", error: "#c8102e",
  },
  bridge: {
    think: "#565c67", read: "#8a919d", web: "#adb3bd", shell: "#ccd1d8", edit: "#f1f2f4", busy: "#737a86",
    sub: "#f1f2f4", turn: "#d11a2a", gate: "#d11a2a", track: null, trackFill: "#181b21", grid: "#23272e",
    ink: "#e6e7ea", muted: "#8b909a", axis: "#7d828c", now: "#d11a2a", idle: "#6d727c", alert: "#ff4a58", bg: "#0e1014", compact: "#7fb2ff", error: "#ff4a58",
  },
};
PALETTES.plain = PALETTES.fleet;

const FONT = '"Rajdhani","Segoe UI",sans-serif';
const DISPLAY = '"Michroma","Rajdhani",sans-serif';

export function legendHtml(skin, reader) {
  const p = PALETTES[skin];
  const sw = (bg, extra = "") => `<i style="background:${bg};${extra}"></i>`;
  const hatch = (c) => `repeating-linear-gradient(135deg,${c} 0 2px,transparent 2px 5px);box-shadow:inset 0 0 0 1px ${c}`;
  const stripes = (c) => `repeating-linear-gradient(90deg,${c} 0 1px,transparent 1px 4px);box-shadow:inset 0 0 0 1px ${c}`;
  const items = reader === "discovery"
    ? [[sw(p.busy), SPAN_NAMES.busy], [sw(p.turn), SPAN_NAMES.turn]]
    : [
        ...["think", "shell", "read", "edit", "web"].map((t) => [sw(p[t]), SPAN_NAMES[t]]),
        [sw("transparent", `background:${stripes(p.sub)}`), SPAN_NAMES.sub],
        [sw(p.turn), SPAN_NAMES.turn],
        [sw("transparent", `background:${hatch(p.gate)}`), SPAN_NAMES.gate],
        [sw("transparent", `width:2px;border-left:2px dashed ${p.compact}`), "Context compacted, tokens"],
        [`<i style="width:9px;height:9px;background:linear-gradient(45deg,transparent 42%,${p.error} 42% 58%,transparent 58%),linear-gradient(-45deg,transparent 42%,${p.error} 42% 58%,transparent 58%)"></i>`, "Tool error"],
      ];
  return items.map(([i, t]) => `<li>${i}${esc(t)}</li>`).join("");
}

export function createLanes(canvas, store) {
  let skin = "fleet";
  const fit = new Map();

  function fitText(g, s, max) {
    const key = g.font + "|" + max + "|" + s;
    if (fit.has(key)) return fit.get(key);
    let r = s;
    if (g.measureText(r).width > max) {
      let lo = 0, hi = s.length;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (g.measureText(s.slice(0, mid) + "…").width <= max) lo = mid;
        else hi = mid - 1;
      }
      r = s.slice(0, lo) + "…";
    }
    if (fit.size > 2000) fit.clear();
    fit.set(key, r);
    return r;
  }

  function rows(list, t0) {
    const out = [];
    let y = AXIS_H + TOP_PAD;
    for (const s of list) {
      out.push({ s, y, h: MAIN_H, main: true });
      y += MAIN_H;
      for (const a of s.subagents) {
        const last = a.spans[a.spans.length - 1];
        if (a.state !== "working" && last && (last[1] ?? Infinity) < t0) continue;
        out.push({ s: a, parent: s, y, h: SUB_H, main: false });
        y += SUB_H;
      }
      y += GROUP_GAP;
    }
    return { rows: out, height: y + 2 };
  }

  function draw() {
    const p = PALETTES[skin];
    const W = canvas.parentElement.clientWidth;
    if (!W) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const t = store.now();
    const range = store.meta.rangeMin * 60e3;
    const t0 = t - range;
    const LW = W < 520 ? 104 : 168;
    const PW = W - LW - 4;
    const X = (ts) => LW + ((ts - t0) / range) * PW;
    const list = store.ordered();
    const built = rows(list, t0);
    const H = Math.max(built.height, 60);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.height = H + "px";
    const g = canvas.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    g.textBaseline = "middle";

    g.font = `600 11px ${FONT}`;
    g.fillStyle = p.axis;
    const ticks = [0, 15, 30, 45, 60];
    for (const m of ticks) {
      const x = X(t0 + m * 60e3);
      g.textAlign = m === 0 ? "left" : m === 60 ? "right" : "center";
      g.fillText(m === 60 ? "NOW" : `-${60 - m}M`, x, 8);
      g.fillStyle = p.grid;
      g.fillRect(Math.round(x), AXIS_H, 1, H - AXIS_H);
      g.fillStyle = p.axis;
    }

    if (!list.length) {
      g.textAlign = "left";
      g.font = `600 13px ${FONT}`;
      g.fillStyle = p.muted;
      g.fillText("NO SESSIONS IN RANGE", LW, AXIS_H + 20);
    }

    for (const r of built.rows) {
      const a = r.s;
      const cy = r.y + r.h / 2;
      g.textAlign = "left";
      if (r.main) {
        const alert = a.state === "waiting" || a.state === "gate";
        g.font = `700 13px ${FONT}`;
        g.fillStyle = alert ? p.alert : a.state === "idle" || a.state === "ended" ? p.idle : p.ink;
        g.fillText(fitText(g, `${a.code} ${String(a.name).toUpperCase()}`, LW - 12), 0, r.y + 10);
        g.font = `400 8.5px ${DISPLAY}`;
        g.fillStyle = p.muted;
        g.fillText(fitText(g, String(a.folder).toUpperCase(), LW - 12), 0, r.y + 24);
      } else {
        g.fillStyle = p.grid;
        g.fillRect(6, r.y, 1, r.h / 2);
        g.fillRect(6, cy, 6, 1);
        g.font = `600 11.5px ${FONT}`;
        g.fillStyle = a.state === "working" ? p.ink : p.idle;
        g.fillText(fitText(g, String(a.description || a.type), LW - 30), 16, cy);
      }

      const barH = r.main ? 10 : 6;
      const by = Math.round(r.main ? r.y + 5 : cy - barH / 2);
      if (p.trackFill) {
        g.fillStyle = p.trackFill;
        g.fillRect(LW, by - 2, PW, barH + 4);
      } else {
        g.fillStyle = p.track;
        g.fillRect(LW, by + barH / 2, PW, 1);
      }

      const isNowTurn = (sp) => sp[1] == null && (sp[2] === "turn" || sp[2] === "gate");
      for (const sp of a.spans) {
        const [s0, e0, type] = sp;
        const e = e0 == null ? t : e0;
        if (e < t0 || s0 > t) continue;
        const x1 = Math.max(LW, X(s0)), x2 = Math.min(LW + PW, X(e));
        const bw = Math.max(1.5, x2 - x1);
        if (type === "sub") {
          g.strokeStyle = p.sub;
          g.lineWidth = 1;
          g.strokeRect(x1 + 0.5, by + 0.5, bw - 1, barH - 1);
          g.fillStyle = p.sub;
          for (let x = x1 + 2; x < x1 + bw - 1; x += 4) g.fillRect(x, by, 1, barH);
        } else if (type === "gate") {
          g.save();
          g.beginPath();
          g.rect(x1, by, bw, barH);
          g.clip();
          g.strokeStyle = p.gate;
          g.lineWidth = 1.5;
          for (let x = x1 - barH; x < x1 + bw; x += 5) {
            g.beginPath();
            g.moveTo(x, by + barH);
            g.lineTo(x + barH, by);
            g.stroke();
          }
          g.restore();
          g.strokeStyle = p.gate;
          g.strokeRect(x1 + 0.5, by + 0.5, bw - 1, barH - 1);
        } else {
          g.globalAlpha = type === "turn" && !isNowTurn(sp) ? 0.4 : 1;
          g.fillStyle = p[type] || p.busy;
          g.fillRect(x1, by, bw, barH);
          g.globalAlpha = 1;
        }
        if (e0 == null && type !== "turn" && type !== "gate") {
          const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 250);
          g.fillStyle = skin === "bridge" ? `rgba(255,255,255,${0.25 + pulse * 0.5})` : `rgba(200,16,46,${0.35 + pulse * 0.5})`;
          g.fillRect(x2 - 2, by - 1, 2, barH + 2);
        }
      }

      if (r.main && a.marks) {
        for (const [mt, kind, tokens] of a.marks) {
          if (mt < t0 || mt > t) continue;
          const x = Math.round(X(mt)) + 0.5;
          if (kind === "compact") {
            g.strokeStyle = p.compact;
            g.setLineDash([2, 2]);
            g.lineWidth = 1.5;
            g.beginPath();
            g.moveTo(x, by - 3);
            g.lineTo(x, by + barH + 3);
            g.stroke();
            g.setLineDash([]);
            if (tokens) {
              g.font = `700 10px ${FONT}`;
              g.fillStyle = p.compact;
              g.textAlign = "center";
              g.fillText(kTokens(tokens), x, by + barH + 9);
            }
          } else {
            g.strokeStyle = p.error;
            g.lineWidth = 1.6;
            g.beginPath();
            g.moveTo(x - 3.5, by - 1);
            g.lineTo(x + 3.5, by + barH + 1);
            g.moveTo(x + 3.5, by - 1);
            g.lineTo(x - 3.5, by + barH + 1);
            g.stroke();
          }
        }
      }
    }

    g.fillStyle = p.now;
    g.fillRect(LW + PW - 2, AXIS_H, 2, H - AXIS_H);
  }

  return {
    draw,
    setSkin(s) {
      skin = s;
      fit.clear();
    },
  };
}
