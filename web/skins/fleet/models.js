import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const HULL_TOP = new THREE.Color("#c9cdd4");
const HULL_LOW = new THREE.Color("#666b74");
const SUPER = new THREE.Color("#b3b8c0");
const DOME = new THREE.Color("#d6dae0");
const DARK = new THREE.Color("#2e323a");
const WING = new THREE.Color("#2b2f37");
const FRAME = new THREE.Color("#9ea4ae");

export function prep(geo, color) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  if (g.getAttribute("uv")) g.deleteAttribute("uv");
  g.computeVertexNormals();
  const n = g.getAttribute("position").count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) color.toArray(c, i * 3);
  g.setAttribute("color", new THREE.BufferAttribute(c, 3));
  return g;
}

export function box(w, h, d, x, y, z, color, rx = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx) g.rotateX(rx);
  g.translate(x, y, z);
  return prep(g, color);
}

function wedge(width, top, bottom) {
  const N = [0, 0, -0.5], RL = [-width / 2, 0, 0.5], RR = [width / 2, 0, 0.5], RT = [0, top, 0.5], RB = [0, -bottom, 0.5];
  const tris = [N, RT, RR, N, RL, RT, N, RR, RB, N, RB, RL, RL, RB, RR, RL, RR, RT];
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(tris.flat(), 3));
  g.computeVertexNormals();
  const c = new Float32Array(tris.length * 3);
  for (let i = 0; i < tris.length; i++) (i < 6 ? HULL_TOP : HULL_LOW).toArray(c, i * 3);
  g.setAttribute("color", new THREE.BufferAttribute(c, 3));
  return g;
}

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function greebles(width, top, count, seed, zFrom, zTo) {
  const r = rng(seed);
  const out = [];
  for (let i = 0; i < count; i++) {
    const z = zFrom + r() * (zTo - zFrom);
    const half = (width / 2) * (z + 0.5);
    const x = (r() * 2 - 1) * half * 0.8;
    const y = top * (z + 0.5) * (1 - Math.abs(x) / half);
    const s = 0.008 + r() * 0.016;
    out.push(box(s * (1 + r()), s * 0.7, s * (1 + r() * 2), x, y + s * 0.2, z, r() < 0.5 ? SUPER : HULL_TOP));
  }
  return out;
}

export function destroyerGeometry() {
  const parts = [wedge(0.6, 0.075, 0.06)];
  parts.push(box(0.22, 0.03, 0.3, 0, 0.06, 0.33, SUPER));
  parts.push(box(0.15, 0.03, 0.22, 0, 0.088, 0.37, SUPER));
  parts.push(box(0.09, 0.026, 0.14, 0, 0.114, 0.41, SUPER));
  parts.push(box(0.03, 0.045, 0.03, 0, 0.145, 0.44, DARK));
  parts.push(box(0.13, 0.03, 0.035, 0, 0.178, 0.44, SUPER));
  for (const x of [-0.045, 0.045]) {
    const d = new THREE.SphereGeometry(0.018, 10, 6);
    d.translate(x, 0.2, 0.44);
    parts.push(prep(d, DOME));
  }
  parts.push(...greebles(0.6, 0.075, 34, 7, -0.3, 0.2));
  return mergeGeometries(parts);
}

export function executorGeometry() {
  const parts = [wedge(0.2, 0.03, 0.024)];
  const r = rng(11);
  for (let i = 0; i < 22; i++) {
    const z = 0.22 + r() * 0.24;
    const w = 0.02 + r() * 0.05;
    parts.push(box(w, 0.01 + r() * 0.025, 0.02 + r() * 0.05, (r() * 2 - 1) * 0.04, 0.03, z, r() < 0.6 ? SUPER : HULL_TOP));
  }
  parts.push(box(0.012, 0.02, 0.012, 0, 0.06, 0.46, DARK));
  parts.push(box(0.07, 0.014, 0.02, 0, 0.074, 0.46, SUPER));
  for (const x of [-0.024, 0.024]) {
    const d = new THREE.SphereGeometry(0.008, 10, 6);
    d.translate(x, 0.086, 0.46);
    parts.push(prep(d, DOME));
  }
  parts.push(...greebles(0.2, 0.03, 60, 13, -0.4, 0.2));
  return mergeGeometries(parts);
}

export function spineGeometry() {
  const parts = [];
  for (let i = 0; i < 16; i++) {
    const z = -0.36 + i * 0.036;
    parts.push(new THREE.BoxGeometry(0.006, 0.004, 0.018).translate(0, 0.03 * (z + 0.5) + 0.003, z));
  }
  return mergeGeometries(parts);
}

export function engineLayout(kind) {
  if (kind === "executor") return [-0.06, -0.03, 0, 0.03, 0.06].map((x) => [x, 0.004, 0.505]);
  return [-0.09, 0, 0.09].map((x) => [x, 0.006, 0.505]);
}

export function enginesGeometry(kind) {
  const r = kind === "executor" ? 0.011 : 0.03;
  const parts = engineLayout(kind).map(([x, y, z]) => new THREE.CylinderGeometry(r, r * 0.9, 0.02, 12).rotateX(Math.PI / 2).translate(x, y, z));
  return mergeGeometries(parts);
}

export function tieGeometry() {
  const parts = [];
  for (const x of [-0.055, 0.055]) {
    const w = new THREE.CylinderGeometry(0.06, 0.06, 0.006, 6).rotateZ(Math.PI / 2).rotateX(Math.PI / 6).translate(x, 0, 0);
    parts.push(prep(w, WING));
    const rim = new THREE.CylinderGeometry(0.012, 0.012, 0.008, 6).rotateZ(Math.PI / 2).translate(x, 0, 0);
    parts.push(prep(rim, FRAME));
  }
  parts.push(prep(new THREE.CylinderGeometry(0.007, 0.007, 0.11, 6).rotateZ(Math.PI / 2), FRAME));
  parts.push(prep(new THREE.SphereGeometry(0.026, 12, 8), FRAME));
  parts.push(prep(new THREE.CircleGeometry(0.012, 8).translate(0, 0, 0.026), DARK));
  return mergeGeometries(parts);
}

let glowTex = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, "rgba(255,255,255,.75)");
  grad.addColorStop(0.6, "rgba(255,255,255,.15)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

export function starfield(count, radius, seed, opts = {}) {
  const r = rng(seed);
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    let x, y, z;
    if (opts.box) {
      [x, y, z] = [opts.box[0] + r() * (opts.box[1] - opts.box[0]), opts.box[2] + r() * (opts.box[3] - opts.box[2]), opts.box[4] + r() * (opts.box[5] - opts.box[4])];
    } else {
      const u = r() * 2 - 1, th = r() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      [x, y, z] = [radius * s * Math.cos(th), radius * u, radius * s * Math.sin(th)];
    }
    pos.set([x, y, z], i * 3);
    const b = 0.35 + r() * 0.65;
    col.set([b, b, b * (0.95 + r() * 0.1)], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const m = new THREE.PointsMaterial({ size: opts.size || 2.2, sizeAttenuation: false, vertexColors: true, map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  return new THREE.Points(g, m);
}

export function disposeTree(root) {
  root.traverse((o) => {
    if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) m.dispose();
  });
}
