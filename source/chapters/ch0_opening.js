/* Prologue: title, the chicken-and-egg puzzle, table of contents. */
(function () {
const { PAL, U, Theater } = window; const { clamp, lerp, ease, rng, noise1 } = U;

Theater.chapter({
  id: 'open', title: 'Prologue', color: PAL.sand, card: false,
  scenes: [{
    id: 'open-title', title: 'The Kinship Theater', header: false, lead: 2.2, tail: 2.0,
    beats: [
      { t: 'A student working through methods for SNP data kept getting stuck on one question. To estimate relatedness, you seem to need to know how inbred the population is. To estimate inbreeding, you seem to need to know how related its members are.',
        s: 'A student working through methods for snip data kept getting stuck on one question. To estimate relatedness, you seem to need to know how inbred the population is. To estimate inbreeding, you seem to need to know how related its members are.' },
      { t: 'It looks like a chicken-and-egg problem. In this program we take it apart, and show that most of the circle is an illusion.' },
      { t: 'Relatedness and inbreeding are one quantity, seen from two angles. The genuine dependency lies elsewhere, in the reference population: its allele frequencies and its structure. And there are good tools for handling it.', pause: 0.6 },
      { t: 'We build from first principles to the methods you will actually run, and when each one works. Watch the lexicon on the right of the screen. Every numbered term is collected in the companion study guide.', pause: 1.5 },
    ],
    terms: [{ beat: 3.5, demo: true, term: 'Lexicon', def: 'Key terms appear here as they are introduced. Every one is collected, with equations and citations, in the companion study guide.' }],
    init() {
      // A luminous multi-generation pedigree used as the title backdrop.
      const r = rng(7); const gens = []; const W = 1500, x0 = 210;
      const counts = [4, 6, 8, 10, 12];
      counts.forEach((n, gi) => { const row = []; for (let k = 0; k < n; k++) row.push({ x: x0 + (k + 0.5) * W / n + (r() - 0.5) * 30, y: 610 + gi * 72, sex: r() < 0.5 ? 'F' : 'M', c: Math.floor(r() * 6) }); gens.push(row); });
      const edges = [];
      for (let gi = 1; gi < gens.length; gi++) for (const ch of gens[gi]) {
        const prev = gens[gi - 1]; const sorted = prev.map((p, k) => [Math.abs(p.x - ch.x) + r() * 120, k]).sort((a, b) => a[0] - b[0]);
        edges.push({ a: [prev[sorted[0][1]].x, prev[sorted[0][1]].y], b: [ch.x, ch.y], gi, col: prev[sorted[0][1]].c });
        edges.push({ a: [prev[sorted[1][1]].x, prev[sorted[1][1]].y], b: [ch.x, ch.y], gi, col: prev[sorted[1][1]].c });
        ch.c = r() < 0.5 ? prev[sorted[0][1]].c : prev[sorted[1][1]].c;
      }
      return { gens, edges };
    },
    draw(g, t, S, D) {
      const cx = 960; const cols = [PAL.heather, PAL.ochre, PAL.lagoon, PAL.coral, PAL.moss, PAL.rose];
      const toc = S.p(3, 1.2); const lift = S.p(1, 1.4);
      // --- backdrop pedigree: alleles flowing down the generations -------------------------
      const pa = ease.out((t - 0.6) / 3.0) * (1 - 0.82 * S.p(1, 1.2)) * (1 - toc);
      if (pa > 0) {
        for (const e of D.edges) {
          const p = clamp((t - 0.8 - e.gi * 0.45) / 1.6); const my = (e.a[1] + e.b[1]) / 2;
          g.poly([e.a, [e.a[0], my], [e.b[0], my], e.b], { color: cols[e.col], w: 1.4, alpha: 0.28 * pa, progress: ease.out(p) });
          const f = (t * 0.22 + e.a[0] * 0.0013 + e.gi * 0.17) % 1; const q = f < 0.5 ? [e.a[0], lerp(e.a[1], my, f * 2)] : [lerp(e.a[0], e.b[0], clamp((f - 0.5) * 4)), f < 0.75 ? my : lerp(my, e.b[1], (f - 0.75) * 4)];
          if (p >= 1) g.dot(q[0], q[1], 2.6, cols[e.col], 0.6 * pa, 3);
        }
        D.gens.forEach((row, gi) => row.forEach((n) => { const a = ease.out((t - 0.6 - gi * 0.45) / 1.2) * pa; KIN.person(g, n.x, n.y, { sex: n.sex, r: 11, color: U.rgba(cols[n.c], 0.8), alpha: a * 0.85, w: 1.6 }); }));
      }
      // --- title ---------------------------------------------------------------------------
      const tp = ease.out((t - 0.8) / 1.8);
      const ty = lerp(330, 300, lift) - 40 * toc; const tsize = lerp(140, 116, lift) * (1 - 0.3 * toc);
      g.text('The Kinship Theater', cx, ty + (1 - tp) * 18, { size: tsize, role: 'display', color: PAL.ink, align: 'center', alpha: tp });
      g.text('RELATEDNESS  ·  INBREEDING  ·  IDENTITY BY DESCENT', cx, ty + 66 * (1 - 0.3 * toc), { size: 19, weight: 600, ls: 3.6, color: PAL.sand, align: 'center', alpha: ease.out((t - 1.6) / 1.6) * (1 - toc) });
      // --- the puzzle: the student's two sentences ------------------------------------------
      const qa = S.p(0, 1.2, 4.2) * (1 - S.p(1, 0.8));
      g.text('To estimate relatedness, you need inbreeding.', cx, 476, { size: 44, role: 'display', italic: true, color: PAL.ink, align: 'center', alpha: qa });
      g.text('To estimate inbreeding, you need relatedness.', cx, 540, { size: 44, role: 'display', italic: true, color: PAL.ink, align: 'center', alpha: S.p(0, 1.2, 9.5) * (1 - S.p(1, 0.8)) });
      // --- the loop: relatedness ⇄ inbreeding, then collapsing into one IBD node --------------
      const la = S.p(1, 1.0) * (1 - toc);
      if (la > 0) {
        const merge = S.io(2, 1.6, 0.2); const L = [cx - lerp(260, 0, merge), 640], R = [cx + lerp(260, 0, merge), 640];
        const spin = t * 0.9;
        // circling arrows (fade as the nodes merge)
        const aa = la * (1 - merge);
        for (const side of [1, -1]) {
          const pts = []; for (let k = 0; k <= 40; k++) { const th = Math.PI * (k / 40) * 0.82 + 0.28 * Math.PI; pts.push([cx - side * 260 * Math.cos(th), 640 - side * 150 * Math.sin(th)]); }
          g.poly(pts, { color: PAL.sand, w: 2.5, alpha: 0.7 * aa });
          const e = pts[pts.length - 1], e2 = pts[pts.length - 3]; g.arrow(e2[0], e2[1], e[0], e[1], { color: PAL.sand, w: 2.5, head: 14, alpha: 0.7 * aa });
          const f = (spin / (2 * Math.PI) + (side > 0 ? 0 : 0.5)) % 1; const th = Math.PI * f * 0.82 + 0.28 * Math.PI; g.dot(cx - side * 260 * Math.cos(th), 640 - side * 150 * Math.sin(th), 5, PAL.ochre, aa, 3);
        }
        g.text('relatedness', L[0], L[1] + 14, { size: 46, role: 'display', color: PAL.lagoon, align: 'center', alpha: la * (1 - merge) });
        g.text('inbreeding', R[0], R[1] + 14, { size: 46, role: 'display', color: PAL.coral, align: 'center', alpha: la * (1 - merge) });
        g.text('?', cx, 568, { size: 60, role: 'display', italic: true, color: PAL.sand, align: 'center', alpha: aa * (0.6 + 0.4 * Math.sin(t * 2)) });
        // merged node
        const ma = la * merge;
        g.glow(cx, 640, 150, PAL.heather, 0.35 * ma);
        g.text('identity by descent', cx, 654, { size: 54, role: 'display', italic: true, color: PAL.ink, align: 'center', alpha: ma });
        g.text('between two individuals  ·  within one', cx, 706, { size: 24, color: PAL.ink2, align: 'center', alpha: ma * S.p(2, 1, 2.0) });
        // reference population arrow from below
        const ra = la * S.p(2, 1.0, 6.0);
        g.arrow(cx, 860, cx, 735, { color: PAL.ochre, w: 3, head: 16, alpha: ra, progress: ra });
        g.text('the reference: allele frequencies & structure', cx, 892, { size: 28, role: 'display', italic: true, color: PAL.ochre, align: 'center', alpha: ra });
      }
      // --- table of contents -----------------------------------------------------------------
      if (toc > 0) {
        const chs = Theater.chapters.filter((c) => c.roman);
        g.text('CONTENTS', 470, 432, { size: 17, weight: 600, ls: 4, color: PAL.sand, alpha: toc, align: 'right' });
        chs.forEach((c, k) => {
          const x = 470, y = 500 + k * 78; const p = S.p(3, 0.9, 0.4 + k * 0.4);
          g.text(c.roman, x + 40, y, { size: 44, role: 'display', italic: true, color: c.color, align: 'right', alpha: p });
          g.text(c.title, x + 70, y, { size: 40, role: 'display', color: PAL.ink, alpha: p });
          g.line(x + 70, y + 20, x + 70 + 560 * p, y + 20, { color: PAL.rule, w: 1, alpha: 0.6 * p });
        });
      }
    },
  }],
});
})();
