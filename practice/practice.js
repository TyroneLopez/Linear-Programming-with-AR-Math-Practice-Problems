/* Pinch practice engine: step-by-step solutions with floating answer blocks.
   A page defines window.PRACTICE = { id, title, lesson } and loads problems.js, which registers generators.
   Input: hand tracking (MediaPipe, pinch to grab, open to drop) or mouse / touch drag. */
(() => {
  const $ = (s) => document.querySelector(s);
  const cfg = window.PRACTICE, GEN = window.PROBLEMS[cfg.id];
  const app = $("#app"), tilesEl = $("#tiles"), video = $("#cam"), cv = $("#fx"), ctx = cv.getContext("2d");
  const CONN = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  /* ---------- math rendering ---------- */
  function tex(src, display) {
    try { return katex.renderToString(String(src), { throwOnError: false, displayMode: !!display }); } catch (_) { return src; }
  }
  // "Plain words with $math$" -> HTML
  function mixed(s) { return String(s).split(/(\$[^$]+\$)/).map((p) => p.startsWith("$") ? tex(p.slice(1, -1)) : esc(p)).join(""); }
  const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  // tile / answer labels: "@words" = plain text, anything else = math
  const labelHTML = (l) => l.startsWith("@") ? `<span class="word">${esc(l.slice(1))}</span>` : tex(l);
  const kindOf = (l) => l.startsWith("@") ? "word" : /^(=|\\ne|<|>|\\le|\\ge|\\to)$/.test(l) ? "sym" : /^[a-z](_\d)?$/.test(l) ? "var" : "num";

  /* ---------- state ---------- */
  let prob = null, lineIx = 0, slots = [], tiles = [], held = null, mode = null, locked = false;
  let score = 0, streak = 0, solved = 0, mistakesThis = 0, triesThisLine = 0;
  let best = 0; try { best = +localStorage.getItem("pinch-lp-best-" + cfg.id) || 0; } catch (_) {}
  const cursor = { x: -999, y: -999, down: false, prevDown: false, visible: false };
  let particles = [];

  /* ---------- sound ---------- */
  let ac = null;
  const unlockAudio = () => { try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); ac.resume(); } catch (_) {} };
  function tone(f, d, type = "sine", v = .06, delay = 0) {
    if (!ac) return;
    const t0 = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = f; g.gain.setValueAtTime(v, t0); g.gain.exponentialRampToValueAtTime(.0001, t0 + d);
    o.connect(g).connect(ac.destination); o.start(t0); o.stop(t0 + d);
  }

  /* ---------- problem flow ---------- */
  function newProblem() {
    prob = GEN();
    lineIx = 0; mistakesThis = 0; locked = false;
    $("#prompt").innerHTML = `<div class="kicker">Problem ${solved + 1}</div><div class="ptext">${mixed(prob.prompt)}</div>`;
    const vis = $("#visual");
    vis.innerHTML = ""; vis.hidden = !prob.visual;
    if (prob.visual) prob.visual.mount(vis), prob.visual.update(0);
    const list = $("#lines"); list.innerHTML = "";
    prob.lines.forEach((ln, i) => {
      const li = document.createElement("li");
      li.className = "line" + (i === prob.lines.length - 1 ? " final" : "");
      li.innerHTML = `<div class="cap">${i === prob.lines.length - 1 ? "Final answer" : "Step " + (i + 1)}${ln.label ? " · " + mixed(ln.label) : ""}</div><div class="row"></div>`;
      list.appendChild(li);
    });
    $("#done").hidden = true;
    activate(0);
    updateHud();
  }
  function partsHTML(row, parts, fill) {
    row.innerHTML = "";
    const out = [];
    const add = (p, into) => {
      if (typeof p === "string") { const s = document.createElement("span"); s.className = "m"; s.innerHTML = tex(p); into.appendChild(s); }
      else if (p.text != null) { const s = document.createElement("span"); s.className = "t"; s.textContent = p.text; into.appendChild(s); }
      else if (p.frac) {
        const f = document.createElement("span"); f.className = "frac";
        const top = document.createElement("span"), bot = document.createElement("span"); top.className = "num"; bot.className = "den";
        p.frac[0].forEach((q) => add(q, top)); p.frac[1].forEach((q) => add(q, bot));
        f.append(top, bot); into.appendChild(f);
      } else if (p.slot != null) {
        const s = document.createElement("span"); s.className = "slot " + kindOf(p.slot);
        if (fill) { s.classList.add("filled"); s.innerHTML = labelHTML(p.slot); }
        else out.push({ el: s, ans: p.slot, tile: null });
        into.appendChild(s);
      }
    };
    parts.forEach((p) => add(p, row));
    return out;
  }
  function activate(i) {
    lineIx = i; triesThisLine = 0;
    const lis = document.querySelectorAll("#lines .line");
    lis.forEach((li, k) => { li.classList.toggle("active", k === i); li.classList.toggle("future", k > i); });
    const ln = prob.lines[i];
    slots = partsHTML(lis[i].querySelector(".row"), ln.parts, false);
    $("#hintBox").hidden = true; $("#hintBox").innerHTML = "";
    // tiles: every answer once per slot, plus distractors
    tiles.forEach((t) => t.el.remove()); tiles = []; held = null;
    const labels = slots.map((s) => s.ans);
    const seen = new Set(labels);
    (ln.extra || []).forEach((d) => { if (!seen.has(d) && labels.length < slots.length + 5) { seen.add(d); labels.push(d); } });
    shuffle(labels).forEach(addTile);
    lis[i].scrollIntoView({ block: "nearest", behavior: "smooth" });
    updateHud();
  }
  function poolRect() { const r = $("#pool").getBoundingClientRect(), a = app.getBoundingClientRect(); return { x: r.left - a.left, y: r.top - a.top, w: r.width, h: r.height }; }
  function addTile(label) {
    const el = document.createElement("div");
    el.className = "tile " + kindOf(label);
    el.innerHTML = labelHTML(label);
    tilesEl.appendChild(el);
    const P = poolRect(), w = el.offsetWidth, h = el.offsetHeight;
    let x = 0, y = 0;
    for (let k = 0; k < 60; k++) {
      x = P.x + 10 + Math.random() * Math.max(1, P.w - w - 20);
      y = P.y + 36 + Math.random() * Math.max(1, P.h - h - 46);
      if (!tiles.some((t) => x < t.x + t.w + 8 && t.x < x + w + 8 && y < t.y + t.h + 8 && t.y < y + h + 8)) break;
    }
    const ang = Math.random() * Math.PI * 2, sp = 10 + Math.random() * 14;
    tiles.push({ el, label, x, y, w, h, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, slot: null, phase: Math.random() * 6 });
  }
  function slotAt(x, y) {
    const a = app.getBoundingClientRect(), pad = mode === "hand" ? 18 : 6;
    return slots.find((s) => { const r = s.el.getBoundingClientRect(); return x > r.left - a.left - pad && x < r.right - a.left + pad && y > r.top - a.top - pad && y < r.bottom - a.top + pad; });
  }
  function tileAt(x, y) {
    const pad = mode === "hand" ? 18 : 2; let best = null, bd = Infinity;
    for (const t of tiles) {
      if (x > t.x - pad && x < t.x + t.w + pad && y > t.y - pad && y < t.y + t.h + pad) {
        const d = Math.hypot(t.x + t.w / 2 - x, t.y + t.h / 2 - y); if (d < bd) { bd = d; best = t; }
      }
    }
    return best;
  }
  function grab() {
    if (locked) return;
    const t = tileAt(cursor.x, cursor.y); if (!t) return;
    if (t.slot) { t.slot.tile = null; t.slot.el.classList.remove("full"); t.slot.el.style.width = ""; t.slot = null; }
    held = t; t.el.classList.add("held"); tilesEl.appendChild(t.el);
    tone(520, .06, "triangle", .04);
  }
  function release() {
    const t = held; if (!t) return; held = null; t.el.classList.remove("held");
    const s = locked ? null : slotAt(cursor.x, cursor.y);
    if (s) {
      if (s.tile && s.tile !== t) eject(s.tile);
      s.tile = t; t.slot = s; s.el.classList.add("full"); s.el.style.width = (t.w + 6) + "px";
      tone(740, .07, "triangle", .04);
      if (slots.every((q) => q.tile)) judge();
    } else { t.vx = (Math.random() - .5) * 40; t.vy = (Math.random() - .5) * 40; }
  }
  function eject(t) {
    if (t.slot) { t.slot.tile = null; t.slot.el.classList.remove("full"); t.slot.el.style.width = ""; t.slot = null; }
    const P = poolRect();
    t.x = Math.min(Math.max(t.x, P.x + 10), P.x + P.w - t.w - 10);
    t.vx = (Math.random() - .5) * 120; t.vy = (Math.random() - .5) * 120;
  }
  function judge() {
    const wrong = slots.filter((s) => s.tile.label !== s.ans);
    const li = document.querySelectorAll("#lines .line")[lineIx];
    if (!wrong.length) {
      locked = true;
      const pts = triesThisLine === 0 ? 10 : 5; score += pts;
      li.classList.add("ok"); burst(li);
      tone(660, .12, "triangle"); tone(880, .14, "triangle", .06, .1);
      flash(`Correct +${pts}`, "good");
      setTimeout(() => {
        partsHTML(li.querySelector(".row"), prob.lines[lineIx].parts, true);
        li.classList.remove("active", "ok"); li.classList.add("done");
        if (prob.visual) prob.visual.update(lineIx + 1);
        if (lineIx + 1 < prob.lines.length) { locked = false; activate(lineIx + 1); }
        else finish();
      }, 650);
    } else {
      triesThisLine++; mistakesThis++;
      li.classList.remove("bad"); void li.offsetWidth; li.classList.add("bad");
      tone(200, .25, "square", .045);
      flash(wrong.length === slots.length ? "Not yet. Try again" : `${slots.length - wrong.length} of ${slots.length} right. Fix the red box${wrong.length > 1 ? "es" : ""}`, "bad");
      wrong.forEach((s) => { s.el.classList.add("wrong"); setTimeout(() => s.el.classList.remove("wrong"), 900); eject(s.tile); });
      if (triesThisLine >= 2) showHint();
    }
    updateHud();
  }
  function finish() {
    score += 20; solved++;
    streak = mistakesThis === 0 ? streak + 1 : 0;
    if (score > best) { best = score; try { localStorage.setItem("pinch-lp-best-" + cfg.id, best); } catch (_) {} }
    tiles.forEach((t) => t.el.remove()); tiles = [];
    [523, 659, 784, 1047].forEach((f, i) => tone(f, .22, "triangle", .06, i * .12));
    $("#doneText").textContent = mistakesThis === 0 ? "Perfect solution! +20" : "Solved! +20";
    $("#doneSub").textContent = mistakesThis === 0 ? `No mistakes. Streak: ${streak}` : `${mistakesThis} mistake${mistakesThis > 1 ? "s" : ""} along the way. Try the next one with none.`;
    $("#done").hidden = false;
    for (let i = 0; i < 3; i++) setTimeout(() => burst($("#done .card")), i * 250);
    updateHud();
  }
  function showHint() {
    const h = prob.lines[lineIx].hint; if (!h) return;
    const box = $("#hintBox"); box.innerHTML = `<b>Hint:</b> ${mixed(h)}`; box.hidden = false;
  }
  function updateHud() {
    $("#hudStep").textContent = prob ? `Step ${Math.min(lineIx + 1, prob.lines.length)} of ${prob.lines.length}` : "";
    $("#hudScore").textContent = score;
    $("#hudStreak").textContent = streak;
    $("#hudBest").textContent = best;
  }
  let flashT;
  function flash(t, cls) { const el = $("#flash"); el.textContent = t; el.className = "show " + cls; clearTimeout(flashT); flashT = setTimeout(() => el.className = cls, 1400); }
  function burst(el) {
    const a = app.getBoundingClientRect(), r = el.getBoundingClientRect(), cx = r.left - a.left + r.width / 2, cy = r.top - a.top + r.height / 2;
    const cols = ["#46cf86", "#f5b83d", "#6ea8ff", "#ffffff"];
    for (let i = 0; i < 40; i++) {
      const ang = -Math.PI / 2 + (Math.random() - .5) * 2.4, sp = 160 + Math.random() * 320;
      particles.push({ x: cx, y: cy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 1.1, c: cols[i % 4], r: 2 + Math.random() * 3 });
    }
  }

  /* ---------- pointer input ---------- */
  function setP(e) { const a = app.getBoundingClientRect(); cursor.x = e.clientX - a.left; cursor.y = e.clientY - a.top; }
  app.addEventListener("pointerdown", (e) => {
    if (mode !== "pointer" || e.target.closest("button, a, .screen")) return;
    setP(e); cursor.down = true; cursor.prevDown = true; grab(); try { app.setPointerCapture(e.pointerId); } catch (_) {}
  });
  app.addEventListener("pointermove", (e) => { if (mode === "pointer") setP(e); });
  const up = (e) => { if (mode === "pointer" && cursor.down) { setP(e); cursor.down = false; cursor.prevDown = false; release(); } };
  app.addEventListener("pointerup", up); app.addEventListener("pointercancel", up);

  /* ---------- hand input (MediaPipe) ---------- */
  const TV = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/";
  const MODEL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
  let landmarker = null, lastT = -1, hand = null, handSeen = 0, stream = null;
  function mapPt(p) {
    const W = app.clientWidth, H = app.clientHeight, vw = video.videoWidth || 1280, vh = video.videoHeight || 720;
    const s = Math.max(W / vw, H / vh), dw = vw * s, dh = vh * s;
    return { x: (W - dw) / 2 + (1 - p.x) * dw, y: (H - dh) / 2 + p.y * dh };
  }
  function updateHand() {
    if (!hand || performance.now() - handSeen > 900) { cursor.visible = false; cursor.down = false; $("#handNote").hidden = false; return; }
    $("#handNote").hidden = true;
    const p4 = hand[4], p8 = hand[8];
    const size = Math.hypot(hand[0].x - hand[9].x, hand[0].y - hand[9].y) || 1;
    const ratio = Math.hypot(p4.x - p8.x, p4.y - p8.y) / size;
    if (!cursor.down && ratio < .3) cursor.down = true; else if (cursor.down && ratio > .45) cursor.down = false;
    const tx = (p4.x + p8.x) / 2, ty = (p4.y + p8.y) / 2;
    if (!cursor.visible) { cursor.x = tx; cursor.y = ty; }
    cursor.x += (tx - cursor.x) * .55; cursor.y += (ty - cursor.y) * .55; cursor.visible = true;
  }
  function handLoop() {
    if (mode !== "hand") return;
    if (landmarker && video.readyState >= 2 && video.currentTime !== lastT) {
      lastT = video.currentTime;
      try { const r = landmarker.detectForVideo(video, performance.now()); const lm = r.landmarks && r.landmarks[0]; if (lm) { hand = lm.map(mapPt); handSeen = performance.now(); } } catch (_) {}
    }
    requestAnimationFrame(handLoop);
  }
  async function startCamera() {
    const msg = $("#startMsg"); msg.hidden = false; msg.textContent = "Starting the camera…";
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      video.srcObject = stream; await video.play();
    } catch (_) {
      msg.textContent = "The camera isn't available here. Open this page from a website (https) or as a file in Chrome or Edge, and allow camera access. You can play with the mouse or touch right now.";
      return;
    }
    try {
      msg.textContent = "Loading hand tracking (a few seconds)…";
      const v = await import(TV + "vision_bundle.mjs");
      const fs = await v.FilesetResolver.forVisionTasks(TV + "wasm");
      const opts = (delegate) => ({ baseOptions: { modelAssetPath: MODEL, delegate }, runningMode: "VIDEO", numHands: 1 });
      try { landmarker = await v.HandLandmarker.createFromOptions(fs, opts("GPU")); }
      catch (_) { landmarker = await v.HandLandmarker.createFromOptions(fs, opts("CPU")); }
    } catch (_) {
      stream.getTracks().forEach((t) => t.stop()); stream = null;
      msg.textContent = "Hand tracking couldn't load. Check the internet connection and try again, or play with the mouse or touch.";
      return;
    }
    msg.hidden = true; begin("hand"); handLoop();
  }
  function begin(m) {
    mode = m; document.body.classList.toggle("hand", m === "hand");
    $("#modeChip").textContent = m === "hand" ? "Hand tracking" : "Mouse / touch";
    $("#start").hidden = true; $("#handNote").hidden = m !== "hand";
    cursor.down = false; cursor.visible = false;
    if (!prob) newProblem();
  }
  $("#playCam").onclick = () => { unlockAudio(); startCamera(); };
  $("#playMouse").onclick = () => { unlockAudio(); if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; } begin("pointer"); };
  $("#menuBtn").onclick = () => { $("#start").hidden = false; $("#startMsg").hidden = true; };
  $("#newBtn").onclick = () => { if (!locked || !$("#done").hidden) newProblem(); };
  $("#hintBtn").onclick = () => showHint();
  $("#nextBtn").onclick = () => newProblem();

  /* ---------- frame loop ---------- */
  function resize() {
    const dpr = window.devicePixelRatio || 1; cv.width = app.clientWidth * dpr; cv.height = app.clientHeight * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    tiles.forEach((t) => { t.w = t.el.offsetWidth; t.h = t.el.offsetHeight; });
  }
  window.addEventListener("resize", resize); resize();
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    if (mode === "hand") updateHand();
    if (mode) {
      if (cursor.down && !cursor.prevDown) grab();
      if (!cursor.down && cursor.prevDown) release();
      cursor.prevDown = cursor.down;
    }
    const a = app.getBoundingClientRect(), P = poolRect();
    const hoverSlot = held ? slotAt(cursor.x, cursor.y) : null;
    slots.forEach((s) => s.el.classList.toggle("over", s === hoverSlot));
    const hoverTile = !held && mode && (mode === "pointer" || cursor.visible) ? tileAt(cursor.x, cursor.y) : null;
    for (const t of tiles) {
      if (t === held) { t.x += (cursor.x - t.w / 2 - t.x) * .6; t.y += (cursor.y - t.h / 2 - t.y) * .6; }
      else if (t.slot) {
        const r = t.slot.el.getBoundingClientRect(), tx = r.left - a.left + (r.width - t.w) / 2, ty = r.top - a.top + (r.height - t.h) / 2;
        t.x += (tx - t.x) * .35; t.y += (ty - t.y) * .35;
      } else {
        const sp = Math.hypot(t.vx, t.vy); if (sp > 26) { t.vx *= .95; t.vy *= .95; }
        t.x += t.vx * dt; t.y += t.vy * dt;
        const l = P.x + 8, r = P.x + P.w - t.w - 8, tp = P.y + 34, b = P.y + P.h - t.h - 8;
        if (t.x < l) { t.x += (l - t.x) * .2; t.vx = Math.abs(t.vx) || 10; }
        if (t.x > r) { t.x += (r - t.x) * .2; t.vx = -Math.abs(t.vx) || -10; }
        if (t.y < tp) { t.y += (tp - t.y) * .2; t.vy = Math.abs(t.vy) || 10; }
        if (t.y > b) { t.y += (b - t.y) * .2; t.vy = -Math.abs(t.vy) || -10; }
        t.phase += dt;
      }
      const bob = !t.slot && t !== held ? Math.sin(t.phase * 2) * 2.5 : 0;
      t.el.style.transform = `translate3d(${t.x}px,${t.y + bob}px,0)`;
      t.el.classList.toggle("hover", t === hoverTile);
    }
    // keep floating blocks from stacking on each other
    const free = tiles.filter((t) => !t.slot && t !== held);
    for (let i = 0; i < free.length; i++) for (let j = i + 1; j < free.length; j++) {
      const A = free[i], B = free[j];
      const ox = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x) + 6, oy = Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y) + 6;
      if (ox > 0 && oy > 0) {
        if (ox < oy) { const d = (A.x < B.x ? -1 : 1) * ox * .1; A.x += d; B.x -= d; A.vx += d * 4; B.vx -= d * 4; }
        else { const d = (A.y < B.y ? -1 : 1) * oy * .1; A.y += d; B.y -= d; A.vy += d * 4; B.vy -= d * 4; }
      }
    }
    draw(dt);
    requestAnimationFrame(frame);
  }
  function draw(dt) {
    ctx.clearRect(0, 0, app.clientWidth, app.clientHeight);
    if (mode === "hand" && hand && cursor.visible) {
      ctx.lineWidth = 3; ctx.strokeStyle = "rgba(255,255,255,.8)"; ctx.lineCap = "round"; ctx.beginPath();
      for (const [i, j] of CONN) { ctx.moveTo(hand[i].x, hand[i].y); ctx.lineTo(hand[j].x, hand[j].y); }
      ctx.stroke(); ctx.fillStyle = "#fff"; hand.forEach((p) => { ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, 7); ctx.fill(); });
      ctx.beginPath(); ctx.arc(cursor.x, cursor.y, cursor.down ? 12 : 18, 0, 7); ctx.lineWidth = 4;
      ctx.strokeStyle = cursor.down ? "#46cf86" : "#f5b83d"; ctx.stroke();
      if (cursor.down) { ctx.fillStyle = "rgba(70,207,134,.4)"; ctx.fill(); }
    }
    particles = particles.filter((p) => (p.life -= dt) > 0);
    for (const p of particles) {
      p.vy += 800 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      ctx.globalAlpha = Math.min(1, p.life); ctx.fillStyle = p.c; ctx.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
    }
    ctx.globalAlpha = 1;
  }
  updateHud();
  requestAnimationFrame(frame);
  // test hook: start straight away in mouse mode with ?mouse
  if (/[?&]mouse\b/.test(location.search)) begin("pointer");
})();
