import { esc, statusLine } from "./format.js";

const ROLE = {
  fleet: (s) => (s.flagship ? "EXECUTOR" : "DESTROYER"),
  bridge: (s) => (s.flagship ? "VADER" : "TROOPER"),
  plain: (s) => (s.flagship ? "FLAGSHIP" : "SESSION"),
};

const CLS = { waiting: "turn", gate: "gate", idle: "idle", ended: "ended" };

export function createHud(root, store, onPromote) {
  let skin = "fleet";
  root.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-id]");
    if (b) onPromote(b.dataset.id);
  });

  return {
    setSkin(s) {
      skin = s;
    },
    draw() {
      const now = store.now();
      const list = store.ordered();
      root.innerHTML = list
        .map((s) => {
          const cls = [CLS[s.state] || "", s.flagship ? "flag" : ""].join(" ").trim();
          const title = s.flagship ? `${s.name}, flagship` : `${s.name}, click to make flagship`;
          return `<button type="button" class="${cls}" data-id="${esc(s.id)}" title="${esc(title)}" aria-label="${esc(`${s.code} ${s.name}: ${statusLine(s, now, skin)}`)}"><b>${s.code} ${ROLE[skin](s)}</b><span>${esc(s.name)} · ${esc(statusLine(s, now, skin))}</span><small>${esc(s.folder)}</small></button>`;
        })
        .join("");
    },
  };
}
