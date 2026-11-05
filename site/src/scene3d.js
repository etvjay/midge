// Midge 3D: the two "moments" of the site (the hero network and the architecture flow) in three.js.
//
// One WebGLRenderer for the whole page: its canvas moves into whichever 3D stage is on screen, so the page holds
// one WebGL context however many stages it has. Each stage keeps its 2D canvas scene as the fallback: this module
// only takes over a stage once its models have loaded, and it never runs under reduced motion (main.js does not
// load it then). Models come from Blender (site/models/*.glb, built through the Blender Lab MCP server).
import {
  WebGLRenderer, Scene, PerspectiveCamera, Color, Fog, AmbientLight, DirectionalLight, PointLight, HemisphereLight,
  Group, Mesh, MeshStandardMaterial, MeshBasicMaterial, InstancedMesh, SphereGeometry, BoxGeometry, Object3D, Vector3,
  BufferGeometry, Line, LineBasicMaterial, LineDashedMaterial, QuadraticBezierCurve3, Float32BufferAttribute, SRGBColorSpace,
  ACESFilmicToneMapping, MathUtils,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { PMREMGenerator } from 'three';

const C = { bg: 0x0f1416, ink: 0xe9ece8, ink2: 0xa6aeab, lake: 0x7cc4b8, glow: 0xd9824a, deny: 0xe0675a, blue: 0x6f9fbd };
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const seg = (t, a, b) => clamp((t - a) / (b - a));
const ease = (p) => 1 - Math.pow(1 - clamp(p), 3);
const easeIO = (p) => { p = clamp(p); return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; };
const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let x = Math.imul(seed ^ (seed >>> 15), 1 | seed); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
const MOBILE = matchMedia('(max-width: 760px)').matches;

// ---------------------------------------------------------------- shared renderer
function makeRenderer() {
  const r = new WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
  r.outputColorSpace = SRGBColorSpace; r.toneMapping = ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
  r.setClearColor(C.bg, 1);
  Object.assign(r.domElement.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block' });
  r.domElement.setAttribute('aria-hidden', 'true');
  r.domElement.className = 'webgl';
  return r;
}
function fit(renderer, host, camera) {
  const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return false;
  const cap = MOBILE ? 1 : 1.5; const maxPx = MOBILE ? 1.5e6 : 3e6;
  const scale = Math.min(window.devicePixelRatio || 1, cap, Math.sqrt(maxPx / (w * h)));
  const bw = Math.round(w * scale), bh = Math.round(h * scale);
  if (renderer.domElement.width !== bw || renderer.domElement.height !== bh) { renderer.setPixelRatio(1); renderer.setSize(bw, bh, false); }
  camera.aspect = w / h; camera.updateProjectionMatrix();
  return true;
}

// DOM labels that follow points in 3D: crisp text, no text in the GPU.
class Labels {
  constructor(host) { this.host = host; this.items = []; this.layer = document.createElement('div'); this.layer.className = 'labels3d'; this.layer.setAttribute('aria-hidden', 'true'); host.appendChild(this.layer); }
  add(text, cls = '') { const el = document.createElement('span'); el.className = `label3d ${cls}`; el.textContent = text; this.layer.appendChild(el); const it = { el, pos: new Vector3(), dx: 0, dy: 0, alpha: 1 }; this.items.push(it); return it; }
  update(camera) {
    const w = this.host.clientWidth, h = this.host.clientHeight; const v = new Vector3();
    for (const it of this.items) {
      v.copy(it.pos).project(camera); const vis = v.z < 1 && it.alpha > 0.01;
      it.el.style.opacity = vis ? String(it.alpha) : '0';
      if (vis) it.el.style.transform = `translate(${((v.x + 1) / 2) * w + it.dx}px, ${((1 - v.y) / 2) * h + it.dy}px)`;
    }
  }
  show(on) { this.layer.style.display = on ? '' : 'none'; }
}

let ENV = null;
function lights(scene) {
  if (ENV) { scene.environment = ENV; scene.environmentIntensity = 0.55; }
  scene.add(new HemisphereLight(0x9fb8b3, 0x0b0f10, 0.9));
  const key = new DirectionalLight(0xffffff, 1.6); key.position.set(4, 6, 6); scene.add(key);
  const rim = new DirectionalLight(C.lake, 1.2); rim.position.set(-6, 2, -4); scene.add(rim);
  scene.add(new AmbientLight(0xffffff, 0.12));
}
// Materials are set here rather than taken from the GLB, so the scenes share one palette.
const M = {
  cage: () => new MeshStandardMaterial({ color: 0x9fd6cc, metalness: 0.85, roughness: 0.22, emissive: C.lake, emissiveIntensity: 0.12 }),
  shell: () => new MeshStandardMaterial({ color: 0x1c2a2c, metalness: 0.2, roughness: 0.08, transparent: true, opacity: 0.38, depthWrite: false, flatShading: true }),
  core: () => new MeshStandardMaterial({ color: C.lake, emissive: C.lake, emissiveIntensity: 1.2, roughness: 0.4 }),
  slab: () => new MeshStandardMaterial({ color: 0x182023, metalness: 0.35, roughness: 0.5 }),
  body: () => new MeshStandardMaterial({ color: 0x141c1f, metalness: 0.45, roughness: 0.42 }),
  pins: () => new MeshStandardMaterial({ color: 0x9aa39f, metalness: 0.9, roughness: 0.3 }),
};
// The slab and enclosure were modelled with their thin side on Blender's Y axis, which glTF turns into depth: lay them flat.
function flat(obj) { const g = new Group(); obj.rotation.x = Math.PI / 2; g.add(obj); return g; }
function dress(obj, map) { obj.traverse((o) => { if (o.isMesh) { const k = Object.keys(map).find((n) => o.name.startsWith(n)); if (k) o.material = map[k](o); } }); return obj; }

// ---------------------------------------------------------------- hero: many rooms, members, one agent in three, the Nest
function heroScene(models, host) {
  const scene = new Scene(); scene.background = new Color(C.bg); scene.fog = new Fog(C.bg, 9, 24); lights(scene);
  const camera = new PerspectiveCamera(38, 1, 0.1, 60);
  const labels = new Labels(host);
  const r = rng(7); const rooms = []; const N = MOBILE ? 8 : 14;
  const world = new Group(); scene.add(world);
  for (let i = 0; i < N; i++) {
    const g = dress(models.room.clone(true), { room_cage: M.cage, room_shell: M.shell, room_core: M.core });
    const col = i % 5, row = Math.floor(i / 5);
    const x = MOBILE ? -1.8 + (i % 3) * 1.8 + (r() - 0.5) * 0.8 : 2.9 + col * 1.2 + (r() - 0.5) * 0.45;
    const y = MOBILE ? 2.2 - Math.floor(i / 3) * 1.25 + (r() - 0.5) * 0.4 : 1.8 - row * 1.6 + (r() - 0.5) * 0.6;
    const z = -1.5 - r() * 3.5; const s = 0.32 + r() * 0.3;
    g.position.set(x, y, z); g.scale.setScalar(0.0001);
    const core = g.getObjectByName('room_core'); const cage = g.getObjectByName('room_cage');
    world.add(g);
    rooms.push({ g, core, cage, s, ph: r() * 6.28, born: 0.2 + i * 0.07, members: 3 + Math.floor(r() * 4), tilt: (r() - 0.5) * 1.2, spin: 0.25 + r() * 0.3 });
  }
  // members orbiting each room: one instanced mesh for all of them
  const memberGeo = new SphereGeometry(0.045, 10, 8);
  const totalMembers = rooms.reduce((a, x) => a + x.members, 0) + 6;
  const members = new InstancedMesh(memberGeo, new MeshStandardMaterial({ color: C.ink, emissive: C.ink, emissiveIntensity: 0.35, roughness: 0.5 }), totalMembers);
  world.add(members); const dummy = new Object3D();
  // the Nest: the one contract under every syndicate
  const nest = flat(dress(models.nest.clone(true), { nest_slab: M.slab, nest_share: (o) => new MeshStandardMaterial({ color: o.material.color, metalness: 0.2, roughness: 0.5, emissive: o.material.color, emissiveIntensity: 0.12 }) }));
  nest.position.set(MOBILE ? 0 : 4.5, MOBILE ? -3.6 : -3.0, -3.2); nest.scale.set(MOBILE ? 1.1 : 1.45, 0.35, 1.2); world.add(nest);
  const nestTop = nest.position.y + 0.12;
  const nestLabel = labels.add('NEAR · one contract, every syndicate settles here', 'dim'); nestLabel.pos.copy(nest.position).add(new Vector3(-1.6, -0.45, 1.1));
  // settlement beams (room -> Nest)
  const beams = rooms.map((rm) => {
    const geo = new BufferGeometry().setAttribute('position', new Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
    const line = new Line(geo, new LineBasicMaterial({ color: C.lake, transparent: true, opacity: 0 })); world.add(line);
    const dot = new Mesh(new SphereGeometry(0.05, 10, 8), new MeshBasicMaterial({ color: C.lake, transparent: true, opacity: 0 })); world.add(dot);
    return { line, dot };
  });
  // the agent in three syndicates
  const agentRooms = [1, Math.floor(N / 2), N - 2].map((i) => rooms[i]);
  const agent = new Mesh(new SphereGeometry(0.075, 16, 12), new MeshStandardMaterial({ color: C.glow, emissive: C.glow, emissiveIntensity: 1.6 })); world.add(agent);
  const agentLight = new PointLight(C.glow, 2.2, 3.5, 2); agent.add(agentLight);
  const links = agentRooms.map((a, k) => {
    const b = agentRooms[(k + 1) % agentRooms.length];
    const geo = new BufferGeometry().setFromPoints([a.g.position, b.g.position]);
    const l = new Line(geo, new LineDashedMaterial({ color: C.glow, dashSize: 0.12, gapSize: 0.12, transparent: true, opacity: 0 })); l.computeLineDistances(); world.add(l); return l;
  });
  const agentLabel = labels.add('one agent · three syndicates', 'glow');
  const roomLabel = labels.add('a syndicate: members deciding in a private room', 'lake');
  // travellers between rooms (members joining another syndicate)
  const trav = Array.from({ length: MOBILE ? 3 : 6 }, () => ({ a: Math.floor(r() * N), b: Math.floor(r() * N), off: r() * 6, dur: 2.6 + r() * 1.6 }));

  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  host.addEventListener('pointermove', (e) => { const b = host.getBoundingClientRect(); mouse.tx = (e.clientX - b.left) / b.width - 0.5; mouse.ty = (e.clientY - b.top) / b.height - 0.5; });
  const look = new Vector3(); const tmp = new Vector3();
  return {
    scene, camera, labels,
    update(t) {
      // scroll through the hero pulls the camera back: from the rooms to the network they make
      const b = host.getBoundingClientRect(); const p = clamp(-b.top / Math.max(1, b.height));
      mouse.x += (mouse.tx - mouse.x) * 0.04; mouse.y += (mouse.ty - mouse.y) * 0.04;
      const cx = MOBILE ? 0 : 0.4; camera.position.set(cx + mouse.x * 0.8 + Math.sin(t * 0.07) * 0.3, 0.3 - mouse.y * 0.5 + p * 1.4, 9.5 + p * 3.5);
      look.set(MOBILE ? 0 : 0.9, -0.3 - p * 0.4, -2.6); camera.lookAt(look);
      let mi = 0;
      rooms.forEach((rm, i) => {
        const born = ease(seg(t, rm.born, rm.born + 1.1)); rm.g.scale.setScalar(Math.max(0.0001, rm.s * born));
        rm.cage.rotation.y = t * rm.spin * 0.3 + rm.ph; rm.cage.rotation.x = rm.tilt * 0.3;
        rm.core.material.emissiveIntensity = 0.8 + 0.35 * Math.sin(t * 1.2 + rm.ph); // deciding
        for (let m = 0; m < rm.members; m++) {
          const a = rm.ph + m * ((Math.PI * 2) / rm.members) + t * 0.35; const R = rm.s * 1.7 * born;
          tmp.set(Math.cos(a) * R, Math.sin(a) * R * Math.sin(rm.tilt) * 0.6, Math.sin(a) * R * 0.9).add(rm.g.position);
          dummy.position.copy(tmp); dummy.scale.setScalar(born); dummy.updateMatrix(); members.setMatrixAt(mi++, dummy.matrix);
        }
        // a settlement now and then: a pulse from the room down to the Nest
        const cyc = (t + rm.ph * 2.3) % 9; const bm = beams[i];
        if (cyc < 1.3 && t > 2.2) {
          const q = ease(cyc / 1.3); const y = MathUtils.lerp(rm.g.position.y - rm.s, nestTop, q);
          const pos = bm.line.geometry.attributes.position; pos.setXYZ(0, rm.g.position.x, rm.g.position.y - rm.s, rm.g.position.z); pos.setXYZ(1, rm.g.position.x, y, rm.g.position.z); pos.needsUpdate = true;
          bm.line.material.opacity = 0.45 * (1 - q * 0.6); bm.dot.position.set(rm.g.position.x, y, rm.g.position.z); bm.dot.material.opacity = 1 - q * 0.4;
        } else { bm.line.material.opacity = 0; bm.dot.material.opacity = 0; }
      });
      for (const tr of trav) {
        const a = rooms[tr.a], c = rooms[tr.b]; let q = ((t + tr.off) % (tr.dur + 2.5)) / tr.dur;
        if (a === c || q > 1 || t < 1.6) { dummy.scale.setScalar(0.0001); } else {
          q = easeIO(q); const mid = tmp.copy(a.g.position).lerp(c.g.position, 0.5); mid.y += 0.9;
          const curve = new QuadraticBezierCurve3(a.g.position, mid.clone(), c.g.position); dummy.position.copy(curve.getPoint(q)); dummy.scale.setScalar(Math.sin(q * Math.PI));
        }
        dummy.updateMatrix(); members.setMatrixAt(mi++, dummy.matrix);
      }
      while (mi < totalMembers) { dummy.scale.setScalar(0.0001); dummy.updateMatrix(); members.setMatrixAt(mi++, dummy.matrix); }
      members.instanceMatrix.needsUpdate = true;
      // the agent hops between its three syndicates
      const show = ease(seg(t, 2.4, 3.4)); const per = 2.8; const k = Math.floor(t / per) % agentRooms.length; const q = easeIO(seg(t % per, 0.5, 2.2));
      const A = agentRooms[k], B = agentRooms[(k + 1) % agentRooms.length];
      const from = tmp.copy(A.g.position).add(new Vector3(0, A.s * 1.5, 0)); const to = B.g.position.clone().add(new Vector3(0, B.s * 1.5, 0));
      const mid = from.clone().lerp(to, 0.5).add(new Vector3(0, 0.8, 0.4));
      agent.position.copy(new QuadraticBezierCurve3(from.clone(), mid, to).getPoint(q)); agent.scale.setScalar(Math.max(0.0001, show)); agentLight.intensity = 2.2 * show;
      links.forEach((l) => { l.material.opacity = 0.5 * show; });
      agentLabel.pos.copy(agent.position); agentLabel.dx = 12; agentLabel.dy = -20; agentLabel.alpha = show;
      const R0 = rooms[MOBILE ? 0 : 5] || rooms[0]; roomLabel.pos.copy(R0.g.position).add(new Vector3(0, -R0.s * 1.9, 0)); roomLabel.dx = -60; roomLabel.alpha = ease(seg(t, 1.4, 2.2)) * (1 - ease(seg(t, 7, 8)));
      nestLabel.alpha = ease(seg(t, 1.8, 2.6)) * 0.85;
    },
  };
}

// ---------------------------------------------------------------- architecture: members -> our program on Phala <-> NEAR AI Cloud -> NEAR L1
function archScene(models, host) {
  const scene = new Scene(); scene.background = new Color(C.bg); scene.fog = new Fog(C.bg, 14, 30); lights(scene);
  const camera = new PerspectiveCamera(34, 1, 0.1, 60);
  const labels = new Labels(host);
  const lidMat = (color) => () => new MeshStandardMaterial({ color, metalness: 0.6, roughness: 0.3, emissive: color, emissiveIntensity: 0.15 });
  const phala = flat(dress(models.tee.clone(true), { tee_body: M.body, tee_lid: lidMat(C.lake), tee_pins: M.pins })); phala.position.set(0, 0, 0); scene.add(phala);
  const ai = flat(dress(models.tee.clone(true), { tee_body: M.body, tee_lid: lidMat(C.blue), tee_pins: M.pins })); ai.position.set(1.8, 2.0, -1.3); ai.scale.setScalar(0.8); scene.add(ai);
  const nest = flat(dress(models.nest.clone(true), { nest_slab: M.slab, nest_share: (o) => new MeshStandardMaterial({ color: o.material.color, metalness: 0.2, roughness: 0.5 }) }));
  nest.position.set(0.4, -2.2, 0.6); nest.scale.set(1.15, 0.8, 1.1); scene.add(nest);
  const phalaLid = phala.getObjectByName('tee_lid'), aiLid = ai.getObjectByName('tee_lid'); const nestSlab = nest.getObjectByName('nest_slab');
  const L = {
    ai: labels.add('NEAR AI Cloud · TEE', 'blue'),
    ph: labels.add('Our program on Phala · TEE', 'lake'),
    nr: labels.add('NEAR L1 · the contract', 'ink'),
    mem: labels.add('members', 'dim'), alice: labels.add('alice', 'ink'), bob: labels.add('bob', 'ink'), mal: labels.add('mallory', 'deny'),
    state: labels.add('', 'state'), msg: labels.add('', 'msg'),
  };
  L.ai.pos.set(1.8, 2.5, -1.3); L.ai.dx = -50; L.ph.pos.set(0, 0.75, 0); L.ph.dx = -80; L.nr.pos.set(0.4, -2.6, 1.6); L.nr.dx = -60;
  const memberPos = [0, 1, 2, 3].map((i) => new Vector3(-3.6, 0.9 - i * 0.6, 0.8 - i * 0.3));
  memberPos.forEach((p) => { const m = new Mesh(new SphereGeometry(0.09, 14, 10), new MeshStandardMaterial({ color: C.ink, emissive: C.ink, emissiveIntensity: 0.3 })); m.position.copy(p); scene.add(m); });
  L.mem.pos.copy(memberPos[0]).add(new Vector3(0, 0.35, 0)); L.mem.dx = -24;
  const recip = { alice: new Vector3(2.3, -2.8, 1.5), bob: new Vector3(3.0, -2.4, 0.6), mal: new Vector3(-2.2, -2.5, 1.8) };
  for (const [k, p] of Object.entries(recip)) { const m = new Mesh(new SphereGeometry(0.1, 14, 10), new MeshStandardMaterial({ color: k === 'mal' ? C.deny : C.ink, emissive: k === 'mal' ? C.deny : C.ink, emissiveIntensity: 0.3 })); m.position.copy(p); scene.add(m); L[k].pos.copy(p); L[k].dx = 10; L[k].dy = -18; }
  // packets
  const pk = (color, size = 0.12) => { const m = new Mesh(new BoxGeometry(size, size, size), new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1 })); m.visible = false; scene.add(m); return m; };
  const bids = memberPos.map(() => pk(C.lake, 0.1)); const total = pk(C.ink); const proposal = pk(C.ink); const signed = pk(C.lake, 0.14); const pays = [pk(C.lake, 0.1), pk(C.lake, 0.1)];
  const along = (m, a, b, q, lift = 0.6) => { if (q <= 0 || q >= 1) { m.visible = false; return; } m.visible = true; const mid = a.clone().lerp(b, 0.5); mid.y += lift; m.position.copy(new QuadraticBezierCurve3(a, mid, b).getPoint(easeIO(q))); m.rotation.set(q * 4, q * 6, 0); };
  const P = { ph: new Vector3(0, 0.3, 0), phIn: new Vector3(-1.2, 0.2, 0.3), ai: new Vector3(1.8, 1.75, -1.3), nr: new Vector3(0.4, -1.9, 0.6) };
  const names = ['An honest proposal', 'The model proposes more than the total', 'A payout outside the group\'s rules'];
  const props = ['split 3.60 / 2.40', 'split 5.00 / 3.00 = 8.00', 'pay 6.00 to mallory'];
  L.state.pos.set(0, 0, 0); L.msg.pos.set(0, 0, 0);
  const flash = (mat, color, k) => { mat.emissive.setHex(k > 0.01 ? color : mat.userData.base ?? (mat.userData.base = mat.emissive.getHex())); mat.emissiveIntensity = 0.15 + k * 1.2; };
  phalaLid.material.userData.base = C.lake; aiLid.material.userData.base = C.blue; nestSlab.material.userData.base = 0x000000;
  return {
    scene, camera, labels,
    update(t) {
      const Pd = 11; const v = Math.floor(t / Pd) % 3; const lt = t % Pd;
      const far = host.clientWidth < 520 ? 1.3 : 1; camera.position.set((5.2 + Math.sin(t * 0.12) * 0.3) * far, 4.4 * far, 9.4 * far); camera.lookAt(0.3, -0.4, 0.2);
      // fixed overlay text: top-left state, bottom message
      L.state.el.textContent = names[v]; L.state.el.dataset.v = String(v);
      memberPos.forEach((p, i) => along(bids[i], p, P.phIn, seg(lt, 0.2 + i * 0.2, 1.4 + i * 0.2), 0.3));
      along(total, P.ph, P.ai, seg(lt, 2.8, 3.8), 0.8);
      proposal.material.color.setHex(v === 1 ? C.deny : C.ink); proposal.material.emissive.setHex(v === 1 ? C.deny : C.ink);
      along(proposal, P.ai, P.ph, seg(lt, 4.6, 5.8), 0.8);
      let msg = ''; let bad = 0;
      if (lt > 1.9 && lt < 2.9) msg = 'sum of sealed bids: 6.00';
      else if (lt >= 2.9 && lt < 4.6) msg = 'only the total goes to the model';
      else if (lt >= 4.6 && lt < 6) msg = `the model proposes: ${props[v]}`;
      const chk = seg(lt, 6, 6.4);
      if (v === 1 && chk > 0) { msg = '8.00 is more than the 6.00 in the room · Phala does not sign'; bad = chk * (1 - seg(lt, 9.5, 11)); flash(phalaLid.material, C.deny, bad); }
      else flash(phalaLid.material, C.lake, (lt > 0.5 && lt < 2.8) || (lt > 6 && lt < 7.4) ? 0.6 : 0);
      flash(aiLid.material, C.blue, lt > 3.2 && lt < 5.6 ? 0.6 : 0);
      if (v !== 1) {
        if (chk > 0 && lt < 7.2) msg = 'fits the total · signed inside the TEE';
        along(signed, P.ph, P.nr, seg(lt, 7.2, 8.2), 0.2);
        const fin = seg(lt, 8.2, 8.6);
        if (v === 0) { if (fin > 0) msg = 'within the rules · NEAR pays alice and bob'; along(pays[0], P.nr, recip.alice, seg(lt, 8.4, 9.6), 0.5); along(pays[1], P.nr, recip.bob, seg(lt, 8.5, 9.7), 0.5); flash(nestSlab.material, C.lake, fin * (1 - seg(lt, 9.6, 10.6)) * 0.5); }
        if (v === 2) { if (fin > 0) msg = 'mallory is not in the rules · NEAR refuses it'; flash(nestSlab.material, C.deny, fin * (1 - seg(lt, 9.8, 11))); pays.forEach((m) => { m.visible = false; }); }
      } else { signed.visible = false; pays.forEach((m) => { m.visible = false; }); flash(nestSlab.material, C.lake, 0); }
      L.msg.el.textContent = msg; L.msg.el.dataset.bad = String(v !== 0 && chk > 0);
    },
  };
}

// ---------------------------------------------------------------- boot
// Give the page a frame between heavy steps, so scrolling and input stay responsive while the 3D starts.
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

export async function boot({ hosts, models: buffers }) {
  if (!('WebGL2RenderingContext' in window)) return { ok: false, reason: 'no WebGL 2' };
  const loader = new GLTFLoader(); const base = new URL('models/', document.baseURI);
  // models arrive as ArrayBuffers fetched in parallel with this module (main.js); fall back to loading them here
  const load = (n) => (buffers && buffers[n] ? buffers[n].then((buf) => loader.parseAsync(buf, base.href)) : loader.loadAsync(new URL(`${n}.glb`, base).href)).then((g) => g.scene);
  const [room, nest, tee] = await Promise.all(['room', 'nest', 'tee'].map(load));
  const models = { room, nest, tee };
  await nextFrame();
  let renderer; try { renderer = makeRenderer(); } catch (e) { return { ok: false, reason: String(e) }; }
  // Software WebGL (no usable GPU: blocklisted drivers, VMs) compiles these shaders for seconds and freezes the page.
  // Keep the 2D scenes instead. ?3d in the URL forces the 3D, for testing.
  const force = new URLSearchParams(location.search).has('3d');
  const info = renderer.getContext().getExtension('WEBGL_debug_renderer_info');
  const gpu = info ? String(renderer.getContext().getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
  if (!force && /swiftshader|llvmpipe|softpipe|software|basic render/i.test(gpu)) { renderer.dispose(); renderer.forceContextLoss(); return { ok: false, reason: `software renderer (${gpu})` }; }
  await nextFrame();
  const pm = new PMREMGenerator(renderer); ENV = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose();
  await nextFrame();
  const stages = hosts.map(({ el, kind, fallback }) => {
    const s = (kind === 'hero' ? heroScene : archScene)(models, el);
    return { el, fallback, ...s, visible: false, t0: null };
  });
  // compile every shader before the first frame, using parallel compilation where the driver offers it
  for (const s of stages) { await nextFrame(); if (renderer.compileAsync) await renderer.compileAsync(s.scene, s.camera).catch(() => {}); }
  let active = null;
  const pick = () => { const vis = stages.filter((s) => s.visible); return vis.sort((a, b) => b.ratio - a.ratio)[0] || null; };
  const io = new IntersectionObserver((es) => { for (const e of es) { const s = stages.find((x) => x.el === e.target); if (s) { s.visible = e.isIntersecting; s.ratio = e.intersectionRatio; } } active = pick(); }, { threshold: [0, 0.1, 0.3, 0.6, 1] });
  // take over each stage: hide its 2D fallback, keep it available if WebGL is lost
  for (const s of stages) io.observe(s.el);
  const takeOver = (s) => { if (s.took) return; s.took = true; requestAnimationFrame(() => { renderer.domElement.classList.add('ready'); setTimeout(() => { if (s.fallback) { if (s.fallback.__stage) s.fallback.__stage.off = true; s.fallback.style.visibility = 'hidden'; } }, 650); }); };
  renderer.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); for (const s of stages) { if (s.fallback) { s.fallback.style.visibility = ''; if (s.fallback.__stage) { s.fallback.__stage.off = false; s.fallback.__stage.start(); } } s.labels.show(false); } renderer.setAnimationLoop(null); renderer.domElement.remove(); });
  const start = performance.now();
  renderer.setAnimationLoop(() => {
    if (document.hidden || !active) return;
    const s = active;
    if (renderer.domElement.parentElement !== s.el) { s.el.insertBefore(renderer.domElement, s.labels.layer); }
    if (!fit(renderer, s.el, s.camera)) return;
    const t = (performance.now() - start) / 1000;
    s.update(t); renderer.render(s.scene, s.camera); s.labels.update(s.camera); takeOver(s);
    for (const o of stages) o.labels.show(o === s);
  });
  return { ok: true, renderer };
}
