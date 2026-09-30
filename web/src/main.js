import "./styles.css";
import { createStore } from "./store.js";
import { createHud } from "./hud.js";
import { createLanes, legendHtml } from "./lanes.js";
import { EMPIRE_PATH } from "./crest.js";

const $ = (id) => document.getElementById(id);
const store = createStore();
const SKIN_KEY = "death-squadron.skin";
const SKINS = ["fleet", "bridge", "plain"];
const TITLES = {
  fleet: ["FLEET STATUS", "fleet status", "FLEET DEPLOYMENT", "deployment", "vessel"],
  bridge: ["COMMAND BRIDGE", "bridge", "STATION CONSOLES", "consoles", "station"],
  plain: ["SESSIONS", "sessions", "TIMELINE", "timeline", "session"],
};

const crestSvg = `<svg viewBox="0 0 496 512" aria-hidden="true"><path d="${EMPIRE_PATH}"/></svg>`;
document.querySelectorAll("[data-crest]").forEach((el) => (el.innerHTML = crestSvg));

const params = new URLSearchParams(location.search);
let skin = (() => {
  const fromUrl = params.get("skin");
  if (SKINS.includes(fromUrl)) return fromUrl;
  try {
    const saved = localStorage.getItem(SKIN_KEY);
    if (SKINS.includes(saved)) return saved;
  } catch {}
  return "fleet";
})();
if (params.get("flagship")) store.promote(params.get("flagship"));

const hud = createHud($("hud"), store, (id) => store.promote(id));
const lanes = createLanes($("lanes"), store);
let engine = null;
let loading = null;
let reserve = [0, 0];

function onReserve(n, ties) {
  reserve = [n, ties];
  const el = $("reserve");
  const parts = [];
  if (n) parts.push(`+${n} ${skin === "bridge" ? "stations" : "vessels"} in reserve`);
  if (ties) parts.push(`+${ties} ${skin === "bridge" ? "drones" : "TIEs"} in reserve`);
  el.hidden = !parts.length;
  el.textContent = parts.join(" · ");
}

async function loadSkin(name) {
  if (name === "plain") {
    engine?.stop();
    return;
  }
  const token = (loading = Symbol(name));
  const [{ createEngine }, mod] = await Promise.all([
    import("./engine.js"),
    name === "bridge" ? import("../skins/bridge/scene.js") : import("../skins/fleet/scene.js"),
  ]);
  if (loading !== token) return;
  engine ||= createEngine($("scene"), $("overlay"));
  engine.setSkin(name === "bridge" ? mod.createBridge : mod.createFleet, { store, onReserve });
}

function setSkin(name) {
  skin = name;
  document.body.dataset.skin = name;
  try {
    localStorage.setItem(SKIN_KEY, name);
  } catch {}
  const [t, ta, l, la] = TITLES[name];
  $("title").textContent = t;
  $("title-aur").textContent = ta;
  $("lanes-name").textContent = l;
  $("lanes-aur").textContent = la;
  document.querySelectorAll(".skins button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.skin === name)));
  hud.setSkin(name);
  lanes.setSkin(name);
  $("legend").innerHTML = legendHtml(name, store.meta.reader);
  $("reserve").hidden = true;
  loadSkin(name);
  render();
}

document.querySelector(".skins").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-skin]");
  if (b && b.dataset.skin !== skin) setSkin(b.dataset.skin);
});

function render() {
  const list = store.ordered();
  const need = list.filter((s) => s.state === "waiting" || s.state === "gate").length;
  const live = list.filter((s) => s.state !== "ended").length;
  const noun = TITLES[skin][4];
  $("counts").innerHTML = `${live} ${noun}${live === 1 ? "" : "s"} · <span class="needs">${need} need${need === 1 ? "s" : ""} you</span> · T-${store.meta.rangeMin || 60}`;
  $("empty").hidden = live > 0 || !store.meta.mode;
  hud.draw();
  lanes.draw();
  const m = store.meta;
  $("mode").textContent = m.mode === "fixture" ? "Synthetic fixture, no real sessions" : m.reader === "discovery" ? "Live · session files only" : m.mode ? "Live · read-only" : "";
}

let lastReader = "";
store.subscribe(() => {
  if (store.meta.reader !== lastReader) {
    lastReader = store.meta.reader;
    $("legend").innerHTML = legendHtml(skin, lastReader);
  }
  engine?.sync();
  render();
});

let es = null;
let tick = null;
function connect() {
  if (es) return;
  es = new EventSource("./events");
  es.onmessage = (e) => {
    $("linklost").hidden = true;
    store.apply(JSON.parse(e.data));
  };
  es.onerror = () => {
    $("linklost").hidden = false;
  };
  tick = setInterval(render, 1000);
}
function disconnect() {
  es?.close();
  es = null;
  clearInterval(tick);
  tick = null;
}
document.addEventListener("visibilitychange", () => (document.hidden ? disconnect() : connect()));
addEventListener("resize", () => lanes.draw());

setSkin(skin);
if (!document.hidden) connect();
window.__deathSquadron = { store, get engine() { return engine; }, get reserve() { return reserve; } };
