/* 3D wireframe hand, shared by the practice activities and ported from hand-demo.html.
   The uploaded hand mesh (window.HAND, see hand-mesh-data.js) is skinned to the 21 tracked joints and drawn with three.js.
   API: HandView.init(containerEl), draw(points21Screen, color), hide(), setLook({ fewWires, opacity }), setMirrored(bool).
   Points are screen pixels relative to the container, { x, y, z } with z in the same units (depth, nearer = negative). */
(() => {
  const HAND = window.HAND;
  let ready = false, mirrorHand = false, fewWires = true, seeThru = .55, glowFor = null;
  let gl, renderer, scene, cam3, box, posAttr, wireGeo, skinMat, wireMat, edgeIdx, coarseIdx, restA, restB, lmA, lmB, N;

  /* ---------- small vector helpers ---------- */
  const v3 = (a, i) => [a[i * 3], a[i * 3 + 1], a[i * 3 + 2]];
  const sb = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dt3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cr3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const un = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  function basis(P0, P5, P9, P17) { const X = un(sb(P5, P17)), y = sb(P9, P0), Y = un(sb(y, X.map((x) => x * dt3(y, X)))), Z = cr3(X, Y); return [X, Y, Z]; }
  const mulRT = (Bt, Br) => { const M = []; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) M.push(Bt[0][i] * Br[0][j] + Bt[1][i] * Br[1][j] + Bt[2][i] * Br[2][j]); return M; };
  const mv = (M, v) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];
  const mm = (A, B) => { const C = []; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C.push(A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j]); return C; };
  function align(a, b) { // rotation matrix turning unit a onto unit b
    const v = cr3(a, b), c = dt3(a, b);
    if (c < -.9999) return [-1, 0, 0, 0, -1, 0, 0, 0, 1];
    const k = 1 / (1 + c), [x, y, z] = v;
    return [1 - k * (y * y + z * z), k * x * y - z, k * x * z + y, k * x * y + z, 1 - k * (x * x + z * z), k * y * z - x, k * x * z - y, k * y * z + x, 1 - k * (x * x + y * y)];
  }

  /* ---------- skinning ---------- */
  function drawMesh(T) { // T: 21 target joints in world space
    const rest = mirrorHand ? restB : restA, R = [];
    for (let i = 0; i < 21; i++) R.push(v3(mirrorHand ? lmB : lmA, i));
    const Br = basis(R[0], R[5], R[9], R[17]), Bt = basis(T[0], T[5], T[9], T[17]);
    const Rp = mulRT(Bt, Br);
    const s = (Math.hypot(...sb(T[9], T[0])) / Math.hypot(...sb(R[9], R[0])) + Math.hypot(...sb(T[5], T[17])) / Math.hypot(...sb(R[5], R[17]))) / 2;
    // rebuild each finger from the palm outward: the model keeps its own bone lengths (a little stretch allowed)
    // and only takes the bending directions from the tracker, so joints stay connected and fingers keep their shape
    const F = [];
    const palmPt = (i) => { const q = mv(Rp, sb(R[i], R[0]).map((x) => x * s)); return [T[0][0] + q[0], T[0][1] + q[1], T[0][2] + q[2]]; };
    F[0] = T[0];
    [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]].forEach((J) => {
      F[J[0]] = palmPt(J[0]);
      for (let k = 1; k < 4; k++) {
        const a = J[k - 1], b = J[k], rl = Math.hypot(...sb(R[b], R[a])), td = sb(T[b], T[a]), tl = Math.hypot(...td) || 1;
        const k1 = Math.min(1.12, Math.max(.9, tl / (rl * s))) * s * rl;
        F[b] = [F[a][0] + td[0] / tl * k1, F[a][1] + td[1] / tl * k1, F[a][2] + td[2] / tl * k1];
      }
    });
    const bones = HAND.bones.map(([a, b, c]) => {
      if (c === -1) return { palm: true, ra: R[0], ta: T[0], M: Rp };
      const rd = sb(R[b], R[a]), rl = Math.hypot(...rd), u = rd.map((x) => x / rl), td = sb(F[b], F[a]), tl = Math.hypot(...td);
      const M = mm(align(un(mv(Rp, u)), un(td)), Rp);
      return { ra: R[a], ta: F[a], M, u, k: tl / rl };
    });
    const out = posAttr.array, BI = HAND.bi, BW = HAND.bw;
    for (let i = 0; i < N; i++) {
      const p = [rest[i * 3], rest[i * 3 + 1], rest[i * 3 + 2]]; let x = 0, y = 0, z = 0;
      for (let j = 0; j < 4; j++) {
        const w = BW[i * 4 + j]; if (!w) continue;
        const bo = bones[BI[i * 4 + j]], d = sb(p, bo.ra); let l;
        if (bo.palm) l = [d[0] * s, d[1] * s, d[2] * s];
        else { const pa = dt3(d, bo.u); l = [(d[0] - bo.u[0] * pa) * s + bo.u[0] * pa * bo.k, (d[1] - bo.u[1] * pa) * s + bo.u[1] * pa * bo.k, (d[2] - bo.u[2] * pa) * s + bo.u[2] * pa * bo.k]; }
        const q = mv(bo.M, l); x += w * (bo.ta[0] + q[0]); y += w * (bo.ta[1] + q[1]); z += w * (bo.ta[2] + q[2]);
      }
      out[i * 3] = x; out[i * 3 + 1] = y; out[i * 3 + 2] = z;
    }
    posAttr.needsUpdate = true;
  }

  /* ---------- public API ---------- */
  function applyLook() {
    if (!ready) return;
    wireGeo.setIndex(fewWires ? coarseIdx : edgeIdx);
    wireMat.opacity = seeThru; skinMat.opacity = .05 * seeThru; glowFor = null;
  }
  function size3() {
    if (!ready) return;
    const W = box.clientWidth, H = box.clientHeight;
    renderer.setPixelRatio(window.devicePixelRatio || 1); renderer.setSize(W, H, false);
    cam3.right = W; cam3.bottom = -H; cam3.updateProjectionMatrix();
  }

  function init(containerEl) {
    if (ready) return true;
    if (!window.THREE || !HAND) { console.warn("HandView: three.js or the hand mesh did not load, so the 3D hand is off."); return false; }
    try {
      box = containerEl;
      N = HAND.pos.length / 3; restA = Float32Array.from(HAND.pos); restB = Float32Array.from(HAND.pos);
      for (let i = 0; i < N; i++) restB[i * 3] = -restB[i * 3];
      lmA = HAND.lm; lmB = HAND.lm.map((v, i) => (i % 3 === 0 ? -v : v));
      const tris = [], es = new Set();
      for (let q = 0; q < HAND.quads.length; q += 4) {
        const f = HAND.quads.slice(q, q + 4); tris.push(f[0], f[1], f[2], f[0], f[2], f[3]);
        for (let i = 0; i < 4; i++) { const a = f[i], b = f[(i + 1) % 4]; es.add(a < b ? a * 65536 + b : b * 65536 + a); }
      }
      // "Less" wires: only edges joining an original vertex to an edge point
      edgeIdx = []; coarseIdx = [];
      const NV0 = HAND.nv, NE0 = HAND.ne;
      es.forEach((k) => {
        const a = Math.floor(k / 65536), b = k % 65536; edgeIdx.push(a, b);
        const lo = Math.min(a, b), hi = Math.max(a, b);
        if (lo < NV0 && hi >= NV0 && hi < NV0 + NE0) coarseIdx.push(a, b);
      });
      posAttr = new THREE.Float32BufferAttribute(new Float32Array(N * 3), 3); posAttr.setUsage(THREE.DynamicDrawUsage);
      gl = document.createElement("canvas");
      gl.setAttribute("aria-hidden", "true");
      Object.assign(gl.style, { position: "absolute", left: "0", top: "0", width: "100%", height: "100%", pointerEvents: "none", zIndex: "8", visibility: "hidden" });
      box.appendChild(gl);
      renderer = new THREE.WebGLRenderer({ canvas: gl, alpha: true, antialias: true });
      scene = new THREE.Scene(); cam3 = new THREE.OrthographicCamera(0, 1, 0, -1, -20000, 20000);
      const skinGeo = new THREE.BufferGeometry(); skinGeo.setAttribute("position", posAttr); skinGeo.setIndex(tris);
      wireGeo = new THREE.BufferGeometry(); wireGeo.setAttribute("position", posAttr); wireGeo.setIndex(coarseIdx);
      skinMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .07, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2 });
      wireMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: .95 });
      const skin = new THREE.Mesh(skinGeo, skinMat), wire = new THREE.LineSegments(wireGeo, wireMat);
      // the see-through skin goes first so it hides the lines behind the hand
      skin.frustumCulled = wire.frustumCulled = false; skin.renderOrder = 0; wire.renderOrder = 1; scene.add(skin, wire);
      ready = true;
      window.addEventListener("resize", size3); size3(); applyLook();
    } catch (err) {
      console.warn("HandView: WebGL is not available, so the 3D hand is off.", err);
      if (gl && gl.parentNode) gl.parentNode.removeChild(gl);
      ready = false; return false;
    }
    return true;
  }

  function draw(h, col) { // h: 21 points { x, y, z } in container pixels
    if (!ready || !h) return;
    drawMesh(h.map((p) => [p.x, -p.y, -p.z]));
    wireMat.color.set(col); skinMat.color.set(col);
    if (glowFor !== col) { gl.style.filter = `drop-shadow(0 0 ${seeThru > .5 ? 2 : 1}px ${col}99)`; glowFor = col; }
    gl.style.visibility = "visible";
    renderer.render(scene, cam3);
  }
  function hide() { if (ready) gl.style.visibility = "hidden"; }
  function setLook(o) {
    if (o && o.fewWires != null) fewWires = !!o.fewWires;
    if (o && o.opacity != null) seeThru = Math.min(1, Math.max(.15, +o.opacity));
    applyLook();
  }
  function setMirrored(m) { mirrorHand = !!m; }

  window.HandView = { init, draw, hide, setLook, setMirrored, isMirrored: () => mirrorHand };
})();
