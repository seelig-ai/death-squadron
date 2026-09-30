import * as THREE from "three";
import { disposeTree } from "../skins/fleet/models.js";

export function createEngine(canvas, overlay) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let skin = null;
  let raf = 0;
  let last = 0;
  let hidden = document.hidden;
  let inView = true;
  let fastUntil = 0;
  let frames = 0;

  function size() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    skin?.resize(w, h);
  }

  function frame(ts) {
    raf = 0;
    if (hidden || !inView || !skin) return;
    const minGap = ts < fastUntil ? 0 : 1000 / 30 - 3;
    if (ts - last >= minGap) {
      const dt = last ? Math.min(0.1, (ts - last) / 1000) : 1 / 30;
      last = ts;
      skin.frame(dt, reduced.matches);
      renderer.render(skin.scene, skin.camera);
      frames++;
    }
    raf = requestAnimationFrame(frame);
  }

  function kick() {
    if (!raf && !hidden && inView && skin) {
      last = 0;
      raf = requestAnimationFrame(frame);
    }
  }

  new ResizeObserver(size).observe(canvas);
  new IntersectionObserver(([e]) => {
    inView = e.isIntersecting;
    kick();
  }).observe(canvas);
  document.addEventListener("visibilitychange", () => {
    hidden = document.hidden;
    kick();
  });

  return {
    renderer,
    setSkin(factory, ctx) {
      if (skin) {
        skin.dispose();
        disposeTree(skin.scene);
      }
      overlay.replaceChildren();
      skin = factory({ ...ctx, renderer, canvas, overlay, engine: this });
      size();
      kick();
    },
    stop() {
      if (skin) {
        skin.dispose();
        disposeTree(skin.scene);
      }
      skin = null;
      overlay.replaceChildren();
      renderer.clear();
    },
    fast() {
      fastUntil = performance.now() + 400;
    },
    sync() {
      skin?.sync();
    },
    get frames() {
      return frames;
    },
    get running() {
      return raf !== 0;
    },
  };
}
