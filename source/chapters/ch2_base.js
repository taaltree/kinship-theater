/* Chapter II — The reference population. */
(function () {
const { PAL, U, Theater } = window; const { clamp, lerp, ease, rng, gauss } = U;
const COL = PAL.ochre;

/* ---------------------------------------------------------------- local helpers */
const label = KIN.label, vis = KIN.vis;
// window: in at beat a (+da s), out at beat b (+db s)
const win = (S, a, da, b, db, d = 0.8) => S.p(a, d, da) * (b === undefined ? 1 : 1 - S.p(b, 0.6, db));
// in at absolute local time t0 (s), out at t1
const tw = (t, t0, t1, d = 0.7) => ease.out((t - t0) / d) * (t1 === undefined ? 1 : 1 - ease.inOut((t - t1) / 0.6));
const KCOL = PAL.lagoon, FCOL = PAL.coral, PCOL = PAL.ochre; // kinship · inbreeding · reference frequency
const illus = (g, x, y, a = 1, align = 'right') => g.text('simulated genotypes', x, y, { size: 17, color: PAL.ink3, align, alpha: a });

/* ---- genetics (deterministic; all estimates on screen are computed from simulated genotypes) */
function rgamma(r, a) { // Marsaglia–Tsang
  if (a < 1) return rgamma(r, a + 1) * Math.pow(r(), 1 / a);
  const d = a - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) { let x, v; do { x = gauss(r); v = 1 + c * x; } while (v <= 0); v = v * v * v; const u = r(); if (u < 1 - 0.0331 * x * x * x * x) return d * v; if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v; }
}
const rbeta = (r, a, b) => { const x = rgamma(r, a), y = rgamma(r, b); return x / (x + y); };
// Balding–Nichols draw of a subpopulation frequency with differentiation F_ST around ancestral p
const bnDraw = (r, p, F) => clamp(rbeta(r, p * (1 - F) / F, (1 - p) * (1 - F) / F), 0.004, 0.996);
// individual = [hapA, hapB], arrays of 0/1 (1 = counted allele)
const founder = (r, P) => [P.map((p) => (r() < p ? 1 : 0)), P.map((p) => (r() < p ? 1 : 0))];
const gamete = (r, ind) => ind[0].map((_, l) => ind[r() < 0.5 ? 0 : 1][l]);
const child = (r, a, b) => [gamete(r, a), gamete(r, b)];
const dosage = (ind) => ind[0].map((v, l) => v + ind[1][l]);
const freqs = (X) => X[0].map((_, l) => X.reduce((s, x) => s + x[l], 0) / (2 * X.length));
const clampP = (P) => P.map((p) => clamp(p, 0.01, 0.99));
// GRM element A_ij = (1/L) Σ (x_i − 2p)(x_j − 2p) / 2p(1 − p): ≈ 2φ off the diagonal, 1 + F on it
function grm(xi, xj, P) { let s = 0; for (let l = 0; l < P.length; l++) { const p = P[l]; s += (xi[l] - 2 * p) * (xj[l] - 2 * p) / (2 * p * (1 - p)); } return s / P.length; }
// Queller & Goodnight (1989), symmetric multilocus form, relatedness r
function qgR(X, Y, P) {
  let n1 = 0, d1 = 0, n2 = 0, d2 = 0;
  for (let l = 0; l < P.length; l++) {
    const pf = (al) => (al ? P[l] : 1 - P[l]); const a = X[0][l], b = X[1][l], c = Y[0][l], d = Y[1][l];
    const Sm = (a === c) + (a === d) + (b === c) + (b === d);
    n1 += Sm - 2 * (pf(a) + pf(b)); d1 += 2 * (1 + (a === b) - pf(a) - pf(b));
    n2 += Sm - 2 * (pf(c) + pf(d)); d2 += 2 * (1 + (c === d) - pf(c) - pf(d));
  }
  return 0.5 * (n1 / d1 + n2 / d2);
}
// Lynch & Ritland (1999), weighted multilocus, symmetric, relatedness r
function lrR(X, Y, P) {
  const one = (A, B) => { let num = 0, den = 0; for (let l = 0; l < P.length; l++) {
    const pf = (al) => (al ? P[l] : 1 - P[l]); const a = A[0][l], b = A[1][l], c = B[0][l], d = B[1][l]; const pa = pf(a), pb = pf(b), dab = a === b ? 1 : 0;
    const nn = pa * ((b === c) + (b === d)) + pb * ((a === c) + (a === d)) - 4 * pa * pb; const dd = (1 + dab) * (pa + pb) - 4 * pa * pb; if (dd <= 1e-9) continue;
    const w = dd / (2 * pa * pb); num += w * nn / dd; den += w; } return num / den; };
  return 0.5 * (one(X, Y) + one(Y, X));
}
// Wang (2002) relatedness, infinite-sample constants, loci weighted by 1/u (as in Demerelate)
function wangConsts(P) {
  return P.map((p) => { const q = 1 - p, a2 = p * p + q * q, a3 = p ** 3 + q ** 3, a4 = p ** 4 + q ** 4, a5 = a2 * a2;
    return [2 * a5 - a4, a2 - 2 * a5 + a4, 4 * (a3 - a4), 2 * (a2 - 3 * a3 + 2 * a4), 4 * (a2 - a5 - 2 * a3 + 2 * a4), 1 - 7 * a2 + 4 * a5 + 10 * a3 - 8 * a4, 2 * a2 - a3]; });
}
function wangR(X, Y, P, W) {
  let su = 0; const Ps = [0, 0, 0], as = [0, 0, 0, 0, 0, 0];
  for (let l = 0; l < P.length; l++) {
    const a = X[0][l], b = X[1][l], c = Y[0][l], d = Y[1][l];
    const s = ((a === c) || (a === d)) + ((b === c) || (b === d)) + ((c === a) || (c === b)) + ((d === a) || (d === b));
    const w = 1 / W[l][6]; su += w; if (s === 4) Ps[0] += w; else if (s === 3) Ps[1] += w; else if (s === 2) Ps[2] += w;
    for (let k = 0; k < 6; k++) as[k] += w * W[l][k]; // Σ(c_l/u_l) / Σ(1/u_l)
  }
  for (let k = 0; k < 3; k++) Ps[k] /= su; for (let k = 0; k < 6; k++) as[k] /= su;
  const [b, c, d, e, f, gg] = as;
  const V = (1 - b) ** 2 * (e * e * f + d * gg * gg) - (1 - b) * (e * f - d * gg) ** 2 + 2 * c * d * f * (1 - b) * (gg + e) + c * c * d * f * (d + f);
  const two = (d * f * ((e + gg) * (1 - b) + c * (d + f)) * (Ps[0] - 1) + d * (1 - b) * (gg * (1 - b - d) + f * (c + e)) * Ps[2] + f * (1 - b) * (e * (1 - b - f) + d * (c + gg)) * Ps[1]) / V;
  const four = (c * d * f * (e + gg) * (Ps[0] + 1 - 2 * b) + ((1 - b) * (f * e * e + d * gg * gg) - (e * f - d * gg) ** 2) * (Ps[0] - b) + c * (d * gg - e * f) * (d * Ps[2] - f * Ps[1]) - c * c * d * f * (Ps[2] + Ps[1] - d - f) - c * (1 - b) * (d * gg * Ps[2] + e * f * Ps[1])) / V;
  return two / 2 + four;
}
// KING-robust (Manichaikul et al. 2010): φ = (N_Aa,Aa − 2 N_AA,aa) / (N_Aa(i) + N_Aa(j))
function kingPhi(xi, xj) { let hh = 0, opp = 0, hi = 0, hj = 0; for (let l = 0; l < xi.length; l++) { const a = xi[l], b = xj[l]; if (a === 1) hi++; if (b === 1) hj++; if (a === 1 && b === 1) hh++; else if (a + b === 2 && a !== 1) opp++; } return (hh - 2 * opp) / (hi + hj); }
const mean = (v) => v.reduce((a, b) => a + b, 0) / v.length;
const sdev = (v) => { const m = mean(v); return Math.sqrt(mean(v.map((x) => (x - m) ** 2))); };

Theater.chapter({
  id: 'base', roman: 'II', title: 'The Reference Population', color: COL,
  question: 'Identity by descent, relative to what?',
  motif(g, t) { // a small genealogy cut by a dashed base line
    const p = ease.inOut((t - 0.6) / 3), a = 0.35;
    const X = (k) => 1180 + k * 70, Yb = 330;
    const seg = [[0, 1, 270], [2, 3, 290], [0.5, 2.5, 220], [4, 5, 250], [6, 7, 300], [5.5, 6.5, 200], [1.5, 6, 150]];
    for (let k = 0; k < 8; k++) g.dot(X(k), Yb, 4, COL, a * clamp(p * 3 - k * 0.1), 2);
    const top = { 0: Yb, 1: Yb, 2: Yb, 3: Yb, 4: Yb, 5: Yb, 6: Yb, 7: Yb };
    seg.forEach(([i, j, y], k) => { const q = clamp(p * 1.6 - k * 0.09); if (q <= 0) return; const yi = top[i] ?? Yb, yj = top[j] ?? Yb;
      g.line(X(i), yi, X(i), lerp(yi, y, q), { color: COL, w: 2, alpha: a }); g.line(X(j), yj, X(j), lerp(yj, y, q), { color: COL, w: 2, alpha: a });
      if (q >= 1) g.line(X(i), y, X(j), y, { color: COL, w: 2, alpha: a }); top[(i + j) / 2] = y; });
    g.line(1140, 240, 1700, 240, { color: COL, w: 2, dash: [8, 7], alpha: a * clamp(p * 2 - 1) });
  },
  intro: { t: 'Chapter two. The reference population: identity by descent, relative to what?' },
  scenes: [
    /* VISUAL BRIEF (base-relative): Beat 0: a coalescent-style genealogy of ~12 present-day alleles
       (dots along the bottom) whose lineages merge going up into the past; a horizontal "base generation"
       line slides upward through time — the higher it goes, the more pairs share an ancestor below it
       (pairs light up as "IBD"); at the top, all coalesce: "everyone is IBD, eventually". Beat 1: two
       bases side by side: "pedigree founders" (a line at the top of a small pedigree) vs "sample allele
       frequencies" (a bar of p for a locus computed from the present-day sample). Beat 2: a histogram /
       strip of pairwise marker kinship estimates centred at 0 with a long right tail (relatives) and a
       negative left side shaded "less related than the average pair"; a vertical line at 0 labelled
       "the average pair in your sample". Beat 3: the reference (allele frequency bar) is nudged and the
       whole histogram shifts together; arrow diagram: relatedness ← reference → inbreeding, with the
       original relatedness ↔ inbreeding arrow faded out. */
    {
      id: 'base-relative', title: 'Identical by descent, since when?',
      beats: [
        { t: 'Go back far enough and every pair of individuals shares an ancestor. Given enough generations, every allele in a population is identical by descent with every other. So identity by descent only has meaning relative to a base population: a point in the past where we declare everyone unrelated.' },
        { t: 'Pedigree coefficients set that base at the founders of the pedigree. Marker-based estimators set it implicitly, through the allele frequencies you supply, which are usually estimated from your own sample.' },
        { t: 'That makes marker estimates relative. They ask whether a pair is more related than the average pair in your sample, which is set to zero. Pairs less related than average receive negative values, and that is not an error.' },
        { t: 'This is where the real dependency lives. Not between relatedness and inbreeding, but between both of them and the reference allele frequencies. Change the reference, and every estimate shifts together.', pause: 0.8 },
      ],
      terms: [
        { beat: 0.82, term: 'Base population', def: 'The reference generation whose members are defined as unrelated and non-inbred; IBD is counted only since then.' },
        { beat: 2.8, term: 'Negative relatedness', def: 'A marker estimate below zero: the pair shares fewer alleles than the average pair in the reference sample. Expected, not an error.' },
      ],
      init() {
        // (1) Kingman coalescent for 12 present-day alleles (seed chosen for a legible, balanced tree)
        const r = rng(13), n = 12, nodes = [];
        for (let i = 0; i < n; i++) nodes.push({ h: 0, kids: [], par: -1 });
        let act = nodes.map((_, i) => i), h = 0;
        while (act.length > 1) {
          const k = act.length; h += -Math.log(r()) / (k * (k - 1) / 2);
          const i = Math.floor(r() * k); let j = Math.floor(r() * (k - 1)); if (j >= i) j++;
          const id = nodes.length; nodes.push({ h, kids: [act[i], act[j]], par: -1 }); nodes[act[i]].par = id; nodes[act[j]].par = id;
          act = act.filter((_, q) => q !== i && q !== j); act.push(id);
        }
        const root = nodes.length - 1, H = nodes[root].h;
        // leaf order by depth-first traversal; x of internal node = mean of children
        let ord = 0; const place = (v) => { const nd = nodes[v]; if (!nd.kids.length) { nd.slot = ord++; nd.leaves = [v]; return; } nd.kids.forEach(place); nd.kids.sort((a, b) => nodes[a].slot - nodes[b].slot); nd.slot = (nodes[nd.kids[0]].slot + nodes[nd.kids[1]].slot) / 2; nd.leaves = [...nodes[nd.kids[0]].leaves, ...nodes[nd.kids[1]].leaves]; };
        place(root);
        nodes.forEach((nd) => { nd.lead = Math.min(...nd.leaves.map((l) => nodes[l].slot)); });
        // MRCA height of every leaf pair
        const mrca = []; for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) { let v = a; while (!nodes[v].leaves.includes(b)) v = nodes[v].par; mrca.push(nodes[v].h); }
        const hs = nodes.slice(n).map((nd) => nd.h).sort((a, b) => a - b);
        const Bbase = (hs[6] + hs[7]) / 2; // declared base: between the 7th and 8th coalescence (5 ancestral lineages)
        // (2) Sample genotypes: 63 individuals, 1000 SNPs, with a few families; GRM kinship relative to sample p̂
        const r2 = rng(5), L = 1000; const P0 = Array.from({ length: L }, () => 0.08 + 0.84 * r2());
        const PR = P0.map((p) => bnDraw(r2, p, 0.02)); // a different reference population (F_ST = 0.02)
        const PS = P0.map((p) => bnDraw(r2, p, 0.02)); // the population actually sampled
        const inds = [], rel = {}; for (let i = 0; i < 36; i++) inds.push(founder(r2, PS));
        const addPair = (a, b, kind) => { rel[inds.length - 2 + ',' + (inds.length - 1)] = kind; };
        for (let k = 0; k < 6; k++) { const m = founder(r2, PS), f = founder(r2, PS); inds.push(child(r2, m, f), child(r2, m, f)); addPair(0, 0, 'FS'); }
        for (let k = 0; k < 6; k++) { const s = founder(r2, PS); inds.push(child(r2, s, founder(r2, PS)), child(r2, s, founder(r2, PS))); addPair(0, 0, 'HS'); }
        for (let k = 0; k < 3; k++) { inds.push(child(r2, inds[k], founder(r2, PS))); rel[k + ',' + (inds.length - 1)] = 'PO'; }
        const X = inds.map(dosage), N = X.length; const pS = clampP(freqs(X)), pR = clampP(PR);
        // estimates under references interpolated from the sample p̂ (λ = 0) to the other reference (λ = 1)
        const NL = 9, bins0 = -0.08, bw = 0.005, nb = 80; const kin = [], inb = [], kinRel = [], meanK = [], meanF = [];
        const raw = [];
        for (let s = 0; s < NL; s++) {
          const lam = s / (NL - 1), P = pS.map((p, l) => lerp(p, pR[l], lam)); const pairs = [], Fs = [];
          for (let i = 0; i < N; i++) { Fs.push(grm(X[i], X[i], P) - 1); for (let j = i + 1; j < N; j++) pairs.push([grm(X[i], X[j], P) / 2, rel[i + ',' + j]]); }
          raw.push([pairs, Fs]);
        }
        // marker kinship is reported relative to the average pair under the sample's own frequencies (= 0 there)
        const c0 = mean(raw[0][0].map((q) => q[0]));
        raw.forEach(([pairs, Fs]) => {
          const hk = new Array(nb).fill(0), hf = new Array(30).fill(0), relv = [];
          for (const [ph0, kind] of pairs) { const ph = ph0 - c0; if (kind) relv.push([ph, kind]); else hk[clamp(Math.floor((ph - bins0) / bw), 0, nb - 1)]++; }
          for (const F of Fs) hf[clamp(Math.floor((F + 0.15) / 0.015), 0, 29)]++;
          kin.push(hk); inb.push(hf); kinRel.push(relv.sort((a, b) => a[0] - b[0]));
          meanK.push(mean(pairs.map((q) => q[0])) - c0); meanF.push(mean(Fs));
        });
        // one-locus sample for the "sample allele frequency" panel: 20 individuals, locus with p ≈ 0.4
        let loc = 0, best = 9; for (let l = 0; l < L; l++) { const p = freqs(X.slice(0, 20).map((x) => [x[l]]))[0]; if (Math.abs(p - 0.4) < best) { best = Math.abs(p - 0.4); loc = l; } }
        const sample = inds.slice(0, 20).map((ind) => [ind[0][loc], ind[1][loc]]);
        const pLoc = sample.reduce((s, a) => s + a[0] + a[1], 0) / 40;
        return { nodes, root, H, n, mrca, Bbase, kin, inb, kinRel, NL, bins0, bw, nb, meanK, meanF, sample, pLoc, pRloc: pR[loc], pSloc: pS[loc], N };
      },
      draw(g, t, S, D) {
        const { nodes, root, H, n } = D;
        // ================= beat 0: coalescent genealogy and a rising base line
        const v0 = vis(S, 0, 1);
        if (v0 > 0) g.withAlpha(v0, () => {
          const X0 = 190, XW = 880, Y0 = 820, YH = 420;
          const xs = (slot) => X0 + slot / (n - 1) * XW, ys = (h) => Y0 - YH * Math.pow(h / H, 0.62);
          label(g, 'Twelve alleles today, traced into the past', 120, 262, S.p(0, 0.8));
          // time arrow
          g.arrow(130, 830, 130, 330, { color: PAL.ink3, w: 2, head: 12, progress: S.p(0, 1) });
          g.text('past', 120, 316, { size: 22, color: PAL.ink2, alpha: S.p(0, 1, 0.5) });
          g.text('today', 120, 872, { size: 22, color: PAL.ink2, alpha: S.p(0, 1, 0.5) });
          // tree grows upward with a time cursor, then the base line moves
          const cur = H * 1.06 * ease.inOut(S.lin(0, 3.0, 0.3));
          const tRise = S.io(0, 3.8, 3.6), tDrop = S.io(0, 1.5, 10.0);
          const B = tDrop > 0 ? lerp(H * 1.05, D.Bbase, tDrop) : H * 1.05 * tRise; // base height
          const showB = S.p(0, 0.6, 3.7);
          // colour of a lineage: the colour of its ancestor at the base line (leftmost descendant leaf's pigment)
          const LC = [PAL.heather, PAL.ochre, PAL.lagoon, PAL.coral, PAL.moss, PAL.rose, PAL.sand, PAL.mint, '#C9A8F0', '#F0C878', '#7DD8E8', '#F29A86'];
          const ancestorAt = (v) => { let a = v; while (a !== root && nodes[nodes[a].par].h <= B) a = nodes[a].par; return a; };
          const colOf = (v) => (showB > 0 ? LC[nodes[ancestorAt(v)].lead] : PAL.ink2);
          for (let v = 0; v < nodes.length; v++) {
            if (v === root) continue; const nd = nodes[v], pa = nodes[nd.par];
            const x = xs(nd.slot), y1 = ys(nd.h), top = Math.min(pa.h, cur), y2 = ys(top); if (cur < nd.h) continue;
            // part below the base is coloured by its base ancestor; above the base it is a dim shared lineage
            const below = nd.h < B; const yb = ys(clamp(B, nd.h, top));
            const c = below ? colOf(v) : PAL.ink3;
            if (below && showB > 0) { g.line(x, y1, x, yb, { color: c, w: 3.2, alpha: 0.95 }); g.line(x, yb, x, y2, { color: PAL.ink3, w: 2.2, alpha: 0.8 }); }
            else g.line(x, y1, x, y2, { color: showB > 0 ? PAL.ink3 : PAL.ink2, w: 2.4, alpha: 0.85 });
            if (cur >= pa.h) { const cAbove = pa.h < B && showB > 0 ? colOf(nd.par) : (showB > 0 ? PAL.ink3 : PAL.ink2); g.line(x, ys(pa.h), xs(pa.slot), ys(pa.h), { color: cAbove, w: pa.h < B && showB > 0 ? 3.2 : 2.4, alpha: 0.9 }); }
          }
          if (cur >= H) g.line(xs(nodes[root].slot), ys(H), xs(nodes[root].slot), ys(H) - 26, { color: PAL.ink3, w: 2.4, alpha: S.p(0, 0.5, 3.0) });
          // coalescence nodes
          for (let v = n; v < nodes.length; v++) if (cur >= nodes[v].h) g.circle(xs(nodes[v].slot), ys(nodes[v].h), 4.5, { fill: nodes[v].h < B && showB > 0 ? colOf(v) : PAL.ink2 });
          // present-day alleles
          for (let v = 0; v < n; v++) g.dot(xs(nodes[v].slot), Y0, 10, colOf(v), S.p(0, 0.6, 0.1 + v * 0.05), 2.4);
          // base line
          if (showB > 0) {
            const yB = ys(B); g.line(X0 - 30, yB, 1290, yB, { color: COL, w: 2.4, dash: [10, 8], alpha: showB });
            const named = S.p(0, 0.7, 11.2);
            g.text(named > 0.01 ? 'base population' : 'base', 1290, yB - 14, { size: 23, weight: 600, color: COL, align: 'right', alpha: showB });
            // ancestors at the declared base: one dot per lineage crossing the line
            if (named > 0) for (let v = 0; v < nodes.length; v++) { if (v === root) continue; const nd = nodes[v], pa = nodes[nd.par]; if (nd.h <= B && pa.h > B) { g.dot(xs(nd.slot), yB, 9, LC[nd.lead], named, 2.6); } }
            g.text('declared unrelated', 1290, yB + 34, { size: 21, color: PAL.ink2, align: 'right', alpha: S.p(0, 0.7, 12.8) });
          }
          // IBD pair counter
          const k = D.mrca.filter((m) => m <= B + 1e-9).length;
          const ca = showB;
          g.withAlpha(ca, () => {
            g.text('pairs IBD since the base', 1250, 878, { size: 21, color: PAL.ink2, align: 'right' });
            g.text(String(k).padStart(2, ' ') + ' / 66', 1250 - g.measure('pairs IBD since the base', { size: 21 }) - 18, 880, { size: 32, role: 'mono', color: k === 66 ? COL : PAL.ink, align: 'right' });
          });
          g.pill('everyone IBD, eventually', 710, 318, { color: COL, size: 23, align: 'center', alpha: S.p(0, 0.6, 7.0) * (1 - S.p(0, 0.5, 9.8)) });
        });

        // ================= beat 1: two ways to set the base
        const v1 = vis(S, 1, 2);
        if (v1 > 0) g.withAlpha(v1, () => {
          // left: pedigree founders
          label(g, 'Pedigree coefficients', 120, 262, S.p(1, 0.6));
          const pa = S.p(1, 0.8, 0.3), pb = S.p(1, 0.8, 1.0), pc = S.p(1, 0.8, 1.6);
          const fy = 410, y2 = 600, y3 = 780, R = 28;
          const F = [[170, fy, 'M'], [295, fy, 'F'], [435, fy, 'M'], [560, fy, 'F']];
          g.rect(120, fy - 62, 490, 124, { fill: U.rgba(COL, 0.07), stroke: U.rgba(COL, 0.5), w: 1.5, r: 14, alpha: pa });
          g.text('base = the founders', 365, fy - 80, { size: 24, weight: 600, color: COL, align: 'center', alpha: S.p(1, 0.7, 1.8) });
          g.math('φ = F = 0', 365, fy + 112, { size: 34, color: COL, align: 'center', alpha: S.p(1, 0.7, 2.2) * 0 });
          F.forEach(([x, y, sx], k) => KIN.person(g, x, y, { sex: sx, r: R, alpha: pa, alleles: [KIN.FOUNDER[2 * k % 8], KIN.FOUNDER[(2 * k + 1) % 8]] }));
          KIN.family(g, [170, fy], [295, fy], [[232, y2]], { progress: pb, r: R });
          KIN.family(g, [435, fy], [560, fy], [[498, y2]], { progress: pb, r: R });
          KIN.person(g, 232, y2, { sex: 'M', r: R, alpha: pb, alleles: [KIN.FOUNDER[0], KIN.FOUNDER[3]] });
          KIN.person(g, 498, y2, { sex: 'F', r: R, alpha: pb, alleles: [KIN.FOUNDER[5], KIN.FOUNDER[6]] });
          KIN.family(g, [232, y2], [498, y2], [[300, y3], [430, y3]], { progress: pc, r: R });
          KIN.person(g, 300, y3, { sex: 'F', r: R, alpha: pc, alleles: [KIN.FOUNDER[0], KIN.FOUNDER[6]] });
          KIN.person(g, 430, y3, { sex: 'M', r: R, alpha: pc, alleles: [KIN.FOUNDER[3], KIN.FOUNDER[6]] });
          g.math('φ = F = 0', 365, 880, { size: 40, color: COL, align: 'center', alpha: S.p(1, 0.7, 2.2) });
          g.text('at the founders', 365, 908 - 60, { size: 21, color: PAL.ink2, align: 'center', alpha: 0 });
          // divider
          g.line(675, 300, 675, 880, { color: PAL.rule, w: 1.5, alpha: S.p(1, 0.8, 3.2) });
          // right: sample allele frequencies
          const ra = S.p(1, 0.8, 3.4);
          label(g, 'Marker-based estimators', 740, 262, ra);
          const sp = D.sample; const gx = 800, gy = 350, dx = 110, dy = 80;
          const tally = S.lin(1, 3.2, 5.6); // alleles counted into the bar
          let counted = 0, A1 = 0;
          sp.forEach((al, i) => {
            const cx = gx + (i % 5) * dx, cy = gy + Math.floor(i / 5) * dy; const ai = S.p(1, 0.6, 3.6 + i * 0.05);
            KIN.person(g, cx, cy, { sex: 'U', r: 17, alpha: ai, w: 1.8 });
            const done = tally * sp.length > i; if (done) { counted += 2; A1 += al[0] + al[1]; }
            KIN.alleles(g, cx, cy + 34, al.map((a) => (a ? PCOL : PAL.ink2)), { size: 7, alpha: ai * (done ? 1 : 0.6), halo: done ? 1.8 : 0.01 });
          });
          // frequency bar = the implicit base
          const bx = 780, by = 800, bwid = 480, ba = S.p(1, 0.8, 5.0);
          g.rect(bx - 30, by - 72, bwid + 60, 124, { fill: U.rgba(COL, 0.07), stroke: U.rgba(COL, 0.5), w: 1.5, r: 14, alpha: S.p(1, 0.7, 7.8) });
          g.rect(bx, by - 15, bwid, 30, { fill: 'rgba(238,231,215,0.08)', stroke: PAL.rule, w: 1.5, r: 15, alpha: ba });
          const pNow = counted ? A1 / counted : 0;
          g.rect(bx, by - 15, Math.max(30 * (counted > 0), bwid * pNow), 30, { fill: U.rgba(PCOL, 0.85), r: 15, alpha: ba * (counted > 0 ? 1 : 0) });
          g.math('\\hat{p} = ' + pNow.toFixed(2), bx, by - 34, { size: 36, color: PCOL, alpha: ba });
          g.text(`${A1} of ${counted} sampled alleles`, bx + bwid, by - 36, { size: 21, role: 'mono', color: PAL.ink2, align: 'right', alpha: ba });
          g.text('base = your own sample', bx + bwid / 2, 880, { size: 24, weight: 600, color: COL, align: 'center', alpha: S.p(1, 0.7, 7.8) });
        });

        // ================= beats 2–3: relative estimates, then a shifted reference
        const v2 = S.p(2, 0.8);
        if (v2 > 0) g.withAlpha(v2, () => {
          const m3 = S.io(3, 1.2, 0.2); // layout morph: full width → right column
          const lam = S.io(3, 2.6, 6.8); // reference shift (Change the reference…)
          const sF = lam * (D.NL - 1), s0 = Math.min(D.NL - 2, Math.floor(sF)), fr = sF - s0;
          const hk = D.kin[s0].map((v, k) => lerp(v, D.kin[s0 + 1][k], fr));
          const AX = { x: lerp(190, 640, m3), y: lerp(330, 318, m3), w: lerp(1060, 640, m3), h: lerp(470, 232, m3) };
          const A = g.axes({ ...AX, xmin: -0.14, xmax: 0.32, ymin: 0, ymax: 230, progress: S.p(2, 1), arrows: false,
            xticks: [{ v: 0, l: '0' }, { v: 0.125, l: '0.125' }, { v: 0.25, l: '0.25' }] });
          label(g, m3 > 0.5 ? 'Kinship, every pair' : 'Marker kinship, every pair in the sample', lerp(120, 640, m3), 262, S.p(2, 0.6));
          g.math('\\hat{φ}_{ij}', A.x + A.w + 6, A.y + A.h + 46, { size: 32, align: 'right', alpha: S.p(2, 0.8, 0.6) });
          // negative region
          const na = S.p(2, 0.8, 6.6);
          g.rect(A.X(-0.14), A.y, A.X(0) - A.X(-0.14), A.h, { fill: U.rgba(FCOL, 0.1), alpha: na * (1 - lam) });
          g.text('less related', A.X(-0.103), A.y + 150, { size: 22, color: FCOL, align: 'center', alpha: na * (1 - m3) });
          g.text('than average', A.X(-0.103), A.y + 178, { size: 22, color: FCOL, align: 'center', alpha: na * (1 - m3) });
          // bars (unrelated pairs), growing in
          const grow = S.io(2, 1.6, 0.6);
          for (let k = 0; k < D.nb; k++) { const x0 = A.X(D.bins0 + k * D.bw), x1 = A.X(D.bins0 + (k + 1) * D.bw); const hv = Math.min(230, hk[k]) * grow; if (hv <= 0) continue; const neg = D.bins0 + (k + 0.5) * D.bw < 0;
            g.rect(x0 + 1, A.Y(hv), x1 - x0 - 2, A.Y(0) - A.Y(hv), { fill: U.rgba(neg && na > 0 ? U.mix(KCOL, FCOL, na * (1 - lam)) : KCOL, 0.75) }); }
          // relatives as individual dots in the right tail
          const rv = D.kinRel[s0].map((q, i) => [lerp(q[0], D.kinRel[s0 + 1][i][0], fr), q[1]]);
          const ra = S.p(2, 0.8, 2.6); const stack = {};
          rv.forEach(([ph, kind]) => { const b = Math.round(ph / 0.02); stack[b] = (stack[b] || 0) + 1; const yy = A.Y(0) - 10 - (stack[b] - 1) * lerp(20, 14, m3); g.dot(A.X(ph), yy, lerp(7, 5.5, m3), kind === 'HS' ? PAL.heather : KCOL, ra, 2.2); });
          g.text('relatives', A.X(0.19), A.Y(0) - lerp(150, 105, m3), { size: 22, color: PAL.ink2, align: 'center', alpha: ra });
          // zero line = the average pair
          const za = S.p(2, 0.8, 4.4);
          const xz = A.X(D.meanK[s0] + fr * (D.meanK[s0 + 1] - D.meanK[s0]));
          g.line(A.X(0), A.y - 4, A.X(0), A.Y(0), { color: PAL.ink, w: 2, dash: [6, 6], alpha: za * 0.6 * ease.out(lam * 4) });
          g.line(xz, A.y - 16, xz, A.Y(0), { color: COL, w: 3, alpha: za });
          g.text(lam > 0.02 ? 'average pair' : 'average pair = 0', xz, A.y - 26, { size: 22, weight: 600, color: COL, align: 'center', alpha: za });
          g.pill('negative ≠ error', A.X(-0.103), A.y + 240, { color: FCOL, size: 21, align: 'center', alpha: S.p(2, 0.7, 8.6) * (1 - m3) });
          illus(g, A.x + A.w, A.y - 26 + lerp(0, -6, m3), S.p(2, 0.6, 1.2) * (1 - m3));
          if (m3 > 0) {
            // inbreeding of every individual (diagonal of the same GRM)
            const hf = D.inb[s0].map((v, k) => lerp(v, D.inb[s0 + 1][k], fr));
            const Bx = g.axes({ x: 640, y: 672, w: 640, h: 150, xmin: -0.15, xmax: 0.3, ymin: 0, ymax: 16, progress: m3, arrows: false, xticks: [{ v: 0, l: '0' }, { v: 0.15, l: '0.15' }] });
            label(g, 'Inbreeding, every individual', 640, 640, m3);
            g.math('\\hat{F}_{i}', Bx.x + Bx.w + 6, Bx.y + Bx.h + 46, { size: 32, align: 'right', alpha: m3 });
            for (let k = 0; k < 30; k++) { const x0 = Bx.X(-0.15 + k * 0.015), x1 = Bx.X(-0.15 + (k + 1) * 0.015); const hv = Math.min(16, hf[k]); if (hv <= 0) continue; g.rect(x0 + 1, Bx.Y(hv), x1 - x0 - 2, Bx.Y(0) - Bx.Y(hv), { fill: U.rgba(FCOL, 0.75), alpha: m3 }); }
            g.line(Bx.X(0), Bx.y - 8, Bx.X(0), Bx.Y(0), { color: PAL.ink, w: 2, dash: [6, 6], alpha: m3 * 0.6 });
            const mf = D.meanF[s0] + fr * (D.meanF[s0 + 1] - D.meanF[s0]);
            g.line(Bx.X(mf), Bx.y + 4, Bx.X(mf), Bx.Y(0), { color: COL, w: 3, alpha: m3 });
            // readouts
            const ro = S.p(3, 0.6, 6.8);
            const mk = D.meanK[s0] + fr * (D.meanK[s0 + 1] - D.meanK[s0]);
            g.math('\\bar{φ} = ' + (mk >= 0 ? '+' : '−') + Math.abs(mk).toFixed(3), 1280, A.y + 22, { size: 30, color: KCOL, align: 'right', alpha: ro });
            g.math('\\bar{F} = ' + (mf >= 0 ? '+' : '−') + Math.abs(mf).toFixed(3), 1280, Bx.y + 14, { size: 30, color: FCOL, align: 'right', alpha: ro });
          }
        });
        // beat 3: the dependency diagram (left column)
        const v3 = S.p(3, 0.8, 0.4);
        if (v3 > 0) g.withAlpha(v3, () => {
          const lam = S.io(3, 2.6, 6.8);
          label(g, 'What depends on what', 120, 262);
          const cx = 340, yR = 400, yE = 700, xK = 190, xF = 490;
          // faded "relatedness ↔ inbreeding" arrow, struck out
          const sa = S.p(3, 0.8, 2.0);
          const ya = yE + 38;
          g.arrow(xK + 40, ya, xF - 40, ya, { color: PAL.ink2, w: 2.4, head: 13, both: true, alpha: 0.9 * (1 - 0.6 * S.p(3, 0.8, 3.4)) });
          g.line(cx - 20, ya - 20, cx + 20, ya + 20, { color: FCOL, w: 3.5, alpha: S.p(3, 0.5, 3.4) });
          g.line(cx - 20, ya + 20, cx + 20, ya - 20, { color: FCOL, w: 3.5, alpha: S.p(3, 0.5, 3.4) });
          // reference node with its p bar (wobbles when the reference changes)
          const ra = S.p(3, 0.8, 4.4);
          g.text('reference', cx, yR - 50, { size: 26, weight: 600, color: PCOL, align: 'center', alpha: sa });
          g.text('allele frequencies', cx, yR - 22, { size: 22, color: PCOL, align: 'center', alpha: sa });
          const pb = lerp(D.pSloc, D.pRloc, lam);
          g.rect(cx - 120, yR, 240, 22, { fill: 'rgba(238,231,215,0.08)', stroke: PAL.rule, w: 1.5, r: 11, alpha: sa });
          g.rect(cx - 120, yR, 240 * pb, 22, { fill: U.rgba(PCOL, 0.85), r: 11, alpha: sa });
          g.arrow(cx - 40, yR + 44, xK + 14, yE - 56, { color: PCOL, w: 3, head: 14, progress: ra });
          g.arrow(cx + 40, yR + 44, xF - 14, yE - 56, { color: PCOL, w: 3, head: 14, progress: ra });
          g.text('relatedness', xK, yE + 8, { size: 25, weight: 600, color: KCOL, align: 'center', alpha: sa });
          g.math('φ', xK, yE + 52, { size: 40, color: KCOL, align: 'center', alpha: sa });
          g.text('inbreeding', xF, yE + 8, { size: 25, weight: 600, color: FCOL, align: 'center', alpha: sa });
          g.math('F', xF, yE + 52, { size: 40, color: FCOL, align: 'center', alpha: sa });
          g.text('change the reference →', cx, 860, { size: 22, color: COL, align: 'center', alpha: S.p(3, 0.6, 6.7) });
          g.text('everything shifts', cx, 888, { size: 22, color: COL, align: 'center', alpha: S.p(3, 0.6, 7.6) });
        });
      },
    },
    /* VISUAL BRIEF (base-estimators): Beat 0: two pairs at one locus: pair A shares a common allele
       (p = 0.9, a big ochre bar) — small "evidence" weight; pair B shares a rare allele (p = 0.05) —
       big evidence glow. Beat 1: GRM formula appears big; animate one locus: genotype dosages 0/1/2 for
       two individuals, centred by 2p (bars shift), multiplied, divided by 2p(1−p), accumulating into a
       running mean across many loci (a counter of loci L climbing, estimate converging). Beat 2: four
       estimators as labelled rows (Queller–Goodnight, Lynch–Ritland, Wang, GRM) each with a small sampling
       distribution (violin/strip) around true value 0.25, showing different spread/bias; a toggle "few
       loci / inbred" widens/biases them. Beat 3: the p bar wobbles (estimated from a small or mixed sample)
       and the estimate distributions all slide together; arrow → "structure". */
    {
      id: 'base-estimators', title: 'Rare alleles carry the signal',
      beats: [
        { t: 'How do estimators turn identity by state into identity by descent? Sharing a common allele is weak evidence, because almost any two individuals would share it. Sharing a rare allele is strong evidence.' },
        { t: 'Moment estimators weight every locus by its allele frequency. The genomic relationship matrix is the clearest example: center each genotype by twice the allele frequency, scale by its expected variance, and average the cross-products across loci.',
          s: 'Moment estimators weight every locus by its allele frequency. The genomic relationship matrix is the clearest example: center each genotype by twice the allele frequency, scale by its expected variance, and average the cross-products across loci.' },
        { t: 'The Queller and Goodnight, Lynch and Ritland, and Wang estimators follow the same logic with different weights. They differ in bias and variance, especially when loci are few or individuals are inbred, so compare them on your own data.' },
        { t: 'Their shared weak point is the allele frequency. If it is wrong, perhaps estimated from a small sample or from a mixture of populations, every estimate inherits the error. Which brings us to structure.' },
      ],
      terms: [
        { beat: 1.1, term: 'Moment estimator', def: 'Kinship estimator built from allele-frequency-weighted IBS sharing (Queller–Goodnight, Lynch–Ritland, Wang, GRM). Fast; relative to the reference frequencies.' },
        { beat: 1.4, term: 'Genomic relationship matrix (GRM)', def: 'A_ij = (1/L) Σ_l (x_il − 2p_l)(x_jl − 2p_l) / 2p_l(1 − p_l); x = allele dosage (0, 1, 2). Estimates 2φ off the diagonal, 1 + F on it.' },
      ],
      init() {
        const r = rng(31), L = 200, NP = 90, FMIX = 0.1;
        const PA = Array.from({ length: L }, () => 0.05 + 0.9 * r()); // ancestral frequencies
        const P = PA.map((p) => bnDraw(r, p, FMIX)); // the study population
        // reference panels: a large unrelated sample (≈ truth), a small one, and a mixture with a second population
        const P2 = PA.map((p) => bnDraw(r, p, FMIX)); // a second, differentiated population
        const big = Array.from({ length: 300 }, () => dosage(founder(r, P)));
        const NSMALL = 8, small = new Array(NSMALL).fill(0);
        const other = Array.from({ length: 300 }, () => dosage(founder(r, P2)));
        const pBig = clampP(freqs(big));
        // pairs: outbred half sibs (true r = 2φ = 0.25), and inbred half sibs whose parents are full sibs
        // (F = 1/4 each, φ = 5/16, so r = 2φ/√((1+F_i)(1+F_j)) = 0.5 while 2φ = 0.625)
        const out = [], inb = [];
        for (let k = 0; k < NP; k++) { const s = founder(r, P); out.push([child(r, s, founder(r, P)), child(r, s, founder(r, P))]); }
        for (let k = 0; k < NP; k++) { const g1 = founder(r, P), g2 = founder(r, P); const s = child(r, g1, g2), d1 = child(r, g1, g2), d2 = child(r, g1, g2); inb.push([child(r, s, d1), child(r, s, d2)]); }
        const sub = (ind, n) => [ind[0].slice(0, n), ind[1].slice(0, n)];
        const est = (pairs, Pf, n) => {
          const Pn = Pf.slice(0, n), W = wangConsts(Pn);
          return pairs.map(([a, b]) => { const A = sub(a, n), B = sub(b, n); return [qgR(A, B, Pn), lrR(A, B, Pn), wangR(A, B, Pn, W), grm(dosage(A), dosage(B), Pn)]; });
        };
        // conditions: 0 = 200 SNPs outbred, 1 = 30 SNPs, 2 = inbred (200 SNPs), 3 = small reference, 4 = mixed reference
        // wrong references are re-estimated for each pair from a sample that includes the pair itself
        const estRef = (pairs, refFn) => pairs.map(([a, b], k) => { const Pn = clampP(freqs([...refFn(k), dosage(a), dosage(b)])), W = wangConsts(Pn); return [qgR(a, b, Pn), lrR(a, b, Pn), wangR(a, b, Pn, W), grm(dosage(a), dosage(b), Pn)]; });
        const C = [est(out, pBig, L), est(out, pBig, 30), est(inb, pBig, L),
          estRef(out, (k) => small.map((_, i) => big[(k * 7 + i * 13) % big.length]).slice(0, NSMALL)),
          estRef(out, (k) => [...big.slice(0, 40), ...other.slice(0, 40)])];
        const pSmall = clampP(freqs([...big.slice(0, NSMALL), ...out[0].map(dosage)])), pMix = clampP(freqs([...big.slice(0, 40), ...other.slice(0, 40), ...out[0].map(dosage)]));
        const stats = C.map((c) => [0, 1, 2, 3].map((m) => { const v = c.map((q) => q[m]); return [mean(v), sdev(v)]; }));
        const jit = Array.from({ length: NP }, () => r() * 2 - 1);
        // crowd for beat 0: 30 random individuals, carriers of a common (p = 0.9) and a rare (p = 0.05) allele
        const crowd = (p, seed) => { const rr = rng(seed); return Array.from({ length: 30 }, () => [rr() < p ? 1 : 0, rr() < p ? 1 : 0]); };
        const cA = crowd(0.9, 4), cB = crowd(0.05, 12);
        // GRM convergence: running mean of per-locus cross-products for 24 full-sib pairs (2φ = 0.5), up to 5000 SNPs
        const r3 = rng(77), LL = 5000; const PG = Array.from({ length: LL }, () => 0.05 + 0.9 * r3());
        const traces = []; let demo = null;
        for (let k = 0; k < 24; k++) {
          const m = founder(r3, PG), f = founder(r3, PG), a = dosage(child(r3, m, f)), b = dosage(child(r3, m, f));
          let s = 0; const tr = [];
          for (let l = 0; l < LL; l++) { const p = PG[l]; s += (a[l] - 2 * p) * (b[l] - 2 * p) / (2 * p * (1 - p)); tr.push(s / (l + 1)); }
          traces.push(tr); if (k === 0) demo = { a: a.slice(0, 12), b: b.slice(0, 12), p: PG.slice(0, 12) };
        }
        const grid = []; for (let L = 1; L <= LL; L = Math.max(L + 1, Math.round(L * 1.06))) grid.push(L); grid.push(LL);
        const tsamp = traces.map((tr) => grid.map((L) => [L, tr[L - 1]]));
        return { C, stats, jit, NP, cA, cB, tsamp, demo, LL, pBig: pBig.slice(0, 18), pSmall: pSmall.slice(0, 18), pMix: pMix.slice(0, 18) };
      },
      draw(g, t, S, D) {
        // ================= beat 0: common vs rare allele sharing
        const v0 = vis(S, 0, 1);
        if (v0 > 0) g.withAlpha(v0, () => {
          g.math('\\text{identity by state} \\;\\to\\; \\text{identity by descent} ?', 705, 580, { size: 52, align: 'center', alpha: S.p(0, 0.8, 0.4) * (1 - S.p(0, 0.5, 3.2)) });
          const panel = (x0, p, crowd, d0, isRare) => {
            const a = S.p(0, 0.8, d0); if (a <= 0) return;
            g.withAlpha(a, () => {
              label(g, isRare ? 'Sharing a rare allele' : 'Sharing a common allele', x0, 262);
              // allele-frequency bar
              const bw = 470; g.rect(x0, 300, bw, 22, { fill: 'rgba(238,231,215,0.08)', stroke: PAL.rule, w: 1.5, r: 11 });
              g.rect(x0, 300, Math.max(22, bw * p), 22, { fill: U.rgba(PCOL, 0.85), r: 11 });
              g.math('p = ' + p, x0 + bw, 356, { size: 34, color: PCOL, align: 'right' });
              // crowd: who carries the allele
              crowd.forEach((al, i) => { const cx = x0 + 30 + (i % 10) * 46, cy = 410 + Math.floor(i / 10) * 64; const ai = S.p(0, 0.4, d0 + 0.3 + i * 0.03);
                const car = al[0] || al[1]; KIN.person(g, cx, cy, { sex: 'U', r: 11, w: 1.5, alpha: ai, color: car ? PCOL : PAL.ink3 });
                KIN.alleles(g, cx, cy + 24, al.map((q) => (q ? PCOL : 'rgba(174,184,177,0.45)')), { size: 5, alpha: ai, halo: q => 1 }); });
              // the focal pair, both carrying the allele
              const pa = S.p(0, 0.7, d0 + 0.7), py = 690;
              const xi = x0 + 140, xj = x0 + 330; const ev = isRare ? 1 : 0.18;
              g.glow((xi + xj) / 2, py, 60 + 120 * ev, PCOL, 0.55 * ev * S.p(0, 1.2, d0 + 1.4));
              KIN.person(g, xi, py, { sex: 'U', r: 26, alpha: pa, label: 'i', alleles: isRare ? [PCOL, PAL.ink3] : [PCOL, PCOL] });
              KIN.person(g, xj, py, { sex: 'U', r: 26, alpha: pa, label: 'j', alleles: isRare ? [PCOL, PAL.ink3] : [PCOL, PCOL] });
              g.line(xi + 58, py, xj - 34, py, { color: PCOL, w: 2.5, dash: [6, 6], alpha: pa });
              // chance and evidence
              const ca = S.p(0, 0.7, d0 + 1.2);
              const share = 1 - Math.pow(1 - p, 2); const both = share * share; // P(a random pair both carry it)
              g.text('both carry it by chance', x0 + 235, 790, { size: 22, color: PAL.ink2, align: 'center', alpha: ca });
              g.text(Math.round(both * 100) + '%', x0 + 235, 846, { size: 48, role: 'display', color: isRare ? COL : PAL.ink2, align: 'center', alpha: ca });
              g.pill(isRare ? 'strong evidence' : 'weak evidence', x0 + 235, 892, { color: isRare ? COL : PAL.ink3, size: 21, align: 'center', alpha: S.p(0, 0.6, isRare ? d0 + 1.6 : d0 + 2.2) });
            });
          };
          panel(130, 0.9, D.cA, 3.7, false);
          panel(760, 0.05, D.cB, 7.6, true);
          g.line(705, 250, 705, 900, { color: PAL.rule, w: 1.5, alpha: S.p(0, 0.6, 7.8) });
        });

        // ================= beat 1: the GRM, one locus at a time, converging
        const v1 = vis(S, 1, 2);
        if (v1 > 0) g.withAlpha(v1, () => {
          const fx = 150, fy = 330, fs = 46;
          const e1 = '\\hat{A}_{ij} = ', e2 = '\\frac{1}{L}\\sum_{l} ', e3 = '\\frac{(x_{il} − 2p_l)(x_{jl} − 2p_l)}{2p_l(1 − p_l)}';
          const w1 = g.mathW(e1, fs), w2 = g.mathW(e2, fs), w3 = g.mathW(e3, fs);
          const fa = S.p(1, 0.9, 0.3);
          g.math(e1 + e2 + e3, fx, fy, { size: fs, alpha: fa });
          // highlight centring (numerator), scaling (denominator), averaging (1/L Σ)
          const hC = win(S, 1, 5.8, 1, 8.4), hS = win(S, 1, 8.4, 1, 10.4), hA = S.p(1, 0.6, 10.4);
          const nx = fx + w1 + w2;
          g.rect(nx - 6, fy - 58, w3 + 12, 46, { stroke: KCOL, w: 2, r: 8, alpha: hC });
          g.text('centre by 2p', nx + w3 + 24, fy - 26, { size: 22, color: KCOL, alpha: hC });
          g.rect(nx - 6, fy - 6, w3 + 12, 46, { stroke: PCOL, w: 2, r: 8, alpha: hS });
          g.text('scale by variance', nx + w3 + 24, fy + 26, { size: 22, color: PCOL, alpha: hS });
          g.rect(fx + w1 - 6, fy - 58, w2 + 4, 98, { stroke: COL, w: 2, r: 8, alpha: hA });
          g.text('average over loci', nx + w3 + 24, fy, { size: 22, color: COL, alpha: hA });
          // ---- left: loci streaming in (pair 1 of the convergence plot)
          const dm = D.demo, rows = 8, rx = 150, ry0 = 450, rh = 52;
          const la = S.p(1, 0.6, 3.2);
          label(g, 'Full sibs i, j: one locus per row', rx, 410, la);
          const nShow = clamp(Math.floor((S.since(1) - 3.4) / 0.42) + 1, 0, rows);
          const dev = S.p(1, 0.8, 5.8), scl = S.p(1, 0.8, 8.4);
          const NX = (v) => rx + 20 + v * 85; // dosage 0..2 → x
          for (let k = 0; k < rows; k++) {
            if (k >= nShow) break; const y = ry0 + 20 + k * rh, a = S.p(1, 0.4, 3.4 + k * 0.42), p = dm.p[k];
            g.withAlpha(a, () => {
              g.line(NX(0), y, NX(2), y, { color: PAL.rule, w: 1.5 });
              [0, 1, 2].forEach((v) => g.line(NX(v), y - 5, NX(v), y + 5, { color: PAL.rule, w: 1.5 }));
              g.line(NX(2 * p), y - 14, NX(2 * p), y + 14, { color: PCOL, w: 3 });
              const xi = dm.a[k], xj = dm.b[k];
              if (dev > 0) { g.line(NX(2 * p), y - 6, NX(xi), y - 6, { color: PAL.ink, w: 3, alpha: dev * 0.8 }); g.line(NX(2 * p), y + 6, NX(xj), y + 6, { color: PAL.heather, w: 3, alpha: dev * 0.8 }); }
              g.dot(NX(xi), y - 6, 6, PAL.ink, 1, 1.8); g.dot(NX(xj), y + 6, 6, PAL.heather, 1, 1.8);
              // scaled cross-product as a bar around a zero axis
              const term = (xi - 2 * p) * (xj - 2 * p) / (2 * p * (1 - p)); const bx = 520, sc = 22;
              g.withAlpha(scl, () => {
                g.line(bx, y - 16, bx, y + 16, { color: PAL.rule, w: 1.5 });
                const wv = clamp(term, -4, 4) * sc; g.rect(Math.min(bx, bx + wv), y - 9, Math.abs(wv), 18, { fill: U.rgba(term >= 0 ? KCOL : FCOL, 0.85), r: 3 });
                g.text((term >= 0 ? '+' : '−') + Math.abs(term).toFixed(2), 640, y + 7, { size: 20, role: 'mono', color: PAL.ink2, align: 'right' });
              });
            });
          }
          g.withAlpha(la, () => { const lx = 390, ly = ry0 - 4; g.dot(lx, ly - 7, 6, PAL.ink, 1, 1.8); g.math('x_i', lx + 12, ly, { size: 24 }); g.dot(lx + 62, ly - 7, 6, PAL.heather, 1, 1.8); g.math('x_j', lx + 74, ly, { size: 24, color: PAL.heather }); g.line(lx + 128, ly - 18, lx + 128, ly + 2, { color: PCOL, w: 3 }); g.math('2p', lx + 136, ly, { size: 24, color: PCOL }); });
          g.text('0', NX(0), ry0 + 4, { size: 19, color: PAL.ink3, align: 'center', alpha: la });
          g.text('1', NX(1), ry0 + 4, { size: 19, color: PAL.ink3, align: 'center', alpha: la });
          g.text('2', NX(2), ry0 + 4, { size: 19, color: PAL.ink3, align: 'center', alpha: la });
          
          // ---- right: running mean over L loci (log scale), 24 full-sib pairs
          const Lnow = S.since(1) < 3.4 ? 1 : (S.since(1) < 10.4 ? clamp(nShow, 1, rows) : Math.pow(10, lerp(Math.log10(rows), Math.log10(D.LL), ease.inOut((S.since(1) - 10.4) / 2.8))));
          const A = g.axes({ x: 760, y: 450, w: 520, h: 380, xmin: 1, xmax: D.LL, ymin: -1, ymax: 2, logx: true, progress: S.p(1, 1, 3.2), arrows: false,
            xticks: [{ v: 1, l: '1' }, { v: 10, l: '10' }, { v: 100, l: '100' }, { v: 1000, l: '1000' }], yticks: [{ v: -1, l: '−1' }, { v: 0, l: '0' }, { v: 0.5, l: '0.5' }, { v: 1, l: '1' }, { v: 2, l: '2' }] });
          const ca = S.p(1, 0.8, 3.4);
          g.text('loci, L', A.x + A.w, A.y + A.h + 56, { size: 22, color: PAL.ink2, align: 'right', alpha: ca });
          g.math('\\hat{A}_{ij}', A.x - 14, A.y - 16, { size: 30, align: 'right', alpha: ca });
          g.line(A.X(1), A.Y(0.5), A.X(D.LL), A.Y(0.5), { color: COL, w: 2, dash: [8, 7], alpha: ca });
          g.math('2φ = 0.5', A.X(D.LL), A.Y(0.5) - 14, { size: 28, color: COL, align: 'right', alpha: S.p(1, 0.8, 10.6) });
          g.clip(A.x, A.y - 6, A.w + 4, A.h + 12, () => {
            D.tsamp.forEach((tr, k) => { const pts = []; for (const [L, v] of tr) { if (L > Lnow) break; pts.push([A.X(L), A.Y(clamp(v, -1.3, 2.3))]); }
              if (pts.length > 1) g.poly(pts, { color: k === 0 ? PAL.ink : KCOL, w: k === 0 ? 2.6 : 1.4, alpha: (k === 0 ? 1 : 0.45) * ca }); });
          });
          g.text('L = ' + Math.round(Lnow), A.x + A.w, A.y + 10, { size: 24, role: 'mono', color: PAL.ink, align: 'right', alpha: ca });
          g.text('24 full-sib pairs', A.x + A.w, A.y + 40, { size: 21, color: PAL.ink2, align: 'right', alpha: ca });
        });

        // ================= beats 2–3: four estimators, sampling distributions
        const v2 = S.p(2, 0.8);
        if (v2 > 0) g.withAlpha(v2, () => {
          const names = ['Queller–Goodnight', 'Lynch–Ritland', 'Wang', 'GRM'];
          const cols = [PAL.moss, PAL.lagoon, PAL.heather, PAL.rose];
          // condition schedule: 0 outbred 200 SNPs → 1 (30 SNPs) → 2 (inbred) → 0 → 3 (small ref) → 4 (mixed ref)
          const tl = [[0, S.b(2)], [1, S.b(2) + 7.6], [2, S.b(2) + 9.0], [0, S.b(3) + 0.9], [3, S.b(3) + 4.6], [4, S.b(3) + 6.8]];
          let ci = 0; while (ci + 1 < tl.length && t >= tl[ci + 1][1]) ci++;
          const prev = ci ? tl[ci - 1][0] : tl[0][0], curC = tl[ci][0], m = ci ? ease.inOut((t - tl[ci][1]) / 1.1) : 1;
          const A = g.axes({ x: 420, y: 380, w: 860, h: 440, xmin: -0.3, xmax: 1.1, ymin: 0, ymax: 4, progress: S.p(2, 1), arrows: false,
            xticks: [{ v: 0, l: '0' }, { v: 0.25, l: '0.25' }, { v: 0.5, l: '0.5' }, { v: 0.75, l: '0.75' }, { v: 1, l: '1' }] });
          g.text('estimated relatedness', A.x + A.w, A.y + A.h + 56, { size: 22, color: PAL.ink2, align: 'right', alpha: S.p(2, 1) });
          // truth lines
          const inbA = (curC === 2 ? m : 0) + (prev === 2 && curC !== 2 ? 1 - m : 0);
          const tr = lerp(0.25, 0.5, inbA);
          g.line(A.X(tr), A.y - 10, A.X(tr), A.Y(0), { color: PAL.ink, w: 2, dash: [7, 6], alpha: 0.9 });
          g.math('r = ' + (inbA > 0.5 ? '0.5' : '0.25'), A.X(tr), A.y - 18, { size: 28, align: 'center' });
          g.line(A.X(0.625), A.y - 10, A.X(0.625), A.Y(0), { color: PAL.rose, w: 2, dash: [3, 6], alpha: inbA });
          g.math('2φ = 0.625', A.X(0.625) + 10, A.y - 18, { size: 28, color: PAL.rose, alpha: inbA });
          for (let e = 0; e < 4; e++) {
            const ra = S.p(2, 0.7, 0.3 + e * 1.0), yc = A.Y(3.5 - e);
            g.text(names[e], A.x - 24, yc + 8, { size: 24, weight: 600, color: cols[e], align: 'right', alpha: ra });
            if (e === 3) g.math('(2φ)', A.x - 24, yc + 42, { size: 24, color: PAL.ink2, align: 'right', alpha: ra });
            g.line(A.x, yc + 48, A.x + A.w, yc + 48, { color: PAL.faint, w: 1, alpha: ra });
            const P0 = D.C[prev], P1 = D.C[curC];
            for (let k = 0; k < D.NP; k++) { const v = lerp(P0[k][e], P1[k][e], m); if (v < -0.3 || v > 1.1) continue; g.circle(A.X(v), yc + D.jit[k] * 30, 3.6, { fill: cols[e], alpha: ra * 0.7 }); }
            const [m0, s0] = D.stats[prev][e], [m1, s1] = D.stats[curC][e]; const mu = lerp(m0, m1, m), sd = lerp(s0, s1, m);
            g.line(A.X(mu - sd), yc + 40, A.X(mu + sd), yc + 40, { color: cols[e], w: 3, alpha: ra });
            g.line(A.X(mu), yc - 40, A.X(mu), yc + 46, { color: PAL.ink, w: 3, alpha: ra });
          }
          // condition pills (beat 2) → reference strip (beat 3)
          const pa = S.p(2, 0.6, 5.2) * (1 - S.p(3, 0.6, 0.4));
          const lab = ['200 SNPs, outbred', '30 SNPs', 'inbred pair'];
          const act = curC === 0 ? 0 : curC === 1 ? 1 : curC === 2 ? 2 : 0;
          let px = 420; lab.forEach((s, k) => { const w = g.pill(s, px, 296, { size: 22, color: k === act ? COL : PAL.ink3, alpha: pa }); px += w + 18; });
          label(g, curC === 2 || prev === 2 && m < 1 ? 'Half sibs, parents full sibs' : 'Half-sib pairs, 90 replicates', 120, 262, S.p(2, 0.6));
          illus(g, 1280, 262, S.p(2, 0.6, 1.0));
          // beat 3: the reference allele frequencies, wobbling
          const rb = S.p(3, 0.7, 0.9);
          if (rb > 0) g.withAlpha(rb, () => {
            const pr = (c) => (c === 3 ? D.pSmall : c === 4 ? D.pMix : D.pBig);
            const Pp = pr(prev), Pc = pr(curC);
            g.text('reference p', 420, 304, { size: 22, weight: 600, color: PCOL });
            for (let l = 0; l < 18; l++) { const p = lerp(Pp[l], Pc[l], m), x = 580 + l * 24; g.rect(x, 316 - 40 * p, 14, 40 * p, { fill: U.rgba(PCOL, 0.85), r: 2 }); g.rect(x, 276, 14, 40, { stroke: PAL.rule, w: 1, r: 2 }); }
            const which = curC === 3 ? 'from 8 individuals' : curC === 4 ? 'from a two-population mix' : 'from a large sample';
            g.text(which, 1030, 304, { size: 22, color: curC >= 3 ? FCOL : PAL.ink2 });
          });
          const sa = S.p(3, 0.7, 8.5);
          g.withAlpha(sa, () => { g.arrow(150, 878, 236, 878, { color: COL, w: 3, head: 14 }); g.pill('structure', 246, 878, { color: COL, size: 24 }); });
        });
      },
    },
    /* VISUAL BRIEF (base-structure): Two clusters of luminous individuals (left island moss, right island
       lagoon). Allele frequency bars: p = 0.8 in left, 0.1 in right, pooled 0.45. Beat 1: two unrelated
       individuals from the left cluster light up with a kinship link (false kin); between-cluster links
       go negative (dim, dashed). A small heatmap of the kinship matrix shows a block structure. Beat 2:
       heterozygote deficit: genotype bar chart of observed vs expected heterozygotes in pooled sample,
       label "Wahlund effect = looks like inbreeding"; both arrows (relatedness ↑, inbreeding ↑) from
       "structure". Beat 3: remedy one — the clusters are separated by a PCA scatter (PC1 vs PC2, two
       clouds); remedy two — KING-robust: pairwise comparison that uses only the pair's own genotypes
       (no p bar). Beat 4: an iteration loop diagram, animated cycling: KING → unrelated set → PCs (ancestry)
       → individual-specific allele frequencies → PC-Relate kinship & F → (refine) — arrows circulate and a
       convergence trace settles. */
    {
      id: 'base-structure', title: 'When structure masquerades as kinship',
      beats: [
        { t: 'Suppose your sample spans two genetically differentiated populations, and you estimate allele frequencies from the pooled sample. An allele that is common in one population looks much less common overall.' },
        { t: 'Now two unrelated individuals from the same population share that allele, and the estimator reads the match as kinship. Pairs within a population look related, and pairs between populations look negatively related.' },
        { t: 'The same mixture also produces a deficit of heterozygotes, the Wahlund effect, which mimics inbreeding. Structure inflates both quantities at once. That is the true chicken and egg.' },
        { t: 'There are two remedies. Analyze each genetic cluster separately, after identifying clusters with PCA, ADMIXTURE, or the sNMF method. Or use estimators that are robust to structure. KING-robust compares a pair without using sample allele frequencies at all.',
          s: 'There are two remedies. Analyze each genetic cluster separately, after identifying clusters with P C A, admixture, or the S N M F method. Or use estimators that are robust to structure. King robust compares a pair without using sample allele frequencies at all.' },
        { t: 'PC-AiR and PC-Relate resolve the loop explicitly. KING finds a set of unrelated individuals. Principal components from that set define ancestry. PC-Relate then estimates kinship and inbreeding using allele frequencies specific to each individual\'s ancestry. The circle becomes an iteration.',
          s: 'P C air and P C relate resolve the loop explicitly. King finds a set of unrelated individuals. Principal components from that set define ancestry. P C relate then estimates kinship and inbreeding using allele frequencies specific to each individual\'s ancestry. The circle becomes an iteration.', pause: 0.8 },
      ],
      terms: [
        { beat: 2.3, term: 'Wahlund effect', def: 'Heterozygote deficit created by pooling genetically differentiated groups; mimics inbreeding and inflates apparent kinship within groups.' },
        { beat: 3.77, term: 'KING-robust', def: 'Kinship estimator (Manichaikul et al. 2010) using only the pair\'s own genotypes (heterozygote sharing), robust to structure among pairs; assumes each pair is outbred and shares one ancestry.' },
        { beat: 4.05, term: 'PC-AiR / PC-Relate', def: 'Conomos et al. (2015, 2016): PCs from an unrelated subset define ancestry; kinship and F are then estimated with individual-specific allele frequencies.' },
      ],
      init() {
        const r = rng(2024), L0 = 2400, nPer = 40, FST = 0.08;
        const PA = Array.from({ length: L0 }, () => 0.1 + 0.8 * r());
        let P1 = PA.map((p) => bnDraw(r, p, FST)), P2 = PA.map((p) => bnDraw(r, p, FST));
        // QC as in practice: keep SNPs with minor-allele frequency ≥ 0.05 in both populations
        const keep = PA.map((_, l) => l === 0 || Math.min(P1[l], 1 - P1[l], P2[l], 1 - P2[l]) >= 0.05);
        P1 = P1.filter((_, l) => keep[l]); P2 = P2.filter((_, l) => keep[l]); const L = P1.length;
        P1[0] = 0.8; P2[0] = 0.1; // the focal locus shown on screen
        // each population: unrelated founders + 3 full-sib pairs placed at fixed slots
        const sibs = [[3, 6], [10, 14], [17, 21], [28, 33]]; // index pairs within each population (full sibs)
        const build = (P) => { const v = []; for (let i = 0; i < nPer; i++) v.push(founder(r, P)); for (const [a, b] of sibs) { const m = founder(r, P), f = founder(r, P); v[a] = child(r, m, f); v[b] = child(r, m, f); } return v; };
        const inds = [...build(P1), ...build(P2)], N = inds.length, X = inds.map(dosage), pop = inds.map((_, i) => (i < nPer ? 0 : 1));
        const pPool = clampP(freqs(X)), pA = clampP(freqs(X.slice(0, nPer))), pB = clampP(freqs(X.slice(nPer)));
        const M = () => Array.from({ length: N }, () => new Array(N).fill(0));
        // (a) pooled-frequency GRM kinship; (b) per-cluster frequencies; (c) KING-robust; (d) PC-Relate
        const Kpool = M(), Ksep = M(), Kking = M(), Kpcr = M();
        for (let i = 0; i < N; i++) for (let j = i; j < N; j++) {
          const a = grm(X[i], X[j], pPool) / 2; Kpool[i][j] = Kpool[j][i] = a;
          const Pc = pop[i] === 0 ? pA : pB; const b = pop[i] === pop[j] ? grm(X[i], X[j], Pc) / 2 : NaN; Ksep[i][j] = Ksep[j][i] = b;
          const c = i === j ? 0.5 : kingPhi(X[i], X[j]); Kking[i][j] = Kking[j][i] = c;
        }
        // PC-AiR: unrelated set from KING (drop one of each pair with φ > 2^-4.5 ≈ 0.044)
        const unrel = []; for (let i = 0; i < N; i++) { if (!unrel.some((j) => Kking[i][j] > 0.044)) unrel.push(i); }
        // PCs from the unrelated set (standardised genotypes, power iteration), projected onto everyone
        const Z = X.map((x) => x.map((v, l) => (v - 2 * pPool[l]) / Math.sqrt(2 * pPool[l] * (1 - pPool[l]))));
        const nU = unrel.length, G = Array.from({ length: nU }, (_, a) => unrel.map((_, b) => { let s = 0; const za = Z[unrel[a]], zb = Z[unrel[b]]; for (let l = 0; l < L; l++) s += za[l] * zb[l]; return s / L; }));
        const eig = (Gm, deflate) => { let v = Gm.map((_, k) => Math.sin(k * 1.7 + 0.3)); let lam = 0;
          for (let it = 0; it < 200; it++) { let w = Gm.map((row) => row.reduce((s, g, k) => s + g * v[k], 0)); if (deflate) { const d = w.reduce((s, x, k) => s + x * deflate.u[k], 0); w = w.map((x, k) => x - d * deflate.u[k]); } lam = Math.hypot(...w); v = w.map((x) => x / lam); } return { u: v, lam }; };
        const e1 = eig(G), e2 = eig(G, e1);
        const proj = (e) => { const w = new Array(L).fill(0); unrel.forEach((iu, a) => { for (let l = 0; l < L; l++) w[l] += Z[iu][l] * e.u[a]; }); return Z.map((z) => z.reduce((s, v, l) => s + v * w[l], 0) / (L * e.lam)); };
        let pc1 = proj(e1); const pc2 = proj(e2); if (mean(pc1.slice(0, nPer)) > 0) pc1 = pc1.map((v) => -v); // population A on the left
        // PC-Relate: individual-specific frequencies μ_il from regressing x_il/2 on PC1, then kinship
        const m1 = mean(pc1), v1 = pc1.reduce((s, x) => s + (x - m1) ** 2, 0);
        const MU = X.map(() => new Float64Array(L));
        for (let l = 0; l < L; l++) { let c = 0, my = 0; for (let i = 0; i < N; i++) { my += X[i][l] / 2; c += (pc1[i] - m1) * X[i][l] / 2; } my /= N; const b = c / v1; for (let i = 0; i < N; i++) MU[i][l] = clamp(my + b * (pc1[i] - m1), 0.01, 0.99); }
        for (let i = 0; i < N; i++) for (let j = i; j < N; j++) { let num = 0, den = 0; for (let l = 0; l < L; l++) { const a = MU[i][l], b = MU[j][l]; num += (X[i][l] - 2 * a) * (X[j][l] - 2 * b); den += Math.sqrt(a * (1 - a) * b * (1 - b)); } Kpcr[i][j] = Kpcr[j][i] = num / (4 * den); }
        // Wahlund effect at the focal locus (pooled sample) and genome-wide mean F̂
        const cnt = [0, 0, 0]; X.forEach((x) => cnt[x[0]]++); const p0 = (cnt[1] + 2 * cnt[2]) / (2 * N);
        const expc = [N * (1 - p0) ** 2, 2 * N * p0 * (1 - p0), N * p0 * p0];
        const Fpool = mean(X.map((x) => grm(x, x, pPool) - 1)), Fsep = mean(X.map((x, i) => grm(x, x, pop[i] ? pB : pA) - 1)), Fpcr = mean(X.map((_, i) => 2 * Kpcr[i][i] - 1));
        const unrelPairs = (K, within) => { const v = []; for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) { if ((pop[i] === pop[j]) !== within) continue; if (sibs.some(([a, b]) => (i % nPer === a && j % nPer === b && pop[i] === pop[j]))) continue; v.push(K[i][j]); } return mean(v); };
        const summ = [Kpool, Ksep, Kking, Kpcr].map((K) => [unrelPairs(K, true), unrelPairs(K, false)]);
        const sibK = [Kpool, Ksep, Kking, Kpcr].map((K) => mean(sibs.flatMap(([a, b]) => [K[a][b], K[a + nPer][b + nPer]])));
        // island layout (phyllotaxis) and the focal unrelated pair in population A (both carry the A-common allele twice)
        const pos = X.map((_, i) => { const k = i % nPer, rr = 142 * Math.sqrt((k + 0.6) / nPer), th = k * 2.39996 + 0.4; return [rr * Math.cos(th), rr * Math.sin(th)]; });
        const isSib = (i) => sibs.some(([a, b]) => i % nPer === a || i % nPer === b);
        let pair = null, bestd = 9; const wm = summ[0][0];
        for (let i = 0; i < nPer; i++) for (let j = i + 1; j < nPer; j++) { if (isSib(i) || isSib(j) || X[i][0] !== 2 || X[j][0] !== 2) continue; const d = Math.abs(Kpool[i][j] - wm); if (d < bestd) { bestd = d; pair = [i, j]; } }
        const [fi, fj] = pair; let hh = 0, opp = 0, hi = 0, hj = 0;
        for (let l = 0; l < L; l++) { const a = X[fi][l], b = X[fj][l]; if (a === 1) hi++; if (b === 1) hj++; if (a === 1 && b === 1) hh++; else if (a + b === 2 && a !== 1) opp++; }
        const kingRows = []; for (let l = 1; kingRows.length < 10; l++) { const a = X[fi][l], b = X[fj][l]; if (kingRows.length < 3 ? (a === 1 && b === 1) : kingRows.length < 5 ? (Math.abs(a - b) === 2) : true) kingRows.push([a, b]); }
        const betw = [[0, nPer + 5], [7, nPer + 12], [13, nPer + 2], [20, nPer + 18], [9, nPer + 22], [25, nPer + 30], [36, nPer + 26]];
        const relSet = Array.from({ length: N }, (_, i) => !unrel.includes(i));
        return { L, pos, pair, betw, king: { hh, opp, hi, hj }, kingRows, relSet, N, nPer, pop, sibs, focal: X.map((x, i) => [inds[i][0][0], inds[i][1][0]]), pAf: freqs(X.slice(0, nPer).map((x) => [x[0]]))[0], pBf: freqs(X.slice(nPer).map((x) => [x[0]]))[0], pPf: p0,
          Kpool, Ksep, Kking, Kpcr, pc1, pc2, unrel, cnt, expc, Fpool, Fsep, Fpcr, summ, sibK };
      },
      draw(g, t, S, D) {
        const { N, nPer, pop } = D; const PCOLS = [PAL.moss, PAL.heather];
        // heatmaps of the kinship matrix (pre-rendered once, lazily)
        if (!D._hm) {
          const cs = 9, cmap = (v) => (v >= 0 ? (v < 0.07 ? U.mix('#122426', KCOL, v / 0.07) : U.mix(KCOL, '#EAFBFF', clamp((v - 0.07) / 0.2))) : U.mix('#122426', FCOL, clamp(-v / 0.07)));
          const paint = (K) => { const c = Theater.makeCanvas(N * cs, N * cs), x = c.getContext('2d'); for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { const v = K[i][j]; x.fillStyle = i === j ? '#2A3B3C' : Number.isNaN(v) ? '#0E1C1E' : cmap(v); x.fillRect(j * cs, i * cs, cs, cs); } return c; };
          D._hm = { pool: paint(D.Kpool), king: paint(D.Kking), pcr: paint(D.Kpcr), cs };
        }
        const heat = (x, y, size, which, a, which2, m) => {
          if (a <= 0) return; g.withAlpha(a, () => {
            g.ctx.imageSmoothingEnabled = false; g.ctx.drawImage(D._hm[which], x, y, size, size);
            if (which2 && m > 0) g.withAlpha(m, () => g.ctx.drawImage(D._hm[which2], x, y, size, size)); g.ctx.imageSmoothingEnabled = true;
            g.rect(x, y, size, size, { stroke: PAL.rule, w: 1.5 });
            const h = size / 2; g.line(x + h, y, x + h, y + size, { color: PAL.bg, w: 2 }); g.line(x, y + h, x + size, y + h, { color: PAL.bg, w: 2 });
            g.rect(x - 14, y, 8, h - 2, { fill: PCOLS[0], r: 3 }); g.rect(x - 14, y + h + 2, 8, h - 2, { fill: PCOLS[1], r: 3 });
            g.rect(x, y - 14, h - 2, 8, { fill: PCOLS[0], r: 3 }); g.rect(x + h + 2, y - 14, h - 2, 8, { fill: PCOLS[1], r: 3 });
          });
        };
        const legend = (x, y, a) => { if (a <= 0) return; g.withAlpha(a, () => { const w = 200; for (let k = 0; k < 40; k++) { const v = -0.07 + k * 0.14 / 39; g.rect(x + k * w / 40, y, w / 40 + 0.5, 12, { fill: v >= 0 ? U.mix('#122426', KCOL, v / 0.07) : U.mix('#122426', FCOL, -v / 0.07) }); }
          g.text('−', x - 8, y + 12, { size: 22, color: FCOL, align: 'right' }); g.text('+', x + w + 8, y + 13, { size: 22, color: KCOL }); g.text('0', x + w / 2, y + 36, { size: 19, color: PAL.ink3, align: 'center' }); }); };
        const fmt = (v, d = 3) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(d);
        // mean kinship of unrelated pairs within / between populations (and full sibs), under the heatmap
        const readout = (x, y, w, b, aw, ab, sib, as) => {
          g.text('mean kinship, unrelated pairs', x, y + 40, { size: 21, color: PAL.ink2, alpha: aw });
          g.text('within populations', x, y + 74, { size: 22, color: KCOL, alpha: aw }); g.text(fmt(w), x + 400, y + 74, { size: 22, role: 'mono', color: KCOL, align: 'right', alpha: aw });
          g.text('between populations', x, y + 106, { size: 22, color: FCOL, alpha: ab }); g.text(fmt(b), x + 400, y + 106, { size: 22, role: 'mono', color: FCOL, align: 'right', alpha: ab });
          if (sib !== undefined) { g.text('full sibs (truth 0.25)', x, y + 138, { size: 22, color: PAL.ink, alpha: as }); g.text(fmt(sib), x + 400, y + 138, { size: 22, role: 'mono', color: PAL.ink, align: 'right', alpha: as }); }
        };
        const [fi, fj] = D.pair;

        // ================= beats 0–2: two islands
        const vI = vis(S, 0, 3);
        if (vI > 0) g.withAlpha(vI, () => {
          const C = [[272, 530], [628, 530]];
          label(g, 'One sample, two populations', 120, 262, S.p(0, 0.6));
          C.forEach(([cx, cy], k) => { const a = S.p(0, 0.8, 1.6 + k * 0.6); g.circle(cx, cy, 162, { fill: U.rgba(PCOLS[k], 0.06), stroke: U.rgba(PCOLS[k], 0.4), w: 1.5, alpha: a });
            g.text(k ? 'population B' : 'population A', cx, cy - 178, { size: 22, weight: 600, color: PCOLS[k], align: 'center', alpha: a }); });
          // between-population links (beat 1, second sentence): look negatively related
          const bl = S.p(1, 0.8, 8.0) * (1 - S.p(2, 0.6));
          D.betw.forEach(([i, j], k) => { const [x1, y1] = [C[0][0] + D.pos[i][0], C[0][1] + D.pos[i][1]], [x2, y2] = [C[1][0] + D.pos[j][0], C[1][1] + D.pos[j][1]];
            g.line(x1, y1, x2, y2, { color: FCOL, w: 1.6, dash: [5, 7], alpha: bl * 0.7 }); });
          g.text('between populations:', 430, 770, { size: 22, color: FCOL, align: 'right', alpha: bl }); g.math('\\hat{φ} < 0', 442, 772, { size: 30, color: FCOL, alpha: bl });
          // focal pair link
          const pl = S.p(1, 0.8, 3.6) * (1 - S.p(2, 0.6));
          const P1 = [C[0][0] + D.pos[fi][0], C[0][1] + D.pos[fi][1]], P2 = [C[0][0] + D.pos[fj][0], C[0][1] + D.pos[fj][1]];
          g.line(P1[0], P1[1], P2[0], P2[1], { color: KCOL, w: 3, alpha: pl });
          for (let i = 0; i < N; i++) {
            const k = pop[i], x = C[k][0] + D.pos[i][0], y = C[k][1] + D.pos[i][1], a = S.p(0, 0.5, 1.8 + k * 0.6 + (i % nPer) * 0.02);
            const foc = (i === fi || i === fj) ? S.p(1, 0.6, 1.2) * (1 - S.p(2, 0.6)) : 0;
            if (foc > 0) g.glow(x, y, 34, KCOL, 0.6 * foc);
            g.dot(x, y, 6.5, PCOLS[k], a, 2);
            const al = D.focal[i]; KIN.alleles(g, x, y + 14, al.map((q) => (q ? PCOL : 'rgba(174,184,177,0.5)')), { size: 4, alpha: a * S.p(0, 0.6, 4.6), halo: 1.2 });
          }
          { const pa = S.p(1, 0.7, 4.2) * (1 - S.p(2, 0.6)); g.text('unrelated, yet', 250, 732, { size: 22, color: KCOL, align: 'right', alpha: pa }); g.math('\\hat{φ} = ' + fmt(D.Kpool[fi][fj]), 262, 734, { size: 30, color: KCOL, alpha: pa }); }
          // beat 2: structure inflates both
          const sa = S.p(2, 0.8, 5.6);
          if (sa > 0) g.withAlpha(sa, () => {
            const y0 = 790; g.pill('structure', 450, y0, { color: COL, size: 24, align: 'center' });
            g.arrow(380, y0 + 4, 250, y0 + 4, { color: COL, w: 3, head: 13, progress: S.p(2, 0.7, 5.9) });
            g.arrow(520, y0 + 4, 650, y0 + 4, { color: COL, w: 3, head: 13, progress: S.p(2, 0.7, 5.9) });
            g.math('φ ↑', 205, y0 + 14, { size: 38, color: KCOL, align: 'center' });
            g.math('F ↑', 695, y0 + 14, { size: 38, color: FCOL, align: 'center' });
            g.text('the true chicken and egg', 450, 862, { size: 23, italic: true, role: 'display', color: PAL.ink, align: 'center', alpha: S.p(2, 0.6, 8.0) });
          });
        });
        // ---- right panel, beat 0: allele frequencies
        const vF = vis(S, 0, 1);
        if (vF > 0) g.withAlpha(vF, () => {
          const x0 = 830, bw = 420; label(g, 'Frequency of one allele', x0, 262);
          const rows = [['population A', D.pAf, PCOLS[0], 2.4], ['population B', D.pBf, PCOLS[1], 3.0], ['pooled sample', D.pPf, PCOL, 5.4]];
          rows.forEach(([nm, p, c, d], k) => { const a = S.p(0, 0.7, d), y = 380 + k * 150 + (k === 2 ? 30 : 0);
            g.text(nm, x0, y - 22, { size: 22, weight: 600, color: c, alpha: a });
            g.math('\\hat{p} = ' + p.toFixed(2), x0 + bw, y - 22, { size: 32, color: c, align: 'right', alpha: a });
            g.rect(x0, y - 8, bw, 26, { fill: 'rgba(238,231,215,0.08)', stroke: PAL.rule, w: 1.5, r: 13, alpha: a });
            g.rect(x0, y - 8, bw * p * ease.out(S.p(0, 1.2, d)), 26, { fill: U.rgba(k === 2 ? PCOL : c, 0.85), r: 13, alpha: a }); });
          const ha = S.p(0, 0.7, 5.9);
          g.rect(x0 - 16, 330, bw + 32, 84, { stroke: PCOLS[0], w: 2, r: 12, alpha: ha * (1 - S.p(0, 0.6, 7.6)) });
          g.arrow(x0 + bw * D.pAf, 414, x0 + bw * D.pPf + 4, 690, { color: PCOL, w: 2.5, head: 14, dash: [6, 6], progress: S.p(0, 1.2, 6.6) });
          g.text('looks less common', x0 + bw * D.pAf - 40, 610, { size: 22, color: PCOL, alpha: S.p(0, 0.7, 7.4) });
        });
        // ---- right panel, beat 1: the kinship matrix (pooled p̂)
        const vH = vis(S, 1, 2);
        if (vH > 0) g.withAlpha(vH, () => {
          const x0 = 860, y0 = 320, sz = 400; label(g, 'Kinship matrix, pooled p̂', 830, 262);
          heat(x0, y0, sz, 'pool', S.p(1, 0.8, 5.8));
          const wa = S.p(1, 0.7, 6.4), ba = S.p(1, 0.7, 8.4);
          readout(x0, y0 + sz, D.summ[0][0], D.summ[0][1], wa, ba);
        });
        // ---- right panel, beat 2: Wahlund effect at the focal locus
        const vW = vis(S, 2, 3);
        if (vW > 0) g.withAlpha(vW, () => {
          const x0 = 830; label(g, 'Genotypes, pooled sample', x0, 262);
          const A = g.axes({ x: 880, y: 360, w: 400, h: 300, xmin: 0, xmax: 3, ymin: 0, ymax: 52, progress: S.p(2, 0.9), arrows: false, yticks: [{ v: 0, l: '0' }, { v: 20, l: '20' }, { v: 40, l: '40' }] });
          ['AA', 'Aa', 'aa'].forEach((gt, k) => {
            const xc = A.X(k + 0.5), ob = D.cnt[2 - k], ex = D.expc[2 - k], gp = ease.out(S.p(2, 1.0, 0.6));
            g.rect(xc - 46, A.Y(ob * gp), 44, A.Y(0) - A.Y(ob * gp), { fill: U.rgba(k === 1 ? FCOL : PAL.ink2, 0.85), r: 3 });
            const ea = S.p(2, 0.8, 1.6);
            g.rect(xc + 2, A.Y(ex), 44, A.Y(0) - A.Y(ex), { stroke: PCOL, w: 2, dash: [5, 4], r: 3, alpha: ea });
            g.text(gt, xc, A.Y(0) + 32, { size: 24, color: PAL.ink, align: 'center', italic: true, role: 'math' });
          });
          const la = S.p(2, 0.7, 1.6);
          const ly = 312; g.rect(A.x, ly - 13, 18, 14, { fill: U.rgba(PAL.ink2, 0.85), r: 2, alpha: S.p(2, 0.7, 0.6) }); g.text('observed', A.x + 26, ly, { size: 21, color: PAL.ink2, alpha: S.p(2, 0.7, 0.6) });
          g.rect(A.x + 136, ly - 13, 18, 14, { stroke: PCOL, w: 2, dash: [4, 3], r: 2, alpha: la }); g.text('expected (HWE, pooled p̂)', A.x + 162, ly, { size: 21, color: PCOL, alpha: la });
          const da = S.p(2, 0.7, 2.6); const xm = A.X(1.5);
          g.arrow(xm + 24, A.Y(D.expc[1]) + 4, xm + 24, A.Y(D.cnt[1]) - 6, { color: FCOL, w: 2.5, head: 12, alpha: da });
          g.text('heterozygote deficit', xm, A.Y(D.expc[1]) - 16, { size: 22, color: FCOL, align: 'center', alpha: da });
          g.pill('Wahlund effect', 1080, 760, { color: FCOL, size: 26, align: 'center', alpha: S.p(2, 0.7, 3.8) });
          g.math('\\bar{F} = ' + D.Fpool.toFixed(3), 1080, 840, { size: 34, color: FCOL, align: 'center', alpha: S.p(2, 0.7, 4.6) });
          g.text('genome-wide, pooled p̂', 1080, 878, { size: 21, color: PAL.ink2, align: 'center', alpha: S.p(2, 0.7, 4.6) });
        });

        // ================= beat 3: two remedies
        const v3 = vis(S, 3, 4);
        if (v3 > 0) g.withAlpha(v3, () => {
          g.line(705, 250, 705, 890, { color: PAL.rule, w: 1.5, alpha: S.p(3, 0.8, 7.6) });
          // remedy 1: PCA, then analyse clusters separately
          label(g, 'Remedy 1: split into clusters', 120, 262, S.p(3, 0.7, 0.4));
          const A = g.axes({ x: 170, y: 340, w: 470, h: 360, xmin: -0.26, xmax: 0.26, ymin: -0.5, ymax: 0.5, progress: S.p(3, 0.9, 1.4), arrows: true });
          g.text('PC1', A.x + A.w + 14, A.Y(-0.5) + 38, { size: 22, color: PAL.ink2, align: 'right', alpha: S.p(3, 0.8, 1.6) });
          g.text('PC2', A.x - 14, A.y - 22, { size: 22, color: PAL.ink2, align: 'right', alpha: S.p(3, 0.8, 1.6) });
          const sep = S.io(3, 1.6, 2.0);
          for (let i = 0; i < N; i++) { const x = A.X(D.pc1[i] * sep), y = A.Y(D.pc2[i]); g.dot(x, y, 6.5, PCOLS[pop[i]], S.p(3, 0.5, 1.8 + i * 0.01), 2); }
          const ca = S.p(3, 0.7, 3.6);
          [0, 1].forEach((k) => { const xs = D.pc1.filter((_, i) => pop[i] === k), mx = mean(xs); g.ellipse(A.X(mx * sep), A.Y(0), 70, 165, { stroke: PCOLS[k], w: 2, dash: [6, 6], alpha: ca }); });
          ['PCA', 'ADMIXTURE', 'sNMF'].forEach((nm, k) => g.pill(nm, 170 + [0, 100, 274][k], 790, { color: COL, size: 22, alpha: S.p(3, 0.6, 4.6 + k * 0.9) }));
          g.text('same pair, within-cluster p̂:', 170, 860, { size: 22, color: PAL.ink2, alpha: S.p(3, 0.7, 6.4) });
          g.math('\\hat{φ} = ' + fmt(D.Ksep[fi][fj]), 475, 862, { size: 30, color: KCOL, alpha: S.p(3, 0.7, 6.4) });
          // remedy 2: KING-robust
          const ka = S.p(3, 0.7, 7.6);
          label(g, 'Remedy 2: KING-robust', 760, 262, ka);
          // the pair's genotypes, locus by locus
          const rx = 790, ry = 330, cw = 46;
          g.withAlpha(ka, () => {
            g.math('i', rx - 26, ry + 24, { size: 28, alpha: S.p(3, 0.5, 8.4) }); g.math('j', rx - 26, ry + 78, { size: 28, alpha: S.p(3, 0.5, 8.4) });
            D.kingRows.forEach(([a, b], k) => { const x = rx + k * cw, hit = a === 1 && b === 1, opp = Math.abs(a - b) === 2; const hl = S.p(3, 0.5, 8.4 + k * 0.12);
              const col = hit ? KCOL : opp ? FCOL : PAL.rule;
              if (hit || opp) g.rect(x - 4, ry - 6, cw - 6, 104, { fill: U.rgba(col, 0.14), stroke: U.rgba(col, 0.7), w: 1.5, r: 6, alpha: hl });
              [a, b].forEach((v, q) => g.text(['aa', 'Aa', 'AA'][v], x + (cw - 14) / 2, ry + 30 + q * 54, { size: 21, role: 'mono', color: v === 1 ? PAL.ink : PAL.ink2, align: 'center', alpha: hl })); });
          });
          const fa = S.p(3, 0.8, 10.4);
          g.math('\\hat{φ}_{ij} = \\frac{N_{Aa,Aa} − 2N_{AA,aa}}{N_{Aa}^{(i)} + N_{Aa}^{(j)}}', 790, 530, { size: 42, alpha: fa });
          const K = D.king;
          g.text(`(${K.hh} − 2·${K.opp}) / (${K.hi} + ${K.hj})`, 790, 600, { size: 23, role: 'mono', color: PAL.ink2, alpha: S.p(3, 0.7, 11.4) });
          g.text('same pair:', 790, 644, { size: 22, color: PAL.ink2, alpha: S.p(3, 0.7, 11.4) }); g.math('\\hat{φ} = ' + fmt(D.Kking[fi][fj]), 900, 646, { size: 30, color: KCOL, alpha: S.p(3, 0.7, 11.4) });
          // no allele frequencies
          const na = S.p(3, 0.7, 12.4); const bx = 820, by = 740;
          g.rect(bx, by, 220, 22, { fill: 'rgba(238,231,215,0.08)', stroke: PAL.rule, w: 1.5, r: 11, alpha: na });
          g.rect(bx, by, 110, 22, { fill: U.rgba(PCOL, 0.5), r: 11, alpha: na });
          g.math('\\hat{p}', bx - 40, by + 20, { size: 32, color: PCOL, alpha: na });
          g.line(bx - 50, by + 40, bx + 236, by - 18, { color: FCOL, w: 3.5, alpha: na });
          g.text('no sample frequencies', bx + 110, by + 66, { size: 22, color: FCOL, align: 'center', alpha: na });
        });

        // ================= beat 4: PC-AiR / PC-Relate loop
        const v4 = S.p(4, 0.8);
        if (v4 > 0) g.withAlpha(v4, () => {
          label(g, 'PC-AiR + PC-Relate', 120, 262);
          const cx = 400, cy = 590, R = 215;
          const nodes = [['KING', 'kinship', -90, 0.4], ['unrelated set', '', -18, 3.0], ['PCs', 'ancestry', 54, 5.4], ['individual p̂', 'per ancestry', 126, 11.0], ['PC-Relate', 'φ and F', 198, 8.2]];
          const P = nodes.map(([, , ang]) => [cx + R * Math.cos(ang * Math.PI / 180), cy + R * Math.sin(ang * Math.PI / 180)]);
          // ring of arrows
          const iter = S.p(4, 0.8, 13.5);
          for (let k = 0; k < 5; k++) {
            const a0 = nodes[k][2] + 20, a1 = nodes[k][2] + 52; const pts = []; for (let q = 0; q <= 20; q++) { const an = (a0 + (a1 - a0) * q / 20) * Math.PI / 180; pts.push([cx + R * Math.cos(an), cy + R * Math.sin(an)]); }
            const pa = k === 4 ? iter : k === 3 ? S.p(4, 0.8, 11.6) : S.p(4, 0.8, nodes[(k + 1) % 5][3] - 0.3);
            g.poly(pts, { color: k === 4 ? COL : PAL.ink2, w: 2.5, progress: pa, dash: k === 4 ? [7, 6] : null });
            if (pa > 0.95) { const [x1, y1] = pts[19], [x2, y2] = pts[20]; g.arrowHead(x2, y2, Math.atan2(y2 - y1, x2 - x1), 13, k === 4 ? COL : PAL.ink2); }
          }
          // circulating pulse once it is an iteration
          if (iter > 0) { const ph = ((S.since(4) - 13.5) / 3.2) % 1, an = (-90 + 360 * ph) * Math.PI / 180; g.dot(cx + R * Math.cos(an), cy + R * Math.sin(an), 7, COL, iter, 3); }
          g.text('iterate', cx, cy + 8, { size: 30, role: 'display', italic: true, color: COL, align: 'center', alpha: iter });
          nodes.forEach(([nm, sub, , d], k) => { const a = S.p(4, 0.7, d); const [x, y] = P[k];
            const w = Math.max(g.measure(nm, { size: 23, weight: 600 }), sub ? g.measure(sub, { size: 21 }) : 0) + 36; g.rect(x - w / 2, y - 30, w, sub ? 64 : 48, { fill: 'rgba(18,36,38,0.92)', stroke: U.rgba(k === 4 ? KCOL : COL, 0.7), w: 1.5, r: 10, alpha: a });
            g.text(nm, x, y + 2, { size: 23, weight: 600, color: k === 4 ? KCOL : PAL.ink, align: 'center', alpha: a });
            if (sub) g.text(sub, x, y + 27, { size: 21, color: PAL.ink2, align: 'center', alpha: a }); });
          // right: the kinship matrix, pooled p̂ → PC-Relate
          const m = S.io(4, 2.0, 10.8);
          const x0 = 860, y0 = 320, sz = 400;
          label(g, m < 0.5 ? 'Kinship matrix, pooled p̂' : 'Kinship matrix, PC-Relate', 830, 262, S.p(4, 0.7, 0.6));
          heat(x0, y0, sz, 'pool', S.p(4, 0.8, 0.6), 'pcr', m);
          // unrelated set: dim the individuals KING flags as relatives (marks along the left edge)
          const ua = S.p(4, 0.6, 3.2) * (1 - S.p(4, 0.6, 8.6));
          for (let i = 0; i < N; i++) if (D.relSet[i]) g.circle(x0 + sz + 14, y0 + (i + 0.5) * sz / N, 3.5, { fill: FCOL, alpha: ua });
          const wv = lerp(D.summ[0][0], D.summ[3][0], m), bv = lerp(D.summ[0][1], D.summ[3][1], m), sv = lerp(D.sibK[0], D.sibK[3], m);
          const ra = S.p(4, 0.7, 0.8);
          readout(x0, y0 + sz, wv, bv, ra, ra, sv, S.p(4, 0.7, 12.2));
        });
        illus(g, 1290, 905, S.p(0, 0.6, 3) * (1 - S.p(3, 0.5)) + S.p(4, 0.6, 1));
      },
    },
  ],
});
})();
