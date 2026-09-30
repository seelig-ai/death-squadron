import * as THREE from "three";

export function createTags(overlay) {
  const map = new Map();
  const v = new THREE.Vector3();
  let frame = [];

  function measure(t) {
    if (t.dirty) {
      t.w = t.el.offsetWidth;
      t.h = t.el.offsetHeight;
      t.dirty = false;
    }
  }

  return {
    place(id, world, camera, w, h, text, sub, cls) {
      let t = map.get(id);
      if (!t) {
        const el = document.createElement("div");
        el.append(document.createElement("span"), document.createElement("small"));
        overlay.append(el);
        t = { el, w: 0, h: 0, dirty: true };
        map.set(id, t);
      }
      const el = t.el;
      v.copy(world).project(camera);
      const visible = v.z > -1 && v.z < 1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2;
      el.style.display = visible ? "" : "none";
      if (!visible) return;
      const cn = `tag ${cls}`;
      if (el.className !== cn) {
        el.className = cn;
        t.dirty = true;
      }
      if (el.firstChild.textContent !== text) {
        el.firstChild.textContent = text;
        t.dirty = true;
      }
      if (el.lastChild.textContent !== sub) {
        if (el.lastChild.textContent.length !== sub.length) t.dirty = true;
        el.lastChild.textContent = sub;
      }
      t.x = (v.x * 0.5 + 0.5) * w;
      t.y = (-v.y * 0.5 + 0.5) * h;
      frame.push(t);
    },
    layout() {
      for (const t of frame) measure(t);
      frame.sort((a, b) => b.y - a.y);
      const placed = [];
      for (const t of frame) {
        let bottom = t.y;
        for (let pass = 0; pass < 8; pass++) {
          const hit = placed.find((p) => Math.abs(p.x - t.x) < (p.w + t.w) / 2 + 4 && bottom > p.top - 1 && bottom - t.h < p.bottom);
          if (!hit) break;
          bottom = hit.top - 2;
        }
        placed.push({ x: t.x, w: t.w, top: bottom - t.h, bottom });
        t.el.style.transform = `translate(${t.x.toFixed(1)}px,${bottom.toFixed(1)}px) translate(-50%,-100%)`;
      }
      frame = [];
    },
    keep(ids) {
      for (const [id, t] of map) {
        if (!ids.has(id)) {
          t.el.remove();
          map.delete(id);
        }
      }
    },
  };
}
