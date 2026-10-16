/* Chapter V — Choosing methods. */
(function () {
const { PAL, U, Theater } = window; const { clamp, lerp, ease, rng, gauss } = U;
const COL = PAL.mint;

// Shared helpers -------------------------------------------------------------------------------
const vis = (S, k0, k1, d = 0.8) => S.p(k0, d) * (k1 === undefined ? 1 : 1 - S.p(k1, 0.6));
const label = (g, s, x, y, a = 1, col = PAL.ink3, align = 'left') => KIN.label(g, s, x, y, a, col, align);
// Scene-local time at which `phrase` is spoken within beat k (interpolated by character position).
const CUES = new WeakMap();
function cue(S, k, phrase) {
  const sc = S.scene; let m = CUES.get(sc); if (!m) CUES.set(sc, (m = new Map()));
  const key = k + '|' + phrase; let v = m.get(key);
  if (v === undefined) {
    const B = sc.timing.beats[k]; v = B ? B.start : S.dur;
    if (B) for (const s of B.sents) { const i = s.cap.indexOf(phrase); if (i >= 0) { v = s.start + (s.end - s.start) * i / s.cap.length; break; } }
    m.set(key, v);
  }
  return v;
}
// Tool card (like KIN.card, with a correct multi-line note).
function card(g, x, y, w, title, note, o = {}) {
  const { color = PAL.ink, alpha = 1, h = 92, size = 26 } = o; if (alpha <= 0) return h;
  g.withAlpha(alpha, () => {
    g.rect(x, y, w, h, { fill: 'rgba(18,36,38,0.82)', stroke: U.rgba(color, 0.55), w: 1.5, r: 10 });
    g.rect(x, y + 12, 4, h - 24, { fill: color, r: 2 });
    g.text(title, x + 24, y + 38, { size, role: 'mono', color });
    if (note) g.wrap(note, x + 24, y + 70, w - 44, { size: 21, color: PAL.ink2, lh: 1.25 });
  });
  return h;
}
const tp = (t, t0, d = 0.8) => ease.out((t - t0) / d);
const tio = (t, t0, d = 0.8) => ease.inOut((t - t0) / d);
// Point at arc-length fraction s along a polyline.
function along(pts, s) {
  let L = 0; const seg = []; for (let k = 1; k < pts.length; k++) { const d = Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); seg.push(d); L += d; }
  let target = clamp(s) * L; for (let k = 0; k < seg.length; k++) { if (target <= seg[k] || k === seg.length - 1) { const f = seg[k] ? clamp(target / seg[k]) : 0; return [lerp(pts[k][0], pts[k + 1][0], f), lerp(pts[k][1], pts[k + 1][1], f)]; } target -= seg[k]; }
  return pts[pts.length - 1];
}
// Realistic SNP allele frequencies: minor-allele frequency skewed low, ≥ 0.05 after MAF filtering.
function alleleFreqs(r, L) { const p = new Float64Array(L); for (let l = 0; l < L; l++) { const maf = 0.05 + 0.45 * Math.pow(r(), 1.3); p[l] = r() < 0.5 ? maf : 1 - maf; } return p; }

/* Exact single-locus pedigree likelihood by enumeration (nodes ordered parents-before-children).
   nodes: [{par:[i,j]|null}], obs: genotype (0/1/2 copies of allele 1) or -1 unsampled, q: allele-1 frequency. */
function locusLik(nodes, obs, q, eps) {
  const n = nodes.length, gt = new Int8Array(n), hw = [(1 - q) * (1 - q), 2 * q * (1 - q), q * q];
  const rec = (i, acc) => {
    if (i === n) return acc; let s = 0; const nd = nodes[i];
    for (let x = 0; x < 3; x++) {
      let pr;
      if (!nd.par) pr = hw[x];
      else { const pf = gt[nd.par[0]] / 2, pm = gt[nd.par[1]] / 2; pr = x === 2 ? pf * pm : x === 1 ? pf * (1 - pm) + pm * (1 - pf) : (1 - pf) * (1 - pm); }
      if (obs[i] >= 0) pr *= obs[i] === x ? 1 - eps : eps / 2;
      if (pr === 0) continue; gt[i] = x; s += rec(i + 1, acc * pr);
    }
    return s;
  };
  return rec(0, 1);
}

// ---- meth-pedigree layout --------------------------------------------------------------------------
const SEX = { M1: 'M', a: 'F', F2: 'F', X: 'F', Y: 'M', b: 'M', c: 'F', d: 'F' };
const SAMPLED = ['a', 'b', 'c', 'd'];
const R0 = 410, R1 = 600, R2 = 790, PR = 25;
const CANDS = [
  { key: 'A', fam: [['a', 'M1', ['c', 'b']], ['b', 'X', ['d']]], pos: { a: [700, R0], M1: [880, R0], c: [740, R1], b: [900, R1], X: [1080, R1], d: [990, R2] } },
  { key: 'B', fam: [['a', 'M1', ['b']], ['M1', 'F2', ['c']], ['c', 'Y', ['d']]], pos: { a: [700, R0], M1: [880, R0], F2: [1070, R0], b: [790, R1], c: [975, R1], Y: [1120, R1], d: [1047, R2] } },
  { key: 'C', fam: [['a', 'M1', ['b']], ['M1', 'F2', ['c']], ['b', 'c', ['d']]], pos: { a: [700, R0], M1: [880, R0], F2: [1070, R0], b: [790, R1], c: [975, R1], d: [882, R2] } },
];
const BIRTH = { a: 2008, b: 2012, c: 2012, d: 2017 };
const yearY = (yr) => R0 + (yr - 2008) * 42;
// Path an allele takes from parent P (toward partner Q) down to kid K, matching KIN.family's connector.
function famPath(P, Q, K, r = PR) {
  const mx = (P[0] + Q[0]) / 2, my = (P[1] + Q[1]) / 2; const sibY = (my + K[1]) / 2 + r * 0.2; const sx = P[0] + Math.sign(Q[0] - P[0]) * r;
  return [[P[0], P[1]], [sx, P[1]], [mx, my], [mx, sibY], [K[0], sibY], [K[0], K[1] - r], [K[0], K[1]]];
}

// ---- meth-map grid ---------------------------------------------------------------------------------
const GX0 = 390, GX1 = 1835, GAP = 12, CW = (GX1 - GX0 - 3 * GAP) / 4;
const RY0 = 352, RH = 122, RG = 10;
const colX = (c) => GX0 + c * (CW + GAP), rowY = (r) => RY0 + r * (RH + RG);

// ---- meth-simulate classes -------------------------------------------------------------------------
const CLS = [
  { id: 'U', nm: 'U', col: PAL.ink2 }, { id: 'HS', nm: 'HS', col: PAL.heather }, { id: 'FS', nm: 'FS', col: PAL.lagoon }, { id: 'PO', nm: 'PO', col: PAL.coral },
];
const CK = [2000, 1400, 1000, 700, 500, 350, 250, 180, 130, 100];
const XG0 = -0.4, XG1 = 1.0, NXG = 141; // r-hat grid
const KG1 = 1.0, NKG = 101;              // k0-hat grid

Theater.chapter({
  id: 'meth', roman: 'V', title: 'Choosing Methods', color: COL,
  question: 'Which tool, for which data and which question?',
  intro: { t: 'Chapter five. Choosing methods: matching the tool to your data and your question.' },
  motif(g, t) {
    // a loop that tightens into a fixed point: the chicken-and-egg cycle, converging
    const cx = 1470, cy = 235; const p = ease.inOut((t - 0.5) / 3.2); const pts = [];
    for (let k = 0; k <= 260; k++) { const u = k / 260; const a = u * Math.PI * 2 * 3.4; const rr = 120 * Math.exp(-2.4 * u); pts.push([cx + rr * 2.1 * Math.cos(a), cy + rr * 0.9 * Math.sin(a)]); }
    g.poly(pts, { color: COL, w: 2.2, alpha: 0.32, progress: p });
    g.dot(cx, cy, 4, COL, 0.4 * clamp((t - 3.4) / 0.8), 3);
  },
  scenes: [
    /* ============================================================== meth-pedigree */
    {
      id: 'meth-pedigree', title: 'Let the pedigree generate the sharing',
      beats: [
        { t: 'Likelihood-based pedigree reconstruction turns the problem around. Instead of estimating kinship and then guessing relationships, it proposes a whole pedigree and asks how probable the genotypes are under it.' },
        { t: 'Inbreeding is not a nuisance here. It is simply a loop in the pedigree, and the likelihood accounts for it automatically, because the pedigree itself generates the pattern of identity by descent.' },
        { t: 'COLONY reconstructs sibships and parentage by maximum likelihood, with an explicit option for inbreeding. The sequoia package is built for SNP panels of a few hundred loci, and uses birth years and age priors to separate relationships that genotypes alone cannot.',
          s: 'Colony reconstructs sibships and parentage by maximum likelihood, with an explicit option for inbreeding. The sequoia package is built for snip panels of a few hundred loci, and uses birth years and age priors to separate relationships that genotypes alone cannot.' },
        { t: 'For pairwise questions, choose estimators that permit inbreeding: NgsRelate version two, which works from genotype likelihoods, or the coancestry function in the related package, with allow.inbreeding set to true.',
          s: 'For pairwise questions, choose estimators that permit inbreeding: N G S Relate version two, which works from genotype likelihoods, or the coancestry function in the related package, with allow inbreeding set to true.', pause: 0.6 },
      ],
      terms: [
        { beat: 0.5, term: 'Pedigree likelihood', def: 'P(all genotypes | pedigree): candidate pedigrees are scored jointly, so inbreeding loops are handled by construction.' },
        { beat: 2.2, term: 'COLONY', def: 'Jones & Wang (2010): ML sibship and parentage reconstruction; tolerates genotyping error; optional inbreeding.' },
        { beat: 2.6, term: 'sequoia', def: 'Huisman (2017): pedigree reconstruction from SNP panels (hundreds of loci), using birth years and age priors.' },
      ],
      init() {
        // Simulate the true pedigree (C) at 300 unlinked SNPs, then score all three candidates exactly.
        const r = rng(5101), L = 300, p = alleleFreqs(r, L), eps = 0.01;
        const al = (q) => (r() < q ? 1 : 0); const pick = (gt) => gt[r() < 0.5 ? 0 : 1];
        const G = { a: [], b: [], c: [], d: [] };
        for (let l = 0; l < L; l++) {
          const q = p[l]; const M1 = [al(q), al(q)], a = [al(q), al(q)], F2 = [al(q), al(q)];
          const b = [pick(M1), pick(a)], c = [pick(M1), pick(F2)], d = [pick(b), pick(c)];
          G.a.push(a[0] + a[1]); G.b.push(b[0] + b[1]); G.c.push(c[0] + c[1]); G.d.push(d[0] + d[1]);
        }
        const ll = CANDS.map((cd) => {
          const ids = []; cd.fam.forEach(([f, m]) => { for (const x of [f, m]) if (!ids.includes(x)) ids.push(x); });
          // order: founders first (anyone who is never a child), then children in family order
          const kids = cd.fam.flatMap((f) => f[2]); const order = [...ids.filter((x) => !kids.includes(x)), ...kids.filter((x, i) => kids.indexOf(x) === i)];
          const idx = Object.fromEntries(order.map((x, i) => [x, i]));
          const nodes = order.map((x) => { const f = cd.fam.find((ff) => ff[2].includes(x)); return { par: f ? [idx[f[0]], idx[f[1]]] : null }; });
          let s = 0;
          for (let l = 0; l < L; l++) { const obs = order.map((x) => (G[x] ? G[x][l] : -1)); s += Math.log(locusLik(nodes, obs, p[l], eps)); }
          return s;
        });
        // Pairwise GRM kinship estimates (phi-hat = A_ij / 2), the "pairwise route"
        const phi = (i, j) => { let s = 0; for (let l = 0; l < L; l++) { const q = p[l]; s += (G[i][l] - 2 * q) * (G[j][l] - 2 * q) / (2 * q * (1 - q)); } return s / L / 2; };
        const pairs = [['b', 'c', ['HS?', 'GP?', 'AV?']], ['b', 'd', ['PO?', 'FS?']], ['a', 'd', ['HS?', 'GP?', 'U?']]].map(([i, j, gs]) => ({ i, j, v: phi(i, j), gs }));
        return { L, G, ll, pairs };
      },
      draw(g, t, S, D) {
        const tRoute = cue(S, 0, 'Instead of'), tGuess = cue(S, 0, 'guessing'), tProp = cue(S, 0, 'it proposes'), tProb = cue(S, 0, 'how probable');
        const tLoop = cue(S, 1, 'a loop'), tAcc = cue(S, 1, 'likelihood accounts'), tGen = cue(S, 1, 'generates');
        const tCol = S.b(2), tInb = cue(S, 2, 'explicit option'), tSeq = cue(S, 2, 'The sequoia'), tBirth = cue(S, 2, 'birth years'), tSep = cue(S, 2, 'to separate');
        const tPair = S.b(3), tNgs = cue(S, 3, 'NgsRelate'), tCoa = cue(S, 3, 'the coancestry');

        // ---------------- left column, beat 0: genotypes → pairwise route
        const vData = tp(t, 1.3, 0.9) * (1 - tp(t, S.b(1) + 0.3, 0.7));
        g.withAlpha(vData, () => {
          label(g, 'Genotypes · 4 sampled animals', 100, 262);
          const N = 34, cw = 12.4;
          SAMPLED.forEach((id, k) => {
            const y = 312 + k * 52, pa = tp(t, 1.4 + k * 0.25, 0.7);
            KIN.person(g, 122, y, { sex: SEX[id], r: 15, color: PAL.ink2, alpha: pa, w: 2 });
            g.math(id, 150, y + 9, { size: 28, color: PAL.ink2, alpha: pa });
            for (let l = 0; l < N; l++) {
              const v = D.G[id][l]; const pl = clamp((t - 1.6 - k * 0.25) * 2.2 - l * 0.04); if (pl <= 0) continue;
              g.rect(178 + l * cw, y - 12, cw - 3, 24, { fill: v === 0 ? 'rgba(238,231,215,0.10)' : U.rgba(PAL.sand, v === 1 ? 0.5 : 0.95), r: 2, alpha: pl });
            }
          });
        });
        const vPw = tp(t, tRoute, 0.8) * (1 - tp(t, S.b(1), 0.7));
        g.withAlpha(vPw, () => {
          label(g, 'Pairwise route', 100, 548, 1, PAL.ink2);
          g.arrow(330, 520, 330, 552, { color: PAL.ink3, w: 2, head: 11, alpha: 0.8 });
          D.pairs.forEach((pr, k) => {
            const y = 612 + k * 86, pa = tp(t, tRoute + 0.3 + k * 0.45, 0.6), pg = tp(t, tGuess + 0.2 + k * 0.35, 0.6);
            g.math(`${pr.i}\\text{–}${pr.j}`, 104, y + 12, { size: 34, color: PAL.ink, alpha: pa });
            g.math(`\\hat{φ} = ${pr.v.toFixed(2)}`, 172, y + 12, { size: 40, color: PAL.lagoon, alpha: pa });
            g.arrow(352, y, 392, y, { color: PAL.ink3, w: 2, head: 11, alpha: pg, progress: pg });
            let x = 402; pr.gs.forEach((s, j) => { x += g.pill(s, x, y, { color: PAL.ochre, size: 21, alpha: pg * tp(t, tGuess + 0.4 + k * 0.35 + j * 0.15, 0.4) }) + 6; });
          });
        });

        // ---------------- right: pedigree route
        const vR = tp(t, tProp - 0.3, 0.8);
        label(g, 'Pedigree route', 660, 262, vR, COL);
        g.math('L = P(\\text{genotypes} | \\text{pedigree})', 660, 322, { size: 40, color: PAL.ink, alpha: tp(t, tProb, 0.8) });
        // candidate index u: 0 (A) → 1 (B) → 2 (C)
        const tA = tProp + 0.2, dwell = 1.15;
        const u = clamp((t - tA - dwell + 0.35) / 0.7) + clamp((t - tA - 2 * dwell + 0.35) / 0.7);
        const i0 = Math.min(1, Math.floor(u)), f = ease.inOut(u - i0), c0 = CANDS[i0], c1 = CANDS[Math.min(2, i0 + 1)];
        const yrMix = tio(t, tBirth - 0.2, 1.4);
        const posOf = (cd, id) => { const P = cd.pos[id]; if (!P) return null; if (cd.key === 'C' && BIRTH[id]) return [P[0], lerp(P[1], yearY(BIRTH[id]), yrMix)]; return P; };
        const P = (id) => { const a = posOf(c0, id), b = posOf(c1, id); if (a && b) return [lerp(a[0], b[0], f), lerp(a[1], b[1], f)]; return a || b; };
        const pedA = vR;
        // birth-year axis (beat 2)
        const ax = yrMix * (1 - 0) * pedA;
        if (ax > 0) g.withAlpha(ax, () => {
          g.line(628, yearY(2007.4), 628, yearY(2017.6), { color: PAL.ink2, w: 2 });
          for (const yr of [2008, 2012, 2017]) { const y = yearY(yr); g.line(620, y, 628, y, { color: PAL.ink2, w: 1.6 }); g.text(String(yr), 612, y + 7, { size: 19, color: PAL.ink2, align: 'right' }); const id = yr === 2008 ? 'a' : yr === 2012 ? 'b' : 'd'; const Q = P(id); g.line(632, y, Q[0] - PR - 34, y, { color: PAL.ink3, w: 1.2, dash: [3, 6], alpha: 0.7 }); }
          g.with(() => { g.ctx.translate(540, (yearY(2008) + yearY(2017)) / 2); g.ctx.rotate(-Math.PI / 2); g.text('birth year', 0, 0, { size: 21, color: PAL.ink3, align: 'center' }); });
        });
        // families (crossfade between candidates)
        const drawFams = (cd, a) => { if (a <= 0.01) return; for (const [fa, mo, kids] of cd.fam) KIN.family(g, P(fa), P(mo), kids.map(P), { color: PAL.ink2, w: 2, alpha: a * pedA, r: PR, progress: tp(t, tA - 0.2, 1.0) }); };
        drawFams(c0, 1 - f); if (c1 !== c0) drawFams(c1, f);
        // loop highlight (beat 1): founder allele from M1 down both sides into d
        const C = CANDS[2]; const isC = i0 === 1 && f > 0.99;
        const hl = isC ? tp(t, tLoop - 0.2, 0.9) : 0;
        const pathL = [...famPath(P('M1'), P('a'), P('b')), ...famPath(P('b'), P('c'), P('d')).slice(1)];
        const pathR = [...famPath(P('M1'), P('F2'), P('c')), ...famPath(P('c'), P('b'), P('d')).slice(1)];
        if (hl > 0) {
          const dim = 1 - 0.55 * tp(t, S.b(2) + 0.2, 1.0) * (1 - tp(t, S.e(2) + 0.6, 1));
          for (const pth of [pathL, pathR]) { g.poly(pth, { color: PAL.heather, w: 9, alpha: 0.16 * hl * dim, progress: hl }); g.poly(pth, { color: PAL.heather, w: 3.2, alpha: 0.95 * hl * dim, progress: hl }); }
          const tr = clamp((t - tLoop - 0.4) / 2.6);
          if (tr > 0 && tr < 1) for (const pth of [pathL, pathR]) { const q = along(pth, ease.inOut(tr)); g.dot(q[0], q[1], 9, PAL.heather, 1, 2.6); }
        }
        // nodes
        const allIds = ['M1', 'a', 'F2', 'X', 'Y', 'b', 'c', 'd'];
        for (const id of allIds) {
          const in0 = !!c0.pos[id], in1 = !!c1.pos[id]; const a = (in0 ? 1 - f : 0) + (in1 ? f : 0) + (in0 && in1 ? 0 : 0);
          const alpha = (in0 && in1 ? 1 : a) * pedA * tp(t, tA - 0.4, 0.7); if (alpha <= 0.01) continue;
          const Q = P(id); const smp = SAMPLED.includes(id);
          const arrived = hl > 0 && t > tLoop + 3.0;
          const o = { sex: SEX[id], r: PR, alpha, w: smp ? 2.6 : 1.8, color: smp ? PAL.ink : PAL.ink3, fill: smp ? 'rgba(11,22,24,0.94)' : 'rgba(11,22,24,0.7)' };
          if (id === 'M1' && hl > 0) { o.alleles = [PAL.heather, null]; o.color = PAL.heather; }
          if (id === 'd' && arrived) { o.alleles = [PAL.heather, PAL.heather]; o.inbred = true; o.glow = PAL.coral; }
          if (!smp && id !== 'M1') o.color = PAL.ink3;
          KIN.person(g, Q[0], Q[1], o);
          if (smp) g.math(id, Q[0] - PR - 6, Q[1] - PR + 4, { size: 28, color: PAL.ink2, align: 'right', alpha });
          if (!smp) g.text('?', Q[0], Q[1] + 8, { size: 22, color: PAL.ink3, align: 'center', alpha: alpha * 0.8 * (id === 'M1' && hl > 0 ? 0 : 1) });
        }
        // candidate tag + scoreboard
        const curKey = u < 0.5 ? 'A' : u < 1.5 ? 'B' : 'C';
        label(g, 'candidate ' + curKey, 660, 372, pedA * tp(t, tA, 0.5) * (1 - tp(t, S.b(1), 0.6)), PAL.ink3);
        g.math('\\ln L', 1188, 404, { size: 40, color: PAL.ink, alpha: pedA * tp(t, tA, 0.6) });
        const best = D.ll.indexOf(Math.max(...D.ll));
        CANDS.forEach((cd, k) => {
          const t0 = tA + k * dwell; const pa = tp(t, t0, 0.4) * pedA; if (pa <= 0) return;
          const y = 470 + k * 62; const cnt = ease.out(clamp((t - t0) / 0.9));
          const v = lerp(D.ll[0] * 1.6, D.ll[k], cnt);
          const isBest = k === best && t > tA + 2 * dwell + 0.9; const active = cd.key === curKey && !isBest;
          const col = isBest ? COL : active ? PAL.ink : PAL.ink2;
          if (isBest) g.rect(1180, y - 34, 148, 50, { fill: U.rgba(COL, 0.12), stroke: U.rgba(COL, 0.6), w: 1.5, r: 8, alpha: tp(t, tA + 2 * dwell + 0.9, 0.5) });
          g.text(cd.key, 1192, y, { size: 30, role: 'display', color: col, alpha: pa });
          g.text(v.toFixed(1), 1318, y, { size: 23, role: 'mono', color: col, align: 'right', alpha: pa });
        });
        g.text('★ best', 1254, 470 + best * 62 + 44, { size: 21, color: COL, align: 'center', alpha: tp(t, tA + 2 * dwell + 1.0, 0.6) * pedA });
        g.text(`${D.L} SNPs`, 1254, 700, { size: 21, role: 'mono', color: PAL.ink3, align: 'center', alpha: tp(t, tA + 0.5, 0.6) * pedA });

        // ---------------- beat 1: the loop explained (left)
        const vL = tp(t, tAcc - 0.3, 0.9) * (1 - tp(t, S.b(2), 0.6));
        g.withAlpha(vL, () => {
          g.text('inbreeding = a loop', 100, 560, { size: 42, role: 'display', italic: true, color: PAL.ink });
          g.text('the likelihood already counts', 100, 612, { size: 42, role: 'display', italic: true, color: PAL.ink });
          g.math('F_{d} = φ_{bc} = 1/8', 100, 712, { size: 44, color: PAL.coral, alpha: tp(t, tGen - 0.6, 0.8) });
          g.text('two copies of one founder allele', 100, 770, { size: 22, color: PAL.heather, alpha: tp(t, tGen, 0.8) });
        });

        // ---------------- beat 2: tool cards + age axis
        const cw = 440;
        card(g, 100, 280, cw, 'COLONY', 'sibships & parentage · ML', { color: COL, h: 118, alpha: tp(t, tCol, 0.7) * pedA });
        g.pill('inbreeding option', 124, 372, { color: PAL.coral, size: 20, alpha: tp(t, tInb, 0.6) });
        card(g, 100, 418, cw, 'sequoia', 'SNP panels of a few hundred loci · birth years & age priors', { color: PAL.ochre, h: 118, alpha: tp(t, tSeq, 0.7) });
        // grandparent vs half sib, separated by ages
        const vAge = tp(t, tSep - 0.2, 0.8) * (1 - tp(t, tPair, 0.6));
        if (vAge > 0) {
          const A = P('a'), Dd = P('d');
          g.carrow(A[0] - PR - 4, A[1] + 10, Dd[0] - PR - 6, Dd[1] - 4, 0.28, { color: PAL.lagoon, w: 2.4, dash: [6, 6], head: 12, alpha: vAge, progress: vAge });
          g.pill(`a, d born ${BIRTH.d - BIRTH.a} yr apart → likely grandparent`, 882, 868, { color: PAL.lagoon, size: 21, align: 'center', alpha: tp(t, tSep + 0.4, 0.7) * (1 - tp(t, tPair, 0.6)) });
        }

        // ---------------- beat 3: pairwise tools that permit inbreeding
        label(g, 'Pairwise · inbreeding allowed', 100, 590, tp(t, tPair, 0.7), PAL.lagoon);
        card(g, 100, 608, cw, 'NgsRelate v2', 'genotype likelihoods · 9 IBD states', { color: PAL.lagoon, h: 118, alpha: tp(t, tNgs, 0.7) });
        const pc = tp(t, tCoa, 0.7);
        if (pc > 0) g.withAlpha(pc, () => {
          g.rect(100, 744, cw, 120, { fill: 'rgba(18,36,38,0.82)', stroke: U.rgba(PAL.lagoon, 0.55), w: 1.5, r: 10 });
          g.rect(100, 756, 4, 96, { fill: PAL.lagoon, r: 2 });
          g.text('related::coancestry(gt,', 124, 790, { size: 23, role: 'mono', color: PAL.ink });
          g.text('  allow.inbreeding = ', 124, 828, { size: 23, role: 'mono', color: PAL.ink });
          g.text('TRUE)', 124 + g.measure('  allow.inbreeding = ', { size: 23, role: 'mono' }), 828, { size: 23, role: 'mono', color: PAL.moss, weight: 600 });
        });
        // the b–d pair, inbreeding allowed: kinship above the outbred 1/4
        const vBD = tp(t, tPair + 0.4, 0.8);
        if (vBD > 0) {
          const B = P('b'), Dd = P('d');
          g.carrow(B[0] - PR - 4, B[1] + 8, Dd[0] - PR - 6, Dd[1] + 2, 0.32, { color: PAL.lagoon, w: 2.6, head: 12, alpha: vBD, progress: vBD, both: true });
          g.math('φ_{bd} = 5/16', 882, 886, { size: 40, color: PAL.lagoon, align: 'center', alpha: tp(t, tPair + 1.4, 0.8) });
          g.text('not ¼', 1000, 884, { size: 22, color: PAL.ink3, alpha: tp(t, tPair + 2.4, 0.8) });
        }
      },
    },
    /* ============================================================== meth-map */
    {
      id: 'meth-map', title: 'Which method, when',
      beats: [
        { t: 'Put the pieces together as a map. Across the top is the question you are asking. Down the side is the data you have.' },
        { t: 'For mean kinship among classes of pairs, as in sex-biased dispersal, almost any data will do. Moment estimators or a genomic relationship matrix, with permutation tests, work even with a few hundred SNPs.',
          s: 'For mean kinship among classes of pairs, as in sex-biased dispersal, almost any data will do. Moment estimators or a genomic relationship matrix, with permutation tests, work even with a few hundred snips.' },
        { t: 'For parentage and sibships, likelihood pedigree methods work from a few hundred well-chosen SNPs upward, especially with age data. Separating half siblings from grandparents or aunts needs segments from dense markers on a chromosome-level assembly, or else ages and pedigree context.',
          s: 'For parentage and sibships, likelihood pedigree methods work from a few hundred well-chosen snips upward, especially with age data. Separating half siblings from grandparents or aunts needs segments from dense markers on a chromosome-level assembly, or else ages and pedigree context.' },
        { t: 'For individual inbreeding, a sparse panel supports only noisy marker-based F, worth checking with g2. RADseq supports likelihood-based heterozygosity and cautious runs. Whole genomes support F_ROH by length class, the most informative measure.',
          s: 'For individual inbreeding, a sparse panel supports only noisy marker-based F, worth checking with g two. Rad seq supports likelihood-based heterozygosity and cautious runs. Whole genomes support F roh by length class, the most informative measure.' },
        { t: 'And whatever the cell, structure comes first. If your sample spans genetic clusters, analyze within them, or use KING-robust and PC-Relate.',
          s: 'And whatever the cell, structure comes first. If your sample spans genetic clusters, analyze within them, or use King robust and P C relate.', pause: 0.8 },
      ],
      draw(g, t, S, D) {
        const COLS = [
          { h: 'Mean kinship by class', s: 'e.g. sex-biased dispersal', at: S.b(1) },
          { h: 'Parentage & sibships', s: 'pedigree reconstruction', at: S.b(2) },
          { h: 'Separate 2nd-degree kin', s: 'half sib vs grandparent vs aunt', at: cue(S, 2, 'Separating') },
          { h: 'Individual inbreeding', s: 'F for each animal', at: S.b(3) },
        ];
        const ROWS = [
          { h: 'Amplicon panel', s: '10²–10³ SNPs' },
          { h: 'RADseq', s: '10³–10⁵ SNPs' },
          { h: 'Low-coverage WGS', s: 'genotype likelihoods' },
          { h: 'WGS', s: '+ chromosome assembly' },
        ];
        // cells: c, r0..r1, colour, main lines (display), mono line, sub line, reveal time
        const CELLS = [
          { c: 0, r0: 0, r1: 3, col: PAL.moss, main: ['Moment estimators', 'or a GRM'], sub: ['+ permutation tests', 'a few hundred SNPs suffice'], at: cue(S, 1, 'Moment'), grow: cue(S, 1, 'almost any') },
          { c: 1, r0: 0, r1: 3, col: PAL.moss, main: ['Likelihood', 'pedigree methods'], mono: 'COLONY · sequoia', sub: ['a few hundred SNPs upward', 'best with age data'], at: cue(S, 2, 'likelihood pedigree'), grow: cue(S, 2, 'likelihood pedigree') - 0.6 },
          { c: 2, r0: 3, r1: 3, col: PAL.moss, main: ['IBD segments'], sub: ['segment lengths tell them apart'], at: cue(S, 2, 'needs segments') },
          { c: 2, r0: 0, r1: 1, col: PAL.ochre, main: ['Only with ages', '& pedigree context'], sub: ['unlinked markers: same k₀, k₁'], at: cue(S, 2, 'or else ages') },
          { c: 2, r0: 2, r1: 2, col: PAL.ochre, main: ['Segments, given a', 'chromosome assembly'], sub: ['noisier at low depth'], at: cue(S, 2, 'chromosome-level') },
          { c: 3, r0: 0, r1: 0, col: PAL.ochre, main: ['Noisy marker F'], sub: ['check g₂ first'], at: cue(S, 3, 'a sparse panel') },
          { c: 3, r0: 1, r1: 1, col: PAL.ochre, main: ['Likelihood', 'heterozygosity'], sub: ['cautious ROH'], at: cue(S, 3, 'RADseq') },
          { c: 3, r0: 2, r1: 3, col: PAL.moss, main: [], froh: true, sub: ['the most informative measure', 'likelihood callers at low depth'], at: cue(S, 3, 'Whole genomes') },
        ];
        const fr = S.p(0, 1.0, 0.1);
        // structure sweep (beat 4)
        const tB = S.b(4), tB2 = cue(S, 4, 'If your sample');
        // ---- corner + frame
        label(g, 'question →', 372, 296, fr, PAL.ink3, 'right');
        label(g, 'data ↓', 92, 338, fr, PAL.ink3);
        g.line(90, 344, GX1, 344, { color: PAL.rule, w: 1.5, progress: fr });
        g.line(380, 270, 380, rowY(3) + RH, { color: PAL.rule, w: 1.5, progress: fr });
        // ---- column headers
        const tTop = cue(S, 0, 'Across the top'), tSide = cue(S, 0, 'Down the side');
        COLS.forEach((c, k) => {
          const x = colX(k), pa = tp(t, tTop + 0.2 + k * 0.3, 0.7);
          const act = t >= c.at - 0.2 && (k === 3 ? t < tB : t < (COLS[k + 1] ? COLS[k + 1].at - 0.2 : tB));
          const on = act ? tp(t, c.at - 0.2, 0.5) : 0;
          g.text(c.h, x + 4, 300, { size: 31, role: 'display', color: on > 0.5 ? PAL.ink : PAL.ink, alpha: pa });
          g.text(c.s, x + 4, 330, { size: 21, color: PAL.ink3, alpha: pa });
          g.line(x + 4, 340, x + 4 + (CW - 8) * on, 340, { color: COL, w: 3, alpha: pa });
        });
        // ---- row headers
        ROWS.forEach((r, k) => {
          const y = rowY(k), pa = tp(t, tSide + 0.15 + k * 0.3, 0.7);
          g.rect(90, y, 280, RH, { fill: 'rgba(18,36,38,0.55)', r: 10, alpha: pa });
          g.text(r.h, 110, y + RH / 2 - 4, { size: 31, role: 'display', color: PAL.ink, alpha: pa });
          g.text(r.s, 110, y + RH / 2 + 30, { size: 21, role: 'mono', color: PAL.ink3, alpha: pa, maxW: 252 });
        });
        // ---- empty cell slots
        for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) g.rect(colX(c), rowY(r), CW, RH, { stroke: 'rgba(238,231,215,0.10)', w: 1.2, r: 10, dash: [4, 7], alpha: tp(t, tSide + 0.8, 1.0) });
        // ---- filled cells
        const sweep = t >= tB ? clamp((t - tB - 0.2) / 1.6) : -1;
        CELLS.forEach((cl) => {
          const t0 = cl.grow ?? cl.at - 0.4; const pg = tio(t, t0, cl.r1 > cl.r0 ? 1.4 : 0.7); if (pg <= 0) return;
          const x = colX(cl.c), y = rowY(cl.r0), H = rowY(cl.r1) + RH - y; const h = H * pg;
          const hot = tp(t, cl.at - 0.2, 0.5) * (1 - tp(t, cl.at + 3.2, 1.2));
          g.rect(x, y, CW, h, { fill: U.rgba(cl.col, 0.13 + 0.07 * hot), stroke: U.rgba(cl.col, 0.65 + 0.35 * hot), w: 1.6 + 1.2 * hot, r: 10 });
          g.rect(x, y + 10, 5, Math.max(0, h - 20), { fill: cl.col, r: 2.5 });
          if (sweep >= 0 && sweep < 1) { const sx = lerp(80, 1860, sweep); if (sx > x && sx < x + CW) g.rect(Math.max(x, sx - 30), y, Math.min(60, x + CW - sx + 30), H, { fill: U.rgba(PAL.sand, 0.14), r: 6 }); }
          // badge
          const pb = tp(t, cl.at + 0.2, 0.5);
          const bx = x + CW - 26, by = y + 26;
          g.circle(bx, by, 14, { fill: U.rgba(cl.col, 0.22), stroke: cl.col, w: 1.6, alpha: pb });
          g.text(cl.col === PAL.moss ? '✓' : '!', bx, by + 7.5, { size: 20, weight: 700, color: cl.col, align: 'center', alpha: pb });
          // content (vertically centred)
          const lines = [];
          cl.main.forEach((s) => lines.push({ s, size: 32, role: 'display', color: PAL.ink, h: 36 }));
          if (cl.froh) lines.push({ froh: true, h: 40 });
          if (cl.mono) lines.push({ s: cl.mono, size: 22, role: 'mono', color: cl.col, h: 34, gap: 6 });
          cl.sub.forEach((s, j) => lines.push({ s, size: 21, role: 'sans', color: PAL.ink2, h: 27, gap: j === 0 ? 8 : 0 }));
          const tot = lines.reduce((a, l) => a + l.h + (l.gap || 0), 0);
          let yy = y + H / 2 - tot / 2; const pt = tp(t, cl.at, 0.8);
          lines.forEach((l, j) => {
            yy += (l.gap || 0) + l.h; const a = pt * tp(t, cl.at + j * 0.18, 0.6);
            if (l.froh) { const w = g.math('F_{\\text{ROH}}', x + 24, yy - 6, { size: 38, color: PAL.ink, alpha: a }); g.text('by length class', x + 30 + w, yy - 6, { size: 32, role: 'display', color: PAL.ink, alpha: a }); }
            else g.text(l.s, x + 24, yy - 6, { size: l.size, role: l.role, color: l.color, alpha: a, maxW: CW - 70 });
          });
        });
        // ---- legend
        const lg = S.p(1, 0.8, 1.5);
        g.text('✓ works', 1835 - 330, 904, { size: 21, color: PAL.moss, alpha: lg, align: 'right' });
        g.text('! with caution, or extra data', 1835, 904, { size: 21, color: PAL.ochre, alpha: lg, align: 'right' });
        // ---- beat 4: structure first
        const bp = S.io(4, 1.0, 0.1);
        if (bp > 0) {
          const bw = (GX1 - 90) * bp;
          g.rect(90, 208, bw, 50, { fill: U.rgba(PAL.sand, 0.12), stroke: U.rgba(PAL.sand, 0.7), w: 1.6, r: 10 });
          g.withAlpha(tp(t, tB + 0.5, 0.7), () => {
            g.text('STRUCTURE FIRST', 112, 242, { size: 22, weight: 600, ls: 2.6, color: PAL.sand });
            const w0 = 112 + g.measure('STRUCTURE FIRST', { size: 22, weight: 600, ls: 2.6 }) + 26;
            g.withAlpha(tp(t, tB2 + 0.6, 0.8), () => {
              g.text('analyze within genetic clusters', w0, 242, { size: 25, color: PAL.ink });
              const w1 = w0 + g.measure('analyze within genetic clusters', { size: 25 }) + 18;
              g.text('— or —', w1, 242, { size: 23, color: PAL.ink3 });
              const w2 = w1 + g.measure('— or —', { size: 23 }) + 18;
              g.text('KING-robust · PC-Relate', w2, 242, { size: 24, role: 'mono', color: PAL.sand, alpha: tp(t, cue(S, 4, 'KING-robust'), 0.7) });
            });
          });
          // chevrons down into each column
          for (let c = 0; c < 4; c++) { const x = colX(c) + CW / 2, pa = tp(t, tB + 0.9 + c * 0.12, 0.5); g.poly([[x - 9, 262], [x, 270], [x + 9, 262]], { color: PAL.sand, w: 2, alpha: pa * 0.8 }); }
        }
      },
    },
    /* ============================================================== meth-simulate */
    {
      id: 'meth-simulate', title: 'Simulate your own power',
      beats: [
        { t: 'The real answer to how you can ever estimate either one reliably is simulation. Take your own allele frequencies and your own marker set, simulate pedigrees with known relationships, including inbred ones, and see what your estimators recover.' },
        { t: 'Each relationship class produces a distribution of estimates. With many markers, unrelated pairs, half siblings and first-degree pairs separate cleanly, and k0 then splits parent and offspring from full siblings.',
          s: 'Each relationship class produces a distribution of estimates. With many markers, unrelated pairs, half siblings and first-degree pairs separate cleanly, and k zero then splits parent and offspring from full siblings.' },
        { t: 'With fewer markers, or more inbreeding, they overlap. The overlap is the misclassification rate: the fraction of half siblings that look unrelated, or full siblings that look like half siblings.' },
        { t: 'Tools exist for exactly this. The related package simulates families, sequoia\'s EstConf estimates assignment error rates, and CKMRsim computes false positive and false negative rates for each kin category.',
          s: 'Tools exist for exactly this. The related package simulates families, sequoia\'s Est Conf estimates assignment error rates, and C K M R sim computes false positive and false negative rates for each kin category.' },
        { t: 'If the simulations show that your panel cannot separate full from half siblings at plausible levels of inbreeding, do not rely on that distinction, no matter which method you use.', pause: 0.6 },
      ],
      terms: [
        { beat: 0.5, term: 'Simulation validation', def: 'Simulating known pedigrees with your own allele frequencies and markers to measure the bias, precision and error rates of your estimators.' },
        { beat: 2.4, term: 'Misclassification rate', def: 'Fraction of pairs of one true relationship assigned to another; the overlap of simulated estimate distributions.' },
      ],
      init() {
        // Unlinked biallelic SNPs; pairs generated by gene dropping through known pedigrees (IBD sampling).
        const r = rng(2026), LM = CK[0], N = 300, p = alleleFreqs(r, LM);
        const PED = {
          U: { par: [null, null], pair: [0, 1] },
          PO: { par: [null, null, [0, 1]], pair: [0, 2] },
          FS: { par: [null, null, [0, 1], [0, 1]], pair: [2, 3] },
          HS: { par: [null, null, null, [0, 1], [0, 2]], pair: [3, 4] },
          // inbred half sibs: both are offspring of half-sib matings (F = 1/8 each); 2φ = 7/16
          HSi: { par: [null, null, null, null, [0, 1], [0, 2], [0, 3], [4, 5], [4, 6]], pair: [7, 8] },
        };
        const est = {};
        for (const [nm, P] of Object.entries(PED)) {
          const n = P.par.length, a0 = new Int8Array(n), a1 = new Int8Array(n);
          const R = CK.map(() => new Float64Array(N)), K = CK.map(() => new Float64Array(N));
          for (let i = 0; i < N; i++) {
            let sA = 0, sI = 0, sE = 0;
            for (let l = 0; l < LM; l++) {
              const q = p[l];
              for (let k = 0; k < n; k++) { const pp = P.par[k]; if (!pp) { a0[k] = r() < q ? 1 : 0; a1[k] = r() < q ? 1 : 0; } else { const f = pp[0], m = pp[1]; a0[k] = r() < 0.5 ? a0[f] : a1[f]; a1[k] = r() < 0.5 ? a0[m] : a1[m]; } }
              const x = a0[P.pair[0]] + a1[P.pair[0]], y = a0[P.pair[1]] + a1[P.pair[1]];
              sA += (x - 2 * q) * (y - 2 * q) / (2 * q * (1 - q));      // GRM: estimates 2φ (= r when outbred)
              if (Math.abs(x - y) === 2) sI++; sE += 2 * q * q * (1 - q) * (1 - q); // IBS0 vs its expectation when k0 = 1
              const L = l + 1; const c = CK.indexOf(L); if (c >= 0) { R[c][i] = sA / L; K[c][i] = sI / sE; }
            }
          }
          est[nm] = { R, K };
        }
        // Kernel densities on fixed grids, one per marker count
        const kde = (arr, x0, x1, nx) => {
          let m = 0; for (const v of arr) m += v; m /= arr.length; let s = 0; for (const v of arr) s += (v - m) * (v - m); s = Math.sqrt(s / arr.length);
          const h = Math.max(0.008, 1.06 * s * Math.pow(arr.length, -0.2)); const out = new Float64Array(nx);
          for (let j = 0; j < nx; j++) { const x = x0 + (x1 - x0) * j / (nx - 1); let d = 0; for (const v of arr) { const z = (x - v) / h; if (z > -4 && z < 4) d += Math.exp(-0.5 * z * z); } out[j] = d / (arr.length * h * Math.sqrt(2 * Math.PI)); }
          return out;
        };
        const dens = {}; for (const nm of Object.keys(PED)) dens[nm] = CK.map((_, c) => kde(est[nm].R[c], XG0, XG1, NXG));
        const k0FS = CK.map((_, c) => kde(est.FS.K[c], 0, KG1, NKG));
        // Classification: r̂ < 1/8 → U; < 3/8 → HS; otherwise k̂0 < 1/8 → PO, else FS.
        const classify = (rv, kv) => (rv < 0.125 ? 0 : rv < 0.375 ? 1 : kv < 0.125 ? 3 : 2);
        const conf = CK.map((_, c) => ['U', 'HS', 'FS', 'PO', 'HSi'].map((nm) => { const row = [0, 0, 0, 0]; for (let i = 0; i < N; i++) row[classify(est[nm].R[c][i], est[nm].K[c][i])]++; return row.map((v) => v / N); }));
        // a few sample estimates per class for the pipeline preview
        // stacked dots for the pipeline preview (500 SNPs, 18 pairs per class), binned at 0.05
        const stack = [], hgt = {}; let ord = 0;
        for (let i = 0; i < 18; i++) ['U', 'HS', 'FS', 'PO'].forEach((nm, k) => { const v = est[nm].R[CK.indexOf(500)][i]; const b = Math.round(v / 0.05) * 0.05; const key = b.toFixed(2); hgt[key] = (hgt[key] || 0) + 1; stack.push({ k, b, h: hgt[key] - 1, ord: ord++ }); });
        // MAF histogram of the simulated panel
        const hist = new Array(9).fill(0); for (let l = 0; l < LM; l++) { const maf = Math.min(p[l], 1 - p[l]); hist[Math.min(8, Math.floor((maf - 0.05) / 0.05))]++; }
        return { dens, k0FS, conf, stack, hist, N };
      },
      draw(g, t, S, D) {
        const ctx = g.ctx;
        // ---------------- beat 0: the simulation pipeline
        const tAF = cue(S, 0, 'allele frequencies'), tMk = cue(S, 0, 'marker set'), tPed = cue(S, 0, 'simulate pedigrees'), tInb = cue(S, 0, 'including inbred'), tEst = cue(S, 0, 'see what');
        const v0 = 1 - S.p(1, 0.7);
        if (v0 > 0) g.withAlpha(v0, () => {
          const cy = 540;
          const stages = [[100, 'Your data', tAF - 0.4], [450, 'Known pedigrees', tPed - 0.3], [880, 'Estimator', tEst - 0.6], [1110, 'Estimates', tEst - 0.2]];
          stages.forEach(([x, s, t0], k) => label(g, s, x, 262, tp(t, t0, 0.6), k === 1 ? COL : PAL.ink3));
          const arr = [[372, 428, tPed - 0.3], [830, 870, tEst - 0.6], [1052, 1092, tEst - 0.2]];
          arr.forEach(([a, b, t0]) => g.arrow(a, cy, b, cy, { color: PAL.ink3, w: 2.2, head: 13, progress: tp(t, t0, 0.7) }));
          // allele-frequency spectrum of the simulated panel (MAF bins 0.05–0.50)
          const ha = tp(t, tAF, 0.9); const hmax = Math.max(...D.hist);
          D.hist.forEach((h, k) => { const bh = 150 * h / hmax * clamp(ha * 1.6 - k * 0.07); g.rect(102 + k * 28, 470 - bh, 22, bh, { fill: PAL.ochre, alpha: 0.85, r: 2 }); });
          g.line(100, 472, 354, 472, { color: PAL.ink3, w: 1.5, alpha: ha });
          g.text('0.05', 102, 496, { size: 19, color: PAL.ink3, alpha: ha }); g.text('0.5', 352, 496, { size: 19, color: PAL.ink3, align: 'right', alpha: ha });
          g.text('allele frequencies', 100, 532, { size: 22, color: PAL.ochre, alpha: ha });
          // markers along a chromosome
          const ma = tp(t, tMk, 0.9);
          KIN.chrom(g, 100, 640, 254, [], { h: 24, alpha: ma, progress: ma });
          for (let k = 0; k < 28; k++) { const x = 106 + k * 8.9 + 3 * Math.sin(k * 2.3); g.line(x, 624, x, 656, { color: PAL.sand, w: 2, alpha: clamp(ma * 28 - k) }); }
          g.text('your markers', 100, 696, { size: 22, color: PAL.sand, alpha: ma });
          // pedigree glyphs
          const rr = 14;
          const glyph = (k, x, y, a) => {
            if (a <= 0) return; const o = (sex, X, Y, extra = {}) => KIN.person(g, X, Y, { sex, r: rr, w: 2, alpha: a, color: PAL.ink2, ...extra });
            const fam = (A, B, K) => KIN.family(g, A, B, K, { r: rr, w: 1.8, alpha: a, color: PAL.ink3 });
            const C = CLS[k] ? CLS[k].col : PAL.coral, hi = { color: C, w: 2.8 };
            if (k === 0) { o('U', x - 30, y + 30, hi); o('U', x + 30, y + 30, hi); }
            if (k === 1) { fam([x - 48, y - 10], [x, y - 10], [[x - 24, y + 60]]); fam([x, y - 10], [x + 48, y - 10], [[x + 24, y + 60]]); o('F', x - 48, y - 10); o('M', x, y - 10); o('F', x + 48, y - 10); o('M', x - 24, y + 60, hi); o('F', x + 24, y + 60, hi); }
            if (k === 2) { fam([x - 28, y - 10], [x + 28, y - 10], [[x - 28, y + 60], [x + 28, y + 60]]); o('M', x - 28, y - 10); o('F', x + 28, y - 10); o('F', x - 28, y + 60, hi); o('M', x + 28, y + 60, hi); }
            if (k === 3) { fam([x - 28, y - 10], [x + 28, y - 10], [[x, y + 60]]); o('M', x - 28, y - 10, hi); o('F', x + 28, y - 10); o('F', x, y + 60, hi); }
            if (k === 4) { // half-sib mating → inbred offspring
              fam([x - 40, y - 40], [x, y - 40], [[x - 20, y + 16]]); fam([x, y - 40], [x + 40, y - 40], [[x + 20, y + 16]]); fam([x - 20, y + 16], [x + 20, y + 16], [[x, y + 72]]);
              o('F', x - 40, y - 40); o('M', x, y - 40); o('F', x + 40, y - 40); o('M', x - 20, y + 16); o('F', x + 20, y + 16); o('F', x, y + 72, { color: PAL.coral, inbred: true, w: 2.8 });
            }
          };
          const GP = [[500, 350, 'U', 0], [640, 350, 'HS', 0], [774, 350, 'FS', 0], [520, 590, 'PO', 0], [700, 600, 'inbred', 16]];
          GP.forEach(([x, y, s, dy], k) => {
            const a = tp(t, k === 4 ? tInb : tPed + k * 0.3, 0.7); glyph(k, x, y, a);
            g.text(s, x, y + 112 + dy, { size: 22, weight: 600, color: k === 4 ? PAL.coral : CLS[k].col, align: 'center', alpha: a });
          });
          // estimator box
          const ea = tp(t, tEst - 0.6, 0.8);
          g.rect(880, 440, 162, 200, { fill: 'rgba(18,36,38,0.85)', stroke: U.rgba(COL, 0.6), w: 1.6, r: 12, alpha: ea });
          g.math('\\hat{r}', 961, 524, { size: 54, color: PAL.ink, align: 'center', alpha: ea });
          g.math('\\hat{k}_{0}', 961, 606, { size: 48, color: PAL.ink, align: 'center', alpha: ea });
          // estimates: dots drop in and stack into a histogram, sorted by true class
          const da = tp(t, tEst, 0.8);
          if (da > 0) {
            const X = (v) => 1110 + (v + 0.2) / 0.9 * 210, by = 700;
            g.line(1106, by + 8, 1324, by + 8, { color: PAL.ink3, w: 1.5, alpha: da });
            [0, 0.25, 0.5].forEach((v) => g.text(String(v), X(v), by + 34, { size: 19, color: PAL.ink3, align: 'center', alpha: da }));
            g.math('\\hat{r}', 1324, by + 40, { size: 26, color: PAL.ink2, align: 'right', alpha: da });
            for (const d of D.stack) {
              const pr = clamp((t - tEst - 0.1 - d.ord * 0.035) / 0.55); if (pr <= 0) continue;
              const x = X(d.b), y = lerp(cy, by - d.h * 10, ease.out(pr)), x0 = lerp(1092, x, ease.out(pr));
              g.dot(x0, y, 4, CLS[d.k].col, 1, 2.2);
            }
          }
          // particles along the arrows once the pipeline is live
          const live = tp(t, tEst + 0.6, 0.8);
          if (live > 0) arr.forEach(([a, b], k) => { for (let q = 0; q < 2; q++) { const ph = (t * 0.6 + q * 0.5 + k * 0.2) % 1; g.dot(lerp(a, b - 10, ph), cy, 4, COL, live * Math.sin(Math.PI * ph), 2.4); } });
        });

        // ---------------- beats 1–4: distributions of r̂ by class
        const tUn = cue(S, 1, 'unrelated pairs'), tHS = cue(S, 1, 'half siblings'), tFD = cue(S, 1, 'first-degree'), tK0 = cue(S, 1, 'k0 then');
        const tFew = S.b(2), tMore = cue(S, 2, 'or more inbreeding'), tOv = cue(S, 2, 'The overlap'), tHU = cue(S, 2, 'half siblings that'), tFH = cue(S, 2, 'full siblings that');
        const tTools = S.b(3), tRel = cue(S, 3, 'The related'), tEC = cue(S, 3, 'EstConf'), tCK = cue(S, 3, 'CKMRsim'), tV = S.b(4), tPl = cue(S, 4, 'at plausible');
        const v1 = S.p(1, 0.9, 0.2);
        if (v1 <= 0) return;
        // marker-count slider: 2000 → 100 at the start of beat 2
        const sl = tio(t, tFew + 0.2, 2.4);
        const ci = sl * (CK.length - 1), c0 = Math.min(CK.length - 2, Math.floor(ci)), cf = ci - c0;
        const Lnow = Math.exp(lerp(Math.log(CK[c0]), Math.log(CK[c0 + 1]), cf));
        const dAt = (arrs) => { const A0 = arrs[c0], A1 = arrs[c0 + 1]; const out = new Array(A0.length); for (let j = 0; j < A0.length; j++) out[j] = lerp(A0[j], A1[j], cf); return out; };
        const conf = D.conf[c0].map((row, i) => row.map((v, j) => lerp(v, D.conf[c0 + 1][i][j], cf)));
        g.withAlpha(v1, () => {
          // slider
          label(g, 'markers', 170, 306, 1, PAL.ink3);
          const sx0 = 330, sx1 = 900, sy = 300; const LX = (L) => lerp(sx0, sx1, (Math.log(L) - Math.log(100)) / (Math.log(2000) - Math.log(100)));
          g.line(sx0, sy, sx1, sy, { color: PAL.rule, w: 4 }); g.line(LX(Lnow), sy, sx1, sy, { color: COL, w: 4, alpha: 0.8 });
          [100, 250, 500, 1000, 2000].forEach((L) => g.line(LX(L), sy - 7, LX(L), sy + 7, { color: PAL.ink3, w: 1.5 }));
          g.text('100', sx0, sy + 32, { size: 19, color: PAL.ink3, align: 'center' }); g.text('2000', sx1, sy + 32, { size: 19, color: PAL.ink3, align: 'center' });
          g.dot(LX(Lnow), sy, 10, COL, 1, 2.6);
          g.text(`${Math.round(Lnow)} SNPs`, LX(Lnow), sy - 22, { size: 22, role: 'mono', color: PAL.ink, align: 'center' });
          // main plot
          const A = g.axes({ x: 170, y: 400, w: 740, h: 410, xmin: XG0, xmax: XG1, ymin: 0, ymax: 1, ylab: 'pairs', labSize: 24, progress: S.p(1, 1.0, 0.2),
            xticks: [{ v: 0, l: '0' }, { v: 0.25, l: '0.25' }, { v: 0.5, l: '0.5' }, { v: 0.75, l: '0.75' }, { v: 1, l: '1' }] });
          g.math('\\hat{r}', A.x + A.w + 34, A.y + A.h + 12, { size: 34, color: PAL.ink, alpha: S.p(1, 1.0, 0.6) });
          const xs = (j) => XG0 + (XG1 - XG0) * j / (NXG - 1);
          const reveal = [tp(t, tUn - 0.1, 1.0), tp(t, tHS - 0.1, 1.0), tp(t, tFD - 0.1, 1.0), tp(t, tFD + 0.2, 1.0)];
          const dens = CLS.map((c) => dAt(D.dens[c.id]));
          let ymax = 0; for (const d of dens) for (const v of d) ymax = Math.max(ymax, v); ymax *= 1.2;
          const Y = (v) => A.y + A.h - (v / ymax) * A.h;
          // misclassification shading: HS below 1/8 (read as U), FS below 3/8 (read as HS)
          const ov = tp(t, tOv, 0.9);
          if (ov > 0) {
            for (const [ci2, cut, tt] of [[1, 0.125, tHU], [2, 0.375, tFH]]) {
              const d = dens[ci2]; const jc = Math.round((cut - XG0) / (XG1 - XG0) * (NXG - 1)); const pts = [[A.X(XG0), Y(0)]];
              for (let j = 0; j <= jc; j++) pts.push([A.X(xs(j)), Y(d[j])]); pts.push([A.X(xs(jc)), Y(0)]);
              g.poly(pts, { fill: U.rgba(PAL.coral, 0.55), color: null, w: 0, alpha: tp(t, tt - 0.3, 0.8) });
            }
            for (const cut of [0.125, 0.375]) g.line(A.X(cut), A.y + 10, A.X(cut), A.y + A.h, { color: PAL.ink3, w: 1.6, dash: [5, 7], alpha: ov * 0.9 });
          }
          CLS.forEach((c, k) => {
            const rv = reveal[k]; if (rv <= 0) return; const pts = dens[k].map((v, j) => [A.X(xs(j)), Y(v * rv)]);
            g.poly([[A.X(XG0), Y(0)], ...pts, [A.X(XG1), Y(0)]], { fill: U.rgba(c.col, 0.12), color: null, w: 0 });
            g.poly(pts, { color: c.col, w: 3 });
          });
          // inbred half sibs ("or more inbreeding"): the HS hump slides right, toward the full sibs
          const inb = tio(t, tMore, 1.8), ia = tp(t, tMore - 0.2, 0.6);
          if (ia > 0) {
            const dI = dAt(D.dens.HSi); const sh = (1 - inb) * (7 / 16 - 1 / 4);
            const pts = []; dI.forEach((v, j) => { const x = xs(j) - sh; if (x >= XG0) pts.push([A.X(x), Y(v)]); });
            g.poly(pts, { color: PAL.heather, w: 3, dash: [9, 7], alpha: ia });
            const lx = A.X(0.84), ly = A.y + 120;
            g.text('inbred HS', lx, ly, { size: 23, weight: 600, color: PAL.heather, alpha: tp(t, tMore + 1.2, 0.8) });
            g.line(lx - 8, ly + 8, A.X(0.66), Y(dI[Math.round((0.66 + sh - XG0) / (XG1 - XG0) * (NXG - 1))]) - 4, { color: PAL.heather, w: 1.4, alpha: 0.7 * tp(t, tMore + 1.2, 0.8) });
          }
          // peak labels
          const peak = (d) => { let m = 0, j0 = 0; d.forEach((v, j) => { if (v > m) { m = v; j0 = j; } }); return [A.X(xs(j0)), Y(m)]; };
          const pU = peak(dens[0]), pH = peak(dens[1]), pF = peak(dens[2]), pP = peak(dens[3]);
          g.text('U', pU[0], pU[1] - 14, { size: 26, weight: 600, color: PAL.ink2, align: 'center', alpha: reveal[0] });
          g.text('HS', pH[0], pH[1] - 14, { size: 26, weight: 600, color: PAL.heather, align: 'center', alpha: reveal[1] });
          const top1 = Math.min(pF[1], pP[1]) - 14;
          g.text('PO', pP[0] - 8, top1, { size: 26, weight: 600, color: PAL.coral, align: 'right', alpha: reveal[3] });
          g.text('·', pP[0], top1, { size: 26, weight: 600, color: PAL.ink3, align: 'center', alpha: reveal[3] });
          g.text('FS', pP[0] + 8, top1, { size: 26, weight: 600, color: PAL.lagoon, alpha: reveal[2] });
          g.text('first degree', A.X(0.5), A.y + A.h + 70, { size: 21, color: PAL.ink3, align: 'center', alpha: reveal[2] * (1 - tp(t, tFew, 0.6)) });
          g.text(`${D.N} simulated pairs per class`, 910, 372, { size: 19, color: PAL.ink3, align: 'right', alpha: S.p(1, 0.8, 1.5) });

          // ---- right column: k0 inset (beats 1–2)
          const vk = tp(t, tK0 - 0.2, 0.8) * (1 - tp(t, tTools, 0.6));
          if (vk > 0) g.withAlpha(vk, () => {
            const w0 = g.math('\\hat{k}_{0}', 1000, 376, { size: 34, color: PAL.ink });
            label(g, 'splits first degree', 1010 + w0, 370, 1, PAL.ink3);
            const B = g.axes({ x: 1012, y: 420, w: 290, h: 180, xmin: 0, xmax: KG1, ymin: 0, ymax: 1, xticks: [{ v: 0, l: '0' }, { v: 0.25, l: '0.25' }, { v: 0.5, l: '0.5' }, { v: 1, l: '1' }] });
            const dk = dAt(D.k0FS); const km = Math.max(...dk) * 1.3;
            const pk = dk.map((v, j) => [B.X(KG1 * j / (NKG - 1)), B.y + B.h - v / km * B.h]);
            g.poly([[B.X(0), B.y + B.h], ...pk, [B.X(KG1), B.y + B.h]], { fill: U.rgba(PAL.lagoon, 0.16), color: null, w: 0 });
            g.poly(pk, { color: PAL.lagoon, w: 3 });
            g.rect(B.X(0) - 3, B.y + 8, 6, B.h - 8, { fill: PAL.coral, r: 2 }); g.glow(B.X(0), B.y + 12, 18, PAL.coral, 0.5);
            g.text('PO', B.X(0) + 14, B.y + 28, { size: 23, weight: 600, color: PAL.coral });
            const pm = pk.reduce((a, q) => (q[1] < a[1] ? q : a), pk[0]);
            g.text('FS', B.X(0.5), B.y + 92, { size: 23, weight: 600, color: PAL.lagoon });
          });
          // ---- misclassification readouts (beat 2)
          const vr = tp(t, tHU - 0.2, 0.7) * (1 - tp(t, tTools, 0.6));
          if (vr > 0) g.withAlpha(vr, () => {
            label(g, 'misclassified', 1000, 690, 1, PAL.coral);
            const rows = [['HS read as U', conf[1][0], tHU], ['FS read as HS', conf[2][1], tFH]];
            rows.forEach(([s, v, tt], k) => { const a = tp(t, tt - 0.2, 0.6); g.text(s, 1000, 744 + k * 62, { size: 24, color: PAL.ink2, alpha: a }); g.text(`${Math.round(v * 100)}%`, 1310, 748 + k * 62, { size: 38, role: 'mono', color: PAL.coral, align: 'right', alpha: a }); });
          });
          // ---- beat 3: tool cards, then a confusion matrix (assigned class by true class)
          const vc = 1 - tp(t, tV, 0.6);
          card(g, 990, 330, 330, 'related', 'familysim(): known families', { color: COL, h: 92, size: 25, alpha: tp(t, tRel - 0.2, 0.7) * vc });
          card(g, 990, 432, 330, 'sequoia', 'EstConf(): assignment errors', { color: PAL.ochre, h: 92, size: 25, alpha: tp(t, tEC - 0.3, 0.7) * vc });
          card(g, 990, 534, 330, 'CKMRsim', 'FPR & FNR per kin category', { color: PAL.lagoon, h: 92, size: 25, alpha: tp(t, tCK - 0.3, 0.7) * vc });
          const vm = tp(t, tCK + 0.4, 0.8);
          if (vm > 0) g.withAlpha(vm, () => {
            const mx = 1090, my = 684, cs = 56, chs = 38; const nm = ['U', 'HS', 'FS', 'PO'];
            label(g, `true ↓ · assigned → · %`, 1000, 660, 1, PAL.ink3);
            nm.forEach((s, j) => g.text(s, mx + j * cs + cs / 2, my + 6, { size: 21, weight: 600, color: CLS[j].col, align: 'center' }));
            const rowsM = [0, 1, 2, 3, 4]; const ra = [1, 1, 1, 1, tp(t, tPl, 0.8)];
            rowsM.forEach((i) => {
              if (ra[i] <= 0) return;
              const y = my + 14 + i * chs, rl = i === 4 ? 'HSᵢ' : nm[i], rc = i === 4 ? PAL.heather : CLS[i].col;
              g.withAlpha(ra[i], () => {
                g.text(rl, mx - 14, y + chs / 2 + 8, { size: 21, weight: 600, color: rc, align: 'right' });
                nm.forEach((_, j) => {
                  const v = conf[i][j]; const diag = i === j || (i === 4 && j === 1); const col = diag ? PAL.moss : PAL.coral;
                  g.rect(mx + j * cs + 2, y + 2, cs - 4, chs - 4, { fill: U.rgba(col, diag ? 0.1 + 0.35 * v : Math.min(0.75, 0.05 + v * 2.2)), r: 5 });
                  g.text(String(Math.round(v * 100)), mx + j * cs + cs / 2, y + chs / 2 + 7, { size: 20, role: 'mono', color: v > 0.02 || diag ? PAL.ink : PAL.ink3, align: 'center' });
                });
              });
            });
            if (ra[4] > 0) g.rect(mx + 2 * cs, my + 14 + 4 * chs, cs, chs, { stroke: PAL.coral, w: 2.4, r: 6, alpha: ra[4] });
          });
          // ---- beat 4: verdict stamp
          const vs = tp(t, tV + 0.8, 0.9);
          if (vs > 0) g.withAlpha(vs, () => g.with(() => {
            ctx.translate(1155, 480); ctx.rotate(-0.035); const sc = lerp(1.12, 1, ease.out(clamp((t - tV - 0.8) / 0.5))); ctx.scale(sc, sc);
            g.rect(-160, -126, 320, 252, { fill: 'rgba(30,20,18,0.9)', stroke: PAL.coral, w: 2.5, r: 12 });
            g.rect(-151, -117, 302, 234, { stroke: U.rgba(PAL.coral, 0.4), w: 1.2, r: 8 });
            g.text('This panel cannot', 0, -58, { size: 34, role: 'display', color: PAL.ink, align: 'center' });
            g.text('separate FS from HS', 0, -16, { size: 34, role: 'display', color: PAL.ink, align: 'center' });
            g.text('at plausible inbreeding', 0, 22, { size: 22, color: PAL.ink2, align: 'center', alpha: tp(t, tPl, 0.7) });
            g.text('don’t rely on it', 0, 86, { size: 32, role: 'display', italic: true, color: PAL.coral, align: 'center', alpha: tp(t, cue(S, 4, 'do not rely'), 0.7) });
          }));
        });
      },
    },
    /* ============================================================== meth-synthesis */
    {
      id: 'meth-synthesis', title: 'The egg was never the problem',
      beats: [
        { t: 'Return to the puzzle. Relatedness seemed to need inbreeding, and inbreeding seemed to need relatedness. But both are identity by descent, between two individuals or within one, and they are estimated together, in one matrix.' },
        { t: 'The genuine dependency runs to the reference: the allele frequencies and population structure that define what unrelated means. Model the structure, and the loop becomes an iteration that converges.' },
        { t: 'Then follow the recipe. Do quality control with inbreeding in mind. Deal with structure first. Ask whether inbreeding varies. Choose methods that allow it. Use runs of homozygosity when your data can see them. And validate everything by simulating your own system.' },
        { t: 'Relatedness and inbreeding are two views of one process: shared ancestry, passed down chromosome by chromosome. Measure it against a reference you understand, and the chicken and the egg turn out to be the same bird.', pause: 2.0 },
      ],
      terms: [],
      init() {
        // Kinship matrix of the closing pedigree (A; mates A', A''; B = A×A', C = A×A'', D = B×C), by the
        // standard recursion φ(i,j) = ½[φ(i, f_j) + φ(i, m_j)] for j younger than i, φ(i,i) = (1 + F_i)/2.
        const par = [null, null, null, [0, 1], [0, 2], [3, 4]]; const n = par.length; const phi = Array.from({ length: n }, () => new Array(n).fill(0));
        for (let i = 0; i < n; i++) {
          const F = par[i] ? phi[par[i][0]][par[i][1]] : 0; phi[i][i] = (1 + F) / 2;
          for (let j = 0; j < i; j++) { const v = par[i] ? 0.5 * (phi[j][par[i][0]] + phi[j][par[i][1]]) : 0; phi[i][j] = phi[j][i] = v; }
        }
        // converging spiral (the loop, iterated)
        const spiral = []; for (let k = 0; k <= 320; k++) { const u = k / 320, a = -Math.PI / 2 + u * Math.PI * 2 * 3.25, rr = 118 * Math.exp(-2.6 * u); spiral.push([rr * 1.5 * Math.cos(a), rr * Math.sin(a)]); }
        // faint luminous dust for the closing image
        const r = rng(77); const dust = []; for (let k = 0; k < 70; k++) dust.push({ x: 120 + r() * 1680, y: 230 + r() * 640, s: 1.2 + r() * 1.8, ph: r() * 6.28 });
        return { phi, spiral, dust };
      },
      draw(g, t, S, D) {
        const tRel = cue(S, 0, 'Relatedness seemed'), tInb2 = cue(S, 0, 'and inbreeding seemed'), tBoth = cue(S, 0, 'But both'), tWithin = cue(S, 0, 'between two'), tMat = cue(S, 0, 'estimated together');
        const tRef = cue(S, 1, 'runs to the reference'), tAF = cue(S, 1, 'the allele frequencies'), tPS = cue(S, 1, 'population structure'), tIt = cue(S, 1, 'the loop becomes'), tConv = cue(S, 1, 'converges');
        const tRec = S.b(2), tEnd = S.b(3), tPass = cue(S, 3, 'passed down'), tMeas = cue(S, 3, 'Measure it'), tBird = cue(S, 3, 'the same bird');
        const out01 = 1 - tp(t, tRec - 0.3, 0.8);
        // ---------------- beat 0: the loop, collapsing into one IBD matrix
        if (out01 > 0) g.withAlpha(out01, () => {
          const merge = tio(t, tBoth, 1.6), la = S.p(0, 1.0, 0.2), slide = tio(t, S.b(1) - 0.2, 1.4);
          const cx = 960, cy = 560, sepX = lerp(330, 0, merge), aa = la * (1 - merge);
          if (aa > 0) {
            const quad = (x1, y1, x2, y2, h) => { const pts = []; for (let k = 0; k <= 40; k++) { const u = k / 40; pts.push([lerp(x1, x2, u), lerp(y1, y2, u) + h * 4 * u * (1 - u)]); } return pts; };
            const arcs = [[quad(cx - 250, cy - 44, cx + 250, cy - 44, -150), tRel], [quad(cx + 250, cy + 40, cx - 250, cy + 40, 150), tInb2]];
            arcs.forEach(([pts, t0], k) => {
              const pr = tp(t, t0 - 0.3, 1.0); g.poly(pts, { color: PAL.sand, w: 2.6, alpha: 0.8 * aa, progress: pr });
              if (pr > 0.95) { const e = pts[40], e2 = pts[37]; g.arrow(e2[0], e2[1], e[0], e[1], { color: PAL.sand, w: 2.6, head: 16, alpha: 0.8 * aa }); }
              g.text('needs', cx, k ? cy + 214 : cy - 210, { size: 28, role: 'display', italic: true, color: PAL.ink2, align: 'center', alpha: aa * tp(t, t0, 0.7) });
              if (t > tInb2 + 0.8) { const f = ((t - tInb2) * 0.45 + k * 0.5) % 1; const q = along(pts, f); g.dot(q[0], q[1], 5.5, PAL.ochre, aa, 3); }
            });
            g.text('?', cx, cy + 22, { size: 72, role: 'display', italic: true, color: PAL.sand, align: 'center', alpha: aa * tp(t, tInb2 + 1, 0.8) * (0.65 + 0.35 * Math.sin(t * 2)) });
          }
          g.text('relatedness', cx - sepX, cy + 18, { size: 56, role: 'display', color: PAL.lagoon, align: 'center', alpha: la * (1 - merge) });
          g.text('inbreeding', cx + sepX, cy + 18, { size: 56, role: 'display', color: PAL.coral, align: 'center', alpha: la * (1 - merge) });
          // merged: identity by descent, then the kinship matrix
          if (merge > 0) {
            const mx = lerp(cx, 600, slide), mat = tp(t, tMat - 0.8, 1.2);
            const n = 6, cs = 50, x0 = mx - n * cs / 2, y0 = 400;
            const titleY = lerp(cy + 12, y0 - 52, mat);
            g.glow(mx, titleY - 16, 190, PAL.heather, 0.3 * merge * (1 - 0.7 * mat));
            g.text('identity by descent', mx, titleY, { size: lerp(66, 44, mat), role: 'display', italic: true, color: PAL.ink, align: 'center', alpha: merge });
            g.text('between two  ·  within one', mx, titleY + 54, { size: 24, color: PAL.ink2, align: 'center', alpha: merge * tp(t, tWithin, 0.8) * (1 - mat) });
            if (mat > 0) {
              // during the iteration the matrix shimmers, then settles as it converges
              const shim = t > tIt - 0.3 ? Math.exp(-Math.max(0, t - tIt) * 0.8) * clamp((t - tIt + 0.3) * 2) : 0;
              for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
                const v = D.phi[i][j], diag = i === j, col = diag ? PAL.coral : PAL.lagoon;
                const wob = shim * 0.16 * Math.sin(t * 7 + i * 1.3 + j * 2.1);
                const a = clamp((diag ? 0.62 + (v - 0.5) * 4 : 0.05 + v * 1.7) + wob, 0.04, 0.95);
                const pc = clamp(mat * 2.4 - (i + j) * 0.1);
                g.rect(x0 + j * cs + 2, y0 + i * cs + 2, cs - 4, cs - 4, { fill: U.rgba(col, a), stroke: diag ? U.rgba(PAL.coral, 0.7) : null, w: 1.2, r: 5, alpha: pc });
              }
              g.rect(x0 - 7, y0 - 7, n * cs + 14, n * cs + 14, { stroke: PAL.rule, w: 1.5, r: 10, alpha: mat });
              const la2 = tp(t, tMat - 0.2, 0.8);
              g.math('φ_{ij}', x0 + n * cs + 26, y0 + 60, { size: 42, color: PAL.lagoon, alpha: la2 });
              g.text('between two', x0 + n * cs + 26, y0 + 96, { size: 21, color: PAL.ink2, alpha: la2 });
              g.math('\\frac{1 + F_{i}}{2}', x0 - 26, y0 + n * cs - 70, { size: 42, color: PAL.coral, align: 'right', alpha: la2 });
              g.text('within one', x0 - 26, y0 + n * cs - 10, { size: 21, color: PAL.ink2, align: 'right', alpha: la2 });
              g.text('one matrix', mx, y0 + n * cs + 62, { size: 32, role: 'display', italic: true, color: PAL.ink, align: 'center', alpha: tp(t, tMat, 0.8) });
            }
          }
          // ---------------- beat 1: the reference, then the loop as a converging iteration
          const ra = tp(t, tRef - 0.2, 0.9);
          if (ra > 0) {
            const rx = 1400, ry = 470;
            g.text('the reference', rx, 330, { size: 50, role: 'display', italic: true, color: PAL.ochre, align: 'center', alpha: ra });
            const pa = tp(t, tAF - 0.2, 0.9);
            [0.62, 0.18, 0.44, 0.83, 0.3, 0.56, 0.12, 0.71].forEach((v, k) => { const h = 100 * v * clamp(pa * 1.5 - k * 0.06); g.rect(rx - 210 + k * 24, ry + 30 - h, 17, h, { fill: PAL.ochre, alpha: 0.85, r: 2 }); });
            g.text('allele frequencies', rx - 118, ry + 66, { size: 22, color: PAL.ochre, align: 'center', alpha: pa });
            const pb = tp(t, tPS - 0.2, 0.9);
            for (let k = 0; k < 16; k++) { const ang = k * 2.4, rr = 5 + (k % 5) * 6.5; g.dot(rx + 92 + rr * Math.cos(ang), ry - 26 + rr * Math.sin(ang), 4, PAL.sand, pb, 2); g.dot(rx + 168 + rr * Math.cos(ang + 1), ry + 4 + rr * Math.sin(ang + 1), 4, PAL.heather, pb, 2); }
            g.text('structure', rx + 130, ry + 66, { size: 22, color: PAL.sand, align: 'center', alpha: pb });
            // the genuine dependency: reference → matrix
            const ar = tp(t, tRef + 0.5, 1.1);
            g.arrow(rx - 236, 420, 830, 420, { color: PAL.ochre, w: 3.2, head: 17, alpha: ar, progress: ar });
            g.text('defines “unrelated”', (rx - 236 + 830) / 2, 404, { size: 22, color: PAL.ochre, align: 'center', alpha: tp(t, cue(S, 1, 'define what'), 0.8) });
            // the loop, iterated: a spiral that tightens onto a fixed point
            const sp = tp(t, tIt - 0.2, 0.6), pr = ease.inOut(clamp((t - tIt) / 2.6));
            if (sp > 0) {
              const ox = 1115, oy = 690; const pts = D.spiral.map(([x, y]) => [ox + x, oy + y]);
              g.poly(pts, { color: COL, w: 2.6, alpha: 0.85 * sp, progress: pr });
              if (pr > 0 && pr < 1) { const q = along(pts, pr); g.dot(q[0], q[1], 6, PAL.ink, sp, 2.8); }
              g.text('kinship', ox - 210, oy + 8, { size: 23, color: PAL.lagoon, align: 'right', alpha: sp });
              g.text('ancestry', ox + 210, oy + 8, { size: 23, color: PAL.ochre, alpha: sp });
              const cv = tp(t, tConv, 0.8);
              g.dot(ox, oy, 7, COL, cv, 3.2); g.glow(ox, oy, 60, COL, 0.35 * cv);
              g.text('converges', ox, oy + 160, { size: 30, role: 'display', italic: true, color: COL, align: 'center', alpha: cv });
            }
          }
        });

        // ---------------- beat 2: the recipe
        const vR = tp(t, tRec + 0.2, 0.9) * (1 - tp(t, tEnd - 0.2, 0.9));
        if (vR > 0) g.withAlpha(vR, () => {
          const items = [
            ['Quality control, with inbreeding in mind', 'Do quality'], ['Structure first', 'Deal with structure'], ['Does inbreeding vary? Check g₂', 'Ask whether'],
            ['Methods that allow inbreeding', 'Choose methods'], ['Runs of homozygosity, where data can see them', 'Use runs'], ['Validate by simulating your own system', 'And validate'],
          ];
          label(g, 'The recipe', 520, 270, 1, COL);
          items.forEach(([txt, ph], k) => {
            const tk = cue(S, 2, ph), y = 352 + k * 92, a = tp(t, tk - 0.2, 0.7), tick = tp(t, tk + 0.9, 0.5);
            g.text(String(k + 1), 560, y + 14, { size: 54, role: 'display', italic: true, color: COL, align: 'right', alpha: a });
            g.text(txt, 600, y + 12, { size: 42, role: 'display', color: PAL.ink, alpha: a });
            g.rect(1440, y - 20, 38, 38, { stroke: PAL.ink3, w: 1.8, r: 7, alpha: a });
            if (tick > 0) { g.poly([[1449, y - 1], [1458, y + 9], [1475, y - 15]], { color: COL, w: 4, progress: tick }); g.glow(1459, y - 1, 32, COL, 0.3 * tick); }
            g.line(600, y + 38, 600 + 880 * a, y + 38, { color: PAL.rule, w: 1, alpha: 0.5 });
          });
        });

        // ---------------- beat 3: one process, passed down chromosome by chromosome
        const vE = tp(t, tEnd + 0.2, 1.4);
        if (vE <= 0) return;
        const tCh = cue(S, 3, 'the chicken'); const bird = tio(t, tCh - 0.2, 2.2);
        // faint luminous dust, drifting
        for (const d of D.dust) g.dot(d.x + 6 * Math.sin(t * 0.2 + d.ph), d.y - 4 * Math.cos(t * 0.17 + d.ph), d.s, PAL.heather, vE * (0.12 + 0.1 * Math.sin(t * 0.8 + d.ph)) * (0.6 + 0.6 * bird), 3);
        const A = [960, 300], B = [700, 470], C = [1220, 470], Dd = [960, 640], r = 24;
        const scaffold = vE * (1 - 0.7 * bird);
        const pB = [[A[0], A[1] + r], [A[0], 385], [B[0], 385], [B[0], B[1] - r]];
        const pC = [[A[0], A[1] + r], [A[0], 385], [C[0], 385], [C[0], C[1] - r]];
        const dB = [[B[0] + r, B[1]], [960, B[1]], [960, Dd[1] - r]];
        const dC = [[C[0] - r, C[1]], [960, C[1]], [960, Dd[1] - r]];
        const sk = tp(t, tEnd + 0.3, 1.6);
        g.withAlpha(scaffold, () => {
          for (const p of [pB, pC]) g.poly(p, { color: PAL.ink3, w: 2, progress: sk });
          g.line(B[0] + r, B[1], C[0] - r, C[1], { color: PAL.ink3, w: 2, progress: sk });
          g.line(960, B[1], 960, Dd[1] - r, { color: PAL.ink3, w: 2, progress: clamp(sk * 2 - 1) });
        });
        // the shared segment flows down both lines of descent
        const fl = ease.inOut(clamp((t - tPass + 0.6) / 3.2));
        const full = [[...pB, ...dB], [...pC, ...dC]];
        const glowA = vE * (1 - 0.45 * bird);
        for (const p of full) { g.poly(p, { color: PAL.heather, w: 11, alpha: 0.14 * glowA, progress: fl }); g.poly(p, { color: PAL.heather, w: 3.4, alpha: 0.95 * glowA, progress: fl }); }
        if (fl > 0 && fl < 1) for (const p of full) { const q = along(p, fl); g.dot(q[0], q[1], 8, PAL.heather, vE, 3); }
        // individuals and their homologous chromosomes
        const seg = { a: 0.28, b: 0.7, color: PAL.heather };
        const homol = (x, y, w, s0, s1, a, h = 12) => { KIN.chrom(g, x, y, w, s0 ? [{ ...seg, alpha: 0.95 * s0 }] : [], { h, alpha: a }); KIN.chrom(g, x, y + h + 7, w, s1 ? [{ ...seg, alpha: 0.95 * s1 }] : [], { h, alpha: a }); };
        const atB = clamp((fl - 0.42) / 0.08), atD = clamp((fl - 0.97) / 0.03);
        g.withAlpha(scaffold, () => {
          KIN.person(g, A[0], A[1], { sex: 'M', r, color: PAL.heather, alpha: tp(t, tEnd + 0.2, 0.8), glow: PAL.heather });
          homol(A[0] + 50, A[1] - 9, 150, 1, 0, tp(t, tEnd + 0.6, 0.8));
          KIN.person(g, B[0], B[1], { sex: 'M', r, color: PAL.ink, alpha: tp(t, tEnd + 0.6, 0.8) });
          KIN.person(g, C[0], C[1], { sex: 'F', r, color: PAL.ink, alpha: tp(t, tEnd + 0.8, 0.8) });
          homol(B[0] - 200, B[1] - 9, 150, atB, 0, tp(t, tEnd + 0.8, 0.8));
          homol(C[0] + 50, C[1] - 9, 150, 0, atB, tp(t, tEnd + 1.0, 0.8));
        });
        KIN.person(g, Dd[0], Dd[1], { sex: 'F', r, color: PAL.ink, alpha: tp(t, tEnd + 1.0, 0.8) * (1 - bird) * vE, inbred: atD >= 1 });
        homol(Dd[0] - 120, Dd[1] + 46, 240, atD, atD, vE * tp(t, tEnd + 1.2, 0.8), 14);
        g.glow(Dd[0], Dd[1] + 57, 90, PAL.heather, 0.3 * atD * vE);
        // two views of one process
        const lv = tp(t, tPass + 2.6, 1.0) * vE, lgo = bird;
        const mvL = [lerp(960, Dd[0], lgo * 0.6), lerp(428, Dd[1], lgo * 0.6)], mvR = [lerp(Dd[0] + 210, Dd[0], lgo * 0.6), lerp(Dd[1] + 56, Dd[1], lgo * 0.6)];
        g.text('relatedness', mvL[0], mvL[1], { size: 34, role: 'display', italic: true, color: PAL.lagoon, align: 'center', alpha: lv * (1 - lgo) });
        g.text('between two', mvL[0], mvL[1] + 28, { size: 21, color: PAL.ink2, align: 'center', alpha: lv * (1 - lgo) });
        g.text('inbreeding', mvR[0], mvR[1], { size: 36, role: 'display', italic: true, color: PAL.coral, alpha: lv * (1 - lgo) });
        g.text('within one', mvR[0], mvR[1] + 30, { size: 21, color: PAL.ink2, alpha: lv * (1 - lgo) });
        // a reference you understand: a quiet horizon
        const rf = tio(t, tMeas, 1.6) * vE;
        g.line(lerp(960, 380, rf), 790, lerp(960, 1540, rf), 790, { color: PAL.ochre, w: 1.8, alpha: 0.6 * rf });
        g.text('reference', 1540, 820, { size: 21, color: PAL.ochre, align: 'right', alpha: rf * (1 - 0.6 * bird) });
        // the same bird
        if (bird > 0) {
          const br = 1 + 0.04 * Math.sin((t - tBird) * 1.3);
          g.glow(Dd[0], Dd[1] - 4, 150 * br, PAL.heather, 0.42 * bird);
          g.icon('songbird', Dd[0] + 4, Dd[1] - 6, 112, PAL.ink, { alpha: bird, bg: PAL.bg });
          g.text('the same bird', 960, 884, { size: 66, role: 'display', italic: true, color: PAL.ink, align: 'center', alpha: tp(t, tBird - 0.1, 1.6) });
        }
      },
    },
  ],
});
})();
