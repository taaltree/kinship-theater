/* Chapter III — Reading relationships. */
(function () {
const { PAL, U, Theater } = window; const { clamp, lerp, ease, rng, gauss } = U;
const COL = PAL.lagoon;

/* ------------------------------------------------------------------ helpers */
const label = KIN.label;
const vis = KIN.vis;
// Sentence-anchored timing: local time at fraction f of sentence j in beat k (robust to narration length).
const sent = (S, k, j, f = 0) => { const B = S.scene.timing.beats[k]; if (!B) return S.dur; const q = B.sents[Math.min(j, B.sents.length - 1)]; return lerp(q.start, q.end, f); };
const P = (S, k, j, f = 0, d = 0.8) => S.tp(sent(S, k, j, f), d);
// in at local time t0, out at t1
const tw = (t, t0, t1, d = 0.6) => ease.out((t - t0) / d) * (t1 === undefined ? 1 : 1 - ease.inOut((t - t1) / 0.5));
const FR = (v) => ({ 0: '0', 0.125: '⅛', 0.25: '¼', 0.5: '½', 0.75: '¾', 1: '1' })[v] ?? String(v);
const tag = (g, s, x, y, a = 1, align = 'left') => g.text(s, x, y, { size: 17, color: PAL.ink3, alpha: a, align, italic: true });
// Pre-rendered luminous dot for fast blitting.
function makeSprite(color, r, halo = 2.2) {
  const R = Math.ceil(r * halo) + 1, c = Theater.makeCanvas(2 * R, 2 * R);
  Theater.makeG(c.getContext('2d')).dot(R, R, r, color, 1, halo);
  return { c, R };
}
function blit(ctx, sp, x, y, a) { if (a <= 0) return; const b = ctx.globalAlpha; ctx.globalAlpha = b * a; ctx.drawImage(sp.c, x - sp.R, y - sp.R); ctx.globalAlpha = b; }

/* Genotype likelihoods for an outbred pair at a biallelic locus: P(gi, gj | z IBD), z = 0, 1, 2. */
const gp = (x, q) => (x === 0 ? (1 - q) * (1 - q) : x === 1 ? 2 * q * (1 - q) : q * q);
function pairLik(q) {
  const o = [];
  for (let xi = 0; xi < 3; xi++) for (let xj = 0; xj < 3; xj++) {
    const ta = xi === 0 ? [0, 0] : xi === 2 ? [1, 1] : [0, 1]; let s = 0;
    for (const tt of ta) { const nj = xj - tt; if (nj === 0) s += 0.5 * (1 - q); else if (nj === 1) s += 0.5 * q; }
    o.push([gp(xi, q) * gp(xj, q), gp(xi, q) * s, xi === xj ? gp(xi, q) : 0]);
  }
  return o;
}
// EM maximum-likelihood (k0, k1, k2) from per-locus genotype-pair codes (xi*3 + xj).
function emK(codes, T, iters = 120) {
  let k = [0.4, 0.4, 0.2]; const L = codes.length;
  for (let it = 0; it < iters; it++) {
    let n0 = 0, n1 = 0, n2 = 0;
    for (let l = 0; l < L; l++) { const v = T[l][codes[l]]; const w0 = k[0] * v[0], w1 = k[1] * v[1], w2 = k[2] * v[2]; const s = w0 + w1 + w2; n0 += w0 / s; n1 += w1 / s; n2 += w2 / s; }
    k = [n0 / L, n1 / L, n2 / L];
  }
  return k;
}

/* Chromosomes as lists of [a, b, label] pieces (Morgans). Meiosis: exponential crossover spacing (Haldane). */
function meiosis(h1, h2, L, r) {
  const xs = []; let x = -Math.log(1 - r()); while (x < L) { xs.push(x); x += -Math.log(1 - r()); }
  let cur = r() < 0.5 ? 0 : 1, a = 0; const out = [];
  for (const b of [...xs, L]) { for (const s of (cur ? h2 : h1)) { const lo = Math.max(a, s[0]), hi = Math.min(b, s[1]); if (hi > lo) out.push([lo, hi, s[2]]); } a = b; cur = 1 - cur; }
  const m = []; for (const s of out) { const l = m[m.length - 1]; if (l && l[2] === s[2] && Math.abs(l[1] - s[0]) < 1e-12) l[1] = s[1]; else m.push(s.slice()); }
  return { h: m, xs };
}
const labAt = (h, x) => { for (const s of h) if (x >= s[0] && x < s[1]) return s[2]; return -1; };
// IBD count (0, 1, 2) along a chromosome between individuals I and J (each a pair of haplotypes).
function ibdTrack(I, J, L) {
  const bp = new Set([0, L]); for (const h of [...I, ...J]) for (const s of h) { bp.add(s[0]); bp.add(s[1]); }
  const b = [...bp].sort((x, y) => x - y); const o = [];
  for (let k = 0; k < b.length - 1; k++) {
    const m = (b[k] + b[k + 1]) / 2; const li = I.map((h) => labAt(h, m)); const used = [false, false]; let c = 0;
    for (const h of J) { const lj = labAt(h, m); for (let q = 0; q < 2; q++) if (!used[q] && li[q] === lj) { used[q] = true; c++; break; } }
    const l = o[o.length - 1]; if (l && l[2] === c) l[1] = b[k + 1]; else o.push([b[k], b[k + 1], c]);
  }
  return o;
}

/* An allele-pair glyph for one locus: individual i (left) and j (right), two beads each; IBD beads share a
   colour and are joined. z = number of alleles shared IBD (outbred). */
function pairGlyph(g, x, y, s, z, a, la = 1) {
  if (a <= 0) return; const F = KIN.FOUNDER;
  const ci = [F[0], F[1]], cj = z === 0 ? [F[3], F[4]] : z === 1 ? [F[0], F[4]] : [F[0], F[1]];
  const dx = 40 * s, dy = 19 * s, br = 9 * s;
  g.withAlpha(a, () => {
    for (const sx of [-1, 1]) g.rect(x + sx * dx - 17 * s, y - dy - 17 * s, 34 * s, 2 * dy + 34 * s, { stroke: PAL.rule, w: 1.5, r: 17 * s });
    for (let k = 0; k < z; k++) g.line(x - dx + br, y + (k ? dy : -dy), x + dx - br, y + (k ? dy : -dy), { color: ci[k], w: 2.4 * Math.max(1, s * 0.8), alpha: 0.85 });
    ci.forEach((c, k) => g.dot(x - dx, y + (k ? dy : -dy), br, c, 1, 2));
    cj.forEach((c, k) => g.dot(x + dx, y + (k ? dy : -dy), br, c, 1, 2));
    g.math('i', x - dx, y - dy - 28 * s, { size: 30, color: PAL.ink2, align: 'center', alpha: la });
    g.math('j', x + dx, y - dy - 28 * s, { size: 30, color: PAL.ink2, align: 'center', alpha: la });
  });
}
// Tiny pedigrees for the three second-degree relationships; the focal pair is drawn in mint.
function miniPed(g, type, cx, cy, a) {
  const r = 11, o = { r, w: 1.6 }, hi = { sex: 'U', r, color: PAL.mint, fill: U.rgba(PAL.mint, 0.25), w: 2.2 };
  const P = (x, y, sex, f) => KIN.person(g, x, y, f ? { ...hi, sex } : { sex, r, color: PAL.ink3, w: 1.6 });
  g.withAlpha(a, () => {
    if (type === 0) { // half sibs: shared father, two mothers
      const y0 = cy, y1 = cy + 92;
      KIN.family(g, [cx - 44, y0], [cx, y0], [[cx - 30, y1]], o); KIN.family(g, [cx, y0], [cx + 44, y0], [[cx + 30, y1]], o);
      P(cx - 44, y0, 'F'); P(cx, y0, 'M'); P(cx + 44, y0, 'F'); P(cx - 30, y1, 'F', 1); P(cx + 30, y1, 'M', 1);
    } else if (type === 1) { // aunt–nephew
      const y0 = cy, y1 = cy + 62, y2 = cy + 124;
      KIN.family(g, [cx - 22, y0], [cx + 22, y0], [[cx - 30, y1], [cx + 22, y1]], o);
      KIN.family(g, [cx + 22, y1], [cx + 62, y1], [[cx + 42, y2]], o);
      P(cx - 22, y0, 'M'); P(cx + 22, y0, 'F'); P(cx - 30, y1, 'F', 1); P(cx + 22, y1, 'M'); P(cx + 62, y1, 'F'); P(cx + 42, y2, 'M', 1);
    } else { // grandparent–grandchild
      const y0 = cy, y1 = cy + 62, y2 = cy + 124;
      KIN.family(g, [cx - 22, y0], [cx + 22, y0], [[cx, y1]], o); KIN.family(g, [cx, y1], [cx + 40, y1], [[cx + 20, y2]], o);
      P(cx - 22, y0, 'F', 1); P(cx + 22, y0, 'M'); P(cx, y1, 'F'); P(cx + 40, y1, 'M'); P(cx + 20, y2, 'M', 1);
    }
  });
}

/* Jacquard identity states. An identity pattern is a class vector over the four alleles [i1, i2, j1, j2];
   alleles in the same class are IBD. The 15 set partitions collapse to Jacquard's 9 condensed states. */
function jState(c) {
  const ai = c[0] === c[1], bj = c[2] === c[3];
  if (ai && bj) return c[0] === c[2] ? 1 : 2;
  if (ai) return (c[2] === c[0] || c[3] === c[0]) ? 3 : 4;
  if (bj) return (c[0] === c[2] || c[1] === c[2]) ? 5 : 6;
  const m = (c[0] === c[2]) + (c[0] === c[3]) + (c[1] === c[2]) + (c[1] === c[3]);
  return m === 2 ? 7 : m === 1 ? 8 : 9;
}
// Canonical representative of each state (standard figure: i on top, j below).
const JQ = [[0, 0, 0, 0], [0, 0, 1, 1], [0, 0, 0, 1], [0, 0, 1, 2], [0, 1, 0, 0], [0, 1, 2, 2], [0, 1, 0, 1], [0, 1, 0, 2], [0, 1, 2, 3]];
// Kinship weight of a state = fraction of the four cross pairs (i_a, j_b) that are IBD → 1, 0, ½, 0, ½, 0, ½, ¼, 0.
const jWeight = (c) => { let n = 0; for (const a of [0, 1]) for (const b of [2, 3]) if (c[a] === c[b]) n++; return n / 4; };
const JCOL = [PAL.heather, PAL.ochre, PAL.mint, PAL.coral];
// Minimal edge set joining IBD alleles: within-individual (coral), verticals, then diagonals only if still unjoined.
function jEdges(c) {
  const par = [0, 1, 2, 3], f = (x) => (par[x] === x ? x : (par[x] = f(par[x]))); const out = [];
  for (const [p, q] of [[0, 1], [2, 3], [0, 2], [1, 3], [0, 3], [1, 2]]) if (c[p] === c[q] && f(p) !== f(q)) { par[f(p)] = f(q); out.push([p, q]); }
  return out;
}
function jqDraw(g, c, x, y, s, a, o = {}) {
  if (a <= 0) return; const dx = 34 * s, dy = 30 * s, br = 9.5 * s; const pr = o.progress ?? 1;
  const pos = [[x - dx, y - dy], [x + dx, y - dy], [x - dx, y + dy], [x + dx, y + dy]]; const E = jEdges(c);
  g.withAlpha(a, () => {
    E.forEach(([p, q], n) => { const within = (p === 0 && q === 1) || (p === 2 && q === 3); g.line(pos[p][0], pos[p][1], pos[q][0], pos[q][1], { color: within ? PAL.coral : COL, w: Math.max(2, 3 * s), progress: clamp(pr * (E.length + 1) - n - 0.7), alpha: 0.95 }); });
    pos.forEach(([px, py], n) => g.dot(px, py, br, o.mono ? PAL.ink2 : JCOL[c[n]], clamp(pr * 3), 1.9));
  });
}

/* Gene dropping through a pedigree [[id, father, mother], ...] (founders have no parents). */
function dropGenos(ped, q, r) {
  const G = {}; const L = q.length;
  for (const [id, fa, mo] of ped) {
    const a = new Int8Array(L), b = new Int8Array(L);
    if (fa == null) for (let l = 0; l < L; l++) { a[l] = r() < q[l] ? 1 : 0; b[l] = r() < q[l] ? 1 : 0; }
    else { const F = G[fa], M = G[mo]; for (let l = 0; l < L; l++) { a[l] = r() < 0.5 ? F[0][l] : F[1][l]; b[l] = r() < 0.5 ? M[0][l] : M[1][l]; } }
    G[id] = [a, b];
  }
  return G;
}
function dropLabels(ped, r) { let n = 0; const G = {}; for (const [id, fa, mo] of ped) G[id] = fa == null ? [n++, n++] : [G[fa][r() < 0.5 ? 0 : 1], G[mo][r() < 0.5 ? 0 : 1]]; return G; }
// Exact kinship by the tabular method (pedigree listed parents-first).
function kinship(ped, i, j) {
  const ids = ped.map((p) => p[0]), idx = Object.fromEntries(ids.map((s, k) => [s, k])); const n = ids.length;
  const K = Array.from({ length: n }, () => new Float64Array(n));
  for (let a = 0; a < n; a++) {
    const [, fa, mo] = ped[a];
    for (let b = 0; b < a; b++) { const v = fa == null ? 0 : 0.5 * (K[idx[fa]][b] + K[idx[mo]][b]); K[a][b] = K[b][a] = v; }
    K[a][a] = 0.5 * (1 + (fa == null ? 0 : K[idx[fa]][idx[mo]]));
  }
  return K[idx[i]][idx[j]];
}
// The two inbred pedigrees of rel-jacquard; focal pair (i, j) highlighted. kind 0: inbred half sibs, 1: inbred PO.
function inbredPed(g, kind, cx, cy, a) {
  const r = 13, o = { r, w: 1.6 };
  const N = (x, y, sex, f, inb) => KIN.person(g, x, y, f ? { sex, r, color: f, fill: U.rgba(f, 0.22), w: 2.4, inbred: inb } : { sex, r, color: PAL.ink3, w: 1.6 });
  g.withAlpha(a, () => {
    if (kind === 0) {
      const y0 = cy - 70, y1 = cy, y2 = cy + 70;
      KIN.family(g, [cx - 26, y0], [cx + 26, y0], [[cx - 64, y1], [cx, y1], [cx + 64, y1]], o);
      KIN.family(g, [cx - 64, y1], [cx, y1], [[cx - 32, y2]], o); KIN.family(g, [cx, y1], [cx + 64, y1], [[cx + 32, y2]], o);
      N(cx - 26, y0, 'M'); N(cx + 26, y0, 'F'); N(cx - 64, y1, 'F'); N(cx, y1, 'M'); N(cx + 64, y1, 'F');
      N(cx - 32, y2, 'U', PAL.mint, true); N(cx + 32, y2, 'U', PAL.mint, true);
    } else {
      const y0 = cy - 70, y1 = cy, y2 = cy + 70;
      KIN.family(g, [cx - 26, y0], [cx + 26, y0], [[cx - 32, y1], [cx + 32, y1]], o);
      KIN.family(g, [cx - 32, y1], [cx + 32, y1], [[cx, y2]], o);
      N(cx - 26, y0, 'M'); N(cx + 26, y0, 'F'); N(cx - 32, y1, 'M', PAL.heather); N(cx + 32, y1, 'F'); N(cx, y2, 'U', PAL.heather, true);
    }
  });
}
// P(gi, gj | Jacquard state k) at a biallelic locus with frequency q: table [code = gi*3 + gj][k].
function lik9(q) {
  const o = []; for (let c = 0; c < 9; c++) o.push(new Float64Array(9));
  JQ.forEach((c, k) => { const m = Math.max(...c) + 1; for (let s = 0; s < (1 << m); s++) { let pr = 1; for (let z = 0; z < m; z++) pr *= (s >> z) & 1 ? q : 1 - q; const al = c.map((z) => (s >> z) & 1); o[(al[0] + al[1]) * 3 + al[2] + al[3]][k] += pr; } });
  return o;
}

Theater.chapter({
  id: 'rel', roman: 'III', title: 'Reading Relationships', color: COL,
  question: 'What can a pair\'s genotypes tell you, and what can they not?',
  intro: { t: 'Chapter three. Reading relationships: what a pair\'s genotypes can tell you, and what they cannot.' },
  motif(g, t) {
    // Cotterman's triangle, faint: k0 across, k1 up; relationship points light up in turn.
    const X = (k0) => 1180 + 230 * k0, Y = (k1) => 340 - 210 * k1; const p = ease.inOut((t - 0.6) / 2.6);
    g.poly([[X(0), Y(1)], [X(0), Y(0)], [X(1), Y(0)]], { color: COL, w: 2, alpha: 0.32, progress: p });
    g.line(X(0), Y(1), X(1), Y(0), { color: COL, w: 2, alpha: 0.32, progress: ease.inOut((t - 1.6) / 1.6) });
    [[0, 1], [0.25, 0.5], [0.5, 0.5], [1, 0]].forEach(([a, b], k) => g.dot(X(a), Y(b), 5, COL, 0.4 * ease.out((t - 2.4 - 0.35 * k) / 0.6), 2.4));
  },
  scenes: [
    /* VISUAL BRIEF (rel-cotterman): Beat 0: a pair at one locus with three illustrated outcomes (share
       0, 1, 2 alleles IBD) as small allele-pair glyphs, labelled k0, k1, k2, with "k0 + k1 + k2 = 1".
       Beat 1: the k-space plot (the canonical "Thompson triangle": x = k1? use k0 on x axis 0–1 and k1 on
       y axis 0–1, feasible region below the line k0 + k1 = 1 and also the curve k1² ≥ 4 k0 k2 boundary
       optional). Points: PO at (0,1), FS at (¼,½), drop in with labels as spoken. Beat 2: iso-kinship
       lines φ = k1/4 + k2/2 drawn as dashed diagonals; PO and FS both on φ = ¼ line, highlighted.
       Beat 3: HS, avuncular, GP all land on the same point (½, ½): three labels stack/collide on one dot;
       a badge "same point → need linkage or ages". Beat 4: unrelated at (1, 0) corner; animate a cloud of
       noisy estimates scattering around each true point (clouds for U, HS, FS, PO, 2–3 hundred dots each,
       deterministic). */
    {
      id: 'rel-cotterman', title: 'Cotterman\'s triangle',
      beats: [
        { t: 'At any locus, an outbred pair shares zero, one, or two alleles identical by descent. Cotterman\'s coefficients, k0, k1 and k2, give the probability of each, and they sum to one.',
          s: 'At any locus, an outbred pair shares zero, one, or two alleles identical by descent. Cotterman\'s coefficients, k zero, k one and k two, give the probability of each, and they sum to one.' },
        { t: 'Parent and offspring always share exactly one: k1 equals one. Full siblings share zero, one or two, with probabilities one quarter, one half, and one quarter. Both relationships have kinship one quarter, but they sit at different points in this space.',
          s: 'Parent and offspring always share exactly one: k one equals one. Full siblings share zero, one or two, with probabilities one quarter, one half, and one quarter. Both relationships have kinship one quarter, but they sit at different points in this space.' },
        { t: 'Kinship is a line through the space: φ = k1/4 + k2/2. Relationship-inference methods use the position along that line, not just which line a pair is on.',
          s: 'Kinship is a line through the space: phi equals k one over four, plus k two over two. Relationship-inference methods use the position along that line, not just which line a pair is on.' },
        { t: 'Half siblings, an aunt and her nephew, and a grandparent and grandchild all have k0 and k1 equal to one half. They occupy the same point. No method using unlinked markers can separate them; that takes linkage information, or ancillary data such as ages.',
          s: 'Half siblings, an aunt and her nephew, and a grandparent and grandchild all have k zero and k one equal to one half. They occupy the same point. No method using unlinked markers can separate them; that takes linkage information, or ancillary data such as ages.' },
        { t: 'Unrelated pairs sit in the corner, where k0 equals one. Real estimates scatter around each point, because every locus is a noisy draw.',
          s: 'Unrelated pairs sit in the corner, where k zero equals one. Real estimates scatter around each point, because every locus is a noisy draw.' },
      ],
      terms: [
        { beat: 0.4, term: 'Cotterman coefficients (k0, k1, k2)', def: 'For outbred pairs, the probabilities of sharing 0, 1 or 2 alleles IBD at a locus. φ = k1/4 + k2/2.' },
        { beat: 3.3, term: 'Second-degree relatives', def: 'Half sibs, avuncular and grandparent–grandchild pairs: identical (k0, k1, k2) = (½, ½, 0), so indistinguishable with unlinked markers.' },
      ],
      init() {
        // Simulate 160 pairs per relationship at L unlinked SNPs and fit (k0, k1, k2) by maximum likelihood (EM).
        const r = rng(31), L = 250; const q = []; for (let l = 0; l < L; l++) q.push(0.05 + 0.45 * r());
        const T = q.map(pairLik); const al = (p) => (r() < p ? 1 : 0);
        const rels = [[1, 0, 0], [0.5, 0.5, 0], [0.25, 0.5, 0.25], [0, 1, 0]];
        const clouds = rels.map((k) => {
          const pts = [];
          for (let n = 0; n < 160; n++) {
            const codes = new Int8Array(L);
            for (let l = 0; l < L; l++) {
              const p = q[l], u = r(), z = u < k[0] ? 0 : u < k[0] + k[1] ? 1 : 2;
              const x1 = al(p), x2 = al(p); let y1, y2;
              if (z === 0) { y1 = al(p); y2 = al(p); } else if (z === 1) { y1 = x1; y2 = al(p); } else { y1 = x1; y2 = x2; }
              codes[l] = (x1 + x2) * 3 + y1 + y2;
            }
            const e = emK(codes, T, 90); pts.push([e[0], e[1], r()]);
          }
          return pts;
        });
        const CC = [PAL.sand, PAL.mint, COL, PAL.heather];
        const spr = CC.map((c) => makeSprite(c, 3.4, 2.2));
        return { clouds, spr, CC };
      },
      draw(g, t, S, D) {
        const ctx = g.ctx;
        const AX = { x: 710, y: 300, w: 540, h: 540 };
        const X = (k0) => AX.x + AX.w * k0, Y = (k1) => AX.y + AX.h * (1 - k1);
        const mv = S.io(1, 1.4);
        const fade4 = 1 - S.p(4, 0.8);
        // ---------------- readout keyframes: (k0, k1, k2) shown in the left column
        const tSlide = sent(S, 2, 1, 0.05);
        const slideK0 = (tt) => 0.125 + 0.125 * Math.cos(Math.PI * Math.max(0, tt - tSlide) / 2.2);
        const keys = [
          { t: -1, v: () => [0, 0, 0], n: '' },
          { t: sent(S, 1, 0, 0.55), v: () => [0, 1, 0], n: 'parent–offspring', c: PAL.heather },
          { t: sent(S, 1, 1, 0.45), v: () => [0.25, 0.5, 0.25], n: 'full siblings', c: COL },
          { t: tSlide, v: (tt) => { const a = slideK0(tt); return [a, 1 - 2 * a, a]; }, n: 'along φ = ¼', c: COL },
          { t: sent(S, 3, 0, 0.05), v: () => [0.5, 0.5, 0], n: 'second degree', c: PAL.mint },
          { t: sent(S, 4, 0, 0.3), v: () => [1, 0, 0], n: 'unrelated', c: PAL.sand },
        ];
        let kv = [0, 0, 0], ki = 0;
        keys.forEach((K, i) => { const w = ease.inOut((t - K.t) / 0.8); if (w > 0) { const v = K.v(t); kv = kv.map((x, z) => lerp(x, v[z], w)); if (t >= K.t) ki = i; } });
        const fmtK = (v) => { for (const n of [0, 0.25, 0.5, 0.75, 1]) if (Math.abs(v - n) < 0.004) return FR(n); return v.toFixed(2); };

        // ---------------- glyphs: share 0 / 1 / 2 alleles IBD (big in beat 0, then the left column)
        label(g, 'At one locus', lerp(140, 100, mv), 262, S.p(0, 0.8, 0.3));
        const rowsY = [390, 500, 610];
        for (let z = 0; z < 3; z++) {
          const a = P(S, 0, 0, 0.42 + 0.08 * z);
          const x = lerp(330 + 375 * z, 160, mv), y = lerp(470, rowsY[z], mv), s = lerp(1.75, 0.95, mv);
          pairGlyph(g, x, y, s, z, a, 1 - mv);
          g.text(z + ' shared IBD', x, y + 104, { size: 24, color: PAL.ink2, align: 'center', alpha: a * (1 - clamp(mv * 4)) });
          const ka = P(S, 0, 1, 0.12 + 0.07 * z);
          g.math('k_' + z, lerp(x, 252, mv), lerp(y + 182, y + 14, mv), { size: lerp(58, 40, mv), color: PAL.ink, align: mv < 0.5 ? 'center' : 'left', alpha: ka });
          // probability bar
          const ba = S.p(1, 0.8, 1.0);
          if (ba > 0) {
            g.rect(318, y - 8, 190, 16, { fill: 'rgba(238,231,215,0.08)', r: 8, alpha: ba });
            if (kv[z] > 0.002) g.rect(318, y - 8, 190 * kv[z], 16, { fill: keys[ki].c || COL, r: 8, alpha: ba * 0.9 });
            g.text(fmtK(kv[z]), 524, y + 9, { size: 26, role: 'math', color: PAL.ink, alpha: ba * (ki > 0 ? 1 : 0) });
          }
        }
        g.math('k_0 + k_1 + k_2 = 1', 705, 830, { size: 52, align: 'center', alpha: P(S, 0, 1, 0.86) * (1 - S.p(1, 0.35)) });
        // relationship name above the readout
        keys.forEach((K, i) => { if (!K.n) return; const a = tw(t, K.t, keys[i + 1] ? keys[i + 1].t : undefined, 0.5) * mv; g.text(K.n, 100, 330, { size: 34, role: 'display', italic: true, color: K.c, alpha: a }); });
        // kinship formula + live value (beat 2 on)
        const fa = S.p(2, 0.9, 0.6);
        g.math('φ = \\frac{k_1}{4} + \\frac{k_2}{2}', 100, 722, { size: 46, alpha: fa });
        const phi = kv[1] / 4 + kv[2] / 2;
        g.text('= ' + (Math.abs(phi - 0.25) < 0.003 ? '¼' : Math.abs(phi - 0.125) < 0.003 ? '⅛' : Math.abs(phi) < 0.003 ? '0' : phi.toFixed(3)), 380, 722, { size: 40, role: 'math', color: COL, alpha: fa });

        // ---------------- Cotterman k-space
        const axA = S.p(1, 1.0, 0.2);
        label(g, 'Cotterman space', AX.x + AX.w, 262, axA, PAL.ink3, 'right');
        const ticks = [0, 0.25, 0.5, 0.75, 1].map((v) => ({ v, l: FR(v) })), yt = ticks.slice(1, 4);
        g.axes({ x: AX.x, y: AX.y, w: AX.w, h: AX.h, progress: axA, xticks: ticks, yticks: yt, tickSize: 21 });
        g.math('k_1', AX.x - 36, AX.y - 20, { size: 34, align: 'center', alpha: clamp(axA * 2 - 1) });
        g.math('k_0', AX.x + AX.w + 22, Y(0) + 12, { size: 34, alpha: clamp(axA * 2 - 1) });
        if (axA > 0) {
          // feasible region: k1 >= 2*sqrt(k0) - 2*k0 (i.e. k1^2 >= 4 k0 k2), below the k2 = 0 edge
          const cur = []; for (let k = 0; k <= 80; k++) { const a = (k / 80) ** 2; cur.push([X(a), Y(2 * Math.sqrt(a) - 2 * a)]); }
          const ra = S.p(1, 1, 0.8);
          g.poly([...cur, [X(1), Y(0)], [X(0), Y(1)]], { fill: U.rgba(COL, 0.08), color: null, w: 0, alpha: ra, close: true });
          g.poly(cur, { color: U.rgba(COL, 0.45), w: 1.6, alpha: ra });
          g.line(X(0), Y(1), X(1), Y(0), { color: PAL.ink2, w: 2.2, progress: S.p(1, 1.2, 0.6) });
          const ang = Math.atan2(AX.h, AX.w);
          g.with(() => { ctx.translate(X(0.78) + 12, Y(0.22) - 12); ctx.rotate(ang); g.math('k_2 = 0', 0, 0, { size: 26, color: PAL.ink3, align: 'center', alpha: ra * fade4 }); });
        }
        // iso-kinship lines φ = k1/4 + k2/2, i.e. k1 = 2 − 2k0 − 4φ: faint across the triangle, solid where feasible
        [[3 / 8, '⅜'], [1 / 4, '¼'], [1 / 8, '⅛']].forEach(([ph, lab], k) => {
          const a0 = Math.max(0, 1 - 4 * ph), a1 = 1 - 2 * ph; const main = ph === 0.25;
          const f1 = Math.min(a1, ((2 - 4 * ph) / 2) ** 2); // feasible end: 2 - 4φ = 2*sqrt(k0)
          const pr = S.p(2, 1.0, 1.5 + 0.4 * (main ? 0 : k + 1));
          const c = main ? COL : PAL.ink2;
          g.line(X(a0), Y(2 - 2 * a0 - 4 * ph), X(a1), Y(0), { color: c, w: 1.6, dash: [6, 8], progress: pr, alpha: 0.55 });
          g.line(X(a0), Y(2 - 2 * a0 - 4 * ph), X(f1), Y(2 - 2 * f1 - 4 * ph), { color: c, w: main ? 5 : 3, progress: pr, alpha: main ? 1 : 0.8 });
          g.text('φ = ' + lab, X(a1), Y(0) - 14, { size: 22, role: 'math', color: main ? COL : PAL.ink2, align: 'center', alpha: pr * (1 - 0.7 * S.p(4, 0.8)) });
        });
        // the bead sliding along φ = ¼
        const sa = tw(t, tSlide - 0.2, sent(S, 3, 0, 0), 0.5);
        if (sa > 0) {
          const a = slideK0(t); const bx = X(a), by = Y(1 - 2 * a);
          g.glow(bx, by, 30, COL, 0.6 * sa); g.circle(bx, by, 9, { fill: PAL.ink, alpha: sa });
          const nx = 0.88, ny = 0.47; // unit normal (up-right) to the φ = ¼ line on screen
          const off = 34; g.arrow(X(0) + nx * off + 6, Y(1) - ny * off + 6, X(0.25) + nx * off - 4, Y(0.5) - ny * off - 6, { color: PAL.ink2, w: 2, head: 11, both: true, alpha: sa });
          g.text('position along the line', X(0.24) + 10, Y(0.86), { size: 22, color: PAL.ink2, alpha: sa });
        }
        // relationship points
        const pt = (k0, k1, c, a, r = 9) => { if (a <= 0) return; g.dot(X(k0), Y(k1), r, c, a, 2.8); };
        const poA = P(S, 1, 0, 0.5), fsA = P(S, 1, 1, 0.45);
        const ring = P(S, 1, 2, 0.35) * (1 - S.p(2, 0.6, 1.2));
        pt(0, 1, PAL.heather, poA * (1 - 0.0 * fade4));
        g.text('parent–offspring', X(0) + 20, Y(1) + 8, { size: 23, color: PAL.heather, alpha: poA });
        pt(0.25, 0.5, COL, fsA);
        g.text('full sibs', X(0.25) - 24, Y(0.5) + 8, { size: 23, color: COL, align: 'right', alpha: fsA });
        if (ring > 0) {
          for (const [k0, k1] of [[0, 1], [0.25, 0.5]]) g.circle(X(k0), Y(k1), 20 + 3 * Math.sin(t * 4), { stroke: PAL.ink, w: 2, alpha: ring });
          g.pill('both φ = ¼', X(0.3), Y(0.84), { size: 22, color: COL, alpha: ring });
        }
        // beat 3: second-degree relatives on one point
        const pA = (j) => P(S, 3, 0, [0.06, 0.3, 0.62][j]);
        const sdA = Math.max(pA(0), 0); pt(0.5, 0.5, PAL.mint, sdA, 10);
        const pedA = 1 - S.p(4, 0.7);
        const peds = [[985, 'half sibs'], [1110, 'aunt–nephew'], [1240, 'grandparent']];
        peds.forEach(([cx, nm], j) => {
          const a = pA(j) * pedA; if (a <= 0) return;
          miniPed(g, j, cx, 312, a);
          g.text(nm, cx, 470, { size: 21, color: PAL.mint, align: 'center', alpha: a });
          g.carrow(cx, 484, X(0.5) + (j - 1) * 10, Y(0.5) - 18, [0.12, 0, -0.12][j], { color: PAL.mint, w: 1.8, head: 10, alpha: a * 0.8, progress: S.p(3, 0.8, [0.5, 1.6, 3.2][j]) });
        });
        const same = P(S, 3, 1, 0.1);
        if (same > 0 && pedA > 0) g.circle(X(0.5), Y(0.5), 22 + 4 * Math.sin(t * 5), { stroke: PAL.mint, w: 2.2, alpha: same * pedA });
        g.text('second degree', X(0.5) + 20, Y(0.5) - 18, { size: 22, color: PAL.mint, alpha: S.p(4, 0.8, 0.4) });
        const bA = P(S, 3, 2, 0.15) * fade4;
        g.pill('indistinguishable with unlinked markers', 100, 806, { size: 22, color: PAL.coral, alpha: bA });
        g.pill('→ linkage, or ages', 100, 858, { size: 22, color: PAL.moss, alpha: P(S, 3, 2, 0.55) * fade4 });
        // beat 4: unrelated corner + noisy estimates
        const uA = P(S, 4, 0, 0.45);
        pt(1, 0, PAL.sand, uA);
        g.text('unrelated', X(0.95), Y(0.25), { size: 23, color: PAL.sand, align: 'center', alpha: uA });
        const t0 = sent(S, 4, 1, 0.05);
        if (t >= t0) {
          const tru = [[1, 0], [0.5, 0.5], [0.25, 0.5], [0, 1]];
          D.clouds.forEach((pts, c) => {
            const [tx, ty] = tru[c];
            for (const [e0, e1, d] of pts) {
              const f = ease.out((t - t0 - d * 2.4 - c * 0.15) / 0.7); if (f <= 0) continue;
              blit(ctx, D.spr[c], lerp(X(tx), X(e0), f), lerp(Y(ty), Y(e1), f), 0.75 * f);
            }
          });
          tag(g, 'simulated · 160 pairs each · 250 unlinked SNPs · ML', AX.x + AX.w, 906, S.p(4, 0.8, 4.2), 'right');
        }
      },
    },
    /* VISUAL BRIEF (rel-jacquard): Beat 0: two individuals, each with two alleles; within-individual IBD
       links appear (allowing inbreeding). Beat 1: a 3×3 grid of the nine Jacquard state diagrams (the
       canonical figure: four dots per state, two for i on top, two for j below, with lines joining IBD
       alleles), labelled Δ1…Δ9, drawn in sequence; Δ7, Δ8, Δ9 marked as the "outbred" states that
       correspond to k2, k1, k0. Beat 2: formula φ = Δ1 + ½(Δ3+Δ5+Δ7) + ¼Δ8 big. Beat 3: back to the
       Cotterman triangle (small): an inbred HS pair's estimate slides from the HS point toward FS; an
       inbred PO estimate slides off the (0,1) corner; red "misclassified" tags. Beat 4: tool pills:
       NgsRelate v2 (genotype likelihoods → all nine Δ + F), related::coancestry(allow.inbreeding = TRUE). */
    {
      id: 'rel-jacquard', title: 'Nine ways to share',
      beats: [
        { t: 'Cotterman\'s space assumes that neither individual is inbred. Allow inbreeding, and each individual\'s own two alleles may also be identical by descent.' },
        { t: 'Among four alleles, two in each individual, there are fifteen patterns of identity, which collapse to nine distinguishable states: Jacquard\'s condensed identity coefficients, Δ1 to Δ9. For an outbred pair, only the last three remain, and they are Cotterman\'s k2, k1 and k0.',
          s: 'Among four alleles, two in each individual, there are fifteen patterns of identity, which collapse to nine distinguishable states: Jacquard\'s condensed identity coefficients, delta one to delta nine. For an outbred pair, only the last three remain, and they are Cotterman\'s k two, k one and k zero.' },
        { t: 'Kinship is still perfectly well defined: φ = Δ1 + ½(Δ3 + Δ5 + Δ7) + ¼Δ8. What breaks is the mapping from estimated coefficients to named relationships.',
          s: 'Kinship is still perfectly well defined: phi equals delta one, plus one half of delta three plus delta five plus delta seven, plus one quarter of delta eight. What breaks is the mapping from estimated coefficients to named relationships.' },
        { t: 'Force an inbred pair into the three-coefficient model and it lands in the wrong place. Inbred half siblings can share two alleles by descent, drifting toward full siblings, and an inbred parent and offspring slide off their corner. Misclassification is the main danger, and three-coefficient kinship can be biased too.' },
        { t: 'Pairwise estimators can be built on all nine states. NgsRelate version two estimates them from genotype likelihoods, and the related package allows inbreeding in its likelihood estimators.',
          s: 'Pairwise estimators can be built on all nine states. N G S Relate version two estimates them from genotype likelihoods, and the related package allows inbreeding in its likelihood estimators.' },
      ],
      terms: [
        { beat: 1.4, term: 'Jacquard coefficients (Δ1–Δ9)', def: 'Probabilities of the nine condensed IBD states among the four alleles of a pair, allowing inbreeding. Δ7, Δ8, Δ9 = k2, k1, k0 when outbred.' },
        { beat: 4.3, term: 'NgsRelate v2', def: 'Hanghøj et al. (2019): ML estimates of all nine Jacquard coefficients and F from genotype likelihoods; suited to low-depth data.' },
      ],
      init() {
        // 15 identity patterns (set partitions of the four alleles), grouped by condensed state.
        const parts = [];
        for (let b = 0; b <= 1; b++) for (let c = 0; c <= b + 1; c++) for (let d = 0; d <= Math.max(b, c) + 1; d++) parts.push([0, b, c, d]);
        parts.forEach((p) => { p.state = jState(p); });
        parts.sort((u, v) => u.state - v.state);
        // Two inbred pedigrees. HS: a brother mated to two of his sisters; i, j are paternal half sibs.
        // PO: offspring of a full-sib mating, paired with one of its parents.
        const pedHS = [['G1'], ['G2'], ['M1', 'G1', 'G2'], ['F', 'G1', 'G2'], ['M2', 'G1', 'G2'], ['i', 'F', 'M1'], ['j', 'F', 'M2']];
        const pedPO = [['G1'], ['G2'], ['i', 'G1', 'G2'], ['B', 'G1', 'G2'], ['j', 'i', 'B']];
        const r = rng(77), L = 600; const q = []; for (let l = 0; l < L; l++) q.push(0.05 + 0.45 * r());
        const T = q.map(pairLik);
        const fit = (ped) => {
          const pts = [];
          for (let n = 0; n < 14; n++) {
            const G = dropGenos(ped, q, r); const codes = new Int8Array(L);
            for (let l = 0; l < L; l++) codes[l] = (G.i[0][l] + G.i[1][l]) * 3 + G.j[0][l] + G.j[1][l];
            const k = emK(codes, T, 100); pts.push([k[0], k[1], k[2], r()]);
          }
          const m = [0, 1, 2].map((z) => pts.reduce((s, p) => s + p[z], 0) / pts.length);
          return { pts, m, phi3: m[1] / 4 + m[2] / 2 };
        };
        const HS = fit(pedHS), PO = fit(pedPO);
        HS.phi = kinship(pedHS, 'i', 'j'); PO.phi = kinship(pedPO, 'i', 'j');
        // Jacquard coefficients of the inbred half sibs (label gene-dropping).
        const dl = new Float64Array(10), N = 60000;
        for (let k = 0; k < N; k++) { const G = dropLabels(pedHS, r); dl[jState([G.i[0], G.i[1], G.j[0], G.j[1]])] += 1 / N; }
        const delta = Array.from(dl).slice(1);
        const phi9 = delta.reduce((s, d, k) => s + d * jWeight(JQ[k]), 0);
        // A 9-state ML fit (EM) for one simulated inbred half-sib pair at 5000 SNPs.
        const L9 = 5000; const q9 = []; for (let l = 0; l < L9; l++) q9.push(0.05 + 0.45 * r());
        const T9 = q9.map(lik9); const G9 = dropGenos(pedHS, q9, r); const c9 = new Int8Array(L9);
        for (let l = 0; l < L9; l++) c9[l] = (G9.i[0][l] + G9.i[1][l]) * 3 + G9.j[0][l] + G9.j[1][l];
        let est = new Array(9).fill(1 / 9);
        for (let it = 0; it < 250; it++) {
          const n = new Array(9).fill(0);
          for (let l = 0; l < L9; l++) { const v = T9[l][c9[l]]; let s = 0; for (let k = 0; k < 9; k++) s += est[k] * v[k]; for (let k = 0; k < 9; k++) n[k] += est[k] * v[k] / s; }
          est = n.map((x) => x / L9);
        }
        const phiEst = est.reduce((s, d, k) => s + d * jWeight(JQ[k]), 0);
        return { parts, HS, PO, delta, phi9, est, phiEst };
      },
      draw(g, t, S, D) {
        const ctx = g.ctx;
        // ---------------- beat 0: the four alleles of a pair
        const a0 = S.p(0, 0.8) * (1 - ease.inOut((t - sent(S, 1, 0, 0.26) + 0.2) / 0.6));
        if (a0 > 0) {
          const cx = 780, cy = 570, s = 3.4, dx = 34 * s, dy = 30 * s;
          const inb = P(S, 0, 1, 0.55, 1.0);
          const c = [0, 0, 0, 0].map((_, n) => n);
          g.withAlpha(a0, () => {
            for (const [yy, nm, sx] of [[cy - dy, 'i', 'M'], [cy + dy, 'j', 'F']]) {
              g.rect(cx - dx - 42, yy - 40, 2 * dx + 84, 80, { stroke: PAL.rule, w: 1.5, r: 40, fill: 'rgba(11,22,24,0.5)' });
              KIN.person(g, cx - dx - 120, yy, { sex: sx, r: 26, color: KIN.SEX[sx], inbred: nm === 'i' && inb > 0.5 });
              g.math(nm, cx - dx - 180, yy + 12, { size: 40, color: PAL.ink2, align: 'center' });
            }
            // between-individual IBD (outbred sharing)
            const xa = P(S, 0, 0, 0.35, 1.0);
            g.line(cx - dx, cy - dy + 14, cx - dx, cy + dy - 14, { color: COL, w: 5, progress: xa });
            g.text('between i and j', cx - dx - 18, cy + 8, { size: 23, color: COL, align: 'right', alpha: xa * (1 - 0.0 * inb) });
            // within-individual IBD (inbreeding)
            g.line(cx - dx + 16, cy - dy, cx + dx - 16, cy - dy, { color: PAL.coral, w: 5, progress: inb });
            g.text('within i', cx, cy - dy - 52, { size: 25, color: PAL.coral, align: 'center', alpha: inb });
            const cols = [JCOL[0], U.mix(JCOL[1], JCOL[0], inb), JCOL[0], JCOL[2]];
            [[cx - dx, cy - dy], [cx + dx, cy - dy], [cx - dx, cy + dy], [cx + dx, cy + dy]].forEach(([x, y], n) => g.dot(x, y, 22, cols[n], 1, 2));
            g.pill('autozygous', cx + dx + 64, cy - dy, { size: 22, color: PAL.coral, alpha: P(S, 0, 1, 0.8, 0.8) });
          });
          label(g, 'Four alleles, two per individual', 120, 262, a0);
        }
        // ---------------- beat 1–2: the 15 patterns collapse into the 9 states
        const cellA = (k) => { const col = k % 3, row = Math.floor(k / 3); return [330 + 370 * col, 380 + 190 * row]; };
        const cellB = (k) => { const col = k % 3, row = Math.floor(k / 3); return [230 + 180 * col, 360 + 185 * row]; };
        const cmp = S.io(2, 1.3);
        const gA = vis(S, 1, 3) * (1 - S.p(1, 0.01) * 0); // grid visibility through beat 2
        const cell = (k) => { const a = cellA(k), b = cellB(k); return [lerp(a[0], b[0], cmp), lerp(a[1], b[1], cmp)]; };
        const sz = lerp(1.1, 0.9, cmp);
        const t15 = sent(S, 1, 0, 0.26), tCol = sent(S, 1, 0, 0.5), tLab = sent(S, 1, 0, 0.64);
        if (gA > 0) {
          const ga = vis(S, 1, 3);
          // the fifteen patterns: 5 × 3 layout, then flight to their state's cell
          const fly = S.tp(tCol, 1.6);
          if (fly < 1) {
            D.parts.forEach((p, n) => {
              const a = ease.out((t - t15 - n * 0.09) / 0.5) * ga; if (a <= 0) return;
              const c0 = [235 + 235 * (n % 5), 400 + 175 * Math.floor(n / 5)];
              const c1 = cell(p.state - 1); const f = ease.inOut(clamp(fly * 1.25 - (n % 5) * 0.05));
              jqDraw(g, p, lerp(c0[0], c1[0], f), lerp(c0[1], c1[1], f), lerp(0.95, sz, f), a * (1 - 0.6 * clamp((fly - 0.75) / 0.25)));
            });
          }
          const cntA = ease.out((t - t15) / 0.6) * ga * (1 - S.p(2, 0.6));
          g.text(fly < 0.5 ? '15 identity patterns' : '9 condensed states', 120, 268, { size: 26, role: 'display', italic: true, color: PAL.ink, alpha: cntA });
          // the nine canonical states
          const sa = clamp((fly - 0.7) / 0.3) * ga;
          const tOut = sent(S, 1, 1, 0.12);
          const outb = S.tp(tOut, 0.8);
          for (let k = 0; k < 9; k++) {
            const [x, y] = cell(k); const w = jWeight(JQ[k]);
            const dimO = k < 6 ? 1 - 0.65 * outb * (1 - cmp) : 1;
            const dimW = w === 0 ? 1 - 0.6 * S.p(2, 0.8, 1.2) : 1;
            const hiW = S.tp(sent(S, 2, 0, [0.33, 0, 0.47, 0, 0.6, 0, 0.72, 0.86, 0][k]), 0.6) * (w > 0 ? 1 : 0);
            if (hiW > 0 && cmp > 0.5) g.glow(x, y, 80, COL, 0.22 * hiW * (1 - S.p(3, 0.6)));
            jqDraw(g, JQ[k], x, y, sz, sa * dimO * dimW);
            const la = S.tp(tLab + k * 0.22, 0.5) * ga * dimO * dimW;
            g.math('Δ_' + (k + 1), x - lerp(105, 68, cmp), y + 14, { size: lerp(36, 30, cmp), color: PAL.ink, align: 'center', alpha: la });
            // weights (beat 2)
            if (cmp > 0) g.text('× ' + (w === 1 ? '1' : w === 0.5 ? '½' : w === 0.25 ? '¼' : '0'), x, y + 72, { size: 26, role: 'math', color: w > 0 ? COL : PAL.ink3, align: 'center', alpha: cmp * ga * dimW });
          }
          // outbred row: Cotterman's coefficients
          const ka = S.tp(sent(S, 1, 1, 0.55), 0.7) * (1 - S.p(2, 0.6)) * ga;
          if (ka > 0) {
            const [x7, y7] = cellA(6), [x9] = cellA(8);
            g.rect(x7 - 150, y7 - 62, x9 - x7 + 300, 124, { stroke: U.rgba(COL, 0.6), w: 2, r: 16, alpha: outb * (1 - S.p(2, 0.6)) * ga });
            g.pill('outbred', x9 + 150, y7 - 62, { size: 20, color: COL, align: 'right', alpha: outb * (1 - S.p(2, 0.6)) * ga });
            ['k_2', 'k_1', 'k_0'].forEach((kk, n) => { const [x] = cellA(6 + n); const a = S.tp(sent(S, 1, 1, 0.62 + 0.11 * n), 0.5) * (1 - S.p(2, 0.6)) * ga; g.math('= ' + kk, x + 66, y7 + 14, { size: 34, color: COL, alpha: a }); });
          }
        }
        // ---------------- beat 2: the kinship formula
        const fA = vis(S, 2, 3);
        if (fA > 0) {
          const ex = 'φ = Δ_1 + \\frac{1}{2}(Δ_3 + Δ_5 + Δ_7) + \\frac{1}{4}Δ_8';
          const sz2 = Math.min(50, 50 * 600 / g.mathW(ex, 50));
          g.math(ex, 700, 450, { size: sz2, alpha: fA * S.tp(sent(S, 2, 0, 0.25), 0.8) });
          tag(g, 'weight = share of the four i–j allele pairs that are IBD', 700, 520, fA * S.tp(sent(S, 2, 0, 0.9), 0.8));
          // what breaks: estimated coefficients → named relationship
          const bA = fA * S.tp(sent(S, 2, 1, 0.15), 0.8);
          if (bA > 0) {
            const y = 690;
            g.math('\\hat{Δ}', 730, y + 14, { size: 44, alpha: bA });
            g.arrow(790, y, 905, y, { color: PAL.ink2, w: 2.5, head: 13, alpha: bA });
            g.arrow(955, y, 1040, y, { color: PAL.ink2, w: 2.5, head: 13, alpha: bA });
            const xa = S.tp(sent(S, 2, 1, 0.45), 0.5) * bA;
            g.line(918, y - 16, 942, y + 16, { color: PAL.coral, w: 4, alpha: xa }); g.line(918, y + 16, 942, y - 16, { color: PAL.coral, w: 4, alpha: xa });
            g.text('named relationship', 1055, y + 9, { size: 26, color: PAL.ink, alpha: bA });
            g.text('FS?  HS?  PO?', 1055, y + 50, { size: 23, color: PAL.coral, alpha: xa });
          }
          label(g, 'Kinship from the nine states', 120, 262, fA * cmp);
        }
        // ---------------- beat 3: forced into three coefficients
        const cA = vis(S, 3, 4);
        if (cA > 0) {
          label(g, 'Fit with three coefficients', 150, 262, cA);
          const AX = { x: 190, y: 320, w: 470, h: 470 };
          const X = (k0) => AX.x + AX.w * k0, Y = (k1) => AX.y + AX.h * (1 - k1);
          g.withAlpha(cA, () => {
            const ticks = [0, 0.5, 1].map((v) => ({ v, l: FR(v) }));
            g.axes({ x: AX.x, y: AX.y, w: AX.w, h: AX.h, progress: S.p(3, 1), xticks: ticks, yticks: [{ v: 0.5, l: '½' }], tickSize: 21 });
            g.math('k_1', AX.x - 34, AX.y - 18, { size: 32, align: 'center' }); g.math('k_0', AX.x + AX.w + 22, Y(0) + 12, { size: 32 });
            const cur = []; for (let k = 0; k <= 60; k++) { const a = (k / 60) ** 2; cur.push([X(a), Y(2 * Math.sqrt(a) - 2 * a)]); }
            g.poly([...cur, [X(1), Y(0)], [X(0), Y(1)]], { fill: U.rgba(COL, 0.07), color: null, w: 0, close: true });
            g.poly(cur, { color: U.rgba(COL, 0.4), w: 1.5 }); g.line(X(0), Y(1), X(1), Y(0), { color: PAL.ink2, w: 2 });
            const refs = [[0, 1, PAL.heather, 'PO', 18, 8, 'left'], [0.25, 0.5, COL, 'FS', -18, 8, 'right'], [0.5, 0.5, PAL.mint, 'HS', 18, -12, 'left']];
            refs.forEach(([k0, k1, c, n, ox, oy, al]) => { g.circle(X(k0), Y(k1), 9, { stroke: c, w: 2.5 }); g.text(n, X(k0) + ox, Y(k1) + oy, { size: 23, color: c, align: al }); });
          });
          // inbred half sibs: slide from HS toward FS
          const sl = (est, from, t0, col, a) => {
            const f = S.tp(t0, 2.4);
            if (f <= 0) return;
            for (const [e0, e1, , d] of est.pts) { const ff = ease.inOut(clamp(f * 1.3 - d * 0.3)); g.dot(lerp(X(from[0]), X(e0), ff), lerp(Y(from[1]), Y(e1), ff), 4, col, 0.7 * a, 2); }
            const m = est.m, ff = ease.inOut(f);
            const mx = lerp(X(from[0]), X(m[0]), ff), my = lerp(Y(from[1]), Y(m[1]), ff);
            g.arrow(X(from[0]), Y(from[1]), mx, my, { color: PAL.coral, w: 3, head: 13, alpha: a * clamp(f * 3) });
            g.dot(mx, my, 8, PAL.coral, a, 2.6);
            return [mx, my];
          };
          const tHS = sent(S, 3, 1, 0.08), tPO = sent(S, 3, 1, 0.62);
          const pH = sl(D.HS, [0.5, 0.5], tHS, PAL.mint, cA);
          const pP = sl(D.PO, [0, 1], tPO, PAL.heather, cA);
          // pedigrees + numbers on the right
          const row = (y, kind, nm, est, t0) => {
            const a = S.tp(t0 - 0.6, 0.7) * cA; if (a <= 0) return;
            inbredPed(g, kind, 800, y, a);
            g.text(nm, 960, y - 40, { size: 26, role: 'display', italic: true, color: kind ? PAL.heather : PAL.mint, alpha: a });
            const ra = S.tp(t0 + 2.0, 0.6) * cA;
            g.text('fit (k0, k1, k2) = (' + est.m.map((v) => v.toFixed(2)).join(', ') + ')', 960, y, { size: 22, color: PAL.ink2, alpha: ra });
            g.pill(kind ? 'off the corner' : 'looks like full sibs', 960, y + 40, { size: 21, color: PAL.coral, alpha: ra });
            const ba = S.tp(sent(S, 3, 2, 0.5), 0.6) * cA;
            g.math('φ = ' + est.phi.toFixed(3), 960, y + 92, { size: 30, color: PAL.ink, alpha: ba });
            g.math('\\hat{φ}_3 = ' + est.phi3.toFixed(3), 1120, y + 92, { size: 30, color: PAL.coral, alpha: ba });
          };
          row(370, 0, 'inbred half sibs', D.HS, tHS);
          row(640, 1, 'inbred parent–offspring', D.PO, tPO);
          const mA = S.tp(sent(S, 3, 2, 0.05), 0.6) * cA;
          g.pill('misclassification', 190, 872, { size: 22, color: PAL.coral, alpha: mA });
          g.pill('biased kinship', 420, 872, { size: 22, color: PAL.coral, alpha: S.tp(sent(S, 3, 2, 0.5), 0.6) * cA });
          tag(g, 'simulated · 14 pairs each · 600 SNPs · ML', AX.x + AX.w, 846, S.tp(tHS + 2, 0.6) * cA, 'right');
        }
        // ---------------- beat 4: estimators that use all nine states
        const eA = S.p(4, 0.9);
        if (eA > 0) {
          label(g, 'Inbred half sibs: Jacquard Δ', 150, 262, eA);
          const B = { x: 200, y: 330, w: 510, h: 390 };
          const bw = B.w / 9; const ymax = 0.4;
          g.withAlpha(eA, () => {
            g.line(B.x, B.y + B.h, B.x + B.w, B.y + B.h, { color: PAL.ink2, w: 2 });
            [0.1, 0.2, 0.3, 0.4].forEach((v) => { const y = B.y + B.h * (1 - v / ymax); g.line(B.x, y, B.x + B.w, y, { color: PAL.faint, w: 1 }); g.text(v.toFixed(1), B.x - 12, y + 7, { size: 19, color: PAL.ink3, align: 'right' }); });
          });
          D.delta.forEach((d, k) => {
            const a = S.p(4, 0.6, 0.4 + 0.12 * k) * eA; const w = jWeight(JQ[k]);
            const x = B.x + bw * (k + 0.5), h = B.h * d / ymax * a;
            g.rect(x - bw * 0.32, B.y + B.h - h, bw * 0.64, h, { fill: U.rgba(w > 0 ? COL : PAL.ink3, w > 0 ? 0.85 : 0.6), r: 3 });
            jqDraw(g, JQ[k], x, B.y + B.h + 46, 0.48, a);
            g.math('Δ_' + (k + 1), x, B.y + B.h + 104, { size: 23, color: PAL.ink2, align: 'center', alpha: a });
          });
          const ea = P(S, 4, 1, 0.3);
          D.est.forEach((d, k) => { const x = B.x + bw * (k + 0.5), y = B.y + B.h * (1 - d / ymax); const a = ea * S.tp(sent(S, 4, 1, 0.3) + 0.1 * k, 0.4); g.line(x - bw * 0.42, y, x + bw * 0.42, y, { color: PAL.ochre, w: 3.5, alpha: a }); });
          g.rect(B.x + B.w - 238, B.y - 40, 26, 14, { fill: U.rgba(COL, 0.85), r: 3, alpha: eA });
          g.text('expected', B.x + B.w - 204, B.y - 27, { size: 19, color: PAL.ink2, alpha: eA });
          g.line(B.x + B.w - 112, B.y - 33, B.x + B.w - 86, B.y - 33, { color: PAL.ochre, w: 3.5, alpha: ea });
          g.text('ML fit', B.x + B.w - 76, B.y - 27, { size: 19, color: PAL.ink2, alpha: ea });
          const ra = S.p(4, 0.8, 2.0);
          g.math('φ = ' + D.phi9.toFixed(3), 200, 884, { size: 32, color: PAL.ink, alpha: ra });
          g.math('\\hat{φ}_9 = ' + D.phiEst.toFixed(3), 400, 884, { size: 32, color: PAL.ochre, alpha: ra * ea });
          g.math('\\hat{φ}_3 = ' + D.HS.phi3.toFixed(3), 610, 884, { size: 32, color: PAL.coral, alpha: ra * 0.9 });
          tag(g, 'simulated pair · 5000 SNPs', B.x + 6, B.y + 22, ea);
          KIN.card(g, 790, 360, 500, 'NgsRelate v2', 'genotype likelihoods → Δ1…Δ9 and F', { color: COL, alpha: P(S, 4, 1, 0.02), h: 104, size: 30 });
          g.pill('low-depth data', 790, 500, { size: 21, color: COL, alpha: P(S, 4, 1, 0.3) });
          KIN.card(g, 790, 560, 500, 'related::coancestry()', 'allow.inbreeding = TRUE', { color: PAL.moss, alpha: P(S, 4, 1, 0.68), h: 104, size: 28 });
        }
      },
    },
    /* VISUAL BRIEF (rel-segments): Use chromosome bars (long rounded rectangles). Beat 0: a chromosome
       pair in an ancestor (two colours); show one meiosis producing a recombinant (crossover animation),
       the passed chromosome a mosaic. Beat 1: three rows — grandparent–grandchild (1 meiosis cuts
       segments), half siblings (2), aunt–nephew (3): a chromosome bar for each pair with shared IBD
       segments highlighted; long/few vs shorter/more vs shortest. Each row labelled "segments cover ½ of genome (r = ¼)"; to the right a tiny histogram of segment lengths per row. Beat 2: realized relatedness — a
       distribution (histogram/density) of realized IBD fraction for full sibs, centred 0.5, with the
       spread ~0.4–0.6, dots raining in; a second, wider density labelled "shorter genetic map". Beat 3: data
       density strip: amplicon panel (few dots on chromosome: can't see segments), RADseq (patchy), WGS
       (dense) — segments visible only in dense data; reference genome icon (chromosome-level). */
    {
      id: 'rel-segments', title: 'Segments, not loci',
      beats: [
        { t: 'Linked markers carry more information than their count suggests. Identity by descent arrives in segments: stretches of chromosome inherited intact from a shared ancestor, and cut shorter by recombination every generation.' },
        { t: 'A grandparent and grandchild share long segments, cut by a single meiosis. Half siblings\' segments pass through two meioses, an aunt and nephew\'s through three. The same expected sharing arrives in different lengths and numbers of pieces, and that is how linkage-aware methods tell these relationships apart.' },
        { t: 'Segments also reveal realized relatedness. Full siblings are expected to share one half, but Mendelian sampling is random, so the actual fraction varies, roughly from 0.4 to 0.6 in humans, and more widely in species with shorter genetic maps, meaning fewer chromosomes or crossovers. Genomic estimates measure what was actually inherited.',
          s: 'Segments also reveal realized relatedness. Full siblings are expected to share one half, but Mendelian sampling is random, so the actual fraction varies, roughly from zero point four to zero point six in humans, and more widely in species with shorter genetic maps, meaning fewer chromosomes or crossovers. Genomic estimates measure what was actually inherited.' },
        { t: 'Using segments requires a reference genome, ideally assembled to chromosomes, and dense markers along it. A panel of a few hundred amplicons cannot see segments; whole-genome data can.', pause: 0.6 },
      ],
      terms: [
        { beat: 0.5, term: 'IBD segment', def: 'A chromosome stretch inherited intact from a common ancestor. Expected length shrinks with the number of meioses separating the pair.' },
        { beat: 2.3, term: 'Realized relatedness', def: 'The fraction of the genome actually shared IBD, which varies around the pedigree expectation because of Mendelian sampling.' },
      ],
      init() {
        const r = rng(2024);
        // A 12-chromosome genome (lengths in Morgans) totalling 24 M; three pair types simulated by gene dropping.
        const GEN = [2.9, 2.7, 2.5, 2.3, 2.2, 2.1, 2.0, 1.9, 1.8, 1.4, 1.2, 1.0];
        const TOT = GEN.reduce((a, b) => a + b, 0);
        let lab = 0; const fh = (L) => [[0, L, lab++]];
        const M = (a, b, L) => meiosis(a, b, L, r).h;
        const sims = {
          GP: (L) => { const A = fh(L), B = fh(L); const P = M(A, B, L); return ibdTrack([A, B], [M(P, fh(L), L), fh(L)], L); },
          HS: (L) => { const A = fh(L), B = fh(L); return ibdTrack([M(A, B, L), fh(L)], [M(A, B, L), fh(L)], L); },
          AV: (L) => { const A = fh(L), B = fh(L), C = fh(L), E = fh(L); const au = [M(A, B, L), M(C, E, L)], sb = [M(A, B, L), M(C, E, L)]; return ibdTrack(au, [M(sb[0], sb[1], L), fh(L)], L); },
        };
        // Example genomes: pick the replicate whose shared fraction is closest to ½ so pictures are typical.
        const rows = ['GP', 'HS', 'AV'].map((k) => {
          let best = null;
          for (let rep = 0; rep < 30; rep++) {
            const chr = GEN.map((L) => sims[k](L).filter((s) => s[2] > 0).map((s) => [s[0] / L, s[1] / L]));
            const sh = chr.reduce((s, c, i) => s + c.reduce((u, q) => u + (q[1] - q[0]) * GEN[i], 0), 0) / TOT;
            if (!best || Math.abs(sh - 0.5) < Math.abs(best.sh - 0.5)) best = { chr, sh };
          }
          // Segment-length distribution and mean shared fraction from 300 replicate genomes.
          const lens = []; let fr = 0, nseg = 0; const R = 300;
          for (let rep = 0; rep < R; rep++) { let sh = 0; for (const L of GEN) for (const s of sims[k](L)) if (s[2] > 0) { sh += s[1] - s[0]; lens.push((s[1] - s[0]) * 100); nseg++; } fr += sh / TOT / R; }
          const bins = new Array(10).fill(0); for (const l of lens) bins[Math.min(9, Math.floor(l / 25))]++;
          const mx = Math.max(...bins); const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
          return { k, ex: best, frac: fr, nseg: nseg / R, mean, bins: bins.map((b) => b / mx) };
        });
        // Beat 0 demo: one meiosis in a parent (two homologues → one recombinant gamete).
        const demo = (() => { for (let s = 0; s < 60; s++) { const m = meiosis([[0, 2.2, 0]], [[0, 2.2, 1]], 2.2, r); if (m.xs.length >= 2 && m.xs.length <= 3 && m.xs.every((x, i) => i === 0 || x - m.xs[i - 1] > 0.35) && m.xs[0] > 0.3 && m.xs[m.xs.length - 1] < 1.9) return m; } return meiosis([[0, 2.2, 0]], [[0, 2.2, 1]], 2.2, r); })();
        const demo2 = (() => { for (let k = 0; k < 60; k++) { const m = meiosis(demo.h, [[0, 2.2, 2]], 2.2, r); const pieces = m.h.filter((q) => q[2] === 0).length; if (m.xs.length >= 2 && pieces >= 2) return m; } return meiosis(demo.h, [[0, 2.2, 2]], 2.2, r); })();
        // Realized relatedness of full sibs: genome-wide IBD fraction (k1/2 + k2), humans vs a short-map species.
        const HUM = [2.86, 2.69, 2.23, 2.14, 2.04, 1.92, 1.87, 1.68, 1.66, 1.81, 1.58, 1.75, 1.26, 1.19, 1.41, 1.34, 1.28, 1.17, 1.07, 1.08, 0.62, 0.73];
        const SHORT = [1.6, 1.3, 1.1, 0.9, 0.7, 0.4];
        const fs = (G, n) => { const tot = G.reduce((a, b) => a + b, 0); const v = []; for (let k = 0; k < n; k++) { let s = 0; for (const L of G) { const A = fh(L), B = fh(L), C = fh(L), E = fh(L); for (const q of ibdTrack([M(A, B, L), M(C, E, L)], [M(A, B, L), M(C, E, L)], L)) s += (q[1] - q[0]) * q[2] / 2; } v.push([s / tot, r()]); } return v; };
        const fsH = fs(HUM, 360), fsS = fs(SHORT, 360);
        const sd = (v) => { const m = v.reduce((a, b) => a + b[0], 0) / v.length; return Math.sqrt(v.reduce((a, b) => a + (b[0] - m) ** 2, 0) / v.length); };
        // Marker panels on one chromosome (half-sib pair): IBD segments from the simulation; detection from genotypes.
        const Lc = 2.2; const segs = sims.HS(Lc).filter((s) => s[2] > 0).map((s) => [s[0] / Lc, s[1] / Lc]);
        const panel = (n, pos) => { const xs = pos ? pos.slice() : []; if (!pos) for (let k = 0; k < n; k++) xs.push(r()); xs.sort((a, b) => a - b); return xs.map((x) => { const p = 0.05 + 0.45 * r(); const al = () => (r() < p ? 1 : 0); const a1 = al(), a2 = al(); const ibd = segs.some((s) => x >= s[0] && x < s[1]); const b1 = ibd ? a1 : al(), b2 = al(); return { x, opp: Math.abs(a1 + a2 - b1 - b2) === 2 }; }); };
        const radPos = []; for (let c = 0; c < 26; c++) { const cx = r(); const n = 2 + Math.floor(r() * 7); for (let k = 0; k < n; k++) radPos.push(clamp(cx + (r() - 0.5) * 0.02)); }
        const panels = [panel(14), panel(radPos.length, radPos), panel(2600)];
        // WGS call: maximal runs without an opposite-homozygote longer than 6% of the chromosome.
        const opp = [0, ...panels[2].filter((m) => m.opp).map((m) => m.x), 1]; const called = [];
        for (let k = 0; k < opp.length - 1; k++) if (opp[k + 1] - opp[k] > 0.06) called.push([opp[k], opp[k + 1]]);
        const sprH = makeSprite(COL, 3.4, 2.2), sprS = makeSprite(PAL.ochre, 3.4, 2.2);
        return { GEN, rows, demo, demo2, fsH, fsS, sdH: sd(fsH), sdS: sd(fsS), segs, panels, called, sprH, sprS };
      },
      draw(g, t, S, D) {
        const ctx = g.ctx; const F = KIN.FOUNDER;
        const cA = F[0], cB = F[1];
        // ---------------- beat 0: meiosis makes mosaic chromosomes; segments shorten each generation
        const a0 = vis(S, 0, 1);
        if (a0 > 0) {
          label(g, 'Recombination cuts segments', 140, 262, a0);
          const x0 = 300, W = 840, L = 2.2, h = 24;
          const y1 = 340, y2 = 384, yG1 = 520, yP = 564, yG2 = 730;
          const seg = (m, cols) => m.h.map((q) => ({ a: q[0] / L, b: q[1] / L, color: cols[q[2]] }));
          const cols = [cA, cB, F[2]];
          g.withAlpha(a0, () => {
            KIN.person(g, 200, 362, { sex: 'F', r: 26, color: PAL.rose });
            KIN.chrom(g, x0, y1, W, [{ a: 0, b: 1, color: cA }], { h, progress: S.p(0, 1.2, 0.3) });
            KIN.chrom(g, x0, y2, W, [{ a: 0, b: 1, color: cB }], { h, progress: S.p(0, 1.2, 0.6) });
            const X1 = (x) => x0 + W * x / L;
            const cross = (xs, ya, yb, t0) => xs.forEach((x, k) => { const px = X1(x), a = S.p(0, 0.5, t0 + 0.35 * k); g.line(px - 12, ya - 4, px + 12, yb + 4, { color: PAL.ink, w: 2.5, alpha: a }); g.line(px + 12, ya - 4, px - 12, yb + 4, { color: PAL.ink, w: 2.5, alpha: a }); g.glow(px, (ya + yb) / 2, 26, PAL.ink, 0.25 * a); });
            cross(D.demo.xs, y1, y2, 2.2);
            g.text('crossovers', X1(D.demo.xs[0]), y1 - 28, { size: 21, color: PAL.ink2, align: 'center', alpha: S.p(0, 0.6, 2.2) });
            // generation 1 gamete
            const d1 = S.io(0, 1.2, 3.6);
            if (d1 > 0) {
              KIN.chrom(g, x0, lerp(y2 + 40, yG1, d1), W, seg(D.demo, cols), { h, alpha: clamp(d1 * 3) });
              g.arrow(200, 400, 200, yG1 - 22, { color: PAL.ink3, w: 2, head: 11, alpha: clamp(d1 * 3) });
              KIN.person(g, 200, yG1 + 20, { sex: 'M', r: 22, color: PAL.lagoon, alpha: clamp(d1 * 3) });
            }
            // generation 2: pairs with a new homologue, recombines again
            const pA = S.tp(sent(S, 0, 1, 0.55), 0.8);
            KIN.chrom(g, x0, yP, W, [{ a: 0, b: 1, color: F[2] }], { h, progress: pA });
            cross(D.demo2.xs, yG1, yP, sent(S, 0, 1, 0.65) - S.b(0));
            const d2 = S.io(0, 1.2, sent(S, 0, 1, 0.78) - S.b(0));
            if (d2 > 0) {
              KIN.chrom(g, x0, lerp(yP + 40, yG2, d2), W, seg(D.demo2, cols), { h, alpha: clamp(d2 * 3) });
              g.arrow(200, yG1 + 52, 200, yG2 - 22, { color: PAL.ink3, w: 2, head: 11, alpha: clamp(d2 * 3) });
              KIN.person(g, 200, yG2 + 20, { sex: 'F', r: 22, color: PAL.rose, alpha: clamp(d2 * 3) });
            }
            // brackets over the pieces still carried from the first ancestor homologue (colour A)
            const br = (m, y, a) => m.h.filter((q) => q[2] === 0).forEach((q) => { const xa = X1(q[0]) + 3, xb = X1(q[1]) - 3; g.line(xa, y, xb, y, { color: cA, w: 2.2, alpha: a }); g.line(xa, y - 6, xa, y + 6, { color: cA, w: 2.2, alpha: a }); g.line(xb, y - 6, xb, y + 6, { color: cA, w: 2.2, alpha: a }); });
            const b1 = P(S, 0, 1, 0.2);
            br(D.demo, yG1 - 26, b1 * (1 - 0.5 * d2));
            br(D.demo2, yG2 - 26, clamp((d2 - 0.6) / 0.4));
            g.text('intact segments', x0 + W + 24, yG1 - 18, { size: 22, color: cA, alpha: b1 });
            g.text('shorter each generation', x0 + W, yG2 + 50, { size: 23, color: PAL.ink, align: 'right', alpha: clamp((d2 - 0.6) / 0.4) });
            g.text('meiosis 1', x0 + W + 24, yG1 + 8, { size: 21, color: PAL.ink3, alpha: clamp(d1 * 2 - 1) });
            g.text('meiosis 2', x0 + W + 24, yG2 + 8, { size: 21, color: PAL.ink3, alpha: clamp(d2 * 2 - 1) });
          });
        }
        // ---------------- beat 1: three second-degree relationships
        const a1 = vis(S, 1, 2);
        if (a1 > 0) {
          const meta = [['grandparent–grandchild', 1, PAL.heather, 0.04], ['half siblings', 2, PAL.mint, 0.42], ['aunt–nephew', 3, PAL.ochre, 0.62]];
          label(g, 'Shared IBD, 12 chromosomes', 140, 262, a1);
          label(g, 'Segment length (cM)', 1040, 262, a1 * S.tp(sent(S, 1, 2, 0.2), 0.6));
          D.rows.forEach((row, ri) => {
            const [nm, mei, col] = meta[ri];
            const t0 = ri === 0 ? sent(S, 1, 0, 0.1) : sent(S, 1, 1, ri === 1 ? 0.05 : 0.55);
            const ra = S.tp(t0, 0.7) * a1; if (ra <= 0) return;
            const y0 = 320 + ri * 196;
            g.text(nm, 140, y0, { size: 27, role: 'display', italic: true, color: col, alpha: ra });
            g.text(mei + (mei > 1 ? ' meioses' : ' meiosis'), 680, y0, { size: 21, color: PAL.ink3, alpha: ra });
            // genome: 12 chromosome bars in two rows of six, proportional to length
            const pr = S.tp(t0 + 0.2, 1.6);
            let x = 140, yy = y0 + 38; const scale = 540 / D.GEN.slice(0, 6).reduce((a, b) => a + b, 0);
            D.GEN.forEach((L, ci) => {
              if (ci === 6) { x = 140; yy += 36; }
              const w = L * scale - 6;
              KIN.chrom(g, x, yy, w, row.ex.chr[ci].map((s) => ({ a: s[0], b: s[1], color: col })), { h: 16, progress: pr, alpha: ra });
              x += w + 8;
            });
            // stats
            const sa = S.tp(sent(S, 1, 2, 0.05) + ri * 0.3, 0.6) * a1;
            g.text(Math.round(row.nseg) + ' segments', 760, y0 + 40, { size: 22, color: PAL.ink, alpha: sa });
            g.text('mean ' + Math.round(row.mean) + ' cM', 760, y0 + 72, { size: 22, color: PAL.ink2, alpha: sa });
            g.text('shared ' + Math.round(row.frac * 100) + '%', 760, y0 + 104, { size: 22, color: PAL.ink2, alpha: sa });
            // histogram of segment lengths
            const hx = 1040, hy = y0 + 104, hw = 250, hh = 90;
            g.line(hx, hy, hx + hw, hy, { color: PAL.ink3, w: 1.5, alpha: sa });
            row.bins.forEach((b, k) => { const h = hh * b * sa; g.rect(hx + k * hw / 10 + 2, hy - h, hw / 10 - 4, h, { fill: U.rgba(col, 0.75), r: 2 }); });
            const mx = hx + hw * Math.min(1, row.mean / 250);
            g.line(mx, hy - hh - 6, mx, hy, { color: PAL.ink, w: 2, dash: [4, 4], alpha: sa });
            if (ri === 2) ['0', '100', '200'].forEach((l, k) => g.text(l, hx + k * hw * 0.4, hy + 24, { size: 18, color: PAL.ink3, align: 'center', alpha: sa }));
          });
          const ka = S.tp(sent(S, 1, 2, 0.5), 0.7) * a1;
          g.math('k_1 = ½ \\quad r = ¼', 140, 900, { size: 34, color: PAL.ink, alpha: ka });
          g.text('same expectation, different pieces', 500, 896, { size: 22, color: PAL.ink2, alpha: ka });
        }
        // ---------------- beat 2: realized relatedness of full sibs
        const a2 = vis(S, 2, 3);
        if (a2 > 0) {
          label(g, 'Full siblings: realized relatedness', 140, 262, a2);
          const AX = g.axes({ x: 200, y: 320, w: 1060, h: 460, xmin: 0.25, xmax: 0.75, ymin: 0, ymax: 1, arrows: false, alpha: a2, progress: S.p(2, 1, 0.3), xticks: [0.3, 0.4, 0.5, 0.6, 0.7].map((v) => ({ v, l: v.toFixed(1) })) });
          g.text('fraction of genome shared IBD', AX.x + AX.w, AX.y + AX.h + 62, { size: 22, color: PAL.ink2, align: 'right', alpha: a2 });
          const eA = a2 * S.tp(sent(S, 2, 1, 0.02), 0.8);
          g.line(AX.X(0.5), AX.y - 10, AX.X(0.5), AX.y + AX.h, { color: PAL.ink, w: 2, dash: [6, 7], alpha: eA });
          g.text('expected ½', AX.X(0.5) + 10, AX.y + 8, { size: 22, color: PAL.ink, alpha: eA });
          const bH = AX.y + 236, bS = AX.y + AX.h - 8;
          const drop = (v, spr, t0, base) => {
            const cnt = new Map(), bw = 0.0075;
            for (const [x, d] of v) {
              const b = Math.round((x - 0.25) / bw); const n = cnt.get(b) || 0; cnt.set(b, n + 1);
              const f = ease.out((t - t0 - d * 4.5) / 0.6); if (f <= 0) continue;
              blit(ctx, spr, AX.X(0.25 + b * bw), lerp(AX.y - 30, base - n * 7.4, f), a2 * f);
            }
          };
          const tH = sent(S, 2, 1, 0.08), tS = sent(S, 2, 1, 0.66);
          g.line(AX.x, bH + 8, AX.x + AX.w, bH + 8, { color: PAL.rule, w: 1.5, alpha: a2 * S.tp(tH, 0.6) });
          drop(D.fsH, D.sprH, tH, bH);
          drop(D.fsS, D.sprS, tS, bS);
          const brk = (sdv, y, col, a, nm) => g.withAlpha(a, () => { const lo = AX.X(0.5 - 2 * sdv), hi = AX.X(0.5 + 2 * sdv); g.arrow(lo, y, hi, y, { color: col, w: 2.5, head: 11, both: true }); g.text(nm, hi + 16, y + 8, { size: 23, color: col }); });
          brk(D.sdH, bH + 36, COL, S.tp(sent(S, 2, 1, 0.5), 0.6) * a2, '≈ 0.4 – 0.6');
          brk(D.sdS, bH + 92, PAL.ochre, S.tp(sent(S, 2, 1, 0.82), 0.6) * a2, 'wider');
          g.text('human map', 220, bH - 120, { size: 23, color: COL, alpha: S.tp(tH, 0.6) * a2 });
          g.text('22 chr · 35 M', 220, bH - 90, { size: 20, color: PAL.ink3, alpha: S.tp(tH, 0.6) * a2 });
          g.text('short map', 220, bS - 90, { size: 23, color: PAL.ochre, alpha: S.tp(tS, 0.6) * a2 });
          g.text('6 chr · 6 M', 220, bS - 60, { size: 20, color: PAL.ink3, alpha: S.tp(tS, 0.6) * a2 });
          tag(g, 'simulated · 360 sib pairs each · ±2 SD', AX.x + AX.w, 896, S.tp(tH + 1.5, 0.6) * a2, 'right');
          g.pill('measures what was inherited', 200, 884, { size: 22, color: PAL.moss, alpha: P(S, 2, 2, 0.1) * a2 });
        }
        // ---------------- beat 3: marker density
        const a3 = S.p(3, 0.9);
        if (a3 > 0) {
          label(g, 'One chromosome, half-sib pair', 140, 262, a3);
          const x0 = 400, W = 880;
          // truth
          const ty = 330;
          g.text('true IBD', 140, ty + 8, { size: 23, color: PAL.ink2, alpha: a3 });
          KIN.chrom(g, x0, ty, W, D.segs.map((s) => ({ a: s[0], b: s[1], color: PAL.mint })), { h: 22, alpha: a3, progress: S.p(3, 1, 0.3) });
          const names = [['amplicon panel', 'few hundred / genome'], ['RADseq', 'patchy'], ['whole genome', 'dense']];
          const tt = [sent(S, 3, 0, 0.66), sent(S, 3, 0, 0.74), sent(S, 3, 0, 0.82)];
          D.panels.forEach((pn, k) => {
            const y = 470 + k * 140; const a = S.tp(tt[k], 0.6) * a3;
            const ra = S.tp(tt[k] + 0.1, 1.0);
            if (a <= 0) return;
            g.text(names[k][0], 140, y + 4, { size: 24, color: PAL.ink, alpha: a });
            g.text(names[k][1], 140, y + 34, { size: 20, color: PAL.ink3, alpha: a });
            g.rect(x0, y - 9, W, 18, { fill: 'rgba(238,231,215,0.06)', r: 9, alpha: a });
            for (const m of pn) {
              if (m.x > ra) break; const px = x0 + W * m.x;
              g.line(px, y - 14, px, y + 14, { color: m.opp ? PAL.coral : PAL.ink2, w: k === 2 ? 0.7 : 2, alpha: a * (k === 2 ? (m.opp ? 0.9 : 0.35) : 0.9) });
            }
            if (k === 2) {
              const ca = P(S, 3, 1, 0.7) * a3;
              for (const s of D.called) g.rect(x0 + W * s[0], y + 24, W * (s[1] - s[0]), 10, { fill: U.rgba(PAL.moss, 0.85), r: 5, alpha: ca });
              g.text('segments recovered', x0 + W, y + 62, { size: 21, color: PAL.moss, align: 'right', alpha: ca });
            }
            if (k === 0) g.pill('cannot see segments', x0 + W, y + 46, { size: 20, color: PAL.coral, align: 'right', alpha: P(S, 3, 1, 0.3) * a3 });
          });
          // reference genome badge
          const rA = P(S, 3, 0, 0.3) * a3;
          g.withAlpha(rA, () => {
            g.rect(140, 832, 400, 56, { fill: 'rgba(18,36,38,0.82)', stroke: U.rgba(PAL.ochre, 0.6), w: 1.5, r: 10 });
            for (let k = 0; k < 5; k++) g.rect(158 + k * 14, 846 + (k % 2) * 4, 8, 28 - (k % 2) * 8, { fill: PAL.ochre, r: 4 });
            g.text('chromosome-level reference', 240, 868, { size: 21, color: PAL.ochre });
          });
          g.line(x0 + W - 300, 870, x0 + W - 276, 870, { color: PAL.coral, w: 2.5, alpha: a3 * S.tp(tt[2], 0.6) });
          g.text('opposite homozygotes', x0 + W - 266, 878, { size: 20, color: PAL.ink3, alpha: a3 * S.tp(tt[2], 0.6) });
        }
      },
    },
    /* VISUAL BRIEF (rel-sexbias): A landscape strip with luminous individuals: females (circles, rose)
       clustered near natal sites, males (squares, lagoon) dispersed. Beat 1: pair links drawn for FF, FM,
       MM; then a plot of mean kinship vs distance class for three lines (FF high at short distance,
       decaying; MM flat; FM intermediate). Beat 2: an offset (bias from inbreeding/allele frequencies)
       lifts all three lines together by the same amount, while the gap between FF and MM is bracketed and
       stays constant: "difference preserved". Beat 3: permutation test: sex labels shuffle (dots swap
       colours), a null histogram of FF−MM differences builds bar by bar, observed value as a vertical line
       far in the tail, p-value. Beat 4: a pedigree overlay showing kinship summing over every path (paths
       light up one by one, adding into a running φ), label "kinship already includes shared parents". */
    {
      id: 'rel-sexbias', title: 'Asking a relative question',
      beats: [
        { t: 'Many ecological questions never need a named relationship. Take sex-biased dispersal: if females stay near where they were born and males disperse, nearby females should be more related to one another than nearby males.' },
        { t: 'Estimate kinship for every female–female, female–male, and male–male pair, and compare the classes, often as a function of the distance between them.' },
        { t: 'Any bias that shifts the baseline, from inbreeding or from imperfect allele frequencies, shifts all the classes roughly together, as long as the sexes share one ancestry mix. The question concerns the difference between classes, and the shared offset cancels.' },
        { t: 'Test the difference by permutation. Shuffle the sex labels, recompute, and ask how often a difference this large arises by chance. Spatial autocorrelation by pair class, in the style of Smouse and Peakall, does the same along a distance axis.' },
        { t: 'Nor do you need to account separately for shared parents. Kinship is already the sum of all shared ancestry, through every path, including shared parents and inbreeding loops. It is exactly the quantity this question needs.', pause: 0.8 },
      ],
      terms: [
        { beat: 0.5, term: 'Sex-biased dispersal', def: 'One sex disperses farther than the other; predicts higher kinship among nearby members of the philopatric sex.' },
        { beat: 3.2, term: 'Permutation test', def: 'Builds a null distribution by shuffling labels (here, sex) and recomputing the statistic; robust to shared baseline biases.' },
      ],
      init() {
        // Individual-based model on a 1-D landscape: females settle near their natal site, males disperse.
        // Pedigree kinship is tracked exactly (tabular method) over 20 generations from unrelated founders.
        const r = rng(37), N = 160, G = 20, sdF = 0.012, sdM = 0.35, mw = 0.05;
        const refl = (x) => { while (x < 0 || x > 1) { if (x < 0) x = -x; if (x > 1) x = 2 - x; } return x; };
        let pop = []; for (let i = 0; i < N; i++) pop.push({ x: r(), s: i % 2 ? 'M' : 'F' });
        let K = []; for (let i = 0; i < N; i++) { K.push(new Float64Array(N)); K[i][i] = 0.5; }
        for (let gen = 0; gen < G; gen++) {
          const Fs = [], Ms = []; pop.forEach((p, i) => (p.s === 'F' ? Fs : Ms).push(i));
          const kids = [];
          for (let n = 0; n < N; n++) {
            const mo = Fs[Math.floor(r() * Fs.length)];
            const w = Ms.map((m) => Math.exp(-((pop[m].x - pop[mo].x) ** 2) / (2 * mw * mw))); const sw = w.reduce((a, b) => a + b, 0);
            let u = r() * sw, fa = Ms[0]; for (let k = 0; k < Ms.length; k++) { u -= w[k]; if (u <= 0) { fa = Ms[k]; break; } }
            const s = n % 2 ? 'M' : 'F'; const nat = pop[mo].x;
            kids.push({ x: refl(nat + gauss(r) * (s === 'F' ? sdF : sdM)), nat, s, fa, mo });
          }
          const K2 = []; for (let i = 0; i < N; i++) K2.push(new Float64Array(N));
          for (let i = 0; i < N; i++) for (let j = i; j < N; j++) {
            const a = kids[i], b = kids[j];
            const v = i === j ? 0.5 * (1 + K[a.fa][a.mo]) : 0.25 * (K[a.fa][b.fa] + K[a.fa][b.mo] + K[a.mo][b.fa] + K[a.mo][b.mo]);
            K2[i][j] = K2[j][i] = v;
          }
          K = K2; pop = kids;
        }
        pop.forEach((p) => { p.y = 0.12 + 0.76 * r(); });
        // Pairs, centred on the mean pairwise kinship (marker estimates are relative to the sample).
        const pairs = []; let mean = 0;
        for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) { pairs.push([i, j, Math.abs(pop[i].x - pop[j].x), K[i][j]]); mean += K[i][j]; }
        mean /= pairs.length;
        const CL = [0, 0.04, 0.08, 0.15, 0.25, 0.4, 0.6, 1.0]; const nc = CL.length - 1;
        pairs.forEach((p) => { let c = 0; while (c < nc - 1 && p[2] >= CL[c + 1]) c++; p.push(c); p[3] -= mean; });
        const classMeans = (sx) => {
          const s = { FF: new Float64Array(nc), FM: new Float64Array(nc), MM: new Float64Array(nc) }, n = { FF: new Float64Array(nc), FM: new Float64Array(nc), MM: new Float64Array(nc) };
          for (const [i, j, , k, c] of pairs) { const t = sx[i] === sx[j] ? sx[i] + sx[j] : 'FM'; s[t][c] += k; n[t][c]++; }
          for (const t in s) for (let c = 0; c < nc; c++) s[t][c] /= Math.max(1, n[t][c]);
          return s;
        };
        const sx0 = pop.map((p) => p.s); const obsM = classMeans(sx0);
        const stat = (m) => m.FF[0] - m.MM[0];
        const obs = stat(obsM);
        // Permutation null: shuffle sex labels, recompute.
        const NP = 400, nul = [], envFF = Array.from({ length: nc }, () => []), shuffles = [];
        for (let k = 0; k < NP; k++) {
          const s = sx0.slice(); for (let i = s.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const tmp = s[i]; s[i] = s[j]; s[j] = tmp; }
          const m = classMeans(s); nul.push(stat(m)); for (let c = 0; c < nc; c++) envFF[c].push(m.FF[c]);
          if (k < 14) shuffles.push(s);
        }
        const env = envFF.map((v) => { v.sort((a, b) => a - b); return [v[Math.floor(0.025 * NP)], v[Math.floor(0.975 * NP)]]; });
        const ge = nul.filter((v) => v >= obs).length; const pval = (ge + 1) / (NP + 1);
        const mids = CL.slice(0, -1).map((a, k) => (a + CL[k + 1]) / 2);
        const hLo = Math.min(...nul) - 0.002, hHi = obs * 1.12, NB = 34; const hb = new Array(NB).fill(0);
        for (const v of nul) hb[clamp(Math.floor((v - hLo) / (hHi - hLo) * NB), 0, NB - 1)]++;
        const hMax = Math.max(...hb);
        // Links to draw: a sample of near pairs of each class.
        const near = pairs.filter((p) => p[2] < 0.05); const links = [];
        for (const p of near) if (r() < 0.22) links.push(p);
        return { pop, obsM, mids, obs, nul, env, pval, shuffles, links, NP, hLo, hHi, NB, hMax };
      },
      draw(g, t, S, D) {
        const SX = KIN.SEX; const CF = { FF: SX.F, MM: SX.M, FM: PAL.heather };
        // ---------------- landscape strip (beats 0–3)
        const LX = 170, LW = 1100, LY = 290, LH = 150;
        const lA = vis(S, 0, 4);
        const X = (x) => LX + LW * x, Yl = (y) => LY + LH * y;
        if (lA > 0) {
          label(g, 'A landscape', LX, 262, lA);
          g.rect(LX - 20, LY - 10, LW + 40, LH + 20, { fill: 'rgba(238,231,215,0.035)', stroke: PAL.rule, w: 1.2, r: 14, alpha: lA });
          const tF = sent(S, 0, 1, 0.3), tM = sent(S, 0, 1, 0.55);
          const fF = S.tp(tF, 1.6), fM = S.tp(tM, 2.2);
          // beat 3: shuffled labels
          const tSh = sent(S, 3, 1, 0.0); const shN = clamp(Math.floor((t - tSh) / 0.42), -1, D.shuffles.length - 1);
          const shA = 1 - S.p(4, 0.6);
          const sexOf = (i) => (shN >= 0 && t < S.b(4) ? D.shuffles[shN][i] : D.pop[i].s);
          const appear = S.p(0, 1.2, 0.8);
          // pair links (beat 1)
          const linkA = vis(S, 1, 3) * lA;
          if (linkA > 0) D.links.forEach(([i, j], k) => {
            const a = linkA * S.p(1, 0.5, 0.6 + (k % 40) * 0.05); const si = D.pop[i].s, sj = D.pop[j].s; const c = si === sj ? CF[si + sj] : CF.FM;
            const xi = X(D.pop[i].x), yi = Yl(D.pop[i].y), xj = X(D.pop[j].x), yj = Yl(D.pop[j].y);
            g.carrow(xi, yi, xj, yj, 0.3, { color: c, w: 1.4, alpha: a * 0.7, head: 0 });
          });
          D.pop.forEach((p, i) => {
            const f = p.s === 'F' ? fF : fM; const x = X(lerp(p.nat, p.x, f)), y = Yl(p.y);
            const sx = sexOf(i); const c = SX[sx];
            KIN.person(g, x, y, { sex: sx, r: 6.5, color: c, fill: U.rgba(c, 0.45), w: 1.6, alpha: appear * lA });
          });
          g.text('females stay', X(0), LY + LH + 44, { size: 22, color: SX.F, alpha: S.tp(tF, 0.6) * lA * (1 - S.p(1, 0.6)) });
          g.text('males disperse', X(0) + 170, LY + LH + 44, { size: 22, color: SX.M, alpha: S.tp(tM, 0.6) * lA * (1 - S.p(1, 0.6)) });
          if (shN >= 0 && t < S.b(4)) g.pill('labels shuffled #' + (shN + 1), X(1), LY + LH + 44, { size: 20, color: PAL.ochre, align: 'right', alpha: lA * shA });
          const pA = S.tp(sent(S, 1, 0, 0.1), 0.6) * vis(S, 1, 3) * lA;
          [['F–F', CF.FF], ['F–M', CF.FM], ['M–M', CF.MM]].forEach(([n, c], k) => { g.line(X(0) + k * 120, LY + LH + 38, X(0) + k * 120 + 26, LY + LH + 38, { color: c, w: 3, alpha: pA }); g.text(n, X(0) + k * 120 + 34, LY + LH + 46, { size: 21, color: c, alpha: pA }); });
        }
        // ---------------- kinship by distance class (beats 1–3)
        const pA = vis(S, 1, 4);
        const off = 0.012 * S.io(2, 1.6, 2.0) * (1 - S.io(3, 0.8));
        if (pA > 0) {
          const AX = g.axes({ x: 230, y: 560, w: 520, h: 260, xmin: -0.08, xmax: 0.82, ymin: -0.015, ymax: 0.035, arrows: false, alpha: pA, progress: S.p(1, 1, 0.6),
            yticks: [{ v: 0, l: '0' }, { v: 0.02, l: '0.02' }], xticks: [{ v: 0, l: '0' }, { v: 0.4, l: '0.4' }, { v: 0.8, l: '0.8' }] });
          g.text('distance', AX.x + AX.w, AX.y + AX.h + 56, { size: 22, color: PAL.ink2, align: 'right', alpha: pA });
          g.text('kinship, relative to mean', AX.x - 6, AX.y - 24, { size: 22, color: PAL.ink2, alpha: pA });
          g.line(AX.x, AX.Y(0), AX.x + AX.w, AX.Y(0), { color: PAL.rule, w: 1.2, dash: [4, 6], alpha: pA });
          // permutation envelope for F–F (Smouse & Peakall style), beat 3
          const eA = P(S, 3, 2, 0.15) * pA;
          if (eA > 0) {
            const up = D.mids.map((m, c) => [AX.X(m), AX.Y(D.env[c][1])]), lo = D.mids.map((m, c) => [AX.X(m), AX.Y(D.env[c][0])]).reverse();
            g.poly([...up, ...lo], { fill: U.rgba(PAL.ink, 0.1), color: null, w: 0, alpha: eA, close: true });
            g.text('95% permutation envelope', AX.X(0.8), AX.Y(D.env[6][1]) - 14, { size: 20, color: PAL.ink3, align: 'right', alpha: eA });
          }
          ['MM', 'FM', 'FF'].forEach((k, n) => {
            const pr = S.p(1, 1.4, 1.6 + n * 0.8);
            const pts = D.mids.map((m, c) => [AX.X(m), AX.Y(D.obsM[k][c] + off)]);
            if (off > 0.0005) g.poly(D.mids.map((m, c) => [AX.X(m), AX.Y(D.obsM[k][c])]), { color: CF[k], w: 1.5, dash: [4, 6], alpha: 0.5 * pA });
            g.poly(pts, { color: CF[k], w: k === 'FM' ? 2.5 : 3.5, progress: pr, alpha: pA });
            pts.forEach(([x, y], c) => { if (pr > c / 7) g.dot(x, y, 4.5, CF[k], pA, 2); });
            const last = pts[pts.length - 1]; g.text(k[0] + '–' + k[1], last[0] + 14, last[1] + 7 + (k === 'FF' ? 16 : k === 'MM' ? -12 : 2), { size: 21, color: CF[k], alpha: pr * pA });
          });
          // beat 2: the difference is preserved
          const bA = vis(S, 2, 3) * pA;
          if (bA > 0) {
            const x = AX.X(-0.035), y1 = AX.Y(D.obsM.FF[0] + off), y2 = AX.Y(D.obsM.MM[0] + off);
            g.line(x, y1, x, y2, { color: PAL.ink, w: 2.5, alpha: bA }); g.line(x - 6, y1, x + 6, y1, { color: PAL.ink, w: 2.5, alpha: bA }); g.line(x - 6, y2, x + 6, y2, { color: PAL.ink, w: 2.5, alpha: bA });
            const oa = S.p(2, 0.8, 2.0) * bA;
            g.arrow(AX.X(0.6), AX.Y(-0.008), AX.X(0.6), AX.Y(-0.008) - (AX.Y(0) - AX.Y(0.012)), { color: PAL.ochre, w: 2.5, head: 12, alpha: oa });
            g.text('shared offset', AX.X(0.6) + 14, AX.Y(-0.004), { size: 21, color: PAL.ochre, alpha: oa });
          }
          tag(g, 'simulated · 160 individuals · 20 generations · pedigree kinship', AX.x, 906, S.p(1, 0.8, 4) * pA);
        }
        // ---------------- beat 2 right: the algebra of the offset
        const qA = vis(S, 2, 3);
        if (qA > 0) {
          g.math('\\hat{φ}_{ij} = φ_{ij} + δ', 880, 620, { size: 46, alpha: qA * S.p(2, 0.8, 1.0) });
          g.math('\\bar{φ}_{FF} − \\bar{φ}_{MM}', 880, 720, { size: 44, color: PAL.ink, alpha: qA * P(S, 2, 1, 0.1) });
          g.text('δ cancels', 880, 790, { size: 30, role: 'display', italic: true, color: PAL.moss, alpha: qA * P(S, 2, 1, 0.55) });
          g.text('one shared ancestry mix', 880, 842, { size: 21, color: PAL.ink3, alpha: qA * S.p(2, 0.8, 6.5) });
        }
        // ---------------- beat 3 right: permutation null
        const hA = vis(S, 3, 4);
        if (hA > 0) {
          const H = { x: 870, y: 580, w: 400, h: 240 }; const lo = D.hLo, hi = D.hHi, nb = D.NB;
          const Xh = (v) => H.x + H.w * (v - lo) / (hi - lo);
          label(g, 'Permutation null', H.x, 540, hA);
          g.line(H.x, H.y + H.h, H.x + H.w, H.y + H.h, { color: PAL.ink2, w: 2, alpha: hA });
          const tSh = sent(S, 3, 1, 0.0); const n = Math.floor(D.NP * ease.inOut(S.tp(tSh, sent(S, 3, 2, 0) - tSh + 1.5)));
          const bins = new Array(nb).fill(0); for (let k = 0; k < n; k++) bins[clamp(Math.floor((D.nul[k] - lo) / (hi - lo) * nb), 0, nb - 1)]++;
          const bw = H.w / nb, sc = (H.h - 40) / D.hMax;
          bins.forEach((b, k) => { const h = b * sc; if (h > 0) g.rect(H.x + k * bw + 1, H.y + H.h - h, bw - 2, h, { fill: U.rgba(PAL.ochre, 0.75), r: 2, alpha: hA }); });
          g.text(n + ' shuffles', H.x, H.y + H.h + 34, { size: 21, color: PAL.ochre, alpha: hA * S.tp(tSh, 0.5) });
          const oA = hA * S.tp(sent(S, 3, 1, 0.5), 0.6);
          const ox = Xh(D.obs); g.line(ox, H.y + 14, ox, H.y + H.h, { color: PAL.coral, w: 3.5, alpha: oA });
          g.text('observed', ox, H.y + 2, { size: 21, color: PAL.coral, align: 'right', alpha: oA });
          g.math('\\bar{φ}_{FF} − \\bar{φ}_{MM}', H.x + H.w, H.y + H.h + 40, { size: 26, color: PAL.ink2, align: 'right', alpha: hA });
          const pv = D.pval < 0.01 ? 'p < 0.01' : 'p = ' + D.pval.toFixed(3);
          g.pill(pv, ox - 14, H.y + 60, { size: 22, color: PAL.coral, align: 'right', alpha: hA * S.tp(sent(S, 3, 1, 0.85), 0.6) });
        }
        // ---------------- beat 4: kinship sums every path (Wright's path counting)
        const kA = S.p(4, 0.9);
        if (kA > 0) {
          label(g, 'Kinship sums every path', 150, 262, kA);
          const N = { h1: [260, 340], G: [470, 340], h2: [680, 340], F: [350, 540], M: [590, 540], i: [350, 760], j: [590, 760] };
          const E = [['h1', 'F'], ['G', 'F'], ['G', 'M'], ['h2', 'M'], ['F', 'i'], ['F', 'j'], ['M', 'i'], ['M', 'j']];
          const r = 26;
          const end = (a, b, rr) => { const [x1, y1] = N[a], [x2, y2] = N[b]; const L = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / L, uy = (y2 - y1) / L; return [x1 + ux * rr, y1 + uy * rr, x2 - ux * rr, y2 - uy * rr]; };
          g.withAlpha(kA, () => {
            E.forEach(([a, b]) => { const [x1, y1, x2, y2] = end(a, b, r + 6); g.arrow(x1, y1, x2, y2, { color: PAL.ink3, w: 2, head: 11 }); });
            KIN.person(g, ...N.h1, { sex: 'F', r, color: PAL.ink3 }); KIN.person(g, ...N.h2, { sex: 'F', r, color: PAL.ink3 });
            KIN.person(g, ...N.G, { sex: 'M', r, color: PAL.ochre, label: 'G', labelColor: PAL.ochre });
            KIN.person(g, ...N.F, { sex: 'M', r, color: SX.M, label: 'F' });
            KIN.person(g, ...N.M, { sex: 'F', r, color: SX.F, label: 'M' });
            KIN.person(g, ...N.i, { sex: 'F', r, color: PAL.ink, fill: U.rgba(COL, 0.35), label: 'i' });
            KIN.person(g, ...N.j, { sex: 'M', r, color: PAL.ink, fill: U.rgba(COL, 0.35), label: 'j' });
            g.text('F and M: half sibs through G', 470, 850, { size: 21, color: PAL.ink3, align: 'center' });
          });
          const paths = [
            { nodes: ['i', 'F', 'j'], c: SX.M, nm: 'via father', off: -9 },
            { nodes: ['i', 'M', 'j'], c: SX.F, nm: 'via mother', off: 9 },
            { nodes: ['i', 'F', 'G', 'M', 'j'], c: PAL.ochre, nm: 'via G', off: 0 },
            { nodes: ['i', 'M', 'G', 'F', 'j'], c: PAL.ochre, nm: 'via G, reversed', off: 0 },
          ];
          const tP = (k) => sent(S, 4, 1, [0.03, 0.2, 0.42, 0.62][k]);
          let phi = 0;
          paths.forEach((p, k) => {
            const a = S.tp(tP(k), 0.5) * kA; if (a <= 0) return;
            const pr = S.tp(tP(k), 1.5); const fade = k < 3 ? 1 - 0.65 * S.tp(tP(k + 1), 0.6) : 1;
            const pts = p.nodes.map((id) => [N[id][0] + p.off, N[id][1]]);
            const tip = g.poly(pts, { color: p.c, w: 6, alpha: 0.75 * a * fade, progress: pr });
            if (pr < 1 && tip) g.dot(tip[0], tip[1], 9, p.c, a, 3);
            if (pr >= 1) phi += Math.pow(0.5, p.nodes.length);
            const y = 360 + k * 78, n = p.nodes.length;
            g.math('(\\frac{1}{2})^{' + n + '} = ' + (n === 3 ? '\\frac{1}{8}' : '\\frac{1}{32}'), 820, y + 12, { size: 34, color: p.c, alpha: a });
            g.text(p.nm, 1040, y + 6, { size: 21, color: PAL.ink2, alpha: a });
          });
          const sA = S.tp(tP(3) + 1.6, 0.6) * kA;
          g.line(820, 668, 1270, 668, { color: PAL.rule, w: 1.5, alpha: kA * S.tp(tP(0), 0.5) });
          const runA = kA * S.tp(tP(0) + 1.5, 0.5) * (1 - sA);
          g.math('Σ = ' + (phi === 0.125 ? '\\frac{1}{8}' : phi === 0.25 ? '\\frac{1}{4}' : phi === 0.28125 ? '\\frac{9}{32}' : '0'), 820, 736, { size: 42, color: PAL.ink2, alpha: runA });
          g.math('φ_{ij} = \\frac{5}{16}', 820, 736, { size: 48, color: COL, alpha: sA });
          g.text('vs ¼ for ordinary full sibs', 1040, 730, { size: 21, color: PAL.ink3, alpha: sA });
          g.pill('already includes shared parents', 820, 820, { size: 22, color: PAL.moss, alpha: P(S, 4, 2, 0.05) * kA });
        }
      },
    },
  ],
});
})();
