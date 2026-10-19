/* Web player for the Linear Programming deck.
   Every slide is a list of positioned elements (recorded from the PowerPoint build).
   Elements whose names start with "!!" glide from slide to slide (a Morph-style transition);
   names ending in "#n" appear on click n. */
(() => {
  const D = window.DECK, PX = 96, PT = 96 / 72, W = 1280, H = 720;
  const stage = document.getElementById("stage"), vp = document.getElementById("viewport");
  const SVGNS = "http://www.w3.org/2000/svg";
  const cssD = window.CSS && CSS.supports && CSS.supports("d", 'path("M0 0")');
  const EQ = {};
  D.eqs.forEach((e) => { EQ[e.slide + "|" + e.name] = e; });

  /* ---------- math ---------- */
  function toKatex(src) {
    let s = String(src).replace(/✓/g, "\\checkmark ");
    const out = []; let i = 0;
    while (i < s.length) {
      if (s[i] === "\\") {
        const m = s.slice(i).match(/^\\([A-Za-z]+|.)/); out.push(m[0]); i += m[0].length;
        if (m[1] === "text") { const j = s.indexOf("}", i); out.push(s.slice(i, j + 1)); i = j + 1; }
        continue;
      }
      let m = s.slice(i).match(/^[A-Za-z]{2,}/);
      if (m) { out.push("\\text{" + m[0] + "}"); i += m[0].length; continue; }
      m = s.slice(i).match(/^ {2,}/);
      if (m) { out.push("\\;\\;\\; "); i += m[0].length; continue; }
      out.push(s[i]); i++;
    }
    s = out.join("");
    s = s.replace(/(\d),(\d{3})/g, "$1{,}$2")
      .replace(/−/g, "-").replace(/≤/g, "\\le ").replace(/≥/g, "\\ge ").replace(/≠/g, "\\ne ")
      .replace(/→/g, "\\to ").replace(/×/g, "\\times ").replace(/ /g, "\\quad ")
      .replace(/(?<=[A-Za-z\)\}:,]) (?=[A-Za-z\(\\])/g, "\\ ");
    return s;
  }
  function katexHTML(src, display) {
    try { return katex.renderToString(toKatex(src), { displayMode: !!display, throwOnError: false, output: "html" }); }
    catch (_) { return src; }
  }

  /* ---------- text ---------- */
  const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  function runsHTML(text) {
    if (typeof text === "string") return esc(text).replace(/\n/g, "<br>");
    const paras = [[]];
    text.forEach((r) => {
      const o = r.options || {};
      paras[paras.length - 1].push(r);
      if (o.breakLine) paras.push([]);
    });
    return paras.filter((p) => p.length).map((p) => {
      const bullet = p.some((r) => r.options && r.options.bullet);
      const space = p.reduce((m, r) => Math.max(m, (r.options && r.options.paraSpaceAfter) || 0), 0);
      const inner = p.map((r) => {
        const o = r.options || {}; let h = esc(r.text);
        if (o.subscript) h = "<sub>" + h + "</sub>";
        const st = [];
        if (o.bold) st.push("font-weight:700");
        if (o.bold === false) st.push("font-weight:400");
        if (o.italic) st.push("font-style:italic");
        if (o.color) st.push("color:#" + o.color);
        if (o.fontFace) st.push("font-family:" + o.fontFace);
        return st.length ? `<span style="${st.join(";")}">${h}</span>` : h;
      }).join("");
      return `<div class="p${bullet ? " bul" : ""}" style="margin-bottom:${space * PT}px">${inner}</div>`;
    }).join("");
  }
  function eqHTML(e) {
    if (e.mode === "mixed") {
      return '<div class="p">' + String(e.src).split(/(\$[^$]+\$)/).map((p) =>
        p.startsWith("$") ? katexHTML(p.slice(1, -1), false) : esc(p)).join("") + "</div>";
    }
    return e.src.split("\n").map((l) => `<div class="eqline" style="text-align:${e.align === "l" ? "left" : "center"}">${katexHTML(l, false)}</div>`).join("");
  }

  /* ---------- element geometry ---------- */
  const isSvg = (e) => e.kind === "shape" && ["LINE", "CUSTOM_GEOMETRY", "LEFT_BRACKET", "RIGHT_BRACKET"].includes(e.shape);
  function pathOf(e) {
    const x = e.x * PX, y = e.y * PX, w = e.w * PX, h = e.h * PX;
    if (e.shape === "LINE") return e.flipV ? `M${x} ${y + h}L${x + w} ${y}` : `M${x} ${y}L${x + w} ${y + h}`;
    if (e.shape === "LEFT_BRACKET") return `M${x + w} ${y}L${x} ${y}L${x} ${y + h}L${x + w} ${y + h}`;
    if (e.shape === "RIGHT_BRACKET") return `M${x} ${y}L${x + w} ${y}L${x + w} ${y + h}L${x} ${y + h}`;
    const pts = (e.points || []).filter((p) => !p.close);
    return pts.map((p, k) => (k ? "L" : "M") + (x + p.x * PX).toFixed(1) + " " + (y + p.y * PX).toFixed(1)).join("") + "Z";
  }
  const alpha = (tr) => (tr == null ? 1 : 1 - tr / 100);
  function hex(c, tr) {
    if (!c) return "transparent";
    if (tr == null) return "#" + c;
    const n = parseInt(c, 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${alpha(tr)})`;
  }

  /* ---------- build / update a node ---------- */
  function makeNode(e) {
    if (isSvg(e)) {
      const svg = document.createElementNS(SVGNS, "svg");
      svg.setAttribute("class", "el vec"); svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      const p = document.createElementNS(SVGNS, "path"); svg.appendChild(p);
      return svg;
    }
    const d = document.createElement(e.hyperlink ? "a" : "div");
    d.className = "el box";
    const inner = document.createElement("div"); inner.className = "inner"; d.appendChild(inner);
    return d;
  }
  function paint(node, e, slideNum) {
    if (isSvg(e)) {
      const p = node.firstChild, ln = e.line || {};
      const d = pathOf(e);
      if (cssD) p.style.d = `path("${d}")`; else p.setAttribute("d", d);
      const isLine = e.shape !== "CUSTOM_GEOMETRY";
      p.style.fill = isLine ? "none" : hex(e.fill && e.fill.color, e.fill && e.fill.transparency);
      const sw = ln.type === "none" ? 0 : (ln.width || 1) * PT;
      p.style.stroke = ln.type === "none" ? "none" : hex(ln.color || "111111", ln.transparency);
      p.style.strokeWidth = sw;
      p.style.strokeDasharray = ln.dashType && ln.dashType !== "solid" ? `${sw * 3} ${sw * 2}` : "none";
      return;
    }
    const s = node.style, inner = node.firstChild;
    s.left = e.x * PX + "px"; s.top = e.y * PX + "px"; s.width = e.w * PX + "px"; s.height = e.h * PX + "px";
    const fill = e.fill && e.fill.type !== "none" && e.fill.color ? hex(e.fill.color, e.fill.transparency) : "transparent";
    s.background = fill;
    const ln = e.line || {};
    s.border = ln.color && ln.type !== "none" ? `${Math.max(0.75, (ln.width || 1)) * PT}px solid #${ln.color}` : "0";
    s.borderRadius = e.shape === "OVAL" ? "50%" : e.shape === "ROUNDED_RECTANGLE" ? (e.rectRadius || 0.1) * PX + "px" : "0";
    s.boxShadow = e.shadow ? "0 3px 14px rgba(17,17,17,.12)" : "none";
    if (e.kind === "table") { inner.innerHTML = tableHTML(e); s.border = "0"; s.background = "transparent"; return; }
    if (e.kind === "shape") { inner.innerHTML = ""; return; }
    // text
    const fs = (e.fontSize || 18) * PT;
    s.fontSize = fs + "px";
    s.color = "#" + (e.color || "111111");
    s.fontWeight = e.bold ? 700 : 400;
    s.fontStyle = e.italic ? "italic" : "normal";
    s.letterSpacing = e.charSpacing ? e.charSpacing * PT * 0.5 + "px" : "normal";
    s.fontFamily = (e.fontFace || "Arial") + ", Helvetica, sans-serif";
    const m = e.margin == null ? [7.2, 7.2, 3.6, 3.6] : Array.isArray(e.margin) ? e.margin : [e.margin, e.margin, e.margin, e.margin];
    inner.style.padding = `${m[3] * PT}px ${m[1] * PT}px ${m[2] * PT}px ${m[0] * PT}px`;
    inner.style.justifyContent = e.valign === "top" ? "flex-start" : e.valign === "bottom" ? "flex-end" : "center";
    inner.style.textAlign = e.align || "left";
    const eq = EQ[slideNum + "|" + e.objectName];
    const html = eq ? eqHTML(eq) : runsHTML(e.text);
    if (inner.__html !== html) { inner.innerHTML = html; inner.__html = html; }
    if (e.hyperlink) {
      if (e.hyperlink.url) { node.href = e.hyperlink.url; node.dataset.slide = ""; }
      else { node.href = "#"; node.dataset.slide = e.hyperlink.slide; }
      node.title = e.hyperlink.tooltip || "";
      node.classList.add("link");
    }
  }
  function tableHTML(e) {
    const cw = e.colW || [], rh = (e.rowH || 0.36) * PX, fs = (e.fontSize || 12) * PT;
    const pad = e.margin ? e.margin.map((v) => v * PT + "px").join(" ") : "2px 6px";
    const bc = e.border && e.border.color ? "#" + e.border.color : "#E5E7EB";
    return `<table style="font-size:${fs}px;border-collapse:collapse;width:100%">` + e.rows.map((r) =>
      "<tr>" + r.map((c, ci) => {
        const o = c.options || {};
        return `<td style="width:${(cw[ci] || 1) * PX}px;height:${rh}px;padding:${pad};border:1px solid ${bc};` +
          `background:${o.fill ? "#" + o.fill.color : "transparent"};color:#${o.color || "111111"};font-weight:${o.bold ? 700 : 400};text-align:${o.align || "left"}">${runsHTML(c.text)}</td>`;
      }).join("") + "</tr>").join("") + "</table>";
  }

  /* ---------- deck state ---------- */
  let cur = -1, step = 0, nodes = new Map();
  const clickOf = (name) => { const m = /#(\d+)\s*$/.exec(name || ""); return m ? +m[1] : 0; };
  const maxStep = (i) => D.slides[i].els.reduce((m, e) => Math.max(m, clickOf(e.objectName)), 0);

  function goto(i, atEnd) {
    i = Math.max(0, Math.min(D.slides.length - 1, i));
    const sl = D.slides[i], fresh = new Map(), animate = cur >= 0;
    sl.els.forEach((e, k) => {
      const name = e.objectName || `__${k}`;
      const key = name.startsWith("!!") ? name + "|" + (isSvg(e) ? "v" : "b") : `__${i}_${k}`;
      let node = nodes.get(key);
      const reuse = !!node && name.startsWith("!!");
      if (!reuse) {
        node = makeNode(e);
        node.style.opacity = 0;
        stage.appendChild(node);
        if (!animate) node.classList.add("noanim");
      }
      node.style.zIndex = k + 1;
      node.dataset.click = clickOf(name);
      paint(node, e, i + 1);
      fresh.set(key, node);
      nodes.delete(key);
    });
    nodes.forEach((n) => { n.style.opacity = 0; n.style.pointerEvents = "none"; setTimeout(() => n.remove(), 700); });
    nodes = fresh; cur = i; step = atEnd ? maxStep(i) : 0;
    requestAnimationFrame(() => requestAnimationFrame(() => { reveal(); nodes.forEach((n) => n.classList.remove("noanim")); }));
    document.getElementById("count").textContent = `${i + 1} / ${D.slides.length}`;
    document.getElementById("notesText").textContent = sl.notes || "";
    history.replaceState(null, "", "#" + sl.id);
  }
  function reveal() {
    nodes.forEach((n) => {
      const c = +n.dataset.click;
      n.style.opacity = c <= step ? 1 : 0;
      n.style.pointerEvents = c <= step ? "" : "none";
    });
  }
  function next() { if (step < maxStep(cur)) { step++; reveal(); } else if (cur < D.slides.length - 1) goto(cur + 1); }
  function prev() { if (step > 0) { step--; reveal(); } else if (cur > 0) goto(cur - 1, true); }

  /* ---------- input ---------- */
  document.addEventListener("keydown", (ev) => {
    if (ev.altKey || ev.ctrlKey || ev.metaKey) return;
    const k = ev.key;
    if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"].includes(k)) { ev.preventDefault(); next(); }
    else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(k)) { ev.preventDefault(); prev(); }
    else if (k === "Home") goto(0); else if (k === "End") goto(D.slides.length - 1);
    else if (k === "n" || k === "N") toggleNotes();
    else if (k === "f" || k === "F") fullscreen();
  });
  stage.addEventListener("click", (ev) => {
    const a = ev.target.closest("a.link");
    if (a) {
      if (a.dataset.slide) { ev.preventDefault(); goto(+a.dataset.slide - 1); }
      return; // url links navigate normally
    }
    next();
  });
  let tx = null;
  stage.addEventListener("touchstart", (e) => { tx = e.touches[0].clientX; }, { passive: true });
  stage.addEventListener("touchend", (e) => {
    if (tx == null) return; const dx = e.changedTouches[0].clientX - tx; tx = null;
    if (Math.abs(dx) > 50) { dx < 0 ? next() : prev(); }
  });
  document.getElementById("prevBtn").onclick = (e) => { e.stopPropagation(); prev(); };
  document.getElementById("nextBtn").onclick = (e) => { e.stopPropagation(); next(); };
  document.getElementById("homeBtn").onclick = (e) => { e.stopPropagation(); goto(0); };
  document.getElementById("notesBtn").onclick = (e) => { e.stopPropagation(); toggleNotes(); };
  document.getElementById("fsBtn").onclick = (e) => { e.stopPropagation(); fullscreen(); };
  function toggleNotes() { document.body.classList.toggle("notes-open"); fit(); }
  function fullscreen() {
    if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
  }

  /* ---------- scale to fit ---------- */
  function fit() {
    const r = vp.getBoundingClientRect();
    const sc = Math.min(r.width / W, r.height / H);
    stage.style.transform = `translate(${(r.width - W * sc) / 2}px,${(r.height - H * sc) / 2}px) scale(${sc})`;
  }
  window.addEventListener("resize", fit);
  new ResizeObserver(fit).observe(vp);
  fit();

  const start = location.hash.slice(1);
  const idx = D.slides.findIndex((s) => s.id === start);
  goto(idx >= 0 ? idx : /^\d+$/.test(start) ? +start - 1 : 0);
})();
