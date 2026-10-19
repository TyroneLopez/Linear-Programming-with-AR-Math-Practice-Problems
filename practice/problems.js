/* Random problem generators. Each returns { prompt, lines:[{label, parts, hint, extra}], visual? }.
   parts: "latex" | {text} | {slot:"answer"} | {frac:[[...top parts],[...bottom parts]]}.  "@word" answers are plain words. */
window.PROBLEMS = {};
(() => {
  const PROBLEMS = window.PROBLEMS;
  const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const nz = (a, b) => { let v; do v = ri(a, b); while (v === 0); return v; };
  const s = (v) => ({ slot: String(v) });
  const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; };
  const P = (n) => (n < 0 ? `(${n})` : `${n}`);
  function near(n) {
    const c = [n + 1, n - 1, -n, n + 2, n - 2, 2 * n, n + 10].filter((v) => v !== n);
    for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; }
    return c.slice(0, 2).map(String);
  }
  const extras = (...ns) => [...new Set(ns.flatMap(near))];
  function term(c, v, first) {
    if (c === 0) return first ? "" : "";
    const a = Math.abs(c), body = (a === 1 && v ? "" : a) + v;
    return first ? (c < 0 ? "-" : "") + body : (c < 0 ? " - " : " + ") + body;
  }
  const lin = (a, b, c) => `${term(a, "x", true)}${term(b, "y", false)} = ${c}`;
  const coef = (a) => (a === 1 ? "" : a === -1 ? "-" : String(a));
  const sys = (e1, e2) => `$\\begin{cases} ${e1} \\\\ ${e2} \\end{cases}$`;
  const finalXY = (x, y) => ({ label: "", parts: ["(x,\\,y) = (", s(x), ",\\,", s(y), ")"], hint: "Copy the values you found for $x$ and $y$.", extra: extras(x, y) });

  /* ---------- small SVG graph ---------- */
  function Graph(xmin, xmax, ymin, ymax) {
    const W = 300, H = 300, pad = 24;
    const sx = (x) => pad + (x - xmin) / (xmax - xmin) * (W - 2 * pad), sy = (y) => H - pad - (y - ymin) / (ymax - ymin) * (H - 2 * pad);
    const box = [[xmin, ymin], [xmax, ymin], [xmax, ymax], [xmin, ymax]];
    function clip(poly, a, b, c) { // keep a x + b y <= c
      const out = [], f = (p) => a * p[0] + b * p[1] - c;
      for (let i = 0; i < poly.length; i++) {
        const p = poly[i], q = poly[(i + 1) % poly.length], fp = f(p), fq = f(q);
        if (fp <= 0) out.push(p);
        if ((fp < 0 && fq > 0) || (fp > 0 && fq < 0)) { const t = fp / (fp - fq); out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]); }
      }
      return out;
    }
    function segment(a, b, c) {
      const pts = [];
      if (b !== 0) [xmin, xmax].forEach((x) => { const y = (c - a * x) / b; if (y >= ymin - 1e-9 && y <= ymax + 1e-9) pts.push([x, y]); });
      if (a !== 0) [ymin, ymax].forEach((y) => { const x = (c - b * y) / a; if (x >= xmin - 1e-9 && x <= xmax + 1e-9) pts.push([x, y]); });
      if (pts.length < 2) return null;
      pts.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
      return [pts[0], pts[pts.length - 1]];
    }
    const g = {
      halfplanes(list) { let p = box; list.forEach(([a, b, c]) => (p = clip(p, a, b, c))); return p; },
      poly(p, fill) { return p.length > 2 ? `<path d="M${p.map((q) => sx(q[0]).toFixed(1) + " " + sy(q[1]).toFixed(1)).join("L")}Z" fill="${fill}"/>` : ""; },
      line(a, b, c, color, dash) { const sg = segment(a, b, c); return sg ? `<line x1="${sx(sg[0][0])}" y1="${sy(sg[0][1])}" x2="${sx(sg[1][0])}" y2="${sy(sg[1][1])}" stroke="${color}" stroke-width="3" ${dash ? 'stroke-dasharray="8 6"' : ""} stroke-linecap="round"/>` : ""; },
      dot(x, y, color, label, dx = 6, dy = -8) { if (sx(x) + dx > W - 70 && dx > 0) dx = -8; if (sx(x) + dx < 60 && dx < 0) dx = 8; return `<circle cx="${sx(x)}" cy="${sy(y)}" r="5.5" fill="${color}" stroke="#0b1220" stroke-width="2"/>` + (label ? `<text x="${sx(x) + dx}" y="${sy(y) + dy}" fill="${color}" font-size="13" font-weight="700" ${dx < 0 ? 'text-anchor="end"' : ""}>${label}</text>` : ""); },
      svg(inner) {
        const step = Math.max(1, Math.ceil(Math.max(xmax - xmin, ymax - ymin) / 10));
        let grid = "";
        for (let x = Math.ceil(xmin); x <= xmax; x++) grid += `<line x1="${sx(x)}" y1="${sy(ymin)}" x2="${sx(x)}" y2="${sy(ymax)}" stroke="rgba(148,163,184,${x % step ? .08 : .16})"/>`;
        for (let y = Math.ceil(ymin); y <= ymax; y++) grid += `<line x1="${sx(xmin)}" y1="${sy(y)}" x2="${sx(xmax)}" y2="${sy(y)}" stroke="rgba(148,163,184,${y % step ? .08 : .16})"/>`;
        let labels = "";
        for (let x = Math.ceil(xmin / step) * step; x <= xmax; x += step) if (x) labels += `<text x="${sx(x)}" y="${sy(0) + 14}" fill="#9aa7bd" font-size="10" text-anchor="middle">${x}</text>`;
        for (let y = Math.ceil(ymin / step) * step; y <= ymax; y += step) if (y) labels += `<text x="${sx(0) - 5}" y="${sy(y) + 3}" fill="#9aa7bd" font-size="10" text-anchor="end">${y}</text>`;
        const axes = `<line x1="${sx(xmin)}" y1="${sy(0)}" x2="${sx(xmax)}" y2="${sy(0)}" stroke="#cbd5e1" stroke-width="1.6"/><line x1="${sx(0)}" y1="${sy(ymin)}" x2="${sx(0)}" y2="${sy(ymax)}" stroke="#cbd5e1" stroke-width="1.6"/>
          <text x="${sx(xmax) - 4}" y="${sy(0) - 6}" fill="#cbd5e1" font-size="13" font-style="italic" text-anchor="end">x</text><text x="${sx(0) + 7}" y="${sy(ymax) + 12}" fill="#cbd5e1" font-size="13" font-style="italic">y</text>`;
        return `<svg viewBox="0 0 300 300" role="img" aria-label="Graph"><defs><clipPath id="gc"><rect x="${sx(xmin)}" y="${sy(ymax)}" width="${sx(xmax) - sx(xmin)}" height="${sy(ymin) - sy(ymax)}"/></clipPath></defs>${grid}${labels}${axes}<g clip-path="url(#gc)">${inner}</g></svg>`;
      },
    };
    return g;
  }
  function visual(render) {
    let el;
    return { mount(e) { el = e; }, update(k) { const r = render(k); el.innerHTML = `<div class="vcap">${r.cap}</div>${r.html}`; } };
  }
  const K = (src) => { try { return katex.renderToString(src, { throwOnError: false }); } catch (_) { return src; } };

  /* ---------- Elimination ---------- */
  PROBLEMS.elimination = () => {
    let x, y, a1, a2, b, op, k;
    do { x = ri(-6, 6); y = ri(-6, 6); a1 = nz(-5, 5); a2 = nz(-5, 5); b = ri(1, 5); op = pick(["add", "sub"]); k = op === "add" ? a1 + a2 : a1 - a2; }
    while (k === 0 || (Math.abs(k) === 1 && Math.random() < .6) || x === 0);
    const b2 = op === "add" ? -b : b, c1 = a1 * x + b * y, c2 = a2 * x + b2 * y, C = op === "add" ? c1 + c2 : c1 - c2, r3 = c1 - a1 * x;
    const sign = op === "add" ? "+" : "-";
    return {
      prompt: `Solve by elimination. ${sys(lin(a1, b, c1), lin(a2, b2, c2))}`,
      lines: [
        { label: op === "add" ? "Add the two equations" : "Subtract the second equation from the first",
          parts: [s(k), "x", "=", s(C)],
          hint: `The $y$ terms cancel. Left: $${P(a1)} ${sign} ${P(a2)}$. Right: $${P(c1)} ${sign} ${P(c2)}$.`, extra: extras(k, C).concat(String(op === "add" ? a1 - a2 : a1 + a2)) },
        { label: "Divide to find $x$", parts: ["x", "=", { frac: [[s(C)], [s(k)]] }, "=", s(x)], hint: `Divide both sides by $${k}$.`, extra: extras(x) },
        { label: "Substitute $x$ into the first equation", parts: [`${coef(a1)}(`, s(x), `)${term(b, "y", false)} = ${c1}`, "\\;\\Rightarrow\\;", `${term(b, "y", true)} =`, s(r3)],
          hint: `$${P(a1)} \\times ${P(x)} = ${a1 * x}$, then move it to the right side: $${c1} - ${P(a1 * x)}$.`, extra: extras(r3) },
        { label: "Solve for $y$", parts: ["y", "=", { frac: [[s(r3)], [s(b)]] }, "=", s(y)], hint: `Divide both sides by $${b}$.`, extra: extras(y) },
        finalXY(x, y),
      ],
    };
  };

  /* ---------- Substitution ---------- */
  PROBLEMS.substitution = () => {
    let x, y, a1, a2, b2, k;
    do { x = ri(-5, 5); y = ri(-6, 6); a1 = ri(1, 5); a2 = nz(-5, 5); b2 = nz(-4, 4); k = a2 - b2 * a1; } while (k === 0 || x === 0);
    const c1 = a1 * x + y, c2 = a2 * x + b2 * y, R = c2 - b2 * c1;
    const sub = `${term(a2, "x", true)} ${b2 < 0 ? "-" : "+"} ${Math.abs(b2) === 1 ? "" : Math.abs(b2)}(${c1} - ${coef(a1)}x) = ${c2}`;
    return {
      prompt: `Solve by substitution. ${sys(lin(a1, 1, c1), lin(a2, b2, c2))}`,
      lines: [
        { label: "Solve the first equation for $y$", parts: ["y", "=", s(c1), "-", s(a1), "x"], hint: `Move $${coef(a1)}x$ to the right side; it becomes $-${coef(a1)}x$.`, extra: extras(c1, a1) },
        { label: "Substitute into the second equation and simplify", parts: [sub, "\\;\\Rightarrow\\;", s(k), "x", "=", s(R)],
          hint: `Expand: $${P(b2)}(${c1}) = ${b2 * c1}$ and $${P(b2)}(-${a1}x) = ${-b2 * a1}x$. Collect the $x$ terms, then move $${b2 * c1}$ to the right side.`, extra: extras(k, R) },
        { label: "Divide to find $x$", parts: ["x", "=", { frac: [[s(R)], [s(k)]] }, "=", s(x)], hint: `Divide both sides by $${k}$.`, extra: extras(x) },
        { label: "Back-substitute to find $y$", parts: ["y", "=", `${c1} - ${coef(a1)}(`, s(x), ")", "=", s(y)], hint: `$${c1} - ${a1}(${x}) = ${c1} - ${P(a1 * x)}$.`, extra: extras(y) },
        finalXY(x, y),
      ],
    };
  };

  /* ---------- Cramer's Rule ---------- */
  PROBLEMS.cramer = () => {
    let x, y, a1, b1, a2, b2, D;
    do { x = ri(-5, 5); y = ri(-5, 5); a1 = nz(-5, 5); b1 = nz(-5, 5); a2 = nz(-5, 5); b2 = nz(-5, 5); D = a1 * b2 - b1 * a2; } while (D === 0 || Math.abs(D) > 30 || x === 0 || y === 0);
    const c1 = a1 * x + b1 * y, c2 = a2 * x + b2 * y, Dx = c1 * b2 - b1 * c2, Dy = a1 * c2 - c1 * a2;
    const vm = (p, q, r, t) => `\\begin{vmatrix} ${p} & ${q} \\\\ ${r} & ${t} \\end{vmatrix}`;
    const det = (name, p, q, r, t, val, note) => ({
      label: note, parts: [`${name} = ${vm(p, q, r, t)} =`, s(p * t), "-", "(", s(q * r), ")", "=", s(val)],
      hint: `Main diagonal $(${p})(${t}) = ${p * t}$, minus the other diagonal $(${q})(${r}) = ${q * r}$.`, extra: extras(val).concat(String(p * t + q * r)),
    });
    return {
      prompt: `Solve with Cramer's Rule. ${sys(lin(a1, b1, c1), lin(a2, b2, c2))}`,
      lines: [
        det("D", a1, b1, a2, b2, D, "Determinant of the coefficients"),
        det("D_x", c1, b1, c2, b2, Dx, "Replace the $x$ column with the constants"),
        det("D_y", a1, c1, a2, c2, Dy, "Replace the $y$ column with the constants"),
        { label: "Find $x$", parts: ["x", "=", "\\dfrac{D_x}{D}", "=", { frac: [[s(Dx)], [s(D)]] }, "=", s(x)], hint: "Divide $D_x$ by $D$.", extra: extras(x) },
        { label: "Find $y$", parts: ["y", "=", "\\dfrac{D_y}{D}", "=", { frac: [[s(Dy)], [s(D)]] }, "=", s(y)], hint: "Divide $D_y$ by $D$.", extra: extras(y) },
        finalXY(x, y),
      ],
    };
  };

  /* ---------- Gauss-Jordan ---------- */
  PROBLEMS.gaussjordan = () => {
    let x, y, a, p, r, m;
    do { x = ri(-5, 5); y = ri(-5, 5); a = pick([2, 3, 4]); p = nz(-3, 3); r = nz(-4, 4); m = pick([-3, -2, -1, 2, 3]); } while ((x === 0 && y === 0) || Math.abs(x + p * y) > 12);
    const q = x + p * y, sv = m + r * p, t = r * x + sv * y;
    const M = [
      [[a, a * p, a * q], [r, sv, t]],
      [[1, p, q], [r, sv, t]],
      [[1, p, q], [0, m, m * y]],
      [[1, p, q], [0, 1, y]],
      [[1, 0, x], [0, 1, y]],
    ];
    const changed = [null, 0, 1, 1, 0];
    const ops = ["Starting matrix", `\\tfrac{1}{${a}}R_1 \\to R_1`, `R_2 - (${r})R_1 \\to R_2`, `\\tfrac{1}{${m}}R_2 \\to R_2`, `R_1 - (${p})R_2 \\to R_1`];
    const mat = (k) => {
      const rows = M[Math.min(k, 4)].map((row, i) => row.map((v) => (changed[Math.min(k, 4)] === i ? `\\textcolor{#f5b83d}{${v}}` : v)).join(" & "));
      return `\\left[\\begin{array}{rr|r} ${rows.join(" \\\\ ")} \\end{array}\\right]`;
    };
        return {
      prompt: `Solve with Gauss-Jordan reduction. ${sys(lin(a, a * p, a * q), lin(r, sv, t))}`,
      visual: visual((k) => ({ cap: k === 0 ? "Augmented matrix" : `After: ${K(ops[Math.min(k, 4)])}`, html: `<div class="mat">${K("\\Large " + mat(k))}</div>` })),
      lines: [
        { label: "Make the first leading entry 1", parts: [{ frac: [["1"], [s(a)]] }, "R_1 \\to R_1:", "\\;\\;[\\,1\\;\\;", s(p), "\\;\\big|\\;", s(q), "\\,]"],
          hint: `Divide every entry of row 1 by $${a}$.`, extra: extras(a, p, q) },
        { label: "Clear the entry below the 1", parts: ["R_2 - (", s(r), ")R_1 \\to R_2:", "\\;\\;[\\,0\\;\\;", s(m), "\\;\\big|\\;", s(m * y), "\\,]"],
          hint: `Multiply row 1 by $${r}$ and subtract it from row 2: new entry = old entry $- (${r}) \\times$ the entry above it.`, extra: extras(r, m, m * y) },
        { label: "Make the second leading entry 1", parts: [{ frac: [["1"], [s(m)]] }, "R_2 \\to R_2:", "\\;\\;[\\,0\\;\\;1\\;\\big|\\;", s(y), "\\,]"], hint: `Divide row 2 by $${m}$.`, extra: extras(m, y) },
        { label: "Clear the entry above the 1", parts: ["R_1 - (", s(p), ")R_2 \\to R_1:", "\\;\\;[\\,1\\;\\;0\\;\\big|\\;", s(x), "\\,]"], hint: `$${q} - (${p})(${y}) = ${x}$.`, extra: extras(p, x) },
        finalXY(x, y),
      ],
    };
  };

  /* ---------- Types of systems ---------- */
  PROBLEMS.types = () => {
    const type = pick(["one", "none", "many"]);
    let a1, b1, c1, a2, b2, c2, ok;
    do {
      a1 = nz(-5, 5); b1 = nz(-5, 5); c1 = nz(-9, 9);
      if (type === "one") { a2 = nz(-5, 5); b2 = nz(-5, 5); c2 = nz(-9, 9); ok = a1 * b2 !== a2 * b1; }
      else { const k = pick([2, 3, -2, -1, 4]); a2 = k * a1; b2 = k * b1; c2 = type === "many" ? k * c1 : k * c1 + nz(-4, 4); ok = c2 !== 0 && Math.abs(c2) <= 30; }
    } while (!ok);
    const eqAB = a1 * b2 === a2 * b1 ? "=" : "\\ne", eqBC = b1 * c2 === b2 * c1 ? "=" : "\\ne";
    const cls = { one: "consistent and independent", none: "inconsistent", many: "consistent and dependent" };
    const num = { one: "1", none: "0", many: "\\infty" };
    const g = Graph(-10, 10, -10, 10);
    return {
      prompt: `Classify the system and give its number of solutions. ${sys(lin(a1, b1, c1), lin(a2, b2, c2))}`,
      visual: visual((k) => ({
        cap: k < 3 ? "The graph appears when you classify the system" : type === "one" ? "Lines cross at one point" : type === "none" ? "Parallel lines never meet" : "The two lines are the same line",
        html: g.svg(k < 3 ? "" : g.line(a1, b1, c1, "#6ea8ff") + g.line(a2, b2, c2, "#f5b83d", type === "many")),
      })),
      lines: [
        { label: "Write the ratios", parts: ["\\dfrac{a_1}{a_2} =", { frac: [[s(a1)], [s(a2)]] }, "\\quad\\dfrac{b_1}{b_2} =", { frac: [[s(b1)], [s(b2)]] }, "\\quad\\dfrac{c_1}{c_2} =", { frac: [[s(c1)], [s(c2)]] }],
          hint: "Top numbers come from the first equation, bottom numbers from the second.", extra: extras(a1, b2) },
        { label: "Compare the ratios", parts: ["\\dfrac{a_1}{a_2}", s(eqAB), "\\dfrac{b_1}{b_2}", "\\qquad\\dfrac{b_1}{b_2}", s(eqBC), "\\dfrac{c_1}{c_2}"],
          hint: `Cross-multiply. $a_1 b_2 = ${a1 * b2}$ and $a_2 b_1 = ${a2 * b1}$; $b_1 c_2 = ${b1 * c2}$ and $b_2 c_1 = ${b2 * c1}$.`, extra: ["=", "\\ne"] },
        { label: "", parts: [{ text: "The system is" }, s("@" + cls[type]), { text: "Number of solutions:" }, s(num[type])],
          hint: "Different $a$ and $b$ ratios: one solution. All three equal: infinitely many. First two equal but not the third: no solution.",
          extra: Object.values(cls).map((c) => "@" + c).concat(Object.values(num)) },
      ],
    };
  };

  /* ---------- Linear inequalities ---------- */
  PROBLEMS.inequalities = () => {
    let X, Y, a, b, c;
    do { X = nz(-8, 8); Y = nz(-8, 8); } while (Math.abs(X) < 2 || Math.abs(Y) < 2 || (X < 0 && Y < 0));
    const g0 = gcd(X, Y); a = Y / g0; b = X / g0; c = (X * Y) / g0;
    if (a < 0) { a = -a; b = -b; c = -c; }
    const op = pick(["\\le", "<", "\\ge", ">"]), solid = op === "\\le" || op === "\\ge";
    const truth = { "\\le": 0 <= c, "<": 0 < c, "\\ge": 0 >= c, ">": 0 > c }[op];
    const g = Graph(-9, 9, -9, 9);
    const keep = op === "\\le" || op === "<" ? [a, b, c] : [-a, -b, -c];
    return {
      prompt: `Graph the inequality $${term(a, "x", true)}${term(b, "y", false)} ${op} ${c}$.`,
      visual: visual((k) => {
        let h = "";
        if (k >= 5) h += g.poly(g.halfplanes([keep]), "rgba(70,207,134,.28)");
        if (k >= 2) h += g.line(a, b, c, k >= 3 ? "#f5b83d" : "rgba(245,184,61,.45)", k >= 3 ? !solid : true);
        if (k >= 1) h += g.dot(X, 0, "#6ea8ff", `(${X}, 0)`, X < 0 ? -6 : 6, 18);
        if (k >= 2) h += g.dot(0, Y, "#6ea8ff", `(0, ${Y})`, 8, Y < 0 ? 16 : -8);
        if (k >= 4) h += g.dot(0, 0, truth ? "#46cf86" : "#ff6b6b", truth ? "true" : "false", -8, -8);
        return { cap: ["Intercepts and boundary line build up here", "x-intercept plotted", "Line through both intercepts", solid ? "Solid line: points on it count" : "Broken line: points on it do not count", "Test point (0, 0)", "Solution region shaded"][Math.min(k, 5)], html: g.svg(h) };
      }),
      lines: [
        { label: "$x$-intercept (let $y = 0$)", parts: [`${term(a, "x", true)} = ${c}`, "\\;\\Rightarrow\\;", "x =", s(X)], hint: `Divide $${c}$ by $${a}$.`, extra: extras(X) },
        { label: "$y$-intercept (let $x = 0$)", parts: [`${term(b, "y", true)} = ${c}`, "\\;\\Rightarrow\\;", "y =", s(Y)], hint: `Divide $${c}$ by $${b}$.`, extra: extras(Y) },
        { label: "Boundary line", parts: [{ text: "Draw a" }, s(solid ? "@solid" : "@broken"), { text: "line" }], hint: "$\\le$ or $\\ge$: solid line. $<$ or $>$: broken line.", extra: ["@solid", "@broken"] },
        { label: "Test the point $(0, 0)$", parts: [`${a}(0) + ${P(b)}(0) =`, s(0), "\\;\\Rightarrow\\;", `0 ${op} ${c}`, { text: "is" }, s(truth ? "@true" : "@false")],
          hint: `Is $0 ${op} ${c}$ a true statement?`, extra: ["@true", "@false", "1", String(c)] },
        { label: "", parts: [{ text: "Shade the side that" }, s(truth ? "@contains" : "@does not contain"), "(0,\\,0)"],
          hint: "True test point: shade its side. False: shade the other side.", extra: ["@contains", "@does not contain"] },
      ],
    };
  };

  /* ---------- Graphical method ---------- */
  PROBLEMS.graphical = () => {
    let u, v, a1, b1, a2, b2, c1, c2, X1, Y1, X2, Y2, p, q, corners, zs, zmax, ok;
    do {
      u = ri(1, 6); v = ri(1, 6); a1 = ri(1, 5); b1 = ri(1, 5); a2 = ri(1, 5); b2 = ri(1, 5);
      c1 = a1 * u + b1 * v; c2 = a2 * u + b2 * v; X1 = c1 / a1; Y1 = c1 / b1; X2 = c2 / a2; Y2 = c2 / b2;
      p = ri(1, 8); q = ri(1, 8);
      ok = [X1, Y1, X2, Y2].every(Number.isInteger) && ((X1 < X2 && Y1 > Y2) || (X1 > X2 && Y1 < Y2)) && Math.max(X1, Y1, X2, Y2) <= 15;
      if (ok) {
        corners = [[0, 0], [Math.min(X1, X2), 0], [u, v], [0, Math.min(Y1, Y2)]];
        zs = corners.map(([x, y]) => p * x + q * y); zmax = Math.max(...zs);
        ok = zs.filter((z) => z === zmax).length === 1;
      }
    } while (!ok);
    const best = corners[zs.indexOf(zmax)], [, cA, cB, cC] = corners, R = Math.max(X1, Y1, X2, Y2) + 1;
    const g = Graph(-0.6, R, -0.6, R);
    return {
      prompt: `Maximize $z = ${term(p, "x", true)}${term(q, "y", false)}$ subject to $${lin(a1, b1, c1).replace("=", "\\le")}$, $${lin(a2, b2, c2).replace("=", "\\le")}$, $x \\ge 0,\\ y \\ge 0$.`,
      visual: visual((k) => {
        let h = "";
        if (k >= 3) h += g.poly(g.halfplanes([[a1, b1, c1], [a2, b2, c2], [-1, 0, 0], [0, -1, 0]]), "rgba(70,207,134,.25)");
        if (k >= 1) h += g.line(a1, b1, c1, "#6ea8ff");
        if (k >= 2) h += g.line(a2, b2, c2, "#b48cff");
        if (k >= 3) corners.forEach(([x, y]) => (h += g.dot(x, y, k >= 5 && x === best[0] && y === best[1] ? "#f5b83d" : "#eef2f8", k >= 4 ? `z=${p * x + q * y}` : "", 7, -8)));
        return { cap: ["Lines appear as you find their intercepts", "Line 1", "Line 2", "Feasible region and its corners", "z at each corner", `Maximum at (${best[0]}, ${best[1]})`][Math.min(k, 5)], html: g.svg(h) };
      }),
      lines: [
        { label: `Intercepts of $${lin(a1, b1, c1)}$`, parts: ["(", s(X1), ",\\,0)", "\\quad\\text{and}\\quad", "(0,\\,", s(Y1), ")"], hint: `Let $y = 0$ to get $x = ${c1} \\div ${a1}$; let $x = 0$ to get $y = ${c1} \\div ${b1}$.`, extra: extras(X1, Y1) },
        { label: `Intercepts of $${lin(a2, b2, c2)}$`, parts: ["(", s(X2), ",\\,0)", "\\quad\\text{and}\\quad", "(0,\\,", s(Y2), ")"], hint: `Let $y = 0$ to get $x = ${c2} \\div ${a2}$; let $x = 0$ to get $y = ${c2} \\div ${b2}$.`, extra: extras(X2, Y2) },
        { label: "Where the two lines meet", parts: ["(x,\\,y) = (", s(u), ",\\,", s(v), ")"], hint: "Solve the two equations together, for example by elimination.", extra: extras(u, v) },
        { label: "Evaluate $z$ at each corner", parts: ["z(0,0) = 0", `\\quad z(${cA[0]},${cA[1]}) =`, s(zs[1]), `\\quad z(${cB[0]},${cB[1]}) =`, s(zs[2]), `\\quad z(${cC[0]},${cC[1]}) =`, s(zs[3])],
          hint: `Substitute each corner into $z = ${term(p, "x", true)}${term(q, "y", false)}$.`, extra: extras(zs[2], zs[3]) },
        { label: "", parts: ["z_{\\max} =", s(zmax), "\\;\\text{at}\\;(", s(best[0]), ",\\,", s(best[1]), ")"], hint: "Pick the largest value of $z$ from the previous step.", extra: zs.filter((z) => z !== zmax).map(String).concat(extras(best[0])) },
      ],
    };
  };

  /* ---------- Simplex (one pivot) ---------- */
  PROBLEMS.simplex = () => {
    let c1, c2, r, o, A, br, bo, kk;
    do {
      c1 = ri(3, 9); c2 = ri(1, c1 - 1); r = pick([0, 1]); o = 1 - r;
      A = [[0, 0], [0, 0]]; A[r][0] = 1; A[r][1] = ri(1, 4); A[o][0] = ri(1, 4); A[o][1] = ri(1, 4);
      br = ri(2, 8); kk = ri(br + 1, br + 6); bo = A[o][0] * kk;
    } while (A[r][1] * c1 < c2 || bo > 40);
    const b = [0, 0]; b[r] = br; b[o] = bo;
    const yo = A[o][1] - A[o][0] * A[r][1], bnew = bo - A[o][0] * br, yb = -c2 + c1 * A[r][1], zv = c1 * br;
    const sr = `s_${r + 1}`, so = `s_${o + 1}`;
    // tableau states: rows [x, y, s1, s2, b]
    const row0 = (i) => [A[i][0], A[i][1], i === 0 ? 1 : 0, i === 1 ? 1 : 0, b[i]];
    const rowO = [0, yo, 0, 0, bnew]; rowO[2 + r] = -A[o][0]; rowO[2 + o] = 1;
    const bot0 = [-c1, -c2, 0, 0, 0], bot1 = [0, yb, 0, 0, zv]; bot1[2 + r] = c1;
    const table = (k) => {
      const rows = [row0(0), row0(1)];
      if (k >= 4) rows[o] = rowO;
      const bot = k >= 5 ? bot1 : k >= 1 ? bot0 : ["?", "?", "?", "?", "?"];
      const cell = (v, j, i) => {
        const cls = [];
        if (j === 4) cls.push("b");
        if (k >= 2 && k < 4 && j === 0) cls.push("pc");
        if (k >= 3 && k < 4 && i === r && j === 0) cls.push("pv");
        if ((k >= 4 && i === o) || (k >= 5 && i === 2)) cls.push("new");
        return `<td class="${cls.join(" ")}">${v}</td>`;
      };
      const tr = (vals, i, label) => `<tr class="${i === 2 ? "bottom" : ""}${k >= 3 && k < 4 && i === r ? " pr" : ""}"><th>${label}</th>${vals.map((v, j) => cell(v, j, i)).join("")}</tr>`;
      return `<table class="tab"><tr><th></th><th>${K("x")}</th><th>${K("y")}</th><th>${K("s_1")}</th><th>${K("s_2")}</th><th class="b" style="border-left:2px solid #9aa7bd">${K("b")}</th></tr>${tr(rows[0], 0, K(k >= 4 && r === 0 ? "x" : "s_1"))}${tr(rows[1], 1, K(k >= 4 && r === 1 ? "x" : "s_2"))}${tr(bot, 2, K("z"))}</table>`;
    };
    const entries = (vals, slotIx) => {
      const out = ["[\\,"];
      vals.forEach((v, j) => { out.push(slotIx.includes(j) ? s(v) : String(v)); out.push(j === 3 ? "\\;\\big|\\;" : j < 4 ? "\\;\\;" : ""); });
      out.push("\\,]");
      return out.filter((p) => p !== "");
    };
    const le = (i) => `${term(A[i][0], "x", true)}${term(A[i][1], "y", false)} \\le ${b[i]}`;
    return {
      prompt: `Use the simplex method. Maximize $z = ${term(c1, "x", true)}${term(c2, "y", false)}$ subject to $${le(0)}$, $${le(1)}$, $x \\ge 0,\\ y \\ge 0$.`,
      visual: visual((k) => ({ cap: ["Initial tableau (bottom row to fill)", "Initial tableau", "Pivot column: x", `Pivot row: ${sr} leaves, pivot = 1`, `Row ${o + 1} cleared`, "Bottom row has no negatives: optimal", "Optimal tableau"][Math.min(k, 6)], html: table(k) })),
      lines: [
        { label: "Bottom row: write $z$ as $-c_1x - c_2y + z = 0$", parts: ["z\\text{ row:}\\;", ...entries(bot0, [0, 1])], hint: `Move the terms of $z = ${c1}x + ${c2}y$ to the left; their signs change.`, extra: [String(c1), String(c2), String(-c1 - 1)] },
        { label: "Pivot column", parts: [{ text: "Entering variable (most negative entry in the bottom row):" }, s("x")], hint: `$-${c1}$ is more negative than $-${c2}$.`, extra: ["y", "s_1", "s_2"] },
        { label: "Ratio test", parts: [`\\dfrac{${b[0]}}{${A[0][0]}} =`, s(b[0] / A[0][0]), `\\quad\\dfrac{${b[1]}}{${A[1][0]}} =`, s(b[1] / A[1][0]), "\\;\\Rightarrow\\;", { text: "departing:" }, s(sr)],
          hint: "Divide each right-hand value by its entry in the $x$ column. The smallest ratio picks the departing variable.", extra: extras(b[0] / A[0][0]).concat([so, "x"]) },
        { label: `Clear $x$ from row ${o + 1}: $R_${o + 1} - ${coef(A[o][0])}R_${r + 1}$`, parts: entries(rowO, [1, 2 + r, 4]), hint: `New entry = old entry $- ${A[o][0]} \\times$ the entry of row ${r + 1} in the same column.`, extra: extras(yo, bnew) },
        { label: `New bottom row: $R_3 + ${c1}R_${r + 1}$`, parts: entries(bot1, [1, 2 + r, 4]), hint: `New entry = old entry $+ ${c1} \\times$ the entry of row ${r + 1} in the same column.`, extra: extras(yb, zv) },
        { label: "", parts: ["z_{\\max} =", s(zv), "\\;\\text{at}\\;x =", s(br), ",\\;y =", s(0)], hint: "Read $z$ from the bottom-right corner. $x$ is basic in its row; $y$ is non-basic, so it is 0.", extra: extras(zv, br) },
      ],
    };
  };
})();
