import * as THREE from "three";
import { trooperGeometry, vaderGeometry, capeGeometry, consoleGeometry, screenGeometry, roomGeometry, crestGeometry, PIT_DEPTH, WINDOW } from "./models.js";
import { tieGeometry, glowTexture, starfield } from "../fleet/models.js";
import { tagText, FLIGHT_COLORS } from "../fleet/scene.js";
import { createTags } from "../../src/tags.js";

const ROW_A = { z: 0.25, xs: [-2.2, 2.2, -3.4, 3.4, -4.6, 4.6] };
const ROW_B = { z: -1.85, xs: [-2.2, 2.2, -3.4, 3.4] };
const SLOTS = [...ROW_A.xs.map((x) => [x, ROW_A.z]), ...ROW_B.xs.map((x) => [x, ROW_B.z])];
const MAX_DRONES = 4;
const VADER_POS = new THREE.Vector3(0, 0, -1.0);
const RED = new THREE.Color("#ff1f3a");
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function createBridge({ canvas, overlay, store, engine, onReserve }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#0e1014");
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  scene.add(new THREE.HemisphereLight(0xa9b4cc, 0x07080a, 1.2));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(2.5, 7, 8);
  scene.add(key);
  const win = new THREE.DirectionalLight(0x9fb6ff, 0.9);
  win.position.set(0, 4, -8);
  scene.add(win);

  const geo = {
    room: roomGeometry(),
    trooper: trooperGeometry(),
    vader: vaderGeometry(),
    console: consoleGeometry(),
    screen: screenGeometry(),
    crest: crestGeometry(1.7),
    tie: tieGeometry(),
  };
  for (const g of Object.values(geo)) g.userData.shared = true;

  scene.add(new THREE.Mesh(geo.room, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.05, flatShading: true })));
  const crests = new THREE.Group();
  for (const x of [-5.7, 5.7]) {
    const m = new THREE.Mesh(geo.crest, null);
    m.position.set(x, 3.3, WINDOW.z + 0.03);
    crests.add(m);
  }
  const crestMat = new THREE.MeshBasicMaterial({ color: new THREE.Color("#2a2e36") });
  crests.children.forEach((m) => (m.material = crestMat));
  scene.add(crests);
  const stars = starfield(900, 0, 19, { box: [-40, 40, -8, 30, -90, -45], size: 2 });
  scene.add(stars);

  const consoles = new THREE.InstancedMesh(geo.console, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.2, flatShading: true }), SLOTS.length);
  consoles.count = 0;
  scene.add(consoles);
  const drones = new THREE.InstancedMesh(geo.tie, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.55, metalness: 0.35 }), (SLOTS.length + 1) * MAX_DRONES);
  drones.count = 0;
  drones.frustumCulled = false;
  scene.add(drones);

  const vaderMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.55, transparent: true });
  const vader = new THREE.Mesh(geo.vader, vaderMat);
  vader.rotation.y = Math.PI;
  const capeGeo = capeGeometry();
  const capeBase = Float32Array.from(capeGeo.getAttribute("position").array);
  const cape = new THREE.Mesh(capeGeo, new THREE.MeshStandardMaterial({ color: 0x050608, roughness: 0.85, side: THREE.DoubleSide, transparent: true }));
  cape.position.set(0, 1.62, -0.24);
  const vaderGroup = new THREE.Group();
  vaderGroup.add(vader, cape);
  vaderGroup.position.copy(VADER_POS);
  vaderGroup.visible = false;
  scene.add(vaderGroup);
  const vaderLamp = lampSprite();
  vaderLamp.position.set(0, 2.45, 0);
  vaderGroup.add(vaderLamp);
  const vaderHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color("#7fb2ff"), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  vaderHalo.position.set(0, 1.1, 0);
  vaderHalo.visible = false;
  vaderGroup.add(vaderHalo);

  const boltPool = [];
  for (let i = 0; i < 10; i++) {
    const b = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    b.visible = false;
    scene.add(b);
    boltPool.push(b);
  }

  function lampSprite() {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: RED, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.scale.setScalar(0.55);
    s.visible = false;
    return s;
  }

  const stations = new Map();
  const droneState = new Map();
  const tags = createTags(overlay);
  const dummy = new THREE.Object3D();
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();
  let W = 1, H = 1;
  let firstSync = true;
  let vaderData = null;
  const vaderFx = { dim: 1, leaveAt: 0, compactAt: -1e9, seen: new Set() };
  const cam = { focus: null, pos: new THREE.Vector3(0, 2.4, 6.8), look: new THREE.Vector3(0, 0.5, -1.6), basePos: new THREE.Vector3(0, 2.4, 6.8), baseLook: new THREE.Vector3(0, 0.5, -1.6) };

  function makeStation(s) {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.05, transparent: true });
    const trooper = new THREE.Mesh(geo.trooper, mat);
    trooper.userData.id = s.id;
    const screenMat = new THREE.MeshBasicMaterial({ color: 0x2a2e35 });
    const screen = new THREE.Mesh(geo.screen, screenMat);
    const lamp = lampSprite();
    const group = new THREE.Group();
    group.add(trooper, screen, lamp);
    scene.add(group);
    return { id: s.id, group, trooper, mat, screen, screenMat, lamp, slot: -1, dim: 1, leaveAt: 0, compactAt: -1e9, seen: new Set(s.marks.map((m) => m[0])), phase: Math.random() * 6, data: s };
  }

  function removeStation(st) {
    scene.remove(st.group);
    st.mat.dispose();
    st.screenMat.dispose();
    st.lamp.material.dispose();
    stations.delete(st.id);
  }

  function placeStation(st, slot) {
    st.slot = slot;
    const [x, z] = SLOTS[slot];
    st.home = new THREE.Vector3(x, -PIT_DEPTH, z - 0.38);
    st.group.position.copy(st.home);
    st.screen.position.set(0, 0, 0.68);
    st.lamp.position.set(0, 2.15, 0);
    dummy.position.set(x, -PIT_DEPTH, z + 0.3);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    return dummy.matrix.clone();
  }

  function trackDrones(s, owner) {
    let shown = 0, extra = 0;
    const t = performance.now();
    for (const a of s.subagents) {
      let d = droneState.get(a.id);
      if (!d) {
        if (a.state !== "working") continue;
        if (shown >= MAX_DRONES) {
          extra++;
          continue;
        }
        d = { owner, born: firstSync ? t - 5000 : t, doneAt: 0, phase: droneState.size * 1.9 };
        droneState.set(a.id, d);
      }
      shown++;
      if (a.state !== "working" && !d.doneAt) d.doneAt = t;
    }
    return extra;
  }

  function sync() {
    const list = store.ordered();
    const ids = new Set();
    let slot = 0, reserve = 0, droneReserve = 0;
    const tNow = performance.now();
    const matrices = [];
    vaderData = null;
    for (const s of list) {
      if (s.flagship) {
        vaderData = s;
        ids.add(s.id);
        for (const m of s.marks) {
          if (m[1] === "compact" && !vaderFx.seen.has(m[0])) {
            if (!firstSync) vaderFx.compactAt = tNow;
            vaderFx.seen.add(m[0]);
          }
        }
        if (s.state === "ended" && !vaderFx.leaveAt) vaderFx.leaveAt = tNow;
        if (s.state !== "ended") vaderFx.leaveAt = 0;
        droneReserve += trackDrones(s, "vader");
        continue;
      }
      if (slot >= SLOTS.length) {
        reserve++;
        continue;
      }
      ids.add(s.id);
      let st = stations.get(s.id);
      if (!st) {
        st = makeStation(s);
        stations.set(s.id, st);
      }
      st.data = s;
      matrices.push(placeStation(st, slot++));
      for (const m of s.marks) {
        if (m[1] === "compact" && !st.seen.has(m[0])) {
          st.seen.add(m[0]);
          st.compactAt = tNow;
        }
      }
      if (s.state === "ended" && !st.leaveAt) st.leaveAt = tNow;
      if (s.state !== "ended") st.leaveAt = 0;
      droneReserve += trackDrones(s, s.id);
    }
    for (const [id, st] of stations) if (!ids.has(id)) removeStation(st);
    for (const [id, d] of droneState) if (d.owner !== "vader" ? !stations.has(d.owner) : !vaderData) droneState.delete(id);
    matrices.forEach((m, i) => consoles.setMatrixAt(i, m));
    consoles.count = matrices.length;
    consoles.instanceMatrix.needsUpdate = true;
    vaderGroup.visible = !!vaderData;
    if (vaderData) vader.userData.id = vaderData.id;
    onReserve?.(reserve, droneReserve);
    tags.keep(ids);
    firstSync = false;
  }

  function ownerPos(owner, out) {
    if (owner === "vader") return out.copy(VADER_POS).add(tmp.set(0, 2.3, 0));
    const st = stations.get(owner);
    if (!st || !st.group.visible) return null;
    return out.copy(st.group.position).add(tmp.set(0, 1.95, 0));
  }

  function frame(dt, reduced) {
    const tNow = performance.now();
    const time = tNow / 1000;
    const now = store.now();
    const flick = (base, amp) => (reduced ? base : base + Math.random() * amp);

    for (const st of stations.values()) {
      const s = st.data;
      let color, lamp = 0;
      switch (s.state) {
        case "working": color = [0.87, 0.9, 0.96, flick(0.72, 0.3)]; break;
        case "thinking": color = [0.62, 0.7, 0.85, 0.45 + 0.2 * (0.5 + 0.5 * Math.sin(time * 2.2))]; break;
        case "waiting": {
          const on = reduced || time % 1.1 < 0.55;
          color = [0.82, 0.1, 0.16, on ? 1 : 0.35];
          lamp = on ? 1 : 0.12;
          break;
        }
        case "gate": {
          const k = reduced ? 1 : 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(time * (Math.PI * 2 / 2.8)));
          color = [0.82, 0.1, 0.16, k];
          lamp = k;
          break;
        }
        case "idle": color = [0.16, 0.18, 0.21, 1]; break;
        default: color = [0.03, 0.03, 0.04, 1];
      }
      const ck = (tNow - st.compactAt) / 1200;
      if (ck >= 0 && ck < 1) color = [0.5, 0.7, 1, 1];
      st.screenMat.color.setRGB(color[0] * color[3], color[1] * color[3], color[2] * color[3]);
      st.lamp.visible = lamp > 0;
      st.lamp.material.opacity = lamp;
      const wantDim = s.state === "idle" ? 0.4 : 1;
      st.dim += (wantDim - st.dim) * (1 - Math.exp(-dt * 3));
      st.mat.opacity = st.dim;
      st.mat.depthWrite = st.dim > 0.95;
      st.trooper.position.set(0, 0, 0);
      if (!reduced && (s.state === "working" || s.state === "thinking")) st.trooper.rotation.y = Math.sin(time * 0.7 + st.phase) * 0.06;
      if (st.leaveAt) {
        const k = clamp((tNow - st.leaveAt) / 2600, 0, 1);
        if (k < 0.15) st.trooper.rotation.y = (k / 0.15) * Math.PI;
        else {
          st.trooper.rotation.y = Math.PI;
          const w = (k - 0.15) / 0.85;
          st.trooper.position.set(0, reduced ? 0 : Math.abs(Math.sin(w * 18)) * 0.04, -w * 3.2);
        }
        st.mat.opacity = st.dim * (1 - k);
        st.trooper.visible = k < 1;
      } else st.trooper.visible = true;

      const [cls, sub] = tagText(s, now);
      tmp.copy(st.group.position).add(tmp2.set(0, 2.55, 0));
      tags.place(s.id, tmp, camera, W, H, `${s.code} ${String(s.name).toUpperCase()}`, sub, cls);
    }

    if (vaderData) {
      const s = vaderData;
      const amp = reduced ? 0 : s.state === "working" ? 0.09 : s.state === "thinking" ? 0.035 : 0;
      const pos = cape.geometry.getAttribute("position");
      for (let i = 0; i < pos.count; i++) {
        const x = capeBase[i * 3], y = capeBase[i * 3 + 1];
        const hang = -y / 1.55;
        pos.setZ(i, -(Math.sin(time * 1.6 + y * 2.2 + x * 1.3) * amp * hang + hang * hang * 0.12));
        pos.setX(i, x * (1 + hang * 0.55));
      }
      pos.needsUpdate = true;
      cape.geometry.computeVertexNormals();
      const waiting = s.state === "waiting", gate = s.state === "gate";
      vaderLamp.visible = waiting || gate;
      if (waiting) vaderLamp.material.opacity = reduced || time % 1.1 < 0.55 ? 1 : 0.12;
      if (gate) vaderLamp.material.opacity = reduced ? 1 : 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(time * (Math.PI * 2 / 2.8)));
      const wantDim = s.state === "idle" ? 0.4 : 1;
      vaderFx.dim += (wantDim - vaderFx.dim) * (1 - Math.exp(-dt * 3));
      let op = vaderFx.dim;
      vaderGroup.position.copy(VADER_POS);
      if (vaderFx.leaveAt) {
        const k = clamp((tNow - vaderFx.leaveAt) / 2600, 0, 1);
        vaderGroup.position.z -= reduced ? 0 : k * 1.2;
        op *= 1 - k;
      }
      vaderMat.opacity = op;
      cape.material.opacity = op;
      vaderMat.depthWrite = cape.material.depthWrite = op > 0.95;
      const hk = (tNow - vaderFx.compactAt) / 1400;
      vaderHalo.visible = hk >= 0 && hk < 1;
      if (vaderHalo.visible) {
        vaderHalo.scale.setScalar(1.6 + hk * 1.4);
        vaderHalo.material.opacity = 0.7 * (1 - hk);
      }
      const [cls, sub] = tagText(s, now);
      tmp.copy(vaderGroup.position).add(new THREE.Vector3(0, 2.85, 0));
      tags.place(s.id, tmp, camera, W, H, `${s.code} ${String(s.name).toUpperCase()}`, sub, cls);
    }

    tags.layout();
    let n = 0;
    const p = new THREE.Vector3();
    for (const [id, d] of droneState) {
      if (!ownerPos(d.owner, p)) continue;
      const a = d.phase + time * 0.9;
      const r = 0.55;
      let x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a * 2) * 0.08, z = p.z + Math.sin(a) * r * 0.6;
      let scale = 1;
      const u = clamp((tNow - d.born) / 1200, 0, 1);
      if (u < 1) {
        y += (1 - u) * 1.5;
        scale = u;
      }
      if (d.doneAt) {
        const k = clamp((tNow - d.doneAt) / 1500, 0, 1);
        if (k >= 1) {
          droneState.delete(id);
          continue;
        }
        y += k * k * 2.5;
        scale *= 1 - k;
      }
      dummy.position.set(x, y, z);
      dummy.lookAt(x - Math.sin(a) * r, y, z + Math.cos(a) * r * 0.6);
      dummy.scale.setScalar(2.3 * Math.max(0.001, scale));
      dummy.updateMatrix();
      drones.setMatrixAt(n++, dummy.matrix);
      if (n >= drones.instanceMatrix.count) break;
    }
    drones.count = n;
    drones.instanceMatrix.needsUpdate = true;

    const flights = store.activeFlights();
    let bi = 0;
    for (const f of flights) {
      if (bi >= boltPool.length) break;
      const a = endpoint(f.from, new THREE.Vector3()), b = endpoint(f.to, new THREE.Vector3());
      if (!a || !b) continue;
      const u = clamp((now - f.t) / 3000, 0, 1);
      const m = 1 - u;
      const lift = a.distanceTo(b) * 0.25 + 0.5;
      const bolt = boltPool[bi++];
      bolt.position.set(m * m * a.x + 2 * m * u * (a.x + b.x) / 2 + u * u * b.x, m * m * a.y + 2 * m * u * ((a.y + b.y) / 2 + lift) + u * u * b.y, m * m * a.z + 2 * m * u * (a.z + b.z) / 2 + u * u * b.z);
      bolt.material.color.set(FLIGHT_COLORS[f.kind] || "#ffffff");
      bolt.scale.setScalar(0.45);
      bolt.visible = true;
    }
    for (; bi < boltPool.length; bi++) boltPool[bi].visible = false;

    const fst = cam.focus && (cam.focus === "vader" ? (vaderData ? { pos: VADER_POS } : null) : stations.get(cam.focus) ? { pos: stations.get(cam.focus).group.position } : null);
    if (cam.focus && !fst) cam.focus = null;
    const wantPos = fst ? tmp.copy(fst.pos).add(new THREE.Vector3(fst.pos.x * -0.1, 1.9, cam.focus === "vader" ? 3.2 : 2.6)) : cam.basePos;
    const wantLook = fst ? new THREE.Vector3(fst.pos.x, fst.pos.y + (cam.focus === "vader" ? 1.4 : 1.0), fst.pos.z) : cam.baseLook;
    cam.pos.lerp(wantPos, 1 - Math.exp(-dt * 2.5));
    cam.look.lerp(wantLook, 1 - Math.exp(-dt * 2.5));
    camera.position.copy(cam.pos);
    if (!reduced && !cam.focus) {
      camera.position.x += Math.sin(time * 0.23) * 0.14;
      camera.position.y += Math.sin(time * 0.31) * 0.05;
    }
    camera.lookAt(cam.look);
  }

  function endpoint(id, out) {
    if (vaderData && id === vaderData.id) return out.copy(VADER_POS).add(tmp.set(0, 1.9, 0));
    const st = stations.get(id);
    if (st) return out.copy(st.group.position).add(tmp.set(0, 1.6, 0));
    for (const s of [vaderData, ...[...stations.values()].map((x) => x.data)]) {
      if (s && s.subagents.some((a) => a.id === id)) return endpoint(s.id, out);
    }
    return null;
  }

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let down = null;
  const onDown = (e) => (down = { x: e.clientX, y: e.clientY });
  const onUp = (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return (down = null);
    down = null;
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const targets = [...stations.values()].filter((s) => s.trooper.visible).map((s) => s.trooper);
    if (vaderGroup.visible) targets.push(vader);
    const hit = ray.intersectObjects(targets, false)[0];
    const id = hit ? (hit.object === vader ? "vader" : hit.object.userData.id) : null;
    cam.focus = id && id !== cam.focus ? id : null;
    engine.fast();
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointerup", onUp);

  sync();

  return {
    scene,
    camera,
    frame,
    sync,
    resize(w, h) {
      W = w;
      H = h;
      const aspect = w / h;
      camera.aspect = aspect;
      camera.fov = aspect < 1 ? 60 : 50;
      camera.updateProjectionMatrix();
      const hfov = 2 * Math.atan(Math.tan((camera.fov * Math.PI) / 360) * aspect);
      const dist = Math.max(6.8, 5.6 / Math.tan(hfov / 2) - 1.6);
      cam.basePos.set(0, 2.1 + dist * 0.045, dist);
    },
    dispose() {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
      for (const g of Object.values(geo)) g.dispose();
      capeGeo.dispose();
    },
  };
}
