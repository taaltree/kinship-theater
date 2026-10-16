/* Chapter I — Identity by descent. */
(function () {
const { PAL, U, Theater } = window; const { clamp, lerp, ease, rng, gauss } = U;
const KIN = window.KIN;
const COL = PAL.heather;
const FC = KIN.FOUNDER;            // heather, ochre, lagoon, coral, moss, rose, sand, mint
const CREAM = '#EFE6CF';           // an allele copy from outside the pedigree / descent unknown
const GREY = '#7E8B88';            // "state only": colour (descent) hidden

// ---------------------------------------------------------------- helpers
const vis = (S, k0, k1, d = 0.8) => S.p(k0, d) * (k1 === undefined ? 1 : 1 - S.p(k1, 0.6));
const label = (g, s, x, y, a = 1, col = PAL.ink3, align = 'left') => KIN.label(g, s, x, y, a, col, align);

// Polylines with arc-length lookup (alleles travel along pedigree connectors).
function mkPath(pts) {
  const cum = [0];
  for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
  return { pts, cum, L: cum[cum.length - 1] };
}
function along(P, f) {
  const d = clamp(f) * P.L; let k = 1;
  while (k < P.cum.length - 1 && P.cum[k] < d) k++;
  const s = P.cum[k] - P.cum[k - 1] || 1, u = clamp((d - P.cum[k - 1]) / s);
  return [lerp(P.pts[k - 1][0], P.pts[k][0], u), lerp(P.pts[k - 1][1], P.pts[k][1], u)];
}
// Route of one allele copy from a parent's bead to a child's bead, following KIN.family's connectors.
function tPath(par, mate, kids, child, ps, cs, r, off) {
  const my = (par[1] + mate[1]) / 2, mx = (par[0] + mate[0]) / 2;
  const sy = (my + Math.min(...kids.map((k) => k[1]))) / 2 + r * 0.2;
  return mkPath([[par[0] + (ps ? off : -off), par[1]], [mx, my], [mx, sy], [child[0], sy], [child[0], child[1] - r], [child[0] + (cs ? off : -off), child[1]]]);
}
// Same route without bead offsets (centre to centre), for highlighting descent paths.
function cPath(par, mate, kids, child, r) {
  const my = (par[1] + mate[1]) / 2, mx = (par[0] + mate[0]) / 2;
  const sy = (my + Math.min(...kids.map((k) => k[1]))) / 2 + r * 0.2;
  return [[par[0], par[1]], [mx, my], [mx, sy], [child[0], sy], [child[0], child[1] - r]];
}
// A luminous allele bead with an optional state letter.
function bead(g, x, y, col, o = {}) {
  const s = o.size || 14, a = o.alpha ?? 1; if (a <= 0) return;
  g.dot(x, y, s, col, a, o.halo ?? 2.1);
  const la = (o.la ?? 1) * a;
  if (o.letter && la > 0) g.text(o.letter, x, y + s * 0.43, { size: Math.round(s * 1.22), weight: 700, color: PAL.bg, align: 'center', alpha: la });
}
const ring = (g, x, y, r, col, a, w = 2.5) => { if (a > 0) g.circle(x, y, r, { stroke: col, w, alpha: a }); };
const slotRing = (g, x, y, s, a) => { if (a > 0) g.circle(x, y, s, { stroke: PAL.ink3, w: 1.4, alpha: a * 0.7, dash: [3, 4] }); };
// travelling bead with a short fading trail
function traveller(g, P, f, col, size, a) {
  if (f <= 0 || f >= 1 || a <= 0) return;
  for (let k = 4; k >= 1; k--) { const q = along(P, f - k * 0.018); g.circle(q[0], q[1], size * (1 - k * 0.15), { fill: col, alpha: a * 0.28 * (1 - k / 5) }); }
  const p = along(P, f); g.dot(p[0], p[1], size, col, a, 2.6);
}
// Several math pieces in different colours on one baseline.
function mathSeq(g, parts, x, y, o = {}) {
  const size = o.size || 44, a = o.alpha ?? 1;
  const ws = parts.map(([e]) => g.mathW(e, size)); const W = ws.reduce((s, v) => s + v, 0);
  let X = o.align === 'center' ? x - W / 2 : o.align === 'right' ? x - W : x;
  if (a > 0) parts.forEach(([e, c], k) => { g.math(e, X, y, { size, color: c || PAL.ink, alpha: a }); X += ws[k]; });
  return W;
}
// Kinship value as a TeX fraction (denominators up to 32).
function frac(v) {
  if (Math.abs(v) < 1e-9) return '0';
  let n = Math.round(v * 32), d = 32; const gcd = (a, b) => (b ? gcd(b, a % b) : a); const q = gcd(n, d); n /= q; d /= q;
  return d === 1 ? String(n) : `\\frac{${n}}{${d}}`;
}
// Wright's coefficient of relationship, with a hand-drawn radical. y = baseline of "r_ij =".
function wright(g, x, y, size, o = {}) {
  const a = o.alpha ?? 1, hn = o.hn || 0, hd = o.hd || 0;
  const s2 = size * 0.84, pre = 'r_{ij} =';
  const wPre = g.mathW(pre, size) + size * 0.3;
  const wNum = g.mathW('2φ_{ij}', s2), wIn = g.mathW('(1 + F_i)(1 + F_j)', s2);
  const radW = s2 * 0.58 + wIn + s2 * 0.08;
  const W = Math.max(wNum, radW) + size * 0.24;
  if (a <= 0) return wPre + W;
  const fx = x + wPre, ax = y - size * 0.27, lw = Math.max(1.8, size * 0.045);
  g.withAlpha(a, () => {
    g.math(pre, x, y, { size });
    g.rect(fx, ax - lw / 2, W, lw, { fill: PAL.ink });
    const cn = U.mix(PAL.ink, PAL.lagoon, hn), cd = U.mix(PAL.ink, PAL.coral, hd);
    if (hn > 0) g.glow(fx + W / 2, ax - size * 0.5, size * 1.5, PAL.lagoon, 0.22 * hn);
    if (hd > 0) g.glow(fx + W / 2, ax + size * 0.55, size * 2.2, PAL.coral, 0.16 * hd);
    g.math('2φ_{ij}', fx + W / 2, ax - size * 0.12 - s2 * 0.2, { size: s2, color: cn, align: 'center' });
    const b = ax + size * 0.14 + s2 * 0.78; const rx = fx + (W - radW) / 2; const top = b - s2 * 0.8;
    g.poly([[rx, b - s2 * 0.26], [rx + s2 * 0.12, b - s2 * 0.34], [rx + s2 * 0.28, b + s2 * 0.12], [rx + s2 * 0.5, top], [rx + radW, top]], { color: cd, w: lw });
    g.math('(1 + F_i)(1 + F_j)', rx + s2 * 0.58, b, { size: s2, color: cd });
  });
  return wPre + W;
}

/* Small pedigrees used on the kinship cards and morphed into the path-counting figure.
   Local coordinates at full size (glyph radius 34). anc: common ancestors (route colours FC[0], FC[1]). */
const PR = 34;
function makePed(persons, fams, i, j, anc) {
  const P = {}; for (const [id, x, y, sex] of persons) P[id] = { id, x, y, sex };
  const famOf = {}; for (const f of fams) for (const k of f[2]) famOf[k] = f;
  const routes = [];
  // route from an ancestor down to a descendant (chain of parent→child connector paths)
  const lineage = (a, d) => {
    const chain = []; let cur = d;
    while (cur !== a) { const f = famOf[cur]; if (!f) return null; const par = (f[0] === a || isAnc(f[0], a)) ? f[0] : f[1]; chain.unshift([par, cur, f]); cur = par; }
    const pts = []; for (const [par, ch, f] of chain) { const mate = f[0] === par ? f[1] : f[0]; const seg = cPath([P[par].x, P[par].y], [P[mate].x, P[mate].y], f[2].map((k) => [P[k].x, P[k].y]), [P[ch].x, P[ch].y], PR); pts.push(...seg); }
    pts.push([P[d].x, P[d].y]); return pts;
  };
  const isAnc = (x, a) => { if (x === a) return true; const f = famOf[x]; return f ? isAnc(f[0], a) || isAnc(f[1], a) : false; };
  anc.forEach((a, k) => { for (const d of [i, j]) { if (d === a) continue; const pts = lineage(a, d); if (pts) routes.push({ pts, col: FC[k], k }); } });
  const xs = persons.map((p) => p[1]), ys = persons.map((p) => p[2]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  return { P, fams, i, j, anc, routes, cx, cy, w: Math.max(...xs) - Math.min(...xs) + 2 * PR, h: Math.max(...ys) - Math.min(...ys) + 2 * PR };
}
// Draw a pedigree with transform T = {x, y, s} (screen centre and scale).
function drawPed(g, D, T, o = {}) {
  const a = o.alpha ?? 1; if (a <= 0) return;
  const M = (x, y) => [T.x + (x - D.cx) * T.s, T.y + (y - D.cy) * T.s];
  const r = PR * T.s;
  g.withAlpha(a, () => {
    for (const f of D.fams) KIN.family(g, M(D.P[f[0]].x, D.P[f[0]].y), M(D.P[f[1]].x, D.P[f[1]].y), f[2].map((k) => M(D.P[k].x, D.P[k].y)), { r, w: 2, progress: o.prog ?? 1, color: PAL.ink3 });
    const ra = o.routeAlpha ?? 1;
    if (ra > 0) for (const R of D.routes) {
      const sh = R.k ? 3 : -3; const pts = R.pts.map(([x, y]) => { const q = M(x, y); return [q[0] + sh, q[1] + sh]; });
      g.poly(pts, { color: R.col, w: 7, alpha: 0.16 * ra, progress: o.route ?? 1 });
      g.poly(pts, { color: R.col, w: 2.6, alpha: 0.95 * ra, progress: o.route ?? 1 });
    }
    for (const id in D.P) {
      const p = D.P[id]; const [x, y] = M(p.x, p.y); const ij = id === D.i || id === D.j; const ak = D.anc.indexOf(id);
      KIN.person(g, x, y, { sex: p.sex, r, color: ij ? PAL.ink : PAL.ink2, w: ij ? 2.8 : 2, glow: ak >= 0 && (o.ancGlow ?? 1) > 0.05 ? FC[ak] : null, alpha: ij || ak >= 0 ? 1 : 0.8 });
      if (ij && (o.ijLab ?? 1) > 0) { const ls = Math.max(24, 34 * T.s); g.math(id === D.i ? 'i' : 'j', x, y + r + ls * 0.95, { size: ls, color: PAL.ink, align: 'center', alpha: o.ijLab ?? 1 }); }
    }
  });
  return M;
}

Theater.chapter({
  id: 'ibd', roman: 'I', title: 'Identity by Descent', color: COL,
  question: 'What is the one quantity beneath relatedness and inbreeding?',
  intro: { t: 'Chapter one. Identity by descent: the single idea beneath both relatedness and inbreeding.' },
  // Card motif: a faint cousin pedigree with one founder allele trickling down both sides.
  motif(g, t) {
    const a = 0.34 * ease.out((t - 0.4) / 1.6); if (a <= 0) return;
    const N = { GF: [1450, 150], GM: [1560, 150], S1: [1340, 245], P1: [1450, 245], P2: [1560, 245], S2: [1670, 245], C1: [1395, 335], C2: [1615, 335] };
    const r = 11;
    g.withAlpha(a, () => {
      KIN.family(g, N.GF, N.GM, [N.P1, N.P2], { r, w: 1.5, color: PAL.ink2 });
      KIN.family(g, N.S1, N.P1, [N.C1], { r, w: 1.5, color: PAL.ink2 });
      KIN.family(g, N.P2, N.S2, [N.C2], { r, w: 1.5, color: PAL.ink2 });
      const sx = { GF: 'M', GM: 'F', S1: 'F', P1: 'M', P2: 'F', S2: 'M', C1: 'F', C2: 'M' };
      for (const k in N) KIN.person(g, N[k][0], N[k][1], { sex: sx[k], r, w: 1.5, color: k === 'C1' || k === 'C2' || k === 'GF' ? COL : PAL.ink2 });
      const p1 = mkPath([...cPath(N.GF, N.GM, [N.P1, N.P2], N.P1, r), ...cPath(N.P1, N.S1, [N.C1], N.C1, r).slice(1)]);
      const p2 = mkPath([...cPath(N.GF, N.GM, [N.P1, N.P2], N.P2, r), ...cPath(N.P2, N.S2, [N.C2], N.C2, r).slice(1)]);
      const f = ((t * 0.28) % 1.25);
      g.poly(p1.pts, { color: COL, w: 2, progress: f }); g.poly(p2.pts, { color: COL, w: 2, progress: f });
      if (f < 1) { const q1 = along(p1, f), q2 = along(p2, f); g.dot(q1[0], q1[1], 4.5, COL, 1, 3); g.dot(q2[0], q2[1], 4.5, COL, 1, 3); }
    });
  },
  scenes: [
    /* ================================================================ ibd-ibs */
    {
      id: 'ibd-ibs', title: 'Alike in state, alike by descent',
      beats: [
        { t: 'Two alleles are identical by state when they carry the same sequence. They are identical by descent when both are copies of one ancestral allele, inherited through the pedigree.' },
        { t: 'Follow one allele in a grandparent. Through Mendelian segregation, a copy passes to each of two children, and from them to two cousins. The cousins now carry alleles that are identical by descent.' },
        { t: 'Identity by state is what we observe, and at a marker with two alleles it happens by chance all the time. Two strangers can carry the same letter for entirely different ancestral reasons.' },
        { t: 'Every method in this program does the same basic job. It infers identity by descent from observed identity by state, after subtracting the chance matching expected from allele frequencies.', pause: 0.6 },
      ],
      terms: [
        { beat: 0.1, term: 'Identity by state (IBS)', def: 'Two alleles with the same sequence, whatever their origin. This is what genotypes show directly.' },
        { beat: 0.5, term: 'Identity by descent (IBD)', def: 'Two alleles that are copies of a single ancestral allele, inherited through the pedigree since a reference (base) generation.' },
      ],
      init() {
        const r = 38, off = 17;
        const N = { GF: [450, 320], GM: [690, 320], S1: [200, 520], SON: [450, 520], DAU: [690, 520], S2: [940, 520], C1: [325, 720], C2: [815, 720] };
        const SEX = { GF: 'M', GM: 'F', S1: 'F', SON: 'M', DAU: 'F', S2: 'M', C1: 'F', C2: 'M' };
        // founder allele copies: [colour = which ancestral copy, letter = allelic state at an A/G SNP]
        const al = { GF: [[FC[0], 'A'], [FC[1], 'G']], GM: [[FC[2], 'A'], [FC[3], 'G']], S1: [[FC[4], 'G'], [FC[5], 'A']], S2: [[FC[6], 'A'], [FC[7], 'G']] };
        const fam = { SON: ['GF', 'GM', ['SON', 'DAU']], DAU: ['GF', 'GM', ['SON', 'DAU']], C1: ['SON', 'S1', ['C1']], C2: ['S2', 'DAU', ['C2']] };
        // [child, child slot (0 paternal, 1 maternal), parent, parent slot, generation, focal]
        const T = [['SON', 0, 'GF', 0, 1, 1], ['SON', 1, 'GM', 1, 1, 0], ['DAU', 0, 'GF', 0, 1, 1], ['DAU', 1, 'GM', 0, 1, 0],
          ['C1', 0, 'SON', 0, 2, 1], ['C1', 1, 'S1', 0, 2, 0], ['C2', 0, 'S2', 0, 2, 0], ['C2', 1, 'DAU', 0, 2, 1]];
        const tr = []; const into = {};
        for (const [c, cs, p, ps, gen, focal] of T) {
          al[c] = al[c] || []; al[c][cs] = al[p][ps];
          const [a, b, kids] = fam[c]; const mate = p === a ? b : a;
          const o = { c, cs, gen, focal: !!focal, col: al[p][ps][0], path: tPath(N[p], N[mate], kids.map((k) => N[k]), N[c], ps, cs, r, off), start: (gen === 1 ? 1.9 : 4.55) + (focal ? 0 : 0.2) };
          tr.push(o); into[c + cs] = o;
        }
        const founders = ['GF', 'GM', 'S1', 'S2'];
        return { N, SEX, al, tr, into, founders, r, off };
      },
      draw(g, t, S, D) {
        const { N, SEX, al, tr, into, r, off } = D;
        // ---------------------------------------------------------------- beat 0: the two definitions
        const v0 = vis(S, 0, 1);
        if (v0 > 0) g.withAlpha(v0, () => {
          const t0 = S.since(0);
          const strip = (cx, y, col, a) => { const s = 'CTGATCC'; s.split('').forEach((ch, k) => g.text(ch, cx + (k - 3) * 22, y, { size: 26, role: 'mono', weight: k === 3 ? 700 : 400, color: k === 3 ? col : PAL.ink2, align: 'center', alpha: a * (k === 3 ? 1 : 0.75) })); };
          const dots = (x1, y1, x2, y2, col, p) => { g.line(x1, y1, x2, y2, { color: col, w: 2, alpha: 0.6, dash: [2, 7], progress: p }); for (const u of [0.33, 0.66]) if (p > u) g.dot(lerp(x1, x2, u), lerp(y1, y2, u), 5, col, 0.7, 2); };
          g.line(710, 300, 710, 820, { color: PAL.rule, w: 1, alpha: S.p(0, 1, 3.2) });
          // IBS: same letter, two unrelated ancestral copies
          const pa = S.p(0, 0.8, 0.2), pl = ease.inOut((t0 - 0.6) / 1.2), pb = S.p(0, 0.6, 1.5);
          bead(g, 330, 335, FC[1], { size: 15, letter: 'A', alpha: pa * 0.8 }); bead(g, 510, 335, FC[2], { size: 15, letter: 'A', alpha: pa * 0.8 });
          dots(332, 356, 350, 512, FC[1], pl); dots(508, 356, 490, 512, FC[2], pl);
          bead(g, 350, 540, FC[1], { size: 24, letter: 'A', alpha: pb }); bead(g, 490, 540, FC[2], { size: 24, letter: 'A', alpha: pb });
          const ps = S.p(0, 0.6, 1.9);
          g.dot(318, 618, 6, FC[1], ps, 2); g.dot(318, 662, 6, FC[2], ps, 2);
          strip(420, 627, FC[1], ps); strip(420, 671, FC[2], ps);
          g.rect(420 - 13, 600, 26, 82, { stroke: PAL.ink2, w: 1.2, r: 5, alpha: ps * 0.6 });
          g.text('identical by state', 420, 768, { size: 44, role: 'display', italic: true, color: PAL.ink, align: 'center', alpha: S.p(0, 0.8, 0.4) });
          g.text('same sequence, any origin', 420, 808, { size: 23, color: PAL.ink2, align: 'center', alpha: S.p(0, 0.8, 1.2) });
          // IBD: two copies of one ancestral allele
          const qa = S.p(0, 0.8, 3.6), qp = ease.inOut((t0 - 4.1) / 2.2);
          bead(g, 1000, 335, COL, { size: 17, letter: 'A', alpha: qa });
          if (qa > 0) g.glow(1000, 335, 60, COL, 0.25 * qa);
          dots(992, 356, 930, 512, COL, qp); dots(1008, 356, 1070, 512, COL, qp);
          const qb = clamp((t0 - 6.2) / 0.4);
          if (qp > 0 && qp < 1) { g.dot(lerp(1000, 930, qp), lerp(335, 540, qp), 11, COL, 1, 2.6); g.dot(lerp(1000, 1070, qp), lerp(335, 540, qp), 11, COL, 1, 2.6); }
          bead(g, 930, 540, COL, { size: 24, letter: 'A', alpha: qb }); bead(g, 1070, 540, COL, { size: 24, letter: 'A', alpha: qb });
          const qs = S.p(0, 0.6, 6.5);
          g.dot(898, 618, 6, COL, qs, 2); g.dot(898, 662, 6, COL, qs, 2);
          strip(1000, 627, COL, qs); strip(1000, 671, COL, qs);
          g.rect(1000 - 13, 600, 26, 82, { stroke: PAL.ink2, w: 1.2, r: 5, alpha: qs * 0.6 });
          g.text('identical by descent', 1000, 768, { size: 44, role: 'display', italic: true, color: COL, align: 'center', alpha: S.p(0, 0.8, 3.8) });
          g.text('copies of one ancestral allele', 1000, 808, { size: 23, color: PAL.ink2, align: 'center', alpha: S.p(0, 0.8, 4.6) });
        });

        // ---------------------------------------------------------------- beats 1–2: the pedigree
        const vP = S.p(1, 0.8, 0.35) * (1 - S.p(3, 0.6));
        const t1 = S.since(1);
        // beat 2: genotypes show letters only, so colour (descent) drains away, then returns
        const dIn = S.p(2, 0.9, 0.2), dOut = S.p(2, 0.9, 5.5); const dsat = dIn * (1 - dOut);
        const cc = (c) => (dsat > 0.001 ? U.mix(c, GREY, 0.88 * dsat) : c);
        const la = S.p(2, 0.8, 0.3);
        if (vP > 0) g.withAlpha(vP, () => {
          const cp = (gen) => ease.out((t1 - 0.3 - gen * 0.3) / 1.1);
          KIN.family(g, N.GF, N.GM, [N.SON, N.DAU], { r, progress: cp(0), w: 2 });
          KIN.family(g, N.S1, N.SON, [N.C1], { r, progress: cp(1), w: 2 });
          KIN.family(g, N.DAU, N.S2, [N.C2], { r, progress: cp(1), w: 2 });
          // the focal copy's route stays lit
          const fp = (o) => ease.inOut((t1 - o.start) / 2.1);
          for (const o of tr) if (o.focal) {
            const f = fp(o); if (f <= 0) continue;
            g.poly(o.path.pts, { color: COL, w: 9, alpha: 0.12 * (1 - 0.8 * dsat), progress: f });
            g.poly(o.path.pts, { color: COL, w: 3, alpha: 0.75 * (1 - 0.75 * dsat), progress: f });
          }
          // individuals
          const genOf = { GF: 0, GM: 0, S1: 1, SON: 1, DAU: 1, S2: 1, C1: 2, C2: 2 };
          for (const k in N) {
            const a = ease.out((t1 - 0.35 - genOf[k] * 0.3) / 0.7); if (a <= 0) continue;
            const [x, y] = N[k]; KIN.person(g, x, y, { sex: SEX[k], r, color: PAL.ink2, alpha: a });
            for (const s of [0, 1]) {
              const bx = x + (s ? off : -off); const o = into[k + s];
              const filled = o ? fp(o) >= 1 : true;
              if (!filled) { slotRing(g, bx, y, 13, a); continue; }
              const [c, st] = al[k][s];
              bead(g, bx, y, cc(c), { size: 14, letter: st, la, alpha: a });
            }
          }
          // copies in transit
          for (const o of tr) { const f = fp(o); traveller(g, o.path, f, o.col, o.focal ? 12 : 9, o.focal ? 1 : 0.7); }
          // "follow one allele"
          const fa = S.p(1, 0.5, 0.2) * (1 - S.p(1, 0.6, 2.2));
          ring(g, N.GF[0] - off, N.GF[1], 20 + 2.5 * Math.sin(t * 7), COL, fa, 2.5);
          g.text('one founder allele', N.GF[0] - r - 18, N.GF[1] + 8, { size: 23, color: COL, align: 'right', alpha: S.p(1, 0.7, 0.3) * (1 - S.p(2, 0.6)) });
          // generation labels
          const gl = (s, y, d) => label(g, s, 1030, y + 6, S.p(1, 0.7, d) * (1 - S.p(2, 0.6)));
          gl('grandparents', N.GF[1], 0.5); gl('children', N.SON[1], 3.0); gl('cousins', N.C1[1], 5.6);
          // IBD bracket between the cousins
          const bp = S.p(1, 1.1, 7.3), ba = 1 - 0.65 * dsat;
          if (bp > 0) {
            const x1 = N.C1[0] - off, x2 = N.C2[0] + off, yb = 806;
            g.poly([[x1, N.C1[1] + r + 6], [x1, yb], [x2, yb], [x2, N.C2[1] + r + 6]], { color: COL, w: 2.5, dash: [7, 6], alpha: ba, progress: bp });
            g.text('IBD', (x1 + x2) / 2, yb + 38, { size: 28, weight: 600, color: COL, align: 'center', alpha: S.p(1, 0.6, 7.9) * ba });
            const pulse = S.p(1, 0.5, 7.3) * (1 - S.p(2, 0.5)) * (0.6 + 0.4 * Math.sin(t * 5));
            ring(g, x1, N.C1[1], 20, COL, pulse); ring(g, x2, N.C2[1], 20, COL, pulse);
          }
          // beat 2: state only
          label(g, 'What genotypes show', 150, 262, dsat);
          const ra = S.p(2, 0.5, 2.4) * (1 - S.p(2, 0.5, 5.4));
          let q = 0;
          for (const k in N) for (const s of [0, 1]) if (al[k][s][1] === 'A') { ring(g, N[k][0] + (s ? off : -off), N[k][1], 19, CREAM, ra * S.p(2, 0.4, 2.4 + 0.1 * q++), 2); }
          const ca = S.p(2, 0.8, 3.0);
          g.text('chance match, two alleles', 1010, 300, { size: 23, color: PAL.ink2, alpha: ca });
          g.math('p^{2} + q^{2} \\ge \\frac{1}{2}', 1010, 372, { size: 44, color: PAL.ochre, alpha: ca });
          // a stranger walks in
          const sa = S.p(2, 0.9, 5.5); const sx = lerp(1310, 1210, sa), sy = N.C2[1];
          if (sa > 0) {
            KIN.person(g, sx, sy, { sex: 'U', r, color: PAL.ink2, alpha: sa });
            bead(g, sx - off, sy, CREAM, { size: 14, letter: 'A', alpha: sa }); bead(g, sx + off, sy, GREY, { size: 14, letter: 'G', alpha: sa });
            g.text('a stranger', sx, sy + r + 44, { size: 23, color: PAL.ink2, align: 'center', alpha: sa });
            const ap = S.p(2, 1.1, 6.4);
            const A0 = [N.C2[0] + off, N.C2[1] - 20], A1 = [sx - off, sy - 20], C = [(A0[0] + A1[0]) / 2, 560];
            const arc = []; for (let k = 0; k <= 30; k++) { const u = k / 30; arc.push([(1 - u) ** 2 * A0[0] + 2 * (1 - u) * u * C[0] + u * u * A1[0], (1 - u) ** 2 * A0[1] + 2 * (1 - u) * u * C[1] + u * u * A1[1]]); }
            g.poly(arc, { color: PAL.coral, w: 2.5, dash: [7, 6], progress: ap });
            ring(g, N.C2[0] + off, N.C2[1], 19, PAL.coral, ap); ring(g, sx - off, sy, 19, PAL.coral, ap);
            g.text('IBS, not IBD', C[0], 612, { size: 26, weight: 600, color: PAL.coral, align: 'center', alpha: S.p(2, 0.7, 7.0) });
          }
        });

        // ---------------------------------------------------------------- beat 3: what every method does
        const v3 = S.p(3, 0.8, 0.3);
        if (v3 > 0) g.withAlpha(v3, () => {
          const chips = ['moment estimators', 'GRM', 'likelihood', 'IBD segments', 'ROH'];
          const ws = chips.map((c) => g.measure(c, { size: 22, weight: 500 }) + 26.4); const gap = 26; const tot = ws.reduce((a, b) => a + b, 0) + gap * (chips.length - 1);
          let cx = 705 - tot / 2; const hub = [705, 356];
          chips.forEach((c, k) => {
            const p = S.p(3, 0.6, 0.3 + k * 0.3); const mid = cx + ws[k] / 2;
            g.line(mid, 286, hub[0], hub[1], { color: PAL.ink3, w: 1.5, alpha: 0.7 * p, progress: S.p(3, 0.8, 1.3 + k * 0.08) });
            g.pill(c, cx, 268, { size: 22, color: PAL.ink2, alpha: p }); cx += ws[k] + gap;
          });
          g.dot(hub[0], hub[1], 6, COL, S.p(3, 0.6, 2.0), 3);
          g.arrow(hub[0], hub[1] + 10, hub[0], 418, { color: COL, w: 2.4, head: 12, progress: S.p(3, 0.7, 2.4) });
          // probability bar: observed IBS = chance + IBD × (1 − chance)
          const X = (v) => 230 + v * 950, yb = 482, hb = 46;
          const ob = S.p(3, 0.8, 3.0);
          g.rect(X(0), yb - hb / 2, X(1) - X(0), hb, { stroke: PAL.ink3, w: 1.5, r: 6, alpha: ob });
          [[0, '0'], [0.5, '½'], [1, '1']].forEach(([v, s]) => { g.line(X(v), yb + hb / 2, X(v), yb + hb / 2 + 8, { color: PAL.ink3, w: 1.5, alpha: ob }); g.text(s, X(v), yb + hb / 2 + 32, { size: 22, color: PAL.ink3, align: 'center', alpha: ob }); });
          const ibs = 0.625, ch = 0.5;
          const pI = S.io(3, 1.3, 4.6);
          if (pI > 0) g.rect(X(0), yb - hb / 2, (X(ibs) - X(0)) * pI, hb, { fill: U.rgba(CREAM, 0.34), r: 6 });
          const pl = S.p(3, 0.7, 5.6);
          g.poly([[X(0), yb - hb / 2 - 10], [X(0), yb - hb / 2 - 20], [X(ibs), yb - hb / 2 - 20], [X(ibs), yb - hb / 2 - 10]], { color: PAL.ink2, w: 1.6, alpha: pl });
          g.text('observed IBS', X(ibs / 2), yb - hb / 2 - 32, { size: 24, color: PAL.ink, align: 'center', alpha: pl });
          const pC = S.io(3, 1.0, 6.7);
          if (pC > 0) g.rect(X(0), yb - hb / 2, (X(ch) - X(0)) * pC, hb, { fill: U.rgba(PAL.ochre, 0.72), r: 6 });
          const pD = S.p(3, 0.8, 7.5);
          if (pD > 0) { g.rect(X(ch), yb - hb / 2, X(ibs) - X(ch), hb, { fill: U.rgba(COL, 0.85 * pD) }); g.glow((X(ch) + X(ibs)) / 2, yb, 70, COL, 0.3 * pD); }
          g.math('\\text{chance} = p^{2} + q^{2}', X(0.25), yb + 104, { size: 32, color: PAL.ochre, align: 'center', alpha: S.p(3, 0.7, 6.9) });
          g.math('p = q = \\frac{1}{2}', X(0.25), yb + 160, { size: 28, color: PAL.ink2, align: 'center', alpha: S.p(3, 0.7, 8.4) });
          const pB = S.p(3, 0.8, 7.8);
          g.poly([[X(ch) + 2, yb + hb / 2 + 54], [X(ch) + 2, yb + hb / 2 + 64], [X(1) - 2, yb + hb / 2 + 64], [X(1) - 2, yb + hb / 2 + 54]], { color: PAL.ink2, w: 1.6, alpha: pB });
          g.text('illustrative', X(1), yb - hb / 2 - 32, { size: 17, color: PAL.ink3, align: 'right', alpha: pl });
          g.math('1 − \\text{chance}', X(0.75), yb + hb / 2 + 104, { size: 30, color: PAL.ink2, align: 'center', alpha: pB });
          // the estimator, symbolically and with these numbers
          const pf = S.p(3, 0.9, 8.1);
          mathSeq(g, [['P(\\text{IBD})', COL], ['\\, = \\frac{\\text{IBS} − \\text{chance}}{1 − \\text{chance}}', PAL.ink]], 705, 742, { size: 46, align: 'center', alpha: pf });
          mathSeq(g, [['= \\frac{0.625 − 0.5}{1 − 0.5} = ', PAL.ink2], ['0.25', COL]], 705, 852, { size: 40, align: 'center', alpha: S.p(3, 0.9, 8.9) });
        });
      },
    },
    /* ================================================================ ibd-kinship */
    {
      id: 'ibd-kinship', title: 'The kinship coefficient',
      beats: [
        { t: 'The kinship coefficient, φ, is the probability that an allele drawn at random from individual i, and one drawn at the same locus from individual j, are identical by descent.',
          s: 'The kinship coefficient, phi, is the probability that an allele drawn at random from individual i, and one drawn at the same locus from individual j, are identical by descent.' },
        { t: 'Take a parent and its offspring. Half the time, the allele drawn from the child is the one this parent gave it. Half the time after that, the draw from the parent picks that same allele. So φ = ¼.',
          s: 'Take a parent and its offspring. Half the time, the allele drawn from the child is the one this parent gave it. Half the time after that, the draw from the parent picks that same allele. So phi equals one quarter.' },
        { t: 'Full siblings share both parents, and their kinship is also one quarter. Half siblings share one parent, with kinship one eighth. First cousins have kinship one sixteenth.' },
        { t: 'In general, kinship sums over every path through a common ancestor A. A path through n individuals, counting i and j, contributes (½)ⁿ (1 + F_A), where F_A is the inbreeding of the ancestor itself.',
          s: 'In general, kinship sums over every path through a common ancestor A. A path through n individuals, counting i and j, contributes one half to the power n, times one plus F A, where F A is the inbreeding of the ancestor itself.' },
      ],
      terms: [
        { beat: 0.2, term: 'Kinship coefficient (φ)', def: 'Probability that alleles drawn at random, one from each of two individuals at the same locus, are IBD. Also called coancestry.' },
        { beat: 3.2, term: 'Path counting', def: 'Wright\'s method: φ_ij = Σ over paths (½)^n (1 + F_A), with n individuals in each path through a common ancestor A.' },
      ],
      init() {
        // Random draws between i = [heather, ochre] and j = [heather, lagoon]: one shared copy, φ = 1/4.
        const I = [FC[0], FC[1]], J = [FC[0], FC[2]];
        const r = rng(23); const draws = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([a, b]) => ({ a, b, ibd: I[a] === J[b] }));
        let hit = 0; const est = []; draws.forEach((d, k) => { hit += d.ibd ? 1 : 0; est.push(hit / (k + 1)); });
        for (let k = 4; k < 400; k++) { const a = r() < 0.5 ? 0 : 1, b = r() < 0.5 ? 0 : 1; const ibd = I[a] === J[b]; hit += ibd ? 1 : 0; draws.push({ a, b, ibd }); est.push(hit / (k + 1)); }
        const peds = [
          makePed([['P', 0, 0, 'M'], ['Q', 200, 0, 'F'], ['C', 100, 230, 'F']], [['P', 'Q', ['C']]], 'P', 'C', ['P']),
          makePed([['F', 0, 0, 'M'], ['M', 200, 0, 'F'], ['A', 40, 230, 'M'], ['B', 160, 230, 'F']], [['F', 'M', ['A', 'B']]], 'A', 'B', ['F', 'M']),
          makePed([['M1', 0, 0, 'F'], ['S', 180, 0, 'M'], ['M2', 360, 0, 'F'], ['A', 90, 230, 'M'], ['B', 270, 230, 'F']], [['M1', 'S', ['A']], ['S', 'M2', ['B']]], 'A', 'B', ['S']),
          makePed([['GF', 160, 0, 'M'], ['GM', 340, 0, 'F'], ['S1', 0, 230, 'F'], ['P1', 160, 230, 'M'], ['P2', 340, 230, 'F'], ['S2', 500, 230, 'M'], ['I', 80, 460, 'F'], ['J', 420, 460, 'M']],
            [['GF', 'GM', ['P1', 'P2']], ['S1', 'P1', ['I']], ['P2', 'S2', ['J']]], 'I', 'J', ['GF', 'GM']),
        ];
        return { I, J, draws, est, peds };
      },
      draw(g, t, S, D) {
        const { I, J, draws, est, peds } = D;
        const R = 56, BO = 24, BS = 19;
        // ---- draw schedule: the first draw is slow and narrated, then they accelerate
        const t0 = S.b(0) + 7.6, T4 = t0 + 3.0, tE = S.e(1) - 0.6;
        const nDone = t < t0 ? 0 : t < T4 ? 1 + Math.floor((t - t0) / 0.75) : Math.min(400, 5 + Math.floor(395 * clamp((t - T4) / (tE - T4)) ** 2));
        const cur = Math.max(0, nDone - 1);
        // ---- beats 0–1: i and j, then parent and offspring
        const vA = vis(S, 0, 2);
        const m = S.io(1, 1.3, 0.1);
        const pi = [260, lerp(420, 330, m)], pj = [lerp(600, 430, m), lerp(420, 500, m)], pq = [600, 330];
        if (vA > 0) g.withAlpha(vA, () => {
          label(g, 'Kinship as a random draw', 150, 262, S.p(0, 0.8) * (1 - S.p(1, 0.6)));
          label(g, 'Parent and offspring', 150, 262, S.p(1, 0.8, 0.4));
          // other parent and pedigree (beat 1)
          const qa = S.p(1, 0.8, 0.6);
          if (qa > 0) {
            KIN.family(g, pi, pq, [pj], { r: R, progress: S.p(1, 1.2, 0.6), w: 2 });
            KIN.person(g, pq[0], pq[1], { sex: 'F', r: R, color: PAL.ink3, alpha: 0.75 * qa });
            bead(g, pq[0] - BO, pq[1], FC[2], { size: BS, alpha: 0.6 * qa }); bead(g, pq[0] + BO, pq[1], FC[4], { size: BS, alpha: 0.6 * qa });
            g.text('other parent', pq[0], pq[1] + R + 36, { size: 23, color: PAL.ink3, align: 'center', alpha: qa });
          }
          // inheritance routes (beat 1)
          const P1 = tPath(pi, pq, [pj], pj, 0, 0, R, BO), P2 = tPath(pq, pi, [pj], pj, 0, 1, R, BO);
          const f1 = ease.inOut((S.since(1) - 1.9) / 1.8), f2 = ease.inOut((S.since(1) - 2.2) / 1.8);
          if (m >= 1 && f1 > 0) { g.poly(P1.pts, { color: COL, w: 8, alpha: 0.14, progress: f1 }); g.poly(P1.pts, { color: COL, w: 3, alpha: 0.8, progress: f1 }); }
          if (m >= 1 && f2 > 0) g.poly(P2.pts, { color: FC[2], w: 2, alpha: 0.35, progress: f2 });
          // the two individuals
          KIN.person(g, pi[0], pi[1], { sex: 'M', r: R, color: PAL.ink, w: 2.6, label: 'i' });
          KIN.person(g, pj[0], pj[1], { sex: 'F', r: R, color: PAL.ink, w: 2.6, label: 'j' });
          const bA = S.p(0, 0.6, 0.3);
          bead(g, pi[0] - BO, pi[1], I[0], { size: BS, alpha: bA }); bead(g, pi[0] + BO, pi[1], I[1], { size: BS, alpha: bA });
          bead(g, pj[0] - BO, pj[1], J[0], { size: BS, alpha: bA }); bead(g, pj[0] + BO, pj[1], J[1], { size: BS, alpha: bA });
          if (m >= 1) { traveller(g, P1, f1, COL, 12, 1); traveller(g, P2, f2, FC[2], 9, 0.6); }
          g.text('parent', pi[0], pi[1] + R + 36, { size: 23, color: PAL.ink2, align: 'center', alpha: S.p(1, 0.7, 0.6) });
          g.text('offspring', pj[0], pj[1] + R + 36, { size: 23, color: PAL.ink2, align: 'center', alpha: S.p(1, 0.7, 1.0) });
          // pick highlights (beat 0)
          const hA = 1 - S.p(1, 0.5);
          if (hA > 0) {
            const d = draws[cur];
            const ai = nDone ? 1 : S.p(0, 0.4, 4.2), aj = nDone ? 1 : S.p(0, 0.4, 6.4), av = nDone ? 1 : S.p(0, 0.4, 7.6);
            const xi = pi[0] + (d.a ? BO : -BO), xj = pj[0] + (d.b ? BO : -BO);
            ring(g, xi, pi[1], BS + 7, PAL.ink, ai * hA, 2.5); ring(g, xj, pj[1], BS + 7, PAL.ink, aj * hA, 2.5);
            g.line(xi, pi[1] - BS - 8, xi, pi[1] - R - 26, { color: PAL.ink2, w: 2, alpha: ai * hA }); g.line(xj, pj[1] - BS - 8, xj, pj[1] - R - 26, { color: PAL.ink2, w: 2, alpha: aj * hA });
            g.poly([[xi, pi[1] - R - 26], [xi, pi[1] - R - 42], [xj, pj[1] - R - 42], [xj, pj[1] - R - 26]], { color: d.ibd ? COL : PAL.ink3, w: d.ibd ? 3 : 2, dash: d.ibd ? null : [6, 6], alpha: av * hA });
          }
          // convergence plot: running estimate of φ
          const pa = S.p(0, 0.9, 7.0);
          if (pa > 0) g.withAlpha(pa, () => {
            const A = g.axes({ x: 170, y: 662, w: 520, h: 186, xmin: 1, xmax: 400, ymin: 0, ymax: 1, logx: true, xlab: 'draws', ylab: '\\hat{φ}', labSize: 22, tickSize: 20,
              xticks: [{ v: 1, l: '1' }, { v: 10, l: '10' }, { v: 100, l: '100' }], yticks: [{ v: 0, l: '0' }, { v: 0.25, l: '¼' }, { v: 0.5, l: '½' }, { v: 1, l: '1' }] });
            const qa2 = S.p(1, 0.9, 8.5);
            g.line(A.X(1), A.Y(0.25), A.X(400), A.Y(0.25), { color: COL, w: 2, dash: [8, 7], alpha: qa2 });
            if (nDone > 0) {
              const pts = []; for (let k = 0; k < nDone; k++) pts.push([A.X(k + 1), A.Y(est[k])]);
              if (pts.length > 1) g.poly(pts, { color: PAL.ink, w: 2.4 });
              const e = pts[pts.length - 1]; g.dot(e[0], e[1], 5.5, PAL.ink, 1, 3);
              g.text(`${Math.round(est[nDone - 1] * nDone)} of ${nDone} IBD`, 690, 640, { size: 22, role: 'mono', color: PAL.ink2, align: 'right' });
            }
            label(g, 'Running estimate', 200, 640);
          });
        });
        // ---- right panel: definition, then the probability tree
        const vR = vis(S, 0, 2);
        if (vR > 0) g.withAlpha(vR, () => {
          mathSeq(g, [['φ_{ij}', COL], ['\\, = P(\\text{IBD})', PAL.ink]], 800, 330, { size: 52, alpha: S.p(0, 0.8, 0.8) });
          g.text('one random allele from each', 800, 380, { size: 23, color: PAL.ink2, alpha: S.p(0, 0.8, 2.6) });
          // beat 0: the current comparison
          const cA = 1 - S.p(1, 0.5);
          if (cA > 0) g.withAlpha(cA, () => {
            const d = draws[cur]; const ai = nDone ? 1 : S.p(0, 0.5, 4.2), aj = nDone ? 1 : S.p(0, 0.5, 6.4), av = nDone ? 1 : S.p(0, 0.5, 7.6);
            g.text('from i', 960, 470, { size: 22, color: PAL.ink3, align: 'center', alpha: ai }); g.text('from j', 1120, 470, { size: 22, color: PAL.ink3, align: 'center', alpha: aj });
            bead(g, 960, 530, I[d.a], { size: 26, alpha: ai }); bead(g, 1120, 530, J[d.b], { size: 26, alpha: aj });
            g.text(d.ibd ? '≡' : '≠', 1040, 545, { size: 44, color: d.ibd ? COL : PAL.ink3, align: 'center', alpha: av });
            g.text(d.ibd ? 'IBD' : 'not IBD', 1040, 620, { size: 30, weight: 600, color: d.ibd ? COL : PAL.ink3, align: 'center', alpha: av });
          });
          // beat 1: the two-step tree
          const tA = S.p(1, 0.8, 1.4);
          if (tA > 0) g.withAlpha(tA, () => {
            const root = [830, 610], u1 = [990, 520], d1 = [990, 740], u2 = [1170, 470], d2 = [1170, 578];
            g.text('draw from child', u1[0], 428, { size: 22, color: PAL.ink2, align: 'center', alpha: S.p(1, 0.7, 1.8) });
            g.text('from parent', u2[0], 428, { size: 22, color: PAL.ink2, align: 'center', alpha: S.p(1, 0.7, 5.1) });
            const b1 = S.p(1, 0.8, 1.8), b2 = S.p(1, 0.8, 5.1), e1 = S.p(1, 0.8, 3.2), e2 = S.p(1, 0.8, 6.6);
            g.dot(root[0], root[1], 6, PAL.ink2, 1, 2);
            const br = (a, b, p, hot, lab) => {
              g.line(a[0] + 8, a[1], b[0] - 26, b[1], { color: hot ? COL : PAL.ink3, w: hot ? 3.2 : 2, progress: p });
              g.math('\\frac{1}{2}', (a[0] + b[0]) / 2 - 6, (a[1] + b[1]) / 2 + (b[1] < a[1] ? -12 : 40), { size: 30, color: hot ? COL : PAL.ink2, align: 'center', alpha: p });
            };
            br(root, u1, b1, e1 > 0.5); br(root, d1, b1, false);
            bead(g, u1[0], u1[1], J[0], { size: 18, alpha: b1 }); bead(g, d1[0], d1[1], J[1], { size: 18, alpha: b1 });
            g.text('not IBD', d1[0] + 32, d1[1] + 8, { size: 22, color: PAL.ink3, alpha: S.p(1, 0.7, 4.0) });
            br([u1[0] + 18, u1[1]], u2, b2, e2 > 0.5); br([u1[0] + 18, u1[1]], d2, b2, false);
            bead(g, u2[0], u2[1], I[0], { size: 18, alpha: b2 }); bead(g, d2[0], d2[1], I[1], { size: 18, alpha: b2 });
            g.text('IBD', u2[0] + 32, u2[1] + 9, { size: 25, weight: 600, color: COL, alpha: e2 });
            g.text('not IBD', d2[0] + 32, d2[1] + 8, { size: 22, color: PAL.ink3, alpha: e2 });
            if (e1 > 0) ring(g, u1[0], u1[1], 25, COL, e1 * (1 - S.p(2, 0.4)));
            if (e2 > 0) ring(g, u2[0], u2[1], 25, COL, e2 * (1 - S.p(2, 0.4)));
            mathSeq(g, [['φ = \\frac{1}{2} \\times \\frac{1}{2} = ', PAL.ink], ['\\frac{1}{4}', COL]], 820, 842, { size: 46, alpha: S.p(1, 0.8, 8.4) });
          });
        });
        // left-panel echo of the tree: ring on child's copy, then parent's copy
        const e1 = S.p(1, 0.6, 2.1) * (1 - S.p(2, 0.5)), e2 = S.p(1, 0.6, 5.4) * (1 - S.p(2, 0.5));
        ring(g, pj[0] - BO, pj[1], BS + 8, COL, e1 * vA, 3); ring(g, pi[0] - BO, pi[1], BS + 8, COL, e2 * vA, 3);

        // ---- beat 2: a row of kinship cards; beat 3: the cousin card becomes the path diagram
        const vC = S.p(2, 0.8, 0.2);
        if (vC > 0) {
          const out = S.p(3, 0.7);
          const cards = [[100, 240, 0, 'parent–offspring', 0.0, 0.72], [360, 250, 1, 'full siblings', 0.4, 0.72], [630, 310, 2, 'half siblings', 3.2, 0.62], [960, 330, 3, 'first cousins', 5.7, 0.52]];
          const vals = ['\\frac{1}{4}', '\\frac{1}{4}', '\\frac{1}{8}', '\\frac{1}{16}'], vd = [0.2, 2.0, 4.5, 6.8];
          cards.forEach(([x0, w, k, name, d, sc], idx) => {
            const ca = S.p(2, 0.8, d) * vC; const fade = 1 - out;
            if (ca * fade <= 0 && idx !== 3) return;
            g.withAlpha(ca * fade, () => {
              g.rect(x0, 296, w, 524, { fill: 'rgba(18,36,38,0.55)', stroke: PAL.rule, w: 1.2, r: 10 });
              g.math('φ = ' + vals[k], x0 + w / 2, 716, { size: 50, color: PAL.ink, align: 'center', alpha: S.p(2, 0.7, vd[k]) });
              g.text(name, x0 + w / 2, 790, { size: 30, role: 'display', color: PAL.ink2, align: 'center' });
            });
            if (idx < 3) drawPed(g, peds[k], { x: x0 + w / 2, y: 480, s: sc }, { alpha: ca * (1 - out), route: S.p(2, 1.2, d + 0.5), prog: S.p(2, 1.0, d + 0.1) });
          });
          // the cousin pedigree: card → big path diagram
          const mm = S.io(3, 1.4, 0.0);
          const T = { x: lerp(1125, 420, mm), y: lerp(480, 570, mm), s: lerp(0.52, 1, mm) };
          const ca = S.p(2, 0.8, 5.7);
          const Mp = drawPed(g, peds[3], T, { alpha: ca, route: S.p(2, 1.2, 6.2), prog: S.p(2, 1.0, 5.8), routeAlpha: 1 - S.p(3, 0.8), ijLab: 1 });
          if (S.at(3)) drawPaths(g, S, peds[3], Mp, T);
        }
        // ---- beat 3: equations on the right
        const v3 = S.p(3, 0.8, 5.6);
        if (v3 > 0) {
          const ge = 'φ_{ij} = \\sum (\\frac{1}{2})^{n}', gt = '(1 + F_A)';
          const w1 = g.mathW(ge, 46), w2 = g.mathW(gt, 46); const gx = 790;
          g.math(ge, gx, 336, { size: 46, alpha: v3 }); g.math(gt, gx + w1 + 6, 336, { size: 46, alpha: v3 });
          const fu = S.p(3, 0.7, 9.3);
          g.line(gx + w1 + 8, 356, gx + w1 + 6 + w2, 356, { color: PAL.coral, w: 3, alpha: fu, progress: fu });
          const row = (y, col, A, d) => {
            const a = S.p(3, 0.8, d); if (a <= 0) return;
            g.line(790, y - 12, 826, y - 12, { color: col, w: 5, alpha: a });
            g.math(A, 840, y, { size: 32, color: col, alpha: a });
            g.math('n = 5', 900, y, { size: 30, color: PAL.ink2, alpha: a });
            g.math('(\\frac{1}{2})^{5}(1 + 0) = \\frac{1}{32}', 1010, y, { size: 36, alpha: a });
          };
          row(486, FC[0], 'A_1', 7.4); row(606, FC[1], 'A_2', 8.2);
          mathSeq(g, [['φ_{ij} = 2 \\times \\frac{1}{32} = ', PAL.ink], ['\\frac{1}{16}', COL]], 790, 770, { size: 50, alpha: S.p(3, 0.9, 10.2) });
        }
      },
    },
    /* ================================================================ ibd-inbreeding */
    {
      id: 'ibd-inbreeding', title: 'Inbreeding is kinship, one generation back',
      beats: [
        { t: 'The inbreeding coefficient, F, is the probability that the two alleles within a single individual are identical by descent.' },
        { t: 'Where did those two alleles come from? One from the mother, and one from the father. So an individual\'s F is exactly the kinship of its parents. Inbreeding is relatedness, one generation back.',
          s: 'Where did those two alleles come from? One from the mother, and one from the father. So an individual\'s F is exactly the kinship of its parents. Inbreeding is relatedness, one generation back.' },
        { t: 'Here, two half siblings mate, closing a loop in the pedigree. Their kinship is one eighth, so their offspring is inbred, with F equal to one eighth.' },
        { t: 'Now draw twice from one individual, with replacement. Half the time you pick the same allele twice. Otherwise you pick both, and they match by descent with probability F. That gives the self-kinship, (1 + F) / 2.',
          s: 'Now draw twice from one individual, with replacement. Half the time you pick the same allele twice. Otherwise you pick both, and they match by descent with probability F. That gives the self-kinship, one plus F, over two.' },
        { t: 'So arrange every kinship in one matrix. Pairwise kinship fills the off-diagonal, and inbreeding sits on the diagonal. Both come from the same genotypes, estimated together. You never need one in order to get the other.', pause: 0.8 },
      ],
      terms: [
        { beat: 0.2, term: 'Inbreeding coefficient (F)', def: 'Probability that the two alleles at a locus within one individual are IBD. Equals the kinship of the individual\'s parents.' },
        { beat: 3.82, term: 'Self-kinship', def: 'Kinship of an individual with itself: φ_ii = (1 + F_i) / 2.' },
        { beat: 4.2, term: 'Kinship matrix', def: 'Matrix of all pairwise kinships; off-diagonal = pairwise coancestry, diagonal = (1 + F) / 2. A genomic relationship matrix is its marker-based estimate (scaled ×2).' },
      ],
      init() {
        // Half-sib mating pedigree (beat 2) — also the six individuals of the kinship matrix (beat 4).
        const r = 38, off = 17;
        const N = { M1: [210, 320], S: [420, 320], M2: [630, 320], H1: [315, 530], H2: [525, 530], O: [420, 740] };
        const SEX = { M1: 'F', S: 'M', M2: 'F', H1: 'M', H2: 'F', O: 'M' };
        const al = { M1: [FC[4], FC[5]], S: [FC[0], FC[1]], M2: [FC[6], FC[7]] };
        const fam = { H1: ['M1', 'S', ['H1']], H2: ['S', 'M2', ['H2']], O: ['H1', 'H2', ['O']] };
        const T = [['H1', 0, 'S', 0, 0.8, 1], ['H1', 1, 'M1', 0, 1.0, 0], ['H2', 0, 'S', 0, 0.8, 1], ['H2', 1, 'M2', 1, 1.0, 0], ['O', 0, 'H1', 0, 3.7, 1], ['O', 1, 'H2', 0, 3.7, 1]];
        const tr = [], into = {};
        for (const [c, cs, p, ps, start, focal] of T) {
          al[c] = al[c] || []; al[c][cs] = al[p][ps];
          const [a, b, kids] = fam[c]; const mate = p === a ? b : a;
          const o = { c, cs, start, focal: !!focal, col: al[p][ps], path: tPath(N[p], N[mate], kids.map((k) => N[k]), N[c], ps, cs, r, off) };
          tr.push(o); into[c + cs] = o;
        }
        // Exact kinship matrix by the tabular method. Order: M1, S, M2, H1, H2, O.
        const ids = ['M1', 'S', 'M2', 'H1', 'H2', 'O']; const par = [null, null, null, [1, 0], [1, 2], [3, 4]];
        const K = ids.map(() => ids.map(() => 0));
        for (let i = 0; i < 6; i++) {
          for (let j = 0; j < i; j++) { const p = par[i]; K[i][j] = K[j][i] = p ? 0.5 * (K[p[0]][j] + K[p[1]][j]) : 0; }
          K[i][i] = par[i] ? 0.5 * (1 + K[par[i][0]][par[i][1]]) : 0.5;
        }
        // Gene-dropped genotypes (allele dosage 0/1/2) at 20 SNPs for the same six individuals.
        const R = rng(31); const L = 20; const geno = ids.map(() => []);
        for (let l = 0; l < L; l++) {
          const p = 0.2 + 0.6 * R(); const hap = [];
          for (let i = 0; i < 6; i++) hap.push(par[i] ? [hap[par[i][0]][R() < 0.5 ? 0 : 1], hap[par[i][1]][R() < 0.5 ? 0 : 1]] : [R() < p ? 1 : 0, R() < p ? 1 : 0]);
          for (let i = 0; i < 6; i++) geno[i].push(hap[i][0] + hap[i][1]);
        }
        return { N, SEX, al, tr, into, r, off, ids, K, geno };
      },
      draw(g, t, S, D) {
        // ---- beats 0–1: one individual, then its parents
        const vA = vis(S, 0, 2);
        const m = S.io(1, 1.3, 0.1);
        const X = [420, lerp(500, 690, m)], RX = lerp(84, 64, m), BO = lerp(34, 26, m), BS = lerp(26, 20, m);
        const sire = [260, 360], dam = [580, 360], RP = 56, PO = 24;
        if (vA > 0) g.withAlpha(vA, () => {
          const pa = S.p(1, 0.8, 0.4);
          const up0 = tPath(sire, dam, [X], X, 1, 0, RP, PO), up1 = tPath(dam, sire, [X], X, 0, 1, RP, PO);
          const fu = ease.inOut((S.since(1) - 1.8) / 1.6);
          if (pa > 0) {
            KIN.family(g, sire, dam, [X], { r: RP, progress: S.p(1, 1.2, 0.5), w: 2 });
            if (fu > 0 && m >= 1) { g.poly(up0.pts.slice().reverse(), { color: CREAM, w: 2.5, alpha: 0.45, progress: fu }); g.poly(up1.pts.slice().reverse(), { color: CREAM, w: 2.5, alpha: 0.45, progress: fu }); }
            KIN.person(g, sire[0], sire[1], { sex: 'M', r: RP, color: PAL.ink2, alpha: pa }); g.math('s', sire[0] - RP - 14, sire[1] + 10, { size: 36, color: PAL.ink2, align: 'right', alpha: pa });
            KIN.person(g, dam[0], dam[1], { sex: 'F', r: RP, color: PAL.ink2, alpha: pa }); g.math('d', dam[0] + RP + 14, dam[1] + 10, { size: 36, color: PAL.ink2, alpha: pa });
            bead(g, sire[0] - PO, sire[1], GREY, { size: 17, alpha: pa * 0.8 }); bead(g, dam[0] + PO, dam[1], GREY, { size: 17, alpha: pa * 0.8 });
            if (fu >= 1) { bead(g, sire[0] + PO, sire[1], CREAM, { size: 17, letter: 'A' }); bead(g, dam[0] - PO, dam[1], CREAM, { size: 17, letter: 'A' }); }
            else { slotRing(g, sire[0] + PO, sire[1], 16, pa); slotRing(g, dam[0] - PO, dam[1], 16, pa); }
          }
          KIN.person(g, X[0], X[1], { sex: 'F', r: RX, color: PAL.ink, w: 2.8, alpha: S.p(0, 0.7, 0.1), label: m > 0.5 ? 'o' : null });
          const ba = S.p(0, 0.6, 0.5);
          bead(g, X[0] - BO, X[1], CREAM, { size: BS, letter: 'A', alpha: ba }); bead(g, X[0] + BO, X[1], CREAM, { size: BS, letter: 'A', alpha: ba });
          const pulse = S.p(0, 0.5, 2.7) * (1 - S.p(0, 0.5, 4.6));
          ring(g, X[0] - BO, X[1], BS + 7, CREAM, pulse); ring(g, X[0] + BO, X[1], BS + 7, CREAM, pulse);
          // the IBD question inside one individual (coral)…
          const q0 = S.p(0, 0.9, 4.8) * (1 - S.p(1, 0.5));
          if (q0 > 0) {
            const top = X[1] - RX - 44;
            g.poly([[X[0] - BO, X[1] - BS - 4], [X[0] - BO, top], [X[0] + BO, top], [X[0] + BO, X[1] - BS - 4]], { color: PAL.coral, w: 2.5, dash: [6, 5], alpha: q0 });
            g.text('IBD?', X[0], top - 14, { size: 30, weight: 600, color: PAL.coral, align: 'center', alpha: q0 });
          }
          // …travels back one generation and becomes a question between two individuals (lagoon)
          if (m >= 1 && fu > 0 && fu < 1) {
            const rev = (P) => mkPath(P.pts.slice().reverse());
            traveller(g, rev(up0), fu, CREAM, 13, 1); traveller(g, rev(up1), fu, CREAM, 13, 1);
          }
          const q1 = S.p(1, 0.9, 3.9);
          if (q1 > 0) {
            const a0 = [sire[0] + PO, sire[1] - 22], a1 = [dam[0] - PO, dam[1] - 22];
            const arc = []; for (let k = 0; k <= 30; k++) { const u = k / 30; arc.push([lerp(a0[0], a1[0], u), lerp(a0[1], a1[1], u) - Math.sin(Math.PI * u) * 66]); }
            g.poly(arc, { color: PAL.lagoon, w: 2.5, dash: [6, 5], progress: q1 });
            g.math('φ_{sd}', 420, 262, { size: 36, color: PAL.lagoon, align: 'center', alpha: S.p(1, 0.7, 4.6) });
          }
        });
        // right panel, beats 0–1
        const r0 = S.p(0, 0.8) * (1 - S.p(1, 0.6, 3.5));
        mathSeq(g, [['F', PAL.coral], ['\\, = P(\\text{IBD})', PAL.ink]], 790, 450, { size: 60, alpha: S.p(0, 0.8, 0.9) * r0 });
        g.text('two alleles, one individual', 792, 510, { size: 24, color: PAL.ink2, alpha: S.p(0, 0.8, 2.7) * r0 });
        const r1 = vis(S, 1, 2, 0.8) * S.p(1, 0.8, 3.9);
        mathSeq(g, [['F_o', PAL.coral], ['\\, = ', PAL.ink], ['φ_{sd}', PAL.lagoon]], 800, 430, { size: 72, alpha: r1 });
        const r2 = vis(S, 1, 2) * S.p(1, 0.8, 7.4);
        if (r2 > 0) g.withAlpha(r2, () => {
          g.text('relatedness of the parents', 800, 560, { size: 27, color: PAL.lagoon });
          g.arrow(818, 582, 818, 646, { color: PAL.ink2, w: 2.5, head: 13, progress: S.p(1, 0.8, 7.8) });
          g.text('one generation', 842, 622, { size: 22, color: PAL.ink3, alpha: S.p(1, 0.7, 8.2) });
          g.text('inbreeding of the offspring', 800, 690, { size: 27, color: PAL.coral, alpha: S.p(1, 0.7, 8.4) });
        });

        // ---- beat 2: half siblings mate
        const vB = vis(S, 2, 3);
        if (vB > 0) g.withAlpha(vB, () => {
          const { N, SEX, al, tr, into, r, off } = D; const t2 = S.since(2);
          label(g, 'A half-sib mating', 150, 262);
          const cp = (k) => S.p(2, 1.0, 0.2 + k * 0.35);
          KIN.family(g, N.M1, N.S, [N.H1], { r, progress: cp(0), w: 2 }); KIN.family(g, N.S, N.M2, [N.H2], { r, progress: cp(0), w: 2 });
          KIN.family(g, N.H1, N.H2, [N.O], { r, progress: cp(1), w: 2 });
          // the loop
          const lp = S.p(2, 2.4, 0.6);
          const loop = [[N.S[0], N.S[1]], [N.H1[0], N.S[1]], [N.H1[0], N.H1[1]], [N.H2[0], N.H1[1]], [N.H2[0], N.S[1]], [N.S[0], N.S[1]]];
          g.poly(loop, { color: COL, w: 16, alpha: 0.13, progress: lp }); g.poly(loop, { color: COL, w: 2.5, alpha: 0.5, progress: lp });
          const fp = (o) => ease.inOut((t2 - o.start) / 1.9);
          for (const o of tr) if (o.focal) { const f = fp(o); if (f > 0) g.poly(o.path.pts, { color: COL, w: 3, alpha: 0.8, progress: f }); }
          const gen = { M1: 0, S: 0, M2: 0, H1: 1, H2: 1, O: 2 };
          for (const k in N) {
            const a = S.p(2, 0.7, gen[k] * 0.35); const [x, y] = N[k];
            KIN.person(g, x, y, { sex: SEX[k], r, color: k === 'O' ? PAL.ink : PAL.ink2, alpha: a, w: k === 'O' ? 2.8 : 2.2 });
            for (const s of [0, 1]) { const o = into[k + s]; const bx = x + (s ? off : -off); if (o && fp(o) < 1) slotRing(g, bx, y, 13, a); else bead(g, bx, y, al[k][s], { size: 14, alpha: a }); }
          }
          for (const o of tr) traveller(g, o.path, fp(o), o.col, o.focal ? 12 : 9, o.focal ? 1 : 0.7);
          g.math('S', N.S[0], N.S[1] - r - 16, { size: 30, align: 'center', alpha: S.p(2, 0.7, 0.4) });
          g.math('H_1', N.H1[0] - r - 12, N.H1[1] + 10, { size: 30, align: 'right', alpha: S.p(2, 0.7, 0.8) });
          g.math('H_2', N.H2[0] + r + 12, N.H2[1] + 10, { size: 30, alpha: S.p(2, 0.7, 0.8) });
          g.math('O', N.O[0] + r + 14, N.O[1] + 10, { size: 30, alpha: S.p(2, 0.7, 1.0) });
          const ap = S.p(2, 0.8, 5.8);
          ring(g, N.O[0], N.O[1], r + 9, PAL.coral, ap, 3);
          g.text('autozygous', N.O[0], N.O[1] + r + 46, { size: 23, color: PAL.coral, align: 'center', alpha: ap });
          // right: path count → kinship → inbreeding
          mathSeq(g, [['φ_{H_1 H_2}', PAL.lagoon], ['\\, = \\frac{1}{8}', PAL.ink]], 800, 400, { size: 56, alpha: S.p(2, 0.8, 3.4) });
          g.math('(\\frac{1}{2})^{3}(1 + F_S), \\; n = 3', 802, 476, { size: 30, color: PAL.ink2, alpha: S.p(2, 0.8, 4.2) });
          g.arrow(830, 520, 830, 580, { color: PAL.ink2, w: 2.5, head: 13, alpha: S.p(2, 0.6, 5.2), progress: S.p(2, 0.8, 5.2) });
          mathSeq(g, [['F_O', PAL.coral], ['\\, = \\frac{1}{8}', PAL.ink]], 800, 668, { size: 64, alpha: S.p(2, 0.8, 5.5) });
        });

        // ---- beat 3: self-kinship by drawing twice with replacement
        const vC = vis(S, 3, 4);
        if (vC > 0) g.withAlpha(vC, () => {
          const t3 = S.since(3); const P = [330, 450], RI = 92, BO3 = 38, BS3 = 27;
          label(g, 'Two draws from one individual', 150, 262);
          KIN.person(g, P[0], P[1], { sex: 'F', r: RI, color: PAL.ink, w: 2.8, label: 'i' });
          bead(g, P[0] - BO3, P[1], CREAM, { size: BS3, letter: '1' }); bead(g, P[0] + BO3, P[1], CREAM, { size: BS3, letter: '2' });
          const sl = [[255, 700], [405, 700]];
          sl.forEach(([x, y], k) => { slotRing(g, x, y, 30, 1); g.text(k ? '2nd draw' : '1st draw', x, y + 62, { size: 22, color: PAL.ink2, align: 'center' }); });
          g.text('with replacement', 330, 810, { size: 22, color: PAL.ink3, align: 'center', italic: true, alpha: S.p(3, 0.7, 1.6) });
          // three illustrative pairs: (2,1), then (1,1) "same allele", then (1,2) "both"
          const states = [[0.3, [1, 0]], [2.9, [0, 0]], [5.0, [0, 1]]];
          let si = -1; for (let k = 0; k < states.length; k++) if (t3 >= states[k][0]) si = k;
          if (si >= 0) {
            const [ts, pick] = states[si]; const nxt = states[si + 1]; const fadeOut = nxt ? 1 - clamp((t3 - (nxt[0] - 0.25)) / 0.25) : 1;
            pick.forEach((b, k) => {
              const f = ease.inOut((t3 - ts - k * 0.35) / 0.6); if (f <= 0) return;
              const sx = P[0] + (b ? BO3 : -BO3), sy = P[1], [tx, ty] = sl[k];
              const x = lerp(sx, tx, f), y = lerp(sy, ty, f) - Math.sin(Math.PI * f) * 40;
              if (f < 1) ring(g, sx, sy, BS3 + 7, PAL.ink, 1 - f, 2.5);
              bead(g, x, y, CREAM, { size: 22, letter: b ? '2' : '1', alpha: fadeOut });
            });
          }
          // the tree
          const root = [790, 520], up = [970, 400], lo = [970, 640];
          const bu = S.p(3, 0.8, 2.9), bl = S.p(3, 0.8, 5.0);
          const hot = si === 1 ? 'u' : si === 2 ? 'l' : '';
          g.dot(root[0], root[1], 6, PAL.ink2, Math.max(bu, 0), 2);
          g.line(root[0] + 8, root[1], up[0] - 46, up[1], { color: hot === 'u' ? COL : PAL.ink3, w: hot === 'u' ? 3.2 : 2, progress: bu });
          g.line(root[0] + 8, root[1], lo[0] - 46, lo[1], { color: hot === 'l' ? COL : PAL.ink3, w: hot === 'l' ? 3.2 : 2, progress: bl });
          g.math('\\frac{1}{2}', 860, 438, { size: 32, color: PAL.ink2, align: 'center', alpha: bu });
          g.math('\\frac{1}{2}', 860, 640, { size: 32, color: PAL.ink2, align: 'center', alpha: bl });
          bead(g, up[0] - 20, up[1], CREAM, { size: 16, letter: '1', alpha: bu }); bead(g, up[0] + 20, up[1], CREAM, { size: 16, letter: '1', alpha: bu });
          bead(g, lo[0] - 20, lo[1], CREAM, { size: 16, letter: '1', alpha: bl }); bead(g, lo[0] + 20, lo[1], CREAM, { size: 16, letter: '2', alpha: bl });
          g.text('same allele', up[0], up[1] - 36, { size: 22, color: PAL.ink2, align: 'center', alpha: bu });
          g.text('both alleles', lo[0], lo[1] + 52, { size: 22, color: PAL.ink2, align: 'center', alpha: bl });
          g.math('P(\\text{IBD}) = 1', 1030, up[1] + 11, { size: 32, alpha: S.p(3, 0.7, 3.6) });
          mathSeq(g, [['P(\\text{IBD}) = ', PAL.ink], ['F', PAL.coral]], 1030, lo[1] + 11, { size: 32, alpha: S.p(3, 0.7, 8.0) });
          mathSeq(g, [['φ_{ii} = \\frac{1}{2} \\cdot 1 + \\frac{1}{2} \\cdot F = ', PAL.ink], ['\\frac{1 + F}{2}', COL]], 772, 820, { size: 44, alpha: S.p(3, 0.9, 9.4) });
        });

        // ---- beat 4: the kinship matrix
        const vD = S.p(4, 0.8);
        if (vD > 0) g.withAlpha(vD, () => {
          const { ids, K, geno, SEX } = D; const t4 = S.since(4);
          const x0 = 246, y0 = 326, cs = 82, n = 6; const labs = ['M_1', 'S', 'M_2', 'H_1', 'H_2', 'O'];
          label(g, 'Kinship matrix · the half-sib pedigree', 150, 262);
          g.rect(x0, y0, cs * n, cs * n, { stroke: PAL.ink3, w: 1.5, r: 6, alpha: S.p(4, 0.8, 0.2) });
          for (let k = 0; k < n; k++) {
            const a = S.p(4, 0.6, 0.3 + k * 0.08); const id = ids[k];
            KIN.person(g, x0 + cs * (k + 0.5), y0 - 26, { sex: SEX[id], r: 12, w: 1.8, color: PAL.ink2, alpha: a });
            KIN.person(g, x0 - 26, y0 + cs * (k + 0.5), { sex: SEX[id], r: 12, w: 1.8, color: PAL.ink2, alpha: a });
            g.math(labs[k], x0 - 50, y0 + cs * (k + 0.5) + 10, { size: 26, color: PAL.ink2, align: 'right', alpha: a });
          }
          const pulseOff = S.p(4, 0.5, 2.2) * (1 - S.p(4, 0.6, 4.4)), pulseDia = S.p(4, 0.5, 4.6) * (1 - S.p(4, 0.6, 6.4));
          const both = S.p(4, 0.6, 9.3);
          for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
            const dg = i === j; const v = K[i][j];
            const a = dg ? S.p(4, 0.6, 4.6 + i * 0.13) : S.p(4, 0.6, 2.2 + (Math.abs(i - j) - 1) * 0.42);
            if (a <= 0) continue;
            const x = x0 + j * cs, y = y0 + i * cs; const col = dg ? PAL.coral : PAL.lagoon;
            const fill = dg ? 0.32 + 0.9 * (v - 0.5) * 8 : 0.07 + 0.62 * v / 0.3125;
            g.rect(x + 3, y + 3, cs - 6, cs - 6, { fill: U.rgba(col, clamp(fill, 0, 0.9) * a), r: 5 });
            const pu = dg ? pulseDia : pulseOff;
            if ((pu > 0 || both > 0) && v > 0) g.rect(x + 3, y + 3, cs - 6, cs - 6, { stroke: col, w: 2, r: 5, alpha: Math.max(pu, both * (0.45 + 0.35 * Math.sin(t * 3 + i + j))) * a });
            g.math(frac(v), x + cs / 2, y + cs / 2 + (v ? 10 : 9), { size: v ? 26 : 26, color: v ? PAL.ink : PAL.ink3, align: 'center', alpha: a });
          }
          // legend
          const l1 = S.p(4, 0.7, 2.4), l2 = S.p(4, 0.7, 4.6);
          g.rect(800, 362, 26, 26, { fill: U.rgba(PAL.lagoon, 0.7), r: 4, alpha: l1 });
          g.text('pairwise kinship', 842, 384, { size: 27, color: PAL.ink, alpha: l1 });
          g.math('φ_{ij}', 1052, 386, { size: 38, color: PAL.lagoon, alpha: l1 });
          g.text('off-diagonal', 842, 418, { size: 22, color: PAL.ink3, alpha: l1 });
          g.rect(800, 478, 26, 26, { fill: U.rgba(PAL.coral, 0.7), r: 4, alpha: l2 });
          g.text('inbreeding', 842, 500, { size: 27, color: PAL.ink, alpha: l2 });
          g.math('\\frac{1 + F_i}{2}', 980, 504, { size: 38, color: PAL.coral, alpha: l2 });
          g.text('diagonal', 842, 548, { size: 22, color: PAL.ink3, alpha: l2 });
          // the same genotypes feed both
          const ga = S.p(4, 0.8, 6.3);
          if (ga > 0) g.withAlpha(ga, () => {
            label(g, 'Genotypes · 20 SNPs', 820, 618);
            for (let i = 0; i < n; i++) for (let l = 0; l < 20; l++) {
              const x = 830 + l * 22.5, y = 650 + i * 24; const d = geno[i][l]; const p = clamp((t4 - 6.3) * 4 - l * 0.08);
              if (d === 0) g.circle(x, y, 5, { stroke: PAL.ink3, w: 1.3, alpha: p }); else g.dot(x, y, d === 2 ? 6.5 : 4.5, CREAM, p * (d === 2 ? 1 : 0.6), 1.8);
            }
            g.arrow(812, 712, x0 + cs * n + 12, 712, { color: COL, w: 3, head: 14, progress: S.p(4, 0.8, 7.0) });
          });
          g.text('one matrix, one estimation', 1050, 878, { size: 38, role: 'display', italic: true, color: COL, align: 'center', alpha: S.p(4, 0.9, 9.3) });
          if (both > 0) g.glow(x0 + cs * 3, y0 + cs * 3, 330, COL, 0.08 * both);
        });
      },
    },
    /* ================================================================ ibd-r */
    {
      id: 'ibd-r', title: 'Relatedness, rescaled',
      beats: [
        { t: 'Relatedness, r, is the scale most ecologists report. For outbred individuals it is simply twice the kinship: one half for parent and offspring and for full siblings, one quarter for half siblings, one eighth for first cousins.' },
        { t: 'Those tidy values hold only when nobody is inbred. Wright\'s definition allows for inbreeding: r equals 2φ, divided by the square root of (1 + F_i)(1 + F_j).',
          s: 'Those tidy values hold only when nobody is inbred. Wright\'s definition allows for inbreeding: r equals two phi, divided by the square root of one plus F i, times one plus F j.' },
        { t: 'If the parents of a sibship are themselves related, the siblings share more than the textbook half. A correct estimator should report relatedness above one half, and that is not a bias.' },
        { t: 'Much of the confusion behind our puzzle comes from treating one half and one quarter as fixed facts. They are expectations for one special case: an outbred pedigree.', pause: 0.8 },
      ],
      terms: [
        { beat: 0.2, term: 'Relatedness (r)', def: 'Wright\'s coefficient of relationship: r = 2φ / √((1 + F_i)(1 + F_j)); equals 2φ for outbred individuals.' },
      ],
      init() {
        // Realized relatedness: gene-drop whole genomes (20 chromosomes × 1.5 Morgans, Haldane crossovers)
        // through each pedigree and measure the realized kinship of the focal pair; r = 2φ (outbred).
        const R = rng(2026); const NC = 20, CL = 1.5, G = 120, NP = NC * G;
        const poisson = (lam) => { const L = Math.exp(-lam); let k = 0, p = 1; do { k++; p *= R(); } while (p > L); return k - 1; };
        let lab = 0; const founder = () => [new Int16Array(NP).fill(lab++), new Int16Array(NP).fill(lab++)];
        const gamete = (ind) => {
          const out = new Int16Array(NP);
          for (let c = 0; c < NC; c++) {
            const nx = poisson(CL); const xs = []; for (let k = 0; k < nx; k++) xs.push(R() * G); xs.sort((a, b) => a - b);
            let h = R() < 0.5 ? 0 : 1, xi = 0;
            for (let q = 0; q < G; q++) { while (xi < xs.length && xs[xi] <= q + 0.5) { h ^= 1; xi++; } out[c * G + q] = ind[h][c * G + q]; }
          }
          return out;
        };
        const kid = (f, m) => [gamete(f), gamete(m)];
        const phi = (a, b) => { let s = 0; for (let q = 0; q < NP; q++) s += (a[0][q] === b[0][q]) + (a[0][q] === b[1][q]) + (a[1][q] === b[0][q]) + (a[1][q] === b[1][q]); return s / (4 * NP); };
        const sims = {
          PO: () => { const A = founder(), B = founder(); return [A, kid(A, B)]; },
          FS: () => { const A = founder(), B = founder(); return [kid(A, B), kid(A, B)]; },
          HS: () => { const A = founder(), B = founder(), E = founder(); return [kid(A, B), kid(A, E)]; },
          AV: () => { const A = founder(), B = founder(), E = founder(); const C = kid(A, B), D2 = kid(A, B); return [C, kid(D2, E)]; },
          GP: () => { const A = founder(), B = founder(), E = founder(); return [A, kid(kid(A, B), E)]; },
          C1: () => { const A = founder(), B = founder(), E = founder(), H = founder(); return [kid(kid(A, B), E), kid(kid(A, B), H)]; },
        };
        const NR = 36; const real = {};
        for (const k in sims) { real[k] = []; for (let n = 0; n < NR; n++) { lab = 0; const [a, b] = sims[k](); real[k].push(2 * phi(a, b)); } }
        real.U = Array(NR).fill(0);
        const rng2 = {}; for (const k in real) rng2[k] = [Math.min(...real[k]), Math.max(...real[k])];
        const jit = Array.from({ length: NR }, () => (R() - 0.5) * 2);
        return { real, jit, NR, rng2 };
      },
      draw(g, t, S, D) {
        const { real, jit, NR } = D;
        const cats = [['PO', 'PO', 0.5, 6.6], ['FS', 'FS', 0.5, 8.1], ['HS', 'HS', 0.25, 9.2], ['AV', 'avuncular', 0.25, 9.5], ['GP', 'GP', 0.25, 9.8], ['C1', 'cousins', 0.125, 10.6], ['U', 'unrelated', 0, 11.3]];
        const A = { x: 180, y: 330, w: 650, h: 470 }; const ymax = 0.7;
        const Y = (v) => A.y + A.h - v / ymax * A.h; const slot = A.w / cats.length; const CX = (k) => A.x + (k + 0.5) * slot; const bw = 50;
        // ---- axes
        const ax = S.p(0, 1.0, 0.3);
        g.withAlpha(ax, () => {
          g.arrow(A.x, A.y + A.h, A.x, A.y - 14, { color: PAL.ink2, w: 2.2, head: 13 });
          g.line(A.x, A.y + A.h, A.x + A.w, A.y + A.h, { color: PAL.ink2, w: 2.2 });
          g.math('r', A.x - 16, A.y - 6, { size: 34, align: 'right' });
          [[0, '0'], [0.125, '⅛'], [0.25, '¼'], [0.5, '½']].forEach(([v, s]) => { g.line(A.x - 8, Y(v), A.x, Y(v), { color: PAL.ink2, w: 1.6 }); g.text(s, A.x - 16, Y(v) + 8, { size: 23, color: PAL.ink3, align: 'right' }); });
        });
        mathSeq(g, [['r = 2', PAL.ink], ['φ', PAL.lagoon]], 880, 400, { size: 64, alpha: S.p(0, 0.8, 5.3) * (1 - S.p(1, 0.6, 3.0)) });
        g.text('outbred individuals', 884, 456, { size: 24, color: PAL.ink2, alpha: S.p(0, 0.8, 6.0) * (1 - S.p(1, 0.6, 3.0)) });
        // tidy reference lines
        const hl = S.p(0, 0.8, 6.6), ql = S.p(0, 0.8, 9.2);
        g.line(A.x, Y(0.5), A.x + A.w, Y(0.5), { color: PAL.ink3, w: 1.4, dash: [6, 8], alpha: hl * 0.9 });
        g.line(A.x, Y(0.25), A.x + A.w, Y(0.25), { color: PAL.ink3, w: 1.4, dash: [6, 8], alpha: ql * 0.9 });
        // parental kinship dial (beat 2), released in beat 3
        const f = 0.25 * S.io(2, 3.2, 1.0) * (1 - S.io(3, 1.2, 0.2));
        const rFS = (ff) => (1 + 2 * ff) / (2 * (1 + ff));
        const focus = S.p(2, 0.8, 0.4) * (1 - S.p(3, 0.8, 0.2));
        // beat 3 realized spread
        const w3 = S.p(3, 0.9, 0.5); const u3 = Math.max(0, S.since(3) - 0.5) * 2.2;
        cats.forEach(([key, name, rv, d], k) => {
          const p = ease.out((S.since(0) - d) / 1.3) * ax; const cx = CX(k);
          const dim = k === 1 ? 1 : 1 - 0.65 * focus;
          g.text(name, cx, A.y + A.h + 36, { size: 22, color: PAL.ink2, align: 'center', alpha: ax * (0.35 + 0.65 * clamp((S.since(0) - d + 0.6) / 0.6)) * dim });
          let h = rv;
          if (k === 1) h = rFS(f);
          if (w3 > 0 && real[key]) { const vals = real[key]; const i0 = Math.floor(u3) % NR, i1 = (i0 + 1) % NR; const wv = lerp(vals[i0], vals[i1], ease.inOut(u3 - Math.floor(u3))); h = lerp(h, wv, w3); }
          const hh = h * p;
          g.withAlpha(dim, () => {
            if (rv > 0) {
              const half = Math.min(hh, rv / 2), top = hh;
              g.rect(cx - bw / 2, Y(half), bw, Y(0) - Y(half), { fill: U.rgba(PAL.lagoon, 0.85 * (1 - 0.45 * w3)) });
              if (top > rv / 2) g.rect(cx - bw / 2, Y(Math.min(top, rv)), bw, Y(rv / 2) - Y(Math.min(top, rv)), { fill: U.rgba(PAL.lagoon, 0.5 * (1 - 0.45 * w3)) });
              if (top > rv) { const ec = U.mix(COL, PAL.lagoon, w3); g.rect(cx - bw / 2, Y(top), bw, Y(rv) - Y(top), { fill: U.rgba(ec, 0.9 - 0.45 * w3) }); g.glow(cx, Y(top), 40, COL, 0.3 * (1 - w3)); }
              if (top >= rv / 2) g.line(cx - bw / 2, Y(rv / 2), cx + bw / 2, Y(rv / 2), { color: PAL.bg, w: 2, alpha: 0.8 });
              const pa = clamp((S.since(0) - d - 0.6) / 0.5) * (1 - w3);
              if (Y(0) - Y(rv / 2) > 34) { g.math('φ', cx, (Y(0) + Y(rv / 2)) / 2 + 9, { size: 26, color: PAL.bg, align: 'center', alpha: pa * 0.85 }); g.math('φ', cx, (Y(rv / 2) + Y(rv)) / 2 + 9, { size: 26, color: PAL.bg, align: 'center', alpha: pa * 0.85 }); }
              // expected value marker (beat 3)
              g.line(cx - bw / 2 - 10, Y(rv), cx + bw / 2 + 10, Y(rv), { color: PAL.ink, w: 2.4, alpha: w3 });
            } else {
              g.dot(cx, Y(0), 6, PAL.lagoon, p, 2.4);
            }
            // value label
            const vl = clamp((S.since(0) - d - 0.5) / 0.5) * ax * (1 - w3);
            if (k === 1 && f > 0.002) g.text(rFS(f).toFixed(2), cx, Y(h) - 18, { size: 26, role: 'mono', color: COL, align: 'center', alpha: vl });
            else g.math(rv === 0 ? '0' : rv === 0.5 ? '\\frac{1}{2}' : rv === 0.25 ? '\\frac{1}{4}' : '\\frac{1}{8}', cx, Y(rv) - (rv ? 22 : 18), { size: 28, color: PAL.ink, align: 'center', alpha: vl });
            // realized dots
            if (w3 > 0 && real[key]) real[key].forEach((v, n) => { const a = clamp((S.since(3) - 0.5 - n * 0.06) / 0.4) * w3; if (a > 0) g.dot(cx + jit[n] * 22, Y(v), 3.6, PAL.ink, a * 0.85, 1.8); });
          });
        });
        // beat 1: only when nobody is inbred
        g.pill('nobody inbred: F = 0', 880, 300, { size: 22, color: PAL.ink2, alpha: S.p(1, 0.8, 0.5) * (1 - S.p(1, 0.6, 3.0)) });
        // ---- right panel: Wright's formula
        const wa = S.p(1, 0.9, 3.2);
        const hn = S.p(1, 0.6, 5.4), hd = S.p(1, 0.6, 7.3);
        wright(g, 880, 392, 46, { alpha: wa, hn: hn * (1 - S.p(2, 0.6)), hd: hd * (1 - S.p(2, 0.6)) });
        const oc = U.mix(PAL.ink2, PAL.ochre, S.p(3, 0.8, 4.6));
        g.math('F_i = F_j = 0 \\; \\to \\; r = 2φ', 884, 540, { size: 36, color: oc, alpha: S.p(1, 0.8, 9.0) * (1 - S.p(2, 0.6)) + S.p(3, 0.8, 4.6) });
        // ---- beat 2: related parents → full sibs above one half
        const v2 = S.p(2, 0.8, 0.3) * (1 - S.p(3, 0.8, 0.3));
        if (v2 > 0) g.withAlpha(v2, () => {
          // mini pedigree: related parents (kinship f), two full sibs
          const pa = [912, 520], pb = [1000, 520], ka = [930, 600], kb = [982, 600];
          KIN.family(g, pa, pb, [ka, kb], { r: 14, w: 1.6, color: PAL.ink2 });
          KIN.person(g, pa[0], pa[1], { sex: 'M', r: 14, w: 1.8 }); KIN.person(g, pb[0], pb[1], { sex: 'F', r: 14, w: 1.8 });
          KIN.person(g, ka[0], ka[1], { sex: 'M', r: 14, w: 1.8, color: COL }); KIN.person(g, kb[0], kb[1], { sex: 'F', r: 14, w: 1.8, color: COL });
          const arc = []; for (let k = 0; k <= 24; k++) { const u = k / 24; arc.push([lerp(pa[0], pb[0], u), pa[1] - 18 - Math.sin(Math.PI * u) * 26]); }
          g.poly(arc, { color: PAL.lagoon, w: 2.2, dash: [5, 5] });
          g.math('f', (pa[0] + pb[0]) / 2, pa[1] - 52, { size: 28, color: PAL.lagoon, align: 'center' });
          g.text('related parents', 1030, 548, { size: 22, color: PAL.ink2 });
          g.text('f = ' + f.toFixed(3), 1030, 584, { size: 22, role: 'mono', color: PAL.lagoon });
          const B = g.axes({ x: 940, y: 650, w: 330, h: 170, xmin: 0, xmax: 0.27, ymin: 0.45, ymax: 0.65, xlab: 'f', ylab: 'r_{FS}', labSize: 22, tickSize: 20, progress: S.p(2, 1, 0.4),
            xticks: [{ v: 0, l: '0' }, { v: 0.125, l: '⅛' }, { v: 0.25, l: '¼' }], yticks: [{ v: 0.5, l: '½' }, { v: 0.6, l: '0.6' }] });
          g.line(B.X(0), B.Y(0.5), B.X(0.27), B.Y(0.5), { color: PAL.ink3, w: 1.5, dash: [6, 6] });
          g.plot(B, rFS, { from: 0, to: Math.max(1e-4, f), color: COL, w: 3.5 });
          g.dot(B.X(f), B.Y(rFS(f)), 6.5, COL, 1, 3);
        });
        g.pill('not a bias', CX(2) - 40, 372, { size: 23, color: PAL.moss, alpha: S.p(2, 0.8, 6.6) * (1 - S.p(3, 0.6)) });
        g.text('r > ½', CX(1) + 44, 420, { size: 26, weight: 600, color: COL, alpha: S.p(2, 0.8, 5.0) * (1 - S.p(3, 0.6)) });
        // ---- beat 3: the stamp
        const st = S.p(3, 0.5, 4.4);
        if (st > 0) g.with(() => {
          const sc = lerp(1.5, 1, ease.outBack(clamp((S.since(3) - 4.4) / 0.5)));
          g.ctx.translate(590, 372); g.ctx.rotate(-0.1); g.ctx.scale(sc, sc);
          g.rect(-190, -30, 380, 60, { stroke: PAL.ochre, w: 3, r: 8, alpha: st, fill: 'rgba(11,22,24,0.55)' });
          g.text('EXPECTED · OUTBRED', 0, 11, { size: 30, weight: 700, ls: 4, color: PAL.ochre, align: 'center', alpha: st });
        });
        // realized ranges from the simulated genomes
        const ta = S.p(3, 0.8, 5.6);
        if (ta > 0) g.withAlpha(ta, () => {
          label(g, 'Realized r · 36 simulated pairs', 884, 640);
          [['PO', 'parent–offspring', '½'], ['FS', 'full sibs', '½'], ['HS', 'half sibs', '¼'], ['C1', 'cousins', '⅛']].forEach(([k, nm, ex], n) => {
            const y = 690 + n * 46, a = S.p(3, 0.6, 5.8 + n * 0.25); const [lo, hi] = D.rng2[k];
            g.text(nm, 884, y, { size: 23, color: PAL.ink2, alpha: a });
            g.text(ex, 1084, y, { size: 24, color: PAL.ink, align: 'center', alpha: a });
            g.text(lo === hi ? lo.toFixed(2) : lo.toFixed(2) + ' – ' + hi.toFixed(2), 1150, y, { size: 22, role: 'mono', color: lo === hi ? PAL.ink2 : PAL.ink, alpha: a });
          });
        });
        g.text('dots: simulated genomes, 36 pairs each', A.x + A.w, 880, { size: 17, color: PAL.ink3, align: 'right', alpha: S.p(3, 0.8, 1.6) });
      },
    },
  ],
});

// Path-counting overlay on the cousin pedigree (ibd-kinship, beat 3).
function drawPaths(g, S, P, M, T) {
  const at = (id) => M(P.P[id].x, P.P[id].y); const r = PR * T.s;
  const seqs = [['I', 'P1', 'GF', 'P2', 'J'], ['I', 'P1', 'GM', 'P2', 'J']];
  [0, 1].forEach((k) => {
    const p = S.p(3, 1.8, 1.0 + k * 1.2); if (p <= 0) return;
    const rs = P.routes.filter((R) => R.k === k); const toI = rs.find((R) => R.pts[R.pts.length - 1][0] === P.P.I.x), toJ = rs.find((R) => R !== toI);
    const sh = k ? 4 : -4; const pts = [...toI.pts.slice().reverse(), ...toJ.pts.slice(1)].map(([x, y]) => { const q = M(x, y); return [q[0] + sh, q[1] + sh]; });
    g.poly(pts, { color: FC[k], w: 12, alpha: 0.14, progress: p }); g.poly(pts, { color: FC[k], w: 3.4, alpha: 0.95, progress: p });
  });
  // redraw glyphs on top of the path lines
  for (const id in P.P) { const [x, y] = at(id); const ij = id === P.i || id === P.j; const ak = P.anc.indexOf(id); KIN.person(g, x, y, { sex: P.P[id].sex, r, color: ij ? PAL.ink : PAL.ink2, w: ij ? 2.8 : 2, glow: ak >= 0 ? FC[ak] : null, alpha: S.p(3, 0.6, 1.0) }); }
  const la = S.p(3, 0.7, 2.4);
  ['GF', 'GM'].forEach((id, k) => { const [x, y] = at(id); g.math(k ? 'A_2' : 'A_1', x, y - r - 14, { size: 30, color: FC[k], align: 'center', alpha: la }); });
  // count the individuals along the first path
  seqs[0].forEach((id, n) => {
    const a = S.p(3, 0.5, 3.4 + n * 0.45); if (a <= 0) return; const [x, y] = at(id);
    const bx = x - r - 8, by = y + r + 8; g.circle(bx, by, 15, { fill: FC[0], alpha: a }); g.text(String(n + 1), bx, by + 7, { size: 20, weight: 700, color: PAL.bg, align: 'center', alpha: a });
  });
  // F_A: the ancestor's own inbreeding
  const fa = S.p(3, 0.7, 8.8);
  ['GF', 'GM'].forEach((id) => { const [x, y] = at(id); ring(g, x, y, r + 10, PAL.coral, fa, 2.5); });
  if (fa > 0) { const [x, y] = at('GM'); g.math('F_A = 0', x + r + 22, y + 10, { size: 28, color: PAL.coral, alpha: fa }); }
}
})();
