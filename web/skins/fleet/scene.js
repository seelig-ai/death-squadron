import * as THREE from "three";
import { destroyerGeometry, executorGeometry, spineGeometry, enginesGeometry, engineLayout, tieGeometry, glowTexture, starfield } from "./models.js";
import { createTags } from "../../src/tags.js";
import { mmss, mins } from "../../src/format.js";

const LD = 1.3;
const LF = 4.2;
const MAX_SHIPS = 12;
const MAX_TIES = 6;
const TIE_SCALE = 1.7;
const RED = new THREE.Color("#ff1f3a");
const GLOW = new THREE.Color("#cfe0ff");
const SHIELD = new THREE.Color("#7fb2ff");
export const FLIGHT_COLORS = { task: "#cfe0ff", message: "#6dff9e", result: "#ffd27d" };

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ease = (u) => 1 - Math.pow(1 - u, 3);

export function tagText(s, now) {
  switch (s.state) {
    case "waiting": return ["turn", `YOUR TURN ${mmss(now - s.since)}`];
    case "gate": return ["gate", `CLEARANCE ${mmss(now - s.since)}`];
    case "idle": return ["idle", `STANDBY ${mins(now - s.since)}`];
    case "ended": return ["ended", "HYPERSPACE"];
    case "thinking": return ["", "THINKING"];
    default: return ["", s.tool ? s.tool.toUpperCase() : "UNDER WAY"];
  }
}

function bracketGeometry(w, h) {
  const c = Math.min(w, h) * 0.28;
  const x = w / 2, y = h / 2;
  const p = [
    -x, y - c, 0, -x, y, 0, -x, y, 0, -x + c, y, 0,
    x - c, y, 0, x, y, 0, x, y, 0, x, y - c, 0,
    x, -y + c, 0, x, -y, 0, x, -y, 0, x - c, -y, 0,
    -x + c, -y, 0, -x, -y, 0, -x, -y, 0, -x, -y + c, 0,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  return g;
}

export function createFleet({ canvas, overlay, store, engine, onReserve }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#07080b");
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 500);
  scene.add(new THREE.HemisphereLight(0xc8d2e6, 0x0c0e14, 1.15));
  const key = new THREE.DirectionalLight(0xffffff, 2.3);
  key.position.set(-6, 8, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x8fa8ff, 0.7);
  rim.position.set(5, -4, -6);
  scene.add(rim);
  const stars = starfield(1800, 150, 3);
  scene.add(stars);

  const geo = {
    destroyer: destroyerGeometry(),
    executor: executorGeometry(),
    spine: spineGeometry(),
    engD: enginesGeometry("destroyer"),
    engE: enginesGeometry("executor"),
    tie: tieGeometry(),
    ring: new THREE.RingGeometry(0.86, 1, 48),
    shield: new THREE.SphereGeometry(1, 28, 18),
  };
  for (const g of Object.values(geo)) g.userData.shared = true;

  const ties = new THREE.InstancedMesh(geo.tie, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.55, metalness: 0.35 }), MAX_SHIPS * MAX_TIES + MAX_TIES);
  ties.count = 0;
  ties.frustumCulled = false;
  scene.add(ties);

  const boltPool = [];
  for (let i = 0; i < 12; i++) {
    const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    const tail = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.45 }));
    head.visible = tail.visible = false;
    scene.add(head, tail);
    boltPool.push({ head, tail });
  }

  const ships = new Map();
  const tieState = new Map();
  const tiePos = new Map();
  const tags = createTags(overlay);
  const dummy = new THREE.Object3D();
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();
  let W = 1, H = 1;
  let rows = 1;
  let firstSync = true;

  const cam = { az: 0.78, el: -0.17, zoom: 1, target: new THREE.Vector3(0, 0, 1.6), focusId: null, lastInteract: -1e9 };

  function makeShip(s) {
    const flagship = s.flagship;
    const L = flagship ? LF : LD;
    const group = new THREE.Group();
    const hullMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.72, metalness: 0.18 });
    const hull = new THREE.Mesh(flagship ? geo.executor : geo.destroyer, hullMat);
    hull.scale.setScalar(L);
    hull.userData.id = s.id;
    group.add(hull);
    const engMat = new THREE.MeshBasicMaterial({ color: GLOW.clone() });
    const eng = new THREE.Mesh(flagship ? geo.engE : geo.engD, engMat);
    eng.scale.setScalar(L);
    group.add(eng);
    const pts = engineLayout(flagship ? "executor" : "destroyer").map(([x, y, z]) => [x * L, y * L, (z + 0.03) * L]);
    const gGeo = new THREE.BufferGeometry();
    gGeo.setAttribute("position", new THREE.Float32BufferAttribute(pts.flat(), 3));
    const baseGlow = flagship ? 0.2 : 0.26;
    const gMat = new THREE.PointsMaterial({ color: GLOW.clone(), size: baseGlow, map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const glow = new THREE.Points(gGeo, gMat);
    group.add(glow);
    let spine = null;
    if (flagship) {
      spine = new THREE.Mesh(geo.spine, new THREE.MeshBasicMaterial({ color: new THREE.Color("#eaf1ff") }));
      spine.scale.setScalar(L);
      group.add(spine);
    }
    const towerY = flagship ? 0.09 * L + 0.12 : 0.2 * L + 0.08;
    const towerZ = flagship ? 0.46 * L : 0.44 * L;
    const beacon = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: RED, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    beacon.position.set(0, towerY, towerZ);
    beacon.scale.setScalar(0.42);
    beacon.visible = false;
    group.add(beacon);
    const ring = new THREE.Mesh(geo.ring, new THREE.MeshBasicMaterial({ color: RED, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    ring.position.copy(beacon.position);
    ring.visible = false;
    group.add(ring);
    const bracket = new THREE.LineSegments(bracketGeometry(L * 0.95, L * 0.5), new THREE.LineBasicMaterial({ color: RED, transparent: true }));
    bracket.position.set(0, 0.05 * L, 0);
    bracket.visible = false;
    group.add(bracket);
    const shield = new THREE.Mesh(geo.shield, new THREE.MeshBasicMaterial({ color: SHIELD, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    shield.scale.set(L * 0.42, L * 0.2, L * 0.62);
    shield.visible = false;
    group.add(shield);
    const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    flash.position.set(0, 0, -0.5 * L);
    flash.visible = false;
    group.add(flash);
    return {
      id: s.id, flagship, L, group, hull, hullMat, engMat, gMat, baseGlow, spine, beacon, ring, bracket, shield, flash,
      pos: new THREE.Vector3(), target: new THREE.Vector3(), dim: 1, phase: Math.random() * Math.PI * 2,
      jumpAt: 0, compactAt: -1e9, seenMarks: new Set(), data: s,
    };
  }

  function removeShip(sh) {
    scene.remove(sh.group);
    sh.group.traverse((o) => {
      if (o.material) o.material.dispose();
      if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
    });
    ships.delete(sh.id);
  }

  function slotPos(i, state, out) {
    const r = Math.floor(i / 2) + 1;
    const side = i % 2 === 0 ? -1 : 1;
    out.set(side * (0.75 + r * 1.05), (r % 2 ? 0.28 : -0.22) * (side > 0 ? 1 : 0.8), -1.1 + r * 1.35);
    if (state === "idle") out.add(tmp2.set(0, -0.35, LD * 0.8));
    return out;
  }

  function sync() {
    const list = store.ordered();
    const ids = new Set();
    let slot = 0;
    let reserve = 0;
    let tieReserve = 0;
    const tNow = performance.now();
    for (const s of list) {
      if (!s.flagship && slot >= MAX_SHIPS) {
        reserve++;
        continue;
      }
      ids.add(s.id);
      let sh = ships.get(s.id);
      let from = null;
      if (sh && sh.flagship !== s.flagship) {
        from = sh.pos.clone();
        removeShip(sh);
        sh = null;
      }
      if (!sh) {
        sh = makeShip(s);
        ships.set(s.id, sh);
        scene.add(sh.group);
        if (s.flagship) sh.target.set(0, 0, 0);
        else slotPos(slot, s.state, sh.target);
        sh.pos.copy(from || sh.target);
        if (!from && !firstSync) sh.pos.add(tmp.set(0, 0, 12));
        for (const m of s.marks) sh.seenMarks.add(m[0]);
      }
      sh.data = s;
      if (s.flagship) sh.target.set(0, 0, 0);
      else slotPos(slot++, s.state, sh.target);
      for (const m of s.marks) {
        if (m[1] === "compact" && !sh.seenMarks.has(m[0])) {
          sh.seenMarks.add(m[0]);
          sh.compactAt = tNow;
        }
      }
      if (s.state === "ended" && !sh.jumpAt) sh.jumpAt = tNow;
      if (s.state !== "ended" && sh.jumpAt) {
        sh.jumpAt = 0;
        sh.group.visible = true;
        sh.group.scale.set(1, 1, 1);
      }
      let shown = 0;
      for (const a of s.subagents) {
        let st = tieState.get(a.id);
        if (!st) {
          if (a.state !== "working") continue;
          if (shown >= MAX_TIES) {
            tieReserve++;
            continue;
          }
          st = { parent: s.id, born: firstSync ? tNow - 5000 : tNow, doneAt: 0, phase: (tieState.size * 1.7) % (Math.PI * 2), speed: 0.45 + ((tieState.size * 0.37) % 0.3) };
          tieState.set(a.id, st);
        }
        shown++;
        if (a.state !== "working" && !st.doneAt) st.doneAt = tNow;
      }
    }
    for (const [id, sh] of ships) if (!ids.has(id)) removeShip(sh);
    for (const [id, st] of tieState) if (!ships.has(st.parent)) tieState.delete(id);
    rows = Math.max(1, Math.ceil(Math.min(slot, MAX_SHIPS) / 2));
    onReserve?.(reserve, tieReserve);
    tags.keep(ids);
    firstSync = false;
  }

  function placeTies(tNow, time) {
    let n = 0;
    for (const [id, st] of tieState) {
      const sh = ships.get(st.parent);
      if (!sh || !sh.group.visible) continue;
      const L = sh.L;
      const hangar = tmp.copy(sh.group.position).add(tmp2.set(0, -0.07 * L, 0.12 * L));
      const a = st.phase + time * st.speed;
      const rx = L * 0.5 + 0.45, rz = L * 0.42 + 0.45;
      const cx = sh.group.position.x, cy = sh.group.position.y + 0.18 * L + 0.2, cz = sh.group.position.z;
      const px = cx + rx * Math.cos(a), py = cy + Math.sin(a * 2) * 0.12, pz = cz + rz * Math.sin(a);
      const tx = -rx * Math.sin(a), tz = rz * Math.cos(a);
      let x = px, y = py, z = pz, scale = 1;
      const u = clamp((tNow - st.born) / 1400, 0, 1);
      if (u < 1) {
        const e = ease(u);
        x = hangar.x + (px - hangar.x) * e;
        y = hangar.y + (py - hangar.y) * e;
        z = hangar.z + (pz - hangar.z) * e;
        scale = 0.2 + 0.8 * e;
      }
      if (st.doneAt) {
        const d = clamp((tNow - st.doneAt) / 1600, 0, 1);
        if (d >= 1) {
          tieState.delete(id);
          tiePos.delete(id);
          continue;
        }
        const e = d * d;
        x += (hangar.x - x) * e;
        y += (hangar.y - y) * e;
        z += (hangar.z - z) * e;
        scale *= 1 - d;
      }
      dummy.position.set(x, y, z);
      dummy.lookAt(x + tx, y, z + tz);
      dummy.scale.setScalar(TIE_SCALE * Math.max(0.001, scale));
      dummy.updateMatrix();
      ties.setMatrixAt(n++, dummy.matrix);
      tiePos.set(id, dummy.position.clone());
      if (n >= ties.instanceMatrix.count) break;
    }
    ties.count = n;
    ties.instanceMatrix.needsUpdate = true;
  }

  function endpoint(id) {
    const sh = ships.get(id);
    if (sh) return sh.group.position;
    return tiePos.get(id) || null;
  }

  function placeBolts(now) {
    const flights = store.activeFlights();
    let i = 0;
    for (const f of flights) {
      if (i >= boltPool.length) break;
      const a = endpoint(f.from), b = endpoint(f.to);
      if (!a || !b) continue;
      const u = clamp((now - f.t) / 3000, 0, 1);
      const bolt = boltPool[i++];
      const col = new THREE.Color(FLIGHT_COLORS[f.kind] || "#ffffff");
      const lift = a.distanceTo(b) * 0.35 + 0.4;
      const at = (k, out) => {
        const m = 1 - k;
        out.set(m * m * a.x + 2 * m * k * (a.x + b.x) / 2 + k * k * b.x, m * m * a.y + 2 * m * k * ((a.y + b.y) / 2 + lift) + k * k * b.y, m * m * a.z + 2 * m * k * (a.z + b.z) / 2 + k * k * b.z);
        return out;
      };
      at(u, bolt.head.position);
      at(Math.max(0, u - 0.06), bolt.tail.position);
      bolt.head.material.color.copy(col);
      bolt.tail.material.color.copy(col);
      bolt.head.scale.setScalar(0.5);
      bolt.tail.scale.setScalar(0.32);
      bolt.head.material.opacity = u > 0.92 ? (1 - u) / 0.08 : 1;
      bolt.head.visible = bolt.tail.visible = true;
    }
    for (; i < boltPool.length; i++) boltPool[i].head.visible = boltPool[i].tail.visible = false;
  }

  function frame(dt, reduced) {
    const tNow = performance.now();
    const time = tNow / 1000;
    const now = store.now();
    if (!reduced) stars.rotation.y += dt * 0.004;

    for (const sh of ships.values()) {
      const s = sh.data;
      const L = sh.L;
      sh.pos.lerp(sh.target, 1 - Math.exp(-dt * 1.4));
      const bobAmp = reduced ? 0 : s.state === "idle" ? 0.015 : 0.05;
      sh.group.position.copy(sh.pos);
      sh.group.position.y += Math.sin(time * 0.8 + sh.phase) * bobAmp;
      sh.group.rotation.z = reduced ? 0 : Math.sin(time * 0.5 + sh.phase) * 0.012;

      let e;
      switch (s.state) {
        case "working": e = 0.8 + (reduced ? 0.1 : Math.random() * 0.35); break;
        case "thinking": e = 0.3 + 0.22 * (0.5 + 0.5 * Math.sin(time * 2.4)); break;
        case "waiting": case "gate": e = 0.22; break;
        case "idle": e = 0.03; break;
        default: e = 1.4;
      }
      sh.engMat.color.copy(GLOW).multiplyScalar(Math.min(1.2, e));
      sh.gMat.opacity = Math.min(1, e);
      sh.gMat.size = sh.baseGlow * (0.55 + 0.7 * e);
      const wantDim = s.state === "idle" ? 0.32 : 1;
      sh.dim += (wantDim - sh.dim) * (1 - Math.exp(-dt * 2));
      sh.hullMat.color.setScalar(sh.dim);
      if (sh.spine) {
        const lit = s.state === "working" ? 1 : s.state === "thinking" ? 0.55 : 0.12;
        sh.spine.material.color.setRGB(0.92 * lit, 0.95 * lit, lit);
      }

      const waiting = s.state === "waiting", gate = s.state === "gate";
      sh.beacon.visible = waiting || gate;
      if (waiting) sh.beacon.material.opacity = reduced || (time % 1.1) < 0.55 ? 1 : 0.12;
      if (gate) sh.beacon.material.opacity = reduced ? 0.85 : 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(time * (Math.PI * 2 / 2.8)));
      sh.ring.visible = waiting;
      if (waiting) {
        const k = reduced ? 0.5 : (time % 2.2) / 2.2;
        sh.ring.scale.setScalar(0.12 + 0.55 * k * (L / LD) * 0.6);
        sh.ring.material.opacity = reduced ? 0.6 : 1 - k;
        sh.ring.quaternion.copy(camera.quaternion);
      }
      sh.bracket.visible = gate;
      if (gate) {
        sh.bracket.quaternion.copy(camera.quaternion);
        sh.bracket.material.opacity = reduced ? 0.9 : 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(time * (Math.PI * 2 / 2.8)));
      }
      const ck = (tNow - sh.compactAt) / 1400;
      sh.shield.visible = ck >= 0 && ck < 1;
      if (sh.shield.visible) {
        sh.shield.material.opacity = 0.45 * (1 - ck);
        const g = 1 + ck * 0.35;
        sh.shield.scale.set(L * 0.42 * g, L * 0.2 * g, L * 0.62 * g);
      }
      if (sh.jumpAt) {
        const k = (tNow - sh.jumpAt) / 900;
        if (k < 1) {
          const kk = reduced ? 0 : k * k;
          sh.group.scale.set(1, 1, 1 + kk * 9);
          sh.group.position.z -= kk * L * 7;
          sh.flash.visible = true;
          sh.flash.scale.setScalar(L * (0.3 + 1.6 * k));
          sh.flash.material.opacity = 1 - k;
        } else {
          sh.group.visible = false;
          sh.flash.visible = false;
        }
      }

      const [cls, sub] = tagText(s, now);
      tmp.copy(sh.group.position).add(tmp2.set(0, sh.flagship ? 0.09 * L + 0.55 : 0.2 * L + 0.5, sh.flagship ? 0.46 * L : 0.44 * L));
      if (sh.group.visible) tags.place(s.id, tmp, camera, W, H, `${s.code} ${String(s.name).toUpperCase()}`, sub, cls);
      else tags.place(s.id, tmp.set(0, 0, 1e6), camera, W, H, "", "", cls);
    }

    tags.layout();
    placeTies(tNow, time);
    placeBolts(now);

    const focus = cam.focusId && ships.get(cam.focusId);
    if (cam.focusId && !focus) cam.focusId = null;
    const wantTarget = focus ? tmp.copy(focus.group.position) : tmp.set(0, 0, 0.4 + rows * 0.7);
    cam.target.lerp(wantTarget, 1 - Math.exp(-dt * 2.5));
    if (!reduced && time * 1000 - cam.lastInteract > 4000) cam.az += dt * (Math.PI / 180);
    const baseR = focus ? focus.L * 2.4 + 1.2 : 4.4 + rows * 0.9;
    const r = baseR * cam.zoom * (W < 520 ? 1.15 : 1);
    const ce = Math.cos(cam.el);
    camera.position.set(cam.target.x + r * ce * Math.sin(cam.az), cam.target.y + r * Math.sin(cam.el), cam.target.z + r * ce * Math.cos(cam.az));
    camera.lookAt(cam.target);
  }

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function pick(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hulls = [...ships.values()].filter((s) => s.group.visible).map((s) => s.hull);
    const hit = ray.intersectObjects(hulls, false)[0];
    return hit ? hit.object.userData.id : null;
  }

  let drag = null;
  const onDown = (e) => {
    drag = { x: e.clientX, y: e.clientY, moved: false };
    canvas.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    drag.moved = true;
    canvas.classList.add("dragging");
    cam.az -= dx * 0.006;
    cam.el = clamp(cam.el + dy * 0.004, -1.2, 1.2);
    drag.x = e.clientX;
    drag.y = e.clientY;
    cam.lastInteract = performance.now();
    engine.fast();
  };
  const onUp = (e) => {
    if (drag && !drag.moved) {
      const id = pick(e);
      if (id) store.promote(id);
    }
    drag = null;
    canvas.classList.remove("dragging");
  };
  const onWheel = (e) => {
    e.preventDefault();
    cam.zoom = clamp(cam.zoom * Math.exp(e.deltaY * 0.001), 0.35, 2.5);
    cam.lastInteract = performance.now();
    engine.fast();
  };
  const onDbl = (e) => {
    const id = pick(e);
    cam.focusId = id && id !== cam.focusId ? id : null;
    cam.zoom = 1;
    cam.lastInteract = performance.now();
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("dblclick", onDbl);

  sync();

  return {
    scene,
    camera,
    frame,
    sync,
    resize(w, h) {
      W = w;
      H = h;
      camera.aspect = w / h;
      camera.fov = w < 520 ? 48 : 38;
      camera.updateProjectionMatrix();
    },
    dispose() {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("dblclick", onDbl);
      for (const g of Object.values(geo)) g.dispose();
    },
  };
}
