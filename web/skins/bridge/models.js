import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import { prep, box } from "../fleet/models.js";
import { EMPIRE_PATH } from "../../src/crest.js";

const C = (hex) => new THREE.Color(hex);
const WHITE = C("#eceef2");
const BLACK = C("#0f1115");
const GREY = C("#9aa0a8");
const BELT = C("#c3c7ce");
const VADER = C("#0d0e12");
const VADER_HI = C("#1d2026");
const METAL = C("#9da3ad");

function capsule(r, len, x, y, z, color, rx = 0, rz = 0) {
  const g = new THREE.CapsuleGeometry(r, len, 4, 12);
  if (rx) g.rotateX(rx);
  if (rz) g.rotateZ(rz);
  g.translate(x, y, z);
  return prep(g, color);
}

function sphere(r, x, y, z, color, sx = 1, sy = 1, sz = 1) {
  const g = new THREE.SphereGeometry(r, 14, 10);
  g.scale(sx, sy, sz);
  g.translate(x, y, z);
  return prep(g, color);
}

function cyl(r, h, x, y, z, color, rz = 0) {
  const g = new THREE.CylinderGeometry(r, r, h, 14);
  if (rz) g.rotateZ(rz);
  g.translate(x, y, z);
  return prep(g, color);
}

function lathe(profile, y, color, seg = 20) {
  const g = new THREE.LatheGeometry(profile.map(([r, h]) => new THREE.Vector2(r, h)), seg);
  g.translate(0, y, 0);
  return prep(g, color);
}

export function trooperGeometry() {
  const p = [];
  for (const x of [-0.1, 0.1]) {
    p.push(capsule(0.075, 0.62, x, 0.43, 0, WHITE));
    p.push(cyl(0.08, 0.04, x, 0.45, 0, BLACK));
    p.push(box(0.12, 0.1, 0.2, x, 0.05, 0.03, WHITE));
  }
  p.push(box(0.34, 0.16, 0.22, 0, 0.86, 0, WHITE));
  p.push(box(0.36, 0.05, 0.24, 0, 0.94, 0, BELT));
  p.push(cyl(0.15, 0.14, 0, 1.02, 0, BLACK));
  const chest = new THREE.CapsuleGeometry(0.17, 0.2, 4, 12);
  chest.scale(1, 1, 0.8);
  chest.translate(0, 1.24, 0);
  p.push(prep(chest, WHITE));
  p.push(box(0.1, 0.035, 0.02, -0.04, 1.28, 0.14, BLACK));
  p.push(box(0.05, 0.05, 0.02, 0.07, 1.2, 0.14, GREY));
  for (const s of [-1, 1]) {
    p.push(sphere(0.085, s * 0.23, 1.38, 0, WHITE));
    p.push(capsule(0.055, 0.4, s * 0.27, 1.12, 0.06, WHITE, -0.35));
    p.push(sphere(0.045, s * 0.27, 0.9, 0.16, BLACK));
  }
  p.push(cyl(0.06, 0.08, 0, 1.46, 0, BLACK));
  const hy = 1.48;
  p.push(lathe([[0.001, 0], [0.13, 0], [0.15, 0.04], [0.14, 0.1], [0.125, 0.16], [0.12, 0.21], [0.1, 0.27], [0.06, 0.305], [0.001, 0.316]], hy, WHITE));
  for (const s of [-1, 1]) {
    p.push(sphere(0.034, s * 0.052, hy + 0.17, 0.112, BLACK, 1.3, 0.8, 0.5));
    p.push(cyl(0.028, 0.02, s * 0.135, hy + 0.11, 0, GREY, Math.PI / 2));
  }
  p.push(box(0.08, 0.028, 0.03, 0, hy + 0.07, 0.132, BLACK));
  p.push(box(0.012, 0.06, 0.02, 0, hy + 0.2, 0.118, GREY));
  return mergeGeometries(p);
}

export function vaderGeometry() {
  const p = [];
  for (const x of [-0.12, 0.12]) {
    p.push(capsule(0.09, 0.75, x, 0.5, 0, VADER));
    p.push(box(0.15, 0.14, 0.26, x, 0.07, -0.03, VADER_HI));
  }
  const torso = new THREE.CapsuleGeometry(0.24, 0.45, 4, 14);
  torso.scale(1, 1, 0.8);
  torso.translate(0, 1.33, 0);
  p.push(prep(torso, VADER));
  for (const s of [-1, 1]) {
    p.push(sphere(0.13, s * 0.27, 1.6, 0, VADER_HI, 1, 0.6, 1));
    p.push(capsule(0.08, 0.55, s * 0.34, 1.25, 0, VADER));
  }
  p.push(box(0.5, 0.08, 0.38, 0, 1.03, 0, C("#25282e")));
  p.push(box(0.1, 0.07, 0.03, 0, 1.03, -0.2, METAL));
  p.push(box(0.2, 0.14, 0.04, 0, 1.42, -0.2, C("#23262d")));
  p.push(box(0.03, 0.025, 0.02, -0.05, 1.44, -0.225, C("#e0263a")));
  p.push(box(0.03, 0.025, 0.02, 0, 1.44, -0.225, C("#2fb36b")));
  p.push(box(0.03, 0.025, 0.02, 0.05, 1.44, -0.225, C("#3b7cf0")));
  p.push(cyl(0.08, 0.1, 0, 1.66, 0, VADER));
  p.push(lathe([[0.001, 0], [0.2, 0], [0.2, 0.04], [0.17, 0.1], [0.15, 0.18], [0.145, 0.26], [0.13, 0.32], [0.1, 0.37], [0.05, 0.395], [0.001, 0.4]], 1.66, C("#08090b"), 24));
  p.push(box(0.16, 0.16, 0.08, 0, 1.76, -0.15, VADER_HI));
  return mergeGeometries(p);
}

export function capeGeometry() {
  const g = new THREE.PlaneGeometry(1.05, 1.55, 8, 12);
  g.translate(0, -0.775, 0);
  return g;
}

export function consoleGeometry() {
  return mergeGeometries([
    box(0.9, 0.72, 0.42, 0, 0.36, 0, C("#23262d")),
    box(0.94, 0.05, 0.5, 0, 0.74, 0.02, C("#2c3038"), -0.55),
    box(0.9, 0.06, 0.02, 0, 0.62, 0.215, C("#1a1c21")),
    box(0.06, 0.04, 0.02, -0.3, 0.45, 0.215, C("#3d424b")),
    box(0.06, 0.04, 0.02, -0.18, 0.45, 0.215, C("#3d424b")),
    box(0.06, 0.04, 0.02, 0.18, 0.45, 0.215, C("#3d424b")),
    box(0.06, 0.04, 0.02, 0.3, 0.45, 0.215, C("#3d424b")),
  ]);
}

export function screenGeometry() {
  const top = new THREE.PlaneGeometry(0.8, 0.34);
  top.rotateX(-Math.PI / 2 + 0.55);
  top.translate(0, 0.775, 0.03);
  const strip = new THREE.PlaneGeometry(0.84, 0.04);
  strip.translate(0, 0.66, 0.227);
  return mergeGeometries([top, strip]);
}

function rectPath(x0, y0, x1, y1) {
  const p = new THREE.Path();
  p.moveTo(x0, y0);
  p.lineTo(x1, y0);
  p.lineTo(x1, y1);
  p.lineTo(x0, y1);
  p.closePath();
  return p;
}

export const PITS = [
  [-5.4, -1.3, -2.9, 1.3],
  [1.3, 5.4, -2.9, 1.3],
];
export const PIT_DEPTH = 0.8;
export const WINDOW = { top: 5.0, bottom: 1.3, topHalf: 4.6, bottomHalf: 3.4, z: -4.6 };

export function roomGeometry() {
  const floor = new THREE.Shape();
  floor.moveTo(-7, 4.6);
  floor.lineTo(7, 4.6);
  floor.lineTo(7, -9);
  floor.lineTo(-7, -9);
  floor.closePath();
  for (const [x0, x1, z0, z1] of PITS) floor.holes.push(rectPath(x0, -z1, x1, -z0));
  const fg = new THREE.ShapeGeometry(floor);
  fg.rotateX(-Math.PI / 2);
  const parts = [prep(fg, C("#16191e"))];
  parts.push(box(1.8, 0.01, 13.4, 0, 0.005, 2.2, C("#1c1f25")));
  for (const [x0, x1, z0, z1] of PITS) {
    const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    parts.push(box(w, 0.02, d, cx, -PIT_DEPTH, cz, C("#0e1014")));
    parts.push(box(w, PIT_DEPTH, 0.04, cx, -PIT_DEPTH / 2, z1, C("#1b1e24")));
    parts.push(box(w, PIT_DEPTH, 0.04, cx, -PIT_DEPTH / 2, z0, C("#14161b")));
    parts.push(box(0.04, PIT_DEPTH, d, x0, -PIT_DEPTH / 2, cz, C("#181b20")));
    parts.push(box(0.04, PIT_DEPTH, d, x1, -PIT_DEPTH / 2, cz, C("#181b20")));
    parts.push(box(w, 0.03, 0.05, cx, 0.012, z1, C("#3a3f48")));
  }
  const W = WINDOW;
  const wall = new THREE.Shape();
  wall.moveTo(-7, -1);
  wall.lineTo(7, -1);
  wall.lineTo(7, 6.2);
  wall.lineTo(-7, 6.2);
  wall.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-W.bottomHalf, W.bottom);
  hole.lineTo(W.bottomHalf, W.bottom);
  hole.lineTo(W.topHalf, W.top);
  hole.lineTo(-W.topHalf, W.top);
  hole.closePath();
  wall.holes.push(hole);
  const wg = new THREE.ShapeGeometry(wall);
  wg.translate(0, 0, W.z);
  parts.push(prep(wg, C("#111317")));
  const bar = (x0, y0, x1, y1, t, color) => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const g = new THREE.BoxGeometry(len, t, 0.12);
    g.rotateZ(Math.atan2(y1 - y0, x1 - x0));
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, W.z + 0.02);
    return prep(g, color);
  };
  const frame = C("#2c3038");
  parts.push(bar(-W.bottomHalf, W.bottom, W.bottomHalf, W.bottom, 0.14, frame));
  parts.push(bar(-W.topHalf, W.top, W.topHalf, W.top, 0.14, frame));
  parts.push(bar(-W.bottomHalf, W.bottom, -W.topHalf, W.top, 0.14, frame));
  parts.push(bar(W.bottomHalf, W.bottom, W.topHalf, W.top, 0.14, frame));
  parts.push(bar(0, W.bottom, 0, W.top, 0.1, frame));
  parts.push(bar(-1.7, W.bottom, -2.3, W.top, 0.1, frame));
  parts.push(bar(1.7, W.bottom, 2.3, W.top, 0.1, frame));
  for (const s of [-1, 1]) {
    const side = new THREE.PlaneGeometry(13.6, 7.2);
    side.rotateY(-s * Math.PI / 2);
    side.translate(s * 7, 2.6, 2.2);
    parts.push(prep(side, C("#121418")));
  }
  const ceil = new THREE.PlaneGeometry(14, 13.6);
  ceil.rotateX(Math.PI / 2);
  ceil.translate(0, 6.2, 2.2);
  parts.push(prep(ceil, C("#0b0c0f")));
  parts.push(box(14, 0.4, 0.3, 0, 0.2 + W.bottom - 1.4, W.z + 0.15, C("#1a1d23")));
  return mergeGeometries(parts);
}

export function crestGeometry(size) {
  const data = new SVGLoader().parse(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 496 512"><path d="${EMPIRE_PATH}"/></svg>`);
  const geos = [];
  for (const path of data.paths) for (const shape of path.toShapes(true)) geos.push(new THREE.ShapeGeometry(shape, 6));
  const g = mergeGeometries(geos);
  const s = size / 512;
  g.translate(-248, -256, 0);
  g.scale(s, -s, s);
  return g;
}
