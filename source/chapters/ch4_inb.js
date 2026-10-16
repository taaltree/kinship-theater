/* Chapter IV — Measuring inbreeding. */
(function () {
const { PAL, U, Theater } = window; const { clamp, lerp, ease, rng, gauss } = U;
const COL = PAL.coral;

/* ------------------------------------------------------------------ helpers */
const label = KIN.label, vis = KIN.vis;
// Sentence-anchored timing: local time at fraction f of sentence j in beat k (robust to re-timed audio).
const sent = (S, k, j, f = 0) => { const B = S.scene.timing.beats[k]; if (!B) return S.dur; const q = B.sents[Math.min(j, B.sents.length - 1)]; return lerp(q.start, q.end, f); };
const P = (S, k, j, f = 0, d = 0.8) => S.tp(sent(S, k, j, f), d);
// in at local time t0, out at t1
const twin = (t, t0, t1, d = 0.6) => ease.out((t - t0) / d) * (t1 === undefined ? 1 : 1 - ease.inOut((t - t1) / 0.5));
const xTitle = (g, A, s, a = 1) => g.text(s, A.x + A.w, A.y + A.h + 60, { size: 22, color: PAL.ink2, align: 'right', alpha: a });
const yTitle = (g, A, s, a = 1) => g.text(s, A.x - 14, A.y - 26, { size: 22, color: PAL.ink2, align: 'left', alpha: a });
const illus = (g, x, y, a = 1, align = 'right') => g.text('illustrative', x, y, { size: 17, italic: true, color: PAL.ink3, align, alpha: a });
const HO = PAL.sand; // observed heterozygosity (solid); expected = ghost outline
function hslHex(h, s, l) {
  s /= 100; l /= 100; const a = s * Math.min(l, 1 - l);
  const f = (n) => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return '#' + [f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
}
function erfc(x) { const t = 1 / (1 + 0.5 * Math.abs(x)); const y = t * Math.exp(-x * x - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))); return x >= 0 ? y : 2 - y; }
function poisson(r, lam) { const L = Math.exp(-lam); let k = 0, p = 1; do { k++; p *= r(); } while (p > L); return k - 1; }
function shuffle(r, a) { for (let k = a.length - 1; k > 0; k--) { const j = (r() * (k + 1)) | 0; [a[k], a[j]] = [a[j], a[k]]; } return a; }
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
function corr(x, y) { const mx = mean(x), my = mean(y); let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; } return { r: sxy / Math.sqrt(sxx * syy), b: sxy / sxx, mx, my }; }

/* ------------------------------------------------- chromosome inheritance model (scenes 4–5)
   Genome = 12 autosomes (cM lengths below), binned at 0.5 cM. A haplotype stores, per bin, the label of the founder
   chromosome it descends from. Meiosis: Poisson(length/100) crossovers per chromosome (Haldane), uniform positions.
   Runs of homozygosity = maximal stretches where an individual's two haplotypes carry the same founder label (IBD). */
const BIN = 0.5, CHR = [148, 132, 120, 110, 100, 92, 84, 76, 68, 60, 54, 46], NB = CHR.map((c) => Math.round(c / BIN));
const GENOME = CHR.reduce((a, b) => a + b, 0);
const founder = (a, b) => [CHR.map((_, c) => new Int16Array(NB[c]).fill(a)), CHR.map((_, c) => new Int16Array(NB[c]).fill(b))];
function meiosis(r, ind) {
  const out = [];
  for (let c = 0; c < CHR.length; c++) {
    const n = NB[c], k = poisson(r, CHR[c] / 100), xs = []; for (let j = 0; j < k; j++) xs.push((r() * n) | 0); xs.sort((a, b) => a - b);
    let cur = r() < 0.5 ? 0 : 1, xi = 0; const h = new Int16Array(n);
    for (let b = 0; b < n; b++) { while (xi < xs.length && xs[xi] <= b) { cur ^= 1; xi++; } h[b] = ind[cur][c][b]; }
    out.push(h);
  }
  return out;
}
// Segments of one haplotype on chromosome c, in 0–1 units: [{a, b, lab}]
function hapSegs(h) { const out = []; let s = 0; for (let k = 1; k <= h.length; k++) if (k === h.length || h[k] !== h[s]) { out.push({ a: s / h.length, b: k / h.length, lab: h[s] }); s = k; } return out; }
// IBD runs of an individual: [{c, a, b (0–1 units), len (cM), lab}], plus F = genome fraction in runs >= minCM
function runsOf(ind, minCM = 0) {
  const out = []; let tot = 0;
  for (let c = 0; c < CHR.length; c++) {
    const A = ind[0][c], B = ind[1][c], n = NB[c]; let s = -1;
    for (let k = 0; k <= n; k++) {
      const same = k < n && A[k] === B[k];
      if (s >= 0 && (!same || A[k] !== A[s])) { const len = (k - s) * BIN; if (len >= minCM) { out.push({ c, a: s / n, b: k / n, len, lab: A[s] }); tot += len; } s = -1; }
      if (same && s < 0) s = k;
    }
  }
  return { runs: out, F: tot / GENOME };
}
// Half-sib mating: common ancestor CA (labels 0,1) mates with M1 (2,3) and M2 (4,5); half sibs HS1 × HS2 → offspring.
function halfSib(r) {
  const CA = founder(0, 1), M1 = founder(2, 3), M2 = founder(4, 5);
  const HS1 = [meiosis(r, CA), meiosis(r, M1)], HS2 = [meiosis(r, CA), meiosis(r, M2)];
  return { CA, HS1, HS2, off: [meiosis(r, HS1), meiosis(r, HS2)] };
}
function fullSib(r) { const P1 = founder(0, 1), P2 = founder(2, 3); const S1 = [meiosis(r, P1), meiosis(r, P2)], S2 = [meiosis(r, P1), meiosis(r, P2)]; return [meiosis(r, S1), meiosis(r, S2)]; }
function cousins(r) { const G1 = founder(0, 1), G2 = founder(2, 3); const C1 = [meiosis(r, G1), meiosis(r, G2)], C2 = [meiosis(r, G1), meiosis(r, G2)]; const X = [meiosis(r, C1), meiosis(r, founder(6, 7))], Y = [meiosis(r, C2), meiosis(r, founder(8, 9))]; return [meiosis(r, X), meiosis(r, Y)]; }
// Founder-label colours (KIN.FOUNDER, skipping coral so runs keep the chapter accent)
const FC = [KIN.FOUNDER[0], KIN.FOUNDER[1], KIN.FOUNDER[2], KIN.FOUNDER[7], KIN.FOUNDER[4], KIN.FOUNDER[6]];
const fcol = (lab) => FC[((lab % FC.length) + FC.length) % FC.length];
// Small closed population (Wright–Fisher, N diploids, random mating) for T generations: many short, old runs.
function smallPop(seed, N, T) {
  const r = rng(seed); let pop = []; for (let i = 0; i < N; i++) pop.push(founder(2 * i + 10, 2 * i + 11));
  for (let t = 0; t < T; t++) { const nx = []; for (let i = 0; i < N; i++) nx.push([meiosis(r, pop[(r() * N) | 0]), meiosis(r, pop[(r() * N) | 0])]); pop = nx; }
  return pop;
}
// A bottleneck: a population (dots) squeezed through a narrow neck and re-expanding.
function bottleneck(g, x, y, sc, a) {
  if (a <= 0) return;
  g.withAlpha(a, () => {
    const L = [], R = []; for (let k = 0; k <= 30; k++) { const u = k / 30, yy = y - 60 * sc + 120 * sc * u, w = (12 + 40 * Math.pow(Math.abs(u - 0.5) * 2, 1.6)) * sc; L.push([x - w, yy]); R.push([x + w, yy]); }
    g.poly(L, { color: PAL.ink2, w: 2 }); g.poly(R, { color: PAL.ink2, w: 2 });
    const r = rng(4); for (let k = 0; k < 14; k++) { const u = r(), yy = u < 0.5 ? y - 50 * sc + 30 * sc * r() : y + 22 * sc + 30 * sc * r(); const w = (12 + 40 * Math.pow(Math.abs((yy - y + 60 * sc) / (120 * sc) - 0.5) * 2, 1.6)) * sc * 0.7; g.dot(x + (r() * 2 - 1) * w, yy, 3, u < 0.5 ? PAL.ink2 : COL, 0.9, 2); }
    g.dot(x - 3, y, 3, COL, 1, 2); g.dot(x + 4, y - 6, 3, COL, 1, 2);
  });
}
const LENCLS = [[0, 2], [2, 4], [4, 8], [8, 16], [16, 1e9]];
const LENLAB = ['< 2', '2–4', '4–8', '8–16', '> 16'];
const LENCOL = [U.mix(PAL.lagoon, PAL.bg, 0.35), PAL.lagoon, PAL.heather, PAL.rose, PAL.coral];
const lenClass = (len) => LENCLS.findIndex(([a, b]) => len >= a && len < b);
// Shared, lazily computed inbreeding examples (used by inb-roh and inb-roh-calls).
let SHARED = null;
function shared() {
  if (SHARED) return SHARED;
  // Half-sib offspring: seed chosen so chromosome 1 carries one long, central run and F_ROH is close to 1/8.
  const hs = halfSib(rng(HS_SEED));
  // Long-term small population: N = 100 for 28 generations (expected F = 1 − (1 − 1/200)^28 ≈ 0.13).
  const pop = smallPop(31, 100, 28);
  let best = null; for (const ind of pop) { const f = runsOf(ind, 0.5).F; if (!best || Math.abs(f - TARGET_F) < Math.abs(best.f - TARGET_F)) best = { ind, f }; }
  SHARED = { hs, hsRuns: runsOf(hs.off, 0.5), old: best.ind, oldRuns: runsOf(best.ind, 0.5) };
  return SHARED;
}
const HS_SEED = 1537, TARGET_F = 0.128;
// Draw a genome: 12 chromosomes as bars with runs painted. runs: from runsOf; colFn(run) → colour.
function genome(g, x, y, w, runs, o = {}) {
  const { rowH = 30, h = 14, alpha = 1, progress = 1, colFn = () => COL, base } = o; const maxL = CHR[0];
  for (let c = 0; c < CHR.length; c++) {
    const pc = clamp(progress * 1.6 - c * 0.05); if (pc <= 0) continue;
    const segs = runs.filter((q) => q.c === c).map((q) => ({ a: q.a, b: q.b, color: colFn(q) }));
    KIN.chrom(g, x, y + c * rowH, w * CHR[c] / maxL, segs, { h, alpha, progress: ease.out(pc), base });
  }
}

Theater.chapter({
  id: 'inb', roman: 'IV', title: 'Measuring Inbreeding', color: COL,
  question: 'What does heterozygosity hide, and what do runs of homozygosity reveal?',
  intro: { t: 'Chapter four. Measuring inbreeding: what heterozygosity hides, and what runs of homozygosity reveal.' },
  motif(g, t) { // a chromosome pair whose matched stretch glows as a run of homozygosity
    const p = ease.inOut((t - 0.6) / 2.4); const x = 1150, w = 600;
    const a = [[0, 0.3, PAL.lagoon], [0.3, 0.72, COL], [0.72, 1, PAL.heather]], b = [[0, 0.22, PAL.moss], [0.22, 0.72, COL], [0.72, 1, PAL.ochre]];
    g.withAlpha(0.38, () => { KIN.chrom(g, x, 200, w, a.map(([u, v, c]) => ({ a: u, b: v, color: c, alpha: 0.6 })), { h: 16, progress: p }); KIN.chrom(g, x, 232, w, b.map(([u, v, c]) => ({ a: u, b: v, color: c, alpha: 0.6 })), { h: 16, progress: p }); });
    const q = ease.out((t - 2.6) / 1.2); g.rect(x + 0.3 * w - 6, 180, 0.42 * w + 12, 72, { stroke: COL, w: 2, r: 10, alpha: 0.35 * q });
  },
  scenes: [
    /* VISUAL BRIEF (inb-fis): Beat 0: genotype bars AA/Aa/aa observed vs HWE expected (ghost outline),
       formula F_IS = 1 − H_O/H_E. Beat 1: two mating schemes side by side as small luminous populations:
       left "mates more related than random" (pairs linked, heterozygote bar dips), right random mating.
       Beat 2: a small closed population (say N = 20 dots in a ring) mating at random generation by
       generation; a time-series plot below: F_t = 1 − (1 − 1/2N)^t rising (coral) in step with a
       generation counter. Beat 3: on the same plot, F_IS (ochre) jitters around zero the whole time while
       F_t climbs; also H_O and H_E falling together (H_E declining with drift, H_O tracking it). Beat 4:
       label the gap "inbreeding the whole population shares — invisible to F_IS"; a bottleneck icon. */
    {
      id: 'inb-fis', title: 'Inbred, yet in equilibrium',
      beats: [
        { t: 'The classic summary compares observed heterozygosity with the heterozygosity expected under Hardy–Weinberg proportions: F_IS = 1 − H_O / H_E.',
          s: 'The classic summary compares observed heterozygosity with the heterozygosity expected under Hardy-Weinberg proportions: F I S equals one minus H O over H E.' },
        { t: 'F_IS measures non-random mating relative to the current population: whether mates are more related than two random members of this generation. That is not the same as being inbred.',
          s: 'F I S measures non-random mating relative to the current population: whether mates are more related than two random members of this generation. That is not the same as being inbred.' },
        { t: 'Watch a small, closed population that mates completely at random. Drift makes everyone slightly more related each generation, and inbreeding accumulates: F_t = 1 − (1 − 1/2N)^t.',
          s: 'Watch a small, closed population that mates completely at random. Drift makes everyone slightly more related each generation, and inbreeding accumulates: F at time t equals one minus, one minus one over two N, to the power t.' },
        { t: 'But because everyone is equally related, mates are no more related than random pairs, and observed heterozygosity keeps tracking its expectation, even as both decline. F_IS stays near zero while true inbreeding climbs.',
          s: 'But because everyone is equally related, mates are no more related than random pairs, and observed heterozygosity keeps tracking its expectation, even as both decline. F I S stays near zero while true inbreeding climbs.' },
        { t: 'A bottlenecked population can be deeply inbred with an F_IS of zero. Heterozygosity compared with today\'s expectation cannot see inbreeding that the whole population shares.',
          s: 'A bottlenecked population can be deeply inbred with an F I S of zero. Heterozygosity compared with today\'s expectation cannot see inbreeding that the whole population shares.', pause: 0.8 },
      ],
      terms: [
        { beat: 0.5, term: 'F_IS', def: '1 − H_O / H_E: heterozygote deficit relative to Hardy–Weinberg expectation in the current sample; measures non-random mating, not total inbreeding.' },
        { beat: 2.5, term: 'Drift inbreeding', def: 'Inbreeding that accumulates in a finite population under random mating: F_t = 1 − (1 − 1/2N_e)^t. Invisible to F_IS.' },
      ],
      init() {
        // Wright–Fisher population: N = 20 (10 males, 10 females), random mating, L unlinked biallelic loci.
        // Each gene copy carries (state, founder-copy id); realized F = fraction of loci where an individual's two
        // copies descend from the same founder copy (IBD). Sample H_E uses Nei's unbiased 2n/(2n−1) correction.
        const N = 20, NM = 10, L = 600, T = 30, r = rng(2024);
        const p0 = Array.from({ length: L }, () => 0.2 + 0.6 * r());
        let st = [], id = [];
        for (let i = 0; i < N; i++) { const a = new Uint8Array(2 * L), d = new Uint16Array(2 * L); for (let l = 0; l < L; l++) for (let c = 0; c < 2; c++) { a[2 * l + c] = r() < p0[l] ? 1 : 0; d[2 * l + c] = 2 * i + c; } st.push(a); id.push(d); }
        const gens = [], ring = [];
        const record = (gen, par) => {
          let ho = 0, he = 0, fr = 0;
          for (let l = 0; l < L; l++) {
            let c1 = 0, h = 0;
            for (let i = 0; i < N; i++) { const a = st[i][2 * l], b = st[i][2 * l + 1]; c1 += a + b; if (a !== b) h++; if (id[i][2 * l] === id[i][2 * l + 1]) fr++; }
            const p = c1 / (2 * N); ho += h / N; he += 2 * p * (1 - p) * (2 * N) / (2 * N - 1);
          }
          ho /= L; he /= L; fr /= N * L;
          gens.push({ gen, ho, he, fis: 1 - ho / he, fr, F: 1 - Math.pow(1 - 1 / (2 * N), gen) });
          ring.push({ ids: id.map((d) => [d[0], d[1]]), par });
        };
        record(0, null);
        for (let gen = 1; gen <= T; gen++) {
          const ns = [], ni = [], par = [];
          for (let i = 0; i < N; i++) {
            const f = (r() * NM) | 0, m = NM + ((r() * (N - NM)) | 0); const a = new Uint8Array(2 * L), d = new Uint16Array(2 * L); let cf0 = 0, cm0 = 0;
            for (let l = 0; l < L; l++) { const cf = r() < 0.5 ? 0 : 1, cm = r() < 0.5 ? 0 : 1; if (l === 0) { cf0 = cf; cm0 = cm; } a[2 * l] = st[f][2 * l + cf]; d[2 * l] = id[f][2 * l + cf]; a[2 * l + 1] = st[m][2 * l + cm]; d[2 * l + 1] = id[m][2 * l + cm]; }
            ns.push(a); ni.push(d); par.push([f, m]);
          }
          st = ns; id = ni; record(gen, par);
        }
        const hues = Array.from({ length: 2 * N }, (_, k) => hslHex((20 + k * 137.508) % 360, [62, 55, 70][k % 3], [66, 74, 60][k % 3]));
        // ring positions, alternating male/female around the circle
        const RX = 360, RY = 580, RR = 205; const pos = [];
        for (let i = 0; i < N; i++) { const k = i < NM ? 2 * i : 2 * (i - NM) + 1; const th = -Math.PI / 2 + k * 2 * Math.PI / N; pos.push([RX + RR * Math.cos(th), RY + RR * Math.sin(th)]); }
        // beat-1 vignettes: 6 families of 4 (assortative by kinship) vs 24 random individuals
        const r2 = rng(77); const fam = [], rnd = [];
        for (let f = 0; f < 6; f++) { const th = f * Math.PI / 3 + 0.3, cx = 395 + 128 * Math.cos(th), cy = 530 + 118 * Math.sin(th); for (let k = 0; k < 4; k++) fam.push({ x: cx + 34 * Math.cos(k * Math.PI / 2 + f), y: cy + 34 * Math.sin(k * Math.PI / 2 + f), f, sex: k % 2 ? 'F' : 'M' }); }
        for (let k = 0; k < 24; k++) { const th = k * 2.39996 + 0.4, rr = 175 * Math.sqrt((k + 0.5) / 24); rnd.push({ x: 1005 + rr * Math.cos(th) + (r2() - 0.5) * 16, y: 530 + rr * Math.sin(th) + (r2() - 0.5) * 16, sex: k % 2 ? 'F' : 'M' }); }
        const famPairs = []; for (let f = 0; f < 6; f++) { famPairs.push([4 * f, 4 * f + 1], [4 * f + 2, 4 * f + 3]); }
        const males = rnd.map((q, k) => k).filter((k) => rnd[k].sex === 'M'), fem = shuffle(r2, rnd.map((q, k) => k).filter((k) => rnd[k].sex === 'F'));
        const rndPairs = males.map((m, k) => [m, fem[k]]);
        return { gens, ring, hues, pos, RX, RY, RR, N, T, fam, rnd, famPairs, rndPairs };
      },
      draw(g, t, S, D) {
        const ctx = g.ctx;
        // ================= beat 0: genotype classes, observed vs HWE expected =================
        const a0 = vis(S, 0, 1);
        if (a0 > 0) g.withAlpha(a0, () => {
          label(g, 'One locus · sample of 80', 170, 262);
          const A = g.axes({ x: 190, y: 330, w: 470, h: 430, xmax: 3, ymax: 0.6, progress: S.p(0, 1, 0.2), yticks: [{ v: 0, l: '0' }, { v: 0.25, l: '0.25' }, { v: 0.5, l: '0.50' }] });
          yTitle(g, A, 'genotype frequency', S.p(0, 1, 0.5));
          const obs = [0.3125, 0.375, 0.3125], exp = [0.25, 0.5, 0.25], labs = [['A', 'A'], ['A', 'a'], ['a', 'a']];
          for (let k = 0; k < 3; k++) {
            const cx = A.X(k + 0.5), bw = 96; const po = S.p(0, 1, 2.0 + 0.25 * k), pe = S.p(0, 0.9, 4.8 + 0.25 * k);
            const het = k === 1, col = het ? HO : U.mix(HO, PAL.bg, 0.35);
            g.rect(cx - bw / 2, A.Y(obs[k] * po), bw, A.Y(0) - A.Y(obs[k] * po), { fill: U.rgba(col, 0.85), r: 3 });
            g.rect(cx - bw / 2 - 6, A.Y(exp[k]), bw + 12, A.Y(0) - A.Y(exp[k]), { stroke: PAL.ink, w: 2, dash: [7, 6], alpha: 0.75 * pe, r: 3 });
            labs[k].forEach((L, j) => KIN.bead(g, cx + (j ? 17 : -17), A.Y(0) + 34, L === 'A' ? PAL.lagoon : PAL.heather, { size: 13, letter: L, alpha: S.p(0, 0.8, 0.8) }));
          }
          // deficit bracket on the heterozygote bar
          const pd = S.p(0, 0.8, 6.6); const hx = A.X(1.5) + 64;
          g.line(hx, A.Y(0.5), hx, A.Y(0.375), { color: COL, w: 3, alpha: pd });
          g.line(hx - 8, A.Y(0.5), hx + 8, A.Y(0.5), { color: COL, w: 3, alpha: pd }); g.line(hx - 8, A.Y(0.375), hx + 8, A.Y(0.375), { color: COL, w: 3, alpha: pd });
          g.text('deficit', hx + 14, A.Y(0.4375) + 8, { size: 22, color: COL, alpha: pd });
          // legend
          const lg = S.p(0, 0.8, 2.6), le = S.p(0, 0.8, 5.0);
          g.rect(780, 318, 34, 22, { fill: U.rgba(HO, 0.85), r: 3, alpha: lg }); g.text('observed', 826, 337, { size: 22, color: PAL.ink2, alpha: lg });
          g.rect(780, 360, 34, 22, { stroke: PAL.ink, w: 2, dash: [7, 6], r: 3, alpha: 0.75 * le }); g.text('expected under HWE', 826, 379, { size: 22, color: PAL.ink2, alpha: le });
          // formula and the numbers
          const pf = S.p(0, 1, 7.8);
          g.math('F_{IS} = 1 − \\frac{H_{O}}{H_{E}}', 780, 530, { size: 56, color: PAL.ink, alpha: pf });
          const pn = S.p(0, 0.9, 8.8);
          g.math('H_{O} = 0.375', 780, 640, { size: 36, color: HO, alpha: pn });
          g.math('H_{E} = 2pq = 0.500', 780, 696, { size: 36, color: PAL.ink2, alpha: pn });
          g.math('F_{IS} = 0.25', 780, 770, { size: 40, color: COL, alpha: S.p(0, 0.9, 9.4) });
        });
        // ================= beat 1: non-random mating vs random mating =================
        const a1 = vis(S, 1, 2);
        if (a1 > 0) g.withAlpha(a1, () => {
          label(g, 'Mates more related than random', 160, 262, 1, COL);
          label(g, 'Random mating', 840, 262, S.p(1, 0.8, 0.4), PAL.lagoon);
          const pl = S.p(1, 1.2, 1.0), pr = S.p(1, 1.2, 1.6);
          const famHue = [PAL.heather, PAL.ochre, PAL.mint, PAL.rose, PAL.sand, PAL.moss];
          // family clusters (coloured by family) with within-family mates
          D.famPairs.forEach(([i, j], k) => { const A = D.fam[i], B = D.fam[j]; g.line(A.x, A.y, B.x, B.y, { color: COL, w: 2.4, alpha: 0.85, progress: S.p(1, 0.6, 2.2 + 0.08 * k) }); });
          D.fam.forEach((q, k) => { g.glow(q.x, q.y, 40, famHue[q.f], 0.12 * pl); KIN.person(g, q.x, q.y, { sex: q.sex, r: 11, color: famHue[q.f], alpha: S.p(1, 0.6, 0.6 + 0.02 * k), w: 2 }); });
          D.rndPairs.forEach(([i, j], k) => { const A = D.rnd[i], B = D.rnd[j]; g.line(A.x, A.y, B.x, B.y, { color: PAL.lagoon, w: 1.8, alpha: 0.6, progress: S.p(1, 0.6, 3.0 + 0.08 * k) }); });
          D.rnd.forEach((q, k) => KIN.person(g, q.x, q.y, { sex: q.sex, r: 11, color: PAL.ink2, alpha: pr, w: 2 }));
          // heterozygosity bars
          const hb = (x, ho, he, a, fis, col) => {
            const W = 380, y = 790; g.withAlpha(a, () => {
              g.text('H', x - 30, y + 14, { size: 24, role: 'math', italic: true, color: PAL.ink2, align: 'right' });
              g.rect(x, y - 2, W * ho / 0.6, 24, { fill: U.rgba(HO, 0.85), r: 3 });
              g.rect(x - 4, y - 6, W * he / 0.6 + 8, 32, { stroke: PAL.ink, w: 2, dash: [7, 6], alpha: 0.75, r: 4 });
              g.math(fis, x + W / 2, y + 82, { size: 38, color: col, align: 'center' });
            });
          };
          const hp = S.p(1, 0.9, 5.5);
          hb(210, lerp(0.5, 0.39, S.p(1, 1.4, 6.0)), 0.5, hp, 'F_{IS} > 0', COL);
          hb(820, 0.5, 0.5, hp, 'F_{IS} ≈ 0', PAL.lagoon);
          // "not the same as being inbred"
          const pn = P(S, 1, 1, 0.0, 0.8);
          g.withAlpha(pn, () => {
            g.rect(470, 300, 470, 58, { fill: 'rgba(9,19,21,0.9)', stroke: U.rgba(COL, 0.6), w: 1.5, r: 29 });
            g.text('non-random mating  ≠  inbred', 705, 339, { size: 30, role: 'display', italic: true, color: PAL.ink, align: 'center' });
          });
        });
        // ================= beats 2–4: a small closed population under random mating =================
        const a2 = S.p(2, 0.9);
        if (a2 <= 0) return;
        const T = D.T; const gt = T * ease.inOut(clamp((t - sent(S, 2, 1, 0.0)) / (S.e(3) - 1.0 - sent(S, 2, 1, 0.0))));
        const G = Math.floor(gt), u = gt - G; const gNow = Math.min(T, G + (u > 0.6 ? 1 : 0));
        g.withAlpha(a2, () => {
          label(g, 'Closed population · N = 20 · random mating', 150, 262);
          // ---- the ring
          const { pos, hues, RX, RY } = D;
          g.circle(RX, RY, D.RR, { stroke: PAL.rule, w: 1.5, dash: [3, 9] });
          const cur = D.ring[Math.min(T, G)], nxt = D.ring[Math.min(T, G + 1)];
          const flying = G < T && u > 0.02 && gt > 0.001;
          const fl = ease.inOut(clamp((u - 0.05) / 0.55));
          for (let i = 0; i < D.N; i++) {
            const [x, y] = pos[i]; const sex = i < 10 ? 'M' : 'F';
            const ids = (flying && fl >= 1) ? nxt.ids[i] : cur.ids[i];
            const auto = ids[0] === ids[1];
            KIN.person(g, x, y, { sex, r: 25, color: auto ? COL : PAL.ink2, glow: auto ? COL : null, alpha: S.p(2, 0.6, 0.3 + 0.04 * i), w: 2.2 });
            if (!flying || fl >= 1) KIN.alleles(g, x, y, ids.map((k) => hues[k]), { size: 8.5 });
          }
          if (flying && fl < 1) {
            for (let i = 0; i < D.N; i++) {
              const [f, m] = nxt.par[i]; const ids = nxt.ids[i];
              for (const [src, k, dx] of [[f, 0, -9], [m, 1, 9]]) {
                const [x0, y0] = pos[src], [x1, y1] = pos[i]; const ax = lerp(x0, x1, fl) + dx, ay = lerp(y0, y1, fl) - 30 * Math.sin(Math.PI * fl);
                g.line(x0, y0, lerp(x0, x1, fl), lerp(y0, y1, fl), { color: hues[ids[k]], w: 1, alpha: 0.18 * (1 - fl) });
                g.dot(ax, ay, 6, hues[ids[k]], 0.95, 2.2);
              }
            }
          }
          // generation counter in the ring centre
          const pc = P(S, 2, 1, 0, 0.8) * (1 - S.p(4, 0.6, 0.3));
          g.text('generation', RX, RY - 40, { size: 21, color: PAL.ink3, align: 'center', alpha: pc, ls: 1 });
          g.text(String(gNow), RX, RY + 34, { size: 76, role: 'display', color: PAL.ink, align: 'center', alpha: pc });
          // ---- top plot: F_t (theory + realized IBD) and F_IS
          const A = g.axes({ x: 720, y: 330, w: 540, h: 230, xmax: T, ymin: -0.1, ymax: 0.7, progress: S.p(2, 1, 0.6), xticks: [0, 10, 20, 30].map((v) => ({ v, l: String(v) })), yticks: [{ v: 0, l: '0' }, { v: 0.25, l: '0.25' }, { v: 0.5, l: '0.50' }] });
          g.line(A.X(0), A.Y(0), A.X(T), A.Y(0), { color: PAL.ink3, w: 1, dash: [4, 6], alpha: S.p(2, 1, 0.6) });
          xTitle(g, A, 'generation', S.p(2, 1, 0.8));
          const gs = D.gens;
          const fShow = Math.max(0.0001, gt);
          g.plot(A, (x) => 1 - Math.pow(1 - 1 / 40, x), { from: 0, to: fShow, color: COL, w: 3.5 });
          for (let k = 0; k <= Math.min(T, G); k++) g.dot(A.X(k), A.Y(gs[k].fr), 3.6, COL, 0.8, 2);
          const tipF = [A.X(fShow), A.Y(1 - Math.pow(1 - 1 / 40, fShow))];
          g.dot(tipF[0], tipF[1], 6, COL, 1, 3);
          g.math('F_{t}', 736, 300, { size: 34, color: COL, alpha: S.p(2, 0.8, 1.2) });
          // the drift-inbreeding equation, spoken at the end of beat 2
          const pe = P(S, 2, 1, 0.55, 0.9);
          g.math('F_{t} = 1 − (1 − \\frac{1}{2N})^{t}', 1262, 290, { size: 40, color: COL, alpha: pe, align: 'right' });
          g.dot(A.X(17), A.Y(0.62), 4, COL, pe * 0.85, 2); g.text('simulated IBD', A.X(17) + 14, A.Y(0.62) + 7, { size: 21, color: PAL.ink3, alpha: pe });
          // F_IS series (beat 3 on)
          const pf = S.p(3, 0.9, 0.2);
          if (pf > 0) {
            const upto = Math.min(T, G);
            const pts = []; for (let k = 0; k <= upto; k++) pts.push([A.X(k), A.Y(gs[k].fis)]);
            g.poly(pts, { color: PAL.ochre, w: 3, alpha: pf, progress: S.lin(3, 1.4, 0.2) });
            g.math('F_{IS}', 812, 300, { size: 34, color: PAL.ochre, alpha: pf });
          }
          // ---- bottom plot: H_E and H_O
          const pb = S.p(3, 1, 2.5);
          const B = g.axes({ x: 720, y: 650, w: 540, h: 170, xmax: T, ymax: 0.5, progress: pb, xticks: [0, 10, 20, 30].map((v) => ({ v, l: String(v) })), yticks: [{ v: 0, l: '0' }, { v: 0.4, l: '0.40' }] });
          if (pb > 0) {
            const upto = Math.min(T, G);
            const pe = [], po = []; for (let k = 0; k <= upto; k++) { pe.push([B.X(k), B.Y(gs[k].he)]); po.push([B.X(k), B.Y(gs[k].ho)]); }
            g.poly(pe, { color: PAL.ink, w: 2.5, dash: [8, 6], alpha: 0.8 * pb, progress: S.lin(3, 1.6, 3.0) });
            g.poly(po, { color: HO, w: 3, alpha: pb, progress: S.lin(3, 1.6, 3.4) });
            g.math('H_{E}', 900, 640, { size: 30, color: PAL.ink, alpha: S.p(3, 0.8, 3.4) });
            g.math('H_{O}', 990, 640, { size: 30, color: HO, alpha: S.p(3, 0.8, 4.4) });
          }
          // ---- beat 4: the shared inbreeding F_IS cannot see
          const p4 = S.p(4, 0.9, 0.3);
          if (p4 > 0) {
            const xg = A.X(T) + 22, yF = A.Y(gs[T].F), y0 = A.Y(0);
            g.arrow(xg, y0 - 4, xg, yF + 4, { color: COL, w: 3, head: 12, both: true, alpha: p4, progress: S.p(4, 0.8, 0.3) });
            g.withAlpha(P(S, 4, 1, 0.1), () => {
              g.rect(1030, 636, 236, 76, { fill: 'rgba(9,19,21,0.92)', stroke: U.rgba(COL, 0.55), w: 1.5, r: 10 });
              g.text('shared by everyone', 1148, 666, { size: 22, color: COL, align: 'center' });
              g.math('\\text{invisible to }F_{IS}', 1148, 699, { size: 25, color: PAL.ochre, align: 'center' });
            });
            // ring centre: the verdict
            g.rect(D.RX - 112, D.RY - 92, 224, 184, { fill: 'rgba(9,19,21,0.94)', r: 92, alpha: p4 });
            g.withAlpha(p4, () => {
              g.math('F ≈ \\text{' + gs[T].fr.toFixed(2) + '}', D.RX, D.RY - 14, { size: 40, color: COL, align: 'center' });
              g.math('F_{IS} ≈ \\text{' + gs[T].fis.toFixed(2).replace('-', '−') + '}', D.RX, D.RY + 44, { size: 40, color: PAL.ochre, align: 'center' });
            });
            // bottleneck glyph beside the ring
            bottleneck(g, 600, 345, 0.85, S.p(4, 0.9, 0.8));
          }
        });
      },
    },
    /* VISUAL BRIEF (inb-artifacts): Three "culprits" panels revealed in turn (structure, genotyping,
       filtering). Beat 0: Wahlund: two clusters pooled → het bar falls below expectation (callback to
       ch II). Beat 1: sequencing reads stacking over a heterozygous site: at low depth (2 reads) both
       reads happen to show the same allele → called homozygote (mis-call flash); at high depth (20 reads)
       both alleles appear. Beat 2: scatter plot: individual heterozygosity (y) vs mean depth (x), 60
       deterministic points with an upward trend at low depth (artifact) plateauing; annotate "het rises
       with depth → technical"; pills "depth filter" and "genotype likelihoods". Beat 3: a locus table /
       strip of loci with HWE p-values; an HWE filter blade sweeps and removes exactly the loci with
       heterozygote deficit, and the inbreeding signal bar shrinks; pills "filter within populations",
       "filter leniently", "MAF filters shift F". */
    {
      id: 'inb-artifacts', title: 'What fakes inbreeding',
      beats: [
        { t: 'A heterozygote deficit can also be manufactured. The first culprit is structure: pool two populations, and the Wahlund effect removes heterozygotes that were never missing.' },
        { t: 'The second is genotyping. At low sequencing depth, one allele of a heterozygote may never be read, and the call becomes a homozygote. Allelic dropout and null alleles do the same, and with RADseq data they can dominate the signal.',
          s: 'The second is genotyping. At low sequencing depth, one allele of a heterozygote may never be read, and the call becomes a homozygote. Allelic dropout and null alleles do the same, and with rad seq data they can dominate the signal.' },
        { t: 'A useful diagnostic: plot each individual\'s heterozygosity against its mean depth. If heterozygosity rises with depth, the apparent inbreeding is technical. Apply depth filters, or use methods that work with genotype likelihoods rather than hard calls.' },
        { t: 'The third culprit is filtering. Removing loci that depart from Hardy–Weinberg proportions preferentially discards those with the largest heterozygote deficits, biasing inbreeding estimates downward. Filter within populations, and leniently. Minor allele frequency filters shift the estimates too.' },
      ],
      terms: [
        { beat: 1.5, term: 'Allelic dropout', def: 'Failure to observe one allele of a heterozygote (low depth, null alleles), producing false homozygotes and spurious inbreeding.' },
        { beat: 2.7, term: 'Genotype likelihood', def: 'Probability of the sequencing reads under each possible genotype; carries depth-dependent uncertainty forward instead of forcing a hard call.' },
      ],
      init() {
        // --- beat 0: Wahlund. Two subpopulations in exact HWE (p = 0.8 and 0.2, 25 each), then pooled.
        const pops = [];
        const mk = (n, cx, cy, gen, seed) => { const r = rng(seed); const out = []; shuffle(r, gen); gen.forEach((gt, k) => { const th = k * 2.39996 + 0.5, rr = 112 * Math.sqrt((k + 0.5) / n); out.push({ x: cx + rr * Math.cos(th), y: cy + rr * Math.sin(th), gt }); }); return out; };
        const g1 = [...Array(16).fill(2), ...Array(8).fill(1), 0], g2 = [...Array(16).fill(0), ...Array(8).fill(1), 2];
        const P1 = mk(25, 300, 560, g1, 3), P2 = mk(25, 640, 560, g2, 4);
        // pooled positions (one blended cloud)
        const all = [...P1, ...P2]; const rp = rng(9); const order = shuffle(rp, all.map((_, k) => k));
        order.forEach((k, j) => { const th = j * 2.39996 + 0.2, rr = 160 * Math.sqrt((j + 0.5) / 50); all[k].px = 470 + rr * Math.cos(th); all[k].py = 560 + rr * Math.sin(th); });
        // --- beat 1: reads over one heterozygous site (A/G); depth 2 happens to show only A; depth 20 shows both.
        const reads = (n, seed) => { const r = rng(seed); const out = []; for (let k = 0; k < n; k++) out.push({ off: r(), b: r() < 0.5 ? 'A' : 'G', len: 0.42 + 0.22 * r() }); return out; };
        let s2 = 1; while (true) { const rr = reads(2, s2); if (rr[0].b === 'A' && rr[1].b === 'A') break; s2++; }
        let s20 = 1; while (true) { const rr = reads(20, s20); const na = rr.filter((q) => q.b === 'A').length; if (na >= 9 && na <= 11) break; s20++; }
        const R2 = reads(2, s2), R20 = reads(20, s20);
        // --- beat 2: individual heterozygosity vs mean depth. 60 individuals, 5000 sites each, true H ≈ 0.30
        // (small variance in F). Site depth ~ Poisson(mean); sites with depth 0 uncalled; a heterozygote is called
        // het only if both alleles appear among its reads. Filtered view keeps only sites with depth ≥ 10.
        const r3 = rng(41); const inds = [];
        for (let i = 0; i < 60; i++) {
          const md = Math.exp(lerp(Math.log(2), Math.log(32), (i + r3()) / 60)); const Ht = 0.30 * (1 - 0.08 * r3());
          let called = 0, het = 0, calledF = 0, hetF = 0;
          for (let l = 0; l < 5000; l++) {
            const k = poisson(r3, md); if (k === 0) continue; called++; const isHet = r3() < Ht;
            let h = 0; if (isHet) { let a = 0; for (let j = 0; j < k; j++) if (r3() < 0.5) a++; h = (a > 0 && a < k) ? 1 : 0; }
            het += h; if (k >= 10) { calledF++; hetF += isHet ? 1 : 0; }
          }
          inds.push({ md, h: het / called, hf: calledF >= 700 ? hetF / calledF : null });
        }
        // --- beat 3: HWE filtering. 40 individuals with variable F (mean ≈ 0.075), 56 loci; per-locus F_IS and
        // an HWE chi-square (1 df) p-value; loci with p < 0.05 are removed by the filter.
        const r4 = rng(26); const n = 40, L = 56;
        const F = Array.from({ length: n }, () => { const u = r4(); return u < 0.4 ? 0 : u < 0.65 ? 0.0625 : u < 0.88 ? 0.125 : 0.25; });
        const loci = [];
        for (let l = 0; l < L; l++) {
          const p = 0.1 + 0.8 * r4(); let c1 = 0, het = 0;
          for (let i = 0; i < n; i++) { let a, b; if (r4() < F[i]) { a = b = r4() < p ? 1 : 0; } else { a = r4() < p ? 1 : 0; b = r4() < p ? 1 : 0; } c1 += a + b; if (a !== b) het++; }
          const ph = c1 / (2 * n); const he = 2 * ph * (1 - ph) * 2 * n / (2 * n - 1); const ho = het / n; const f = he > 0 ? 1 - ho / he : 0; const pv = erfc(Math.sqrt(n * f * f / 2));
          loci.push({ ho, he, f, pv, drop: pv < 0.05 });
        }
        const est = (ls) => 1 - ls.reduce((a, o) => a + o.ho, 0) / ls.reduce((a, o) => a + o.he, 0);
        const fAll = est(loci), fKept = est(loci.filter((o) => !o.drop)), fTrue = mean(F);
        return { P1, P2, all, R2, R20, inds, loci, fAll, fKept, fTrue };
      },
      draw(g, t, S, D) {
        // culprit index along the top
        const tabs = [['structure', 0, 0], ['genotyping', 1, 0], ['filtering', 3, 0]];
        tabs.forEach(([s, k], j) => {
          const on = S.at(k) && (j === 2 || !S.at(tabs[j + 1][1])); const a = S.p(k, 0.6, k === 0 ? 2.6 : 0.2);
          const x = 160 + j * 300; g.text(String(j + 1), x, 268, { size: 22, role: 'display', italic: true, color: on ? COL : PAL.ink3, alpha: a });
          label(g, s, x + 22, 266, a, on ? COL : PAL.ink3);
        });
        const AL = (A) => PAL.lagoon, BL = PAL.heather; // A allele lagoon, a/G allele heather
        // ================= beat 0: Wahlund effect =================
        const a0 = vis(S, 0, 1);
        if (a0 > 0) g.withAlpha(a0, () => {
          const pool = S.io(0, 1.6, sent(S, 0, 1, 0.45) - S.b(0));
          const pd = S.p(0, 0.8, 1.0);
          g.text('p = 0.8', 300, 420, { size: 24, role: 'mono', color: PAL.lagoon, align: 'center', alpha: pd * (1 - pool) });
          g.text('p = 0.2', 640, 420, { size: 24, role: 'mono', color: PAL.heather, align: 'center', alpha: pd * (1 - pool) });
          g.text('pooled · p = 0.5', 470, 370, { size: 24, role: 'mono', color: PAL.ink2, align: 'center', alpha: pool });
          [...D.P1, ...D.P2].forEach((q, k) => {
            const x = lerp(q.x, q.px, pool), y = lerp(q.y, q.py, pool); const het = q.gt === 1;
            const a = S.p(0, 0.6, 0.6 + 0.012 * k);
            KIN.alleles(g, x, y, [q.gt >= 1 ? PAL.lagoon : PAL.heather, q.gt === 2 ? PAL.lagoon : PAL.heather], { size: 6.5, alpha: a, halo: 1.6 });
            if (het) g.circle(x, y, 15, { stroke: HO, w: 1.4, alpha: a * 0.7 });
          });
          // heterozygosity bars
          const A = g.axes({ x: 900, y: 360, w: 340, h: 420, xmax: 2, ymax: 0.6, progress: S.p(0, 1, 1.4), yticks: [{ v: 0, l: '0' }, { v: 0.32, l: '0.32' }, { v: 0.5, l: '0.50' }] });
          yTitle(g, A, 'heterozygosity', S.p(0, 1, 1.4));
          const he = lerp(0.32, 0.5, pool), pb = S.p(0, 0.9, 1.8);
          g.rect(A.X(0.5) - 55, A.Y(0.32 * pb), 110, A.Y(0) - A.Y(0.32 * pb), { fill: U.rgba(HO, 0.85), r: 3 });
          g.rect(A.X(1.5) - 55, A.Y(he * pb), 110, A.Y(0) - A.Y(he * pb), { stroke: PAL.ink, w: 2, dash: [7, 6], alpha: 0.8, r: 3 });
          g.math('H_{O}', A.X(0.5), A.Y(0) + 40, { size: 32, color: HO, align: 'center', alpha: pb });
          g.math('H_{E}', A.X(1.5), A.Y(0) + 40, { size: 32, color: PAL.ink, align: 'center', alpha: pb });
          const pw = S.p(0, 0.9, sent(S, 0, 1, 0.75) - S.b(0));
          g.line(A.X(0.5) + 60, A.Y(0.5), A.X(1.5) - 62, A.Y(0.5), { color: COL, w: 1.5, dash: [4, 5], alpha: pw });
          g.line(A.X(0.5), A.Y(0.32) - 12, A.X(0.5), A.Y(0.5) + 4, { color: COL, w: 3, alpha: pw });
          g.text('Wahlund effect', A.X(1), A.Y(0.5) - 56, { size: 26, role: 'display', italic: true, color: COL, align: 'center', alpha: pw });
          g.math('F_{IS} = \\text{0.36}', A.X(1), A.Y(0.5) - 18, { size: 30, color: COL, align: 'center', alpha: pw });
          g.text('each subpopulation in HWE', 470, 800, { size: 22, color: PAL.ink3, align: 'center', alpha: pd * (1 - pool) });
          g.text('no inbreeding, yet a deficit', 470, 800, { size: 22, color: PAL.ink2, align: 'center', alpha: pw });
        });
        // ================= beat 1: low depth drops an allele =================
        const a1 = vis(S, 1, 2);
        if (a1 > 0) g.withAlpha(a1, () => {
          const pane = (x0, R, d, delay, callT) => {
            const W = 500, siteX = x0 + W * 0.5, top = 340, rh = 18;
            g.text('depth ' + R.length, x0, 318, { size: 26, role: 'mono', color: PAL.ink, alpha: S.p(1, 0.6, delay) });
            // reference + site marker
            g.line(x0, top + 30, x0 + W, top + 30, { color: PAL.ink2, w: 3, alpha: S.p(1, 0.6, delay) });
            g.line(siteX, top + 18, siteX, top + 54 + 21 * rh, { color: PAL.ink3, w: 1.2, dash: [4, 6], alpha: S.p(1, 0.6, delay) });
            R.forEach((q, k) => {
              const pa = S.p(1, 0.4, delay + 0.4 + k * (R.length > 2 ? 0.12 : 0.6)); if (pa <= 0) return;
              const L = W * q.len, xs = siteX - L * (0.1 + 0.8 * q.off), y = top + 56 + k * rh + (1 - pa) * -20;
              g.rect(xs, y - 6, L, 12, { fill: U.rgba(PAL.ink, 0.22), r: 6, alpha: pa });
              g.dot(siteX, y, 6.5, q.b === 'A' ? PAL.lagoon : PAL.heather, pa, 1.8);
            });
            const pc = S.p(1, 0.7, callT); const na = R.filter((q) => q.b === 'A').length; const het = na > 0 && na < R.length;
            const cy = 790;
            g.text('call', x0, cy + 8, { size: 22, color: PAL.ink3, alpha: pc });
            KIN.alleles(g, x0 + 100, cy, [PAL.lagoon, het ? PAL.heather : PAL.lagoon], { size: 12, alpha: pc });
            g.text(het ? 'A/G  ✓' : 'A/A', x0 + 150, cy + 9, { size: 26, role: 'mono', color: het ? PAL.moss : COL, alpha: pc });
            if (!het) { const fl = pc * (0.6 + 0.4 * Math.sin((t - S.b(1)) * 5)); g.text('false homozygote', x0 + 250, cy + 9, { size: 23, color: COL, alpha: fl }); }
            g.text('truth: A/G', x0 + W, 318, { size: 22, color: PAL.ink3, align: 'right', alpha: S.p(1, 0.6, delay) });
          };
          const d0 = sent(S, 1, 1, 0) - S.b(1);
          pane(150, D.R2, 2, d0, d0 + 3.2);
          pane(760, D.R20, 20, d0 + 2.4, d0 + 5.6);
          const pf = S.p(1, 0.8, d0 + 3.6);
          g.math('P(\\text{het called hom}) = 2(\\frac{1}{2})^{d}', 150, 620, { size: 34, color: PAL.ink2, alpha: pf });
          g.math('d = 2:\\; 0.5 \\quad d = 20:\\; 2 × 10^{−6}', 150, 680, { size: 30, color: COL, alpha: S.p(1, 0.8, d0 + 4.4) });
          const pp = (k, txt, x, col) => g.pill(txt, x, 870, { size: 22, color: col, alpha: P(S, 1, 2, k) });
          pp(0.0, 'allelic dropout', 150, COL); pp(0.22, 'null alleles', 390, COL); pp(0.62, 'RADseq', 590, PAL.ochre);
        });
        // ================= beat 2: heterozygosity vs depth diagnostic =================
        const a2 = vis(S, 2, 3);
        if (a2 > 0) g.withAlpha(a2, () => {
          const A = g.axes({ x: 200, y: 330, w: 780, h: 440, xmin: 0, xmax: 34, ymin: 0.1, ymax: 0.34, progress: S.p(2, 1, 0.2), xticks: [0, 10, 20, 30].map((v) => ({ v, l: String(v) })), yticks: [0.1, 0.2, 0.3].map((v) => ({ v, l: v.toFixed(2) })) });
          xTitle(g, A, 'mean read depth', S.p(2, 1, 0.6)); yTitle(g, A, 'individual heterozygosity', S.p(2, 1, 0.6));
          const fil = S.io(2, 1.6, sent(S, 2, 2, 0.1) - S.b(2));
          g.line(A.X(0), A.Y(0.3 * 0.96), A.X(34), A.Y(0.3 * 0.96), { color: PAL.moss, w: 1.5, dash: [6, 7], alpha: 0.7 * S.p(2, 0.8, sent(S, 2, 1, 0.5) - S.b(2)) });
          g.text('true H', A.X(34) + 22, A.Y(0.3 * 0.96) + 7, { size: 21, color: PAL.moss, align: 'left', alpha: S.p(2, 0.8, sent(S, 2, 1, 0.5) - S.b(2)) });
          D.inds.forEach((q, k) => {
            const pa = S.p(2, 0.5, 1.4 + k * 0.045); if (pa <= 0) return;
            const y = q.hf === null ? q.h : lerp(q.h, q.hf, fil); const a = q.hf === null ? 1 - 0.85 * fil : 1;
            g.dot(A.X(q.md), A.Y(y), 6, q.md < 8 && fil < 0.5 ? COL : PAL.sand, pa * a, 2.2);
          });
          // the artefactual trend
          const pt = S.p(2, 1.2, sent(S, 2, 1, 0) - S.b(2));
          // expected called H: a het is seen only if both alleles appear among k ~ Poisson(d) reads, given k ≥ 1
          g.plot(A, (d) => 0.288 * (1 - 2 * (Math.exp(-d / 2) - Math.exp(-d)) / (1 - Math.exp(-d))), { from: 1.2, to: 33, color: COL, w: 3, alpha: 0.85 * (1 - fil), progress: pt });
          g.withAlpha(pt * (1 - fil), () => g.text('rises with depth → technical', A.X(5.5), A.Y(0.135), { size: 24, color: COL }));
          g.withAlpha(fil, () => g.text('depth ≥ 10 sites only: flat', A.X(5.5), A.Y(0.135), { size: 24, color: PAL.moss }));
          // remedies
          const pr = (f, txt, y, col) => g.pill(txt, 1050, y, { size: 24, color: col, alpha: P(S, 2, 2, f) });
          pr(0.0, 'depth filters', 470, PAL.moss); pr(0.45, 'genotype likelihoods', 540, PAL.moss);
        });
        // ================= beat 3: HWE filtering biases F downward =================
        const a3 = S.p(3, 0.9);
        if (a3 > 0) g.withAlpha(a3, () => {
          const x0 = 200, W = 760, y0 = 560, sc = 330; const L = D.loci.length, bw = W / L;
          g.line(x0 - 10, y0, x0 + W + 10, y0, { color: PAL.ink2, w: 2 });
          g.math('\\text{per-locus }F_{IS}', x0 - 10, 332, { size: 26, color: PAL.ink2 });
          g.text('0', x0 - 22, y0 + 7, { size: 19, color: PAL.ink3, align: 'right' });
          g.text('deficit', x0 - 22, y0 - 120, { size: 21, color: PAL.ink3, align: 'right' });
          g.text('excess', x0 - 22, y0 + 130, { size: 21, color: PAL.ink3, align: 'right' });
          const sweep = S.io(3, 3.4, sent(S, 3, 1, 0.15) - S.b(3)); const bx = x0 + W * sweep;
          D.loci.forEach((q, k) => {
            const x = x0 + k * bw + bw / 2; const pa = S.p(3, 0.5, 0.6 + k * 0.02); const h = q.f * sc * pa;
            const gone = q.drop && bx > x; const fall = gone ? clamp((bx - x) / 120) : 0;
            const col = q.f > 0 ? COL : PAL.lagoon;
            g.rect(x - bw * 0.36, h > 0 ? y0 - h : y0, bw * 0.72, Math.abs(h), { fill: U.rgba(col, 0.85 * (1 - 0.85 * fall)), r: 2, alpha: pa });
            if (q.drop && fall > 0) g.text('×', x, y0 - Math.max(h, 0) - 14, { size: 22, color: PAL.ink2, align: 'center', alpha: (1 - fall * 0.4) });
          });
          if (sweep > 0 && sweep < 1) { g.line(bx, 340, bx, 800, { color: PAL.ink, w: 2.5, alpha: 0.85 }); g.text('HWE filter', bx, 820 - 0, { size: 21, color: PAL.ink, align: 'center' }); }
          g.text('HWE filter  p < 0.05 removed', x0 + W, 330, { size: 21, color: PAL.ink3, align: 'right', alpha: S.p(3, 0.6, sent(S, 3, 1, 0.15) - S.b(3)) });
          // estimate meter
          const M = g.axes({ x: 1080, y: 360, w: 170, h: 380, xmax: 1, ymax: 0.1, arrows: false, progress: S.p(3, 1, 0.8), yticks: [0, 0.05, 0.1].map((v) => ({ v, l: v.toFixed(2) })) });
          const fNow = lerp(D.fAll, D.fKept, ease.inOut(sweep));
          g.rect(1120, M.Y(fNow * S.p(3, 0.9, 1)), 90, M.Y(0) - M.Y(fNow * S.p(3, 0.9, 1)), { fill: U.rgba(COL, 0.85), r: 3 });
          g.line(1112, M.Y(D.fTrue), 1218, M.Y(D.fTrue), { color: PAL.ink, w: 2, dash: [6, 5], alpha: S.p(3, 0.8, 1.4) });
          g.text('true F', 1226, M.Y(D.fTrue) + 7 - (Math.abs(D.fTrue - D.fAll) < 0.006 ? 14 : 0), { size: 21, color: PAL.ink, alpha: S.p(3, 0.8, 1.4) });
          const pb4 = S.p(3, 0.6, sent(S, 3, 1, 0.15) - S.b(3));
          g.line(1112, M.Y(D.fAll), 1218, M.Y(D.fAll), { color: COL, w: 2, alpha: 0.6 * pb4 });
          g.text('unfiltered', 1100, M.Y(D.fAll) + 7, { size: 21, color: COL, align: 'right', alpha: 0.8 * pb4 });
          g.math('\\hat{F}', 1165, M.Y(0) + 44, { size: 36, color: COL, align: 'center', alpha: S.p(3, 0.8, 1) });
          g.text(fNow.toFixed(3), 1165, M.Y(fNow) - 14, { size: 22, role: 'mono', color: COL, align: 'center', alpha: S.p(3, 0.8, 1) });
          const pr = (k, f, txt, x, col) => g.pill(txt, x, 872, { size: 22, color: col, alpha: P(S, 3, k, f) });
          pr(2, 0.0, 'filter within populations', 200, PAL.moss); pr(2, 0.5, 'filter leniently', 500, PAL.moss); pr(3, 0.05, 'MAF filters shift F', 690, PAL.ochre);
        });
      },
    },
    /* VISUAL BRIEF (inb-g2): Beat 0: three estimator pills (F_hom · PLINK, F_GRM, F_UNI · GCTA) above a
       strip plot of individual F estimates with wide error bars (noisy). Beat 1: a genome as a row of loci
       per individual (grid: individuals × loci, cells heterozygous = bright, homozygous = dim); inbred
       individuals show dim rows across the whole genome. Beat 2: first show g2 as covariance of heterozygosity
       between pairs of loci (two locus columns highlighted, their het patterns co-varying across
       individuals; g2 formula/label). Then the simpler heterozygosity–heterozygosity correlation: loci
       split at random into two halves (columns colour-coded and separated); scatter of het(half A) vs
       het(half B) per individual; regression line labelled r_HHC; reshuffle 2–3 times.
       Beat 3: contrast: a population with no variance in F — scatter is a round cloud, g2 ≈ 0 with CI
       crossing zero; label "differences in F are noise"; pill "inbreedR". */
    {
      id: 'inb-g2', title: 'Does inbreeding vary?',
      beats: [
        { t: 'Individual estimates of F come in several flavors: F_hom from PLINK, and F_GRM and F_UNI from the GCTA software. All are still relative to the sample\'s allele frequencies, and all are noisy when markers are few.',
          s: 'Individual estimates of F come in several flavors: F hom from plink, and F G R M and F uni from the G C T A software. All are still relative to the sample\'s allele frequencies, and all are noisy when markers are few.' },
        { t: 'Before trusting them, ask a prior question: does inbreeding vary among individuals at all? If it does, an inbred individual tends to be homozygous across its whole genome, so heterozygosity at one set of loci predicts heterozygosity at another.' },
        { t: 'That correlation is called identity disequilibrium, and g2 measures it as the excess covariance in heterozygosity between pairs of loci. A simpler view splits the loci into random halves and correlates each individual\'s heterozygosity across them.',
          s: 'That correlation is called identity disequilibrium, and g two measures it as the excess covariance in heterozygosity between pairs of loci. A simpler view splits the loci into random halves and correlates each individual\'s heterozygosity across them.' },
        { t: 'If g2 is indistinguishable from zero, differences in individual F are mostly sampling noise, and heterozygosity–fitness correlations built on them will be weak. The inbreedR package estimates g2 with confidence intervals.',
          s: 'If g two is indistinguishable from zero, differences in individual F are mostly sampling noise, and heterozygosity-fitness correlations built on them will be weak. The inbreed R package estimates g two with confidence intervals.', pause: 0.6 },
      ],
      terms: [
        { beat: 0.6, term: 'Marker-based F', def: 'Individual F from genotypes: F_hom (PLINK --het), F_GRM and F_UNI (GCTA). Relative to sample allele frequencies; noisy with few loci.' },
        { beat: 2.2, term: 'Identity disequilibrium (g2)', def: 'Correlation of heterozygosity across loci caused by variance in inbreeding among individuals; g2 > 0 means F varies (Stoffel et al. 2016, inbreedR).' },
      ],
      init() {
        // ---------- beat 0: three marker-based estimators (Yang et al. 2011 / PLINK) on a simulated sample.
        // 40 individuals with known F; 5000 unlinked loci; p from the sample. Show 10 individuals; bootstrap over
        // loci (200 reps) for 95% intervals, with all 5000 loci and with the first 100.
        const r0 = rng(303); const n0 = 40, L0 = 5000;
        const Ftrue = [0, 0, 0.03, 0.0625, 0.0625, 0.125, 0.125, 0.25, 0.25, 0.375];
        const Fs = Array.from({ length: n0 }, (_, i) => (i < 10 ? Ftrue[i] : [0, 0, 0.0625, 0.125][(r0() * 4) | 0]));
        const pt = Array.from({ length: L0 }, () => 0.1 + 0.8 * r0());
        const X = Fs.map((F) => { const row = new Uint8Array(L0); for (let l = 0; l < L0; l++) { if (r0() < F) row[l] = r0() < pt[l] ? 2 : 0; else row[l] = (r0() < pt[l] ? 1 : 0) + (r0() < pt[l] ? 1 : 0); } return row; });
        const ps = Array.from({ length: L0 }, (_, l) => { let c = 0; for (let i = 0; i < n0; i++) c += X[i][l]; return c / (2 * n0); });
        const per = (x, p) => { const v = 2 * p * (1 - p); return [(x - 2 * p) ** 2 / v - 1, (x * x - (1 + 2 * p) * x + 2 * p * p) / v, x === 1 ? 0 : 1, 1 - v]; };
        const estim = (i, idx) => { let grm = 0, uni = 0, O = 0, E = 0, m = 0; for (const l of idx) { const p = ps[l]; if (p <= 0 || p >= 1) continue; const q = per(X[i][l], p); grm += q[0]; uni += q[1]; O += q[2]; E += q[3]; m++; } return [(O - E) / (m - E), grm / m, uni / m]; };
        const boot = (i, idx, reps, seed) => { const r = rng(seed); const out = [[], [], []]; for (let b = 0; b < reps; b++) { const bi = idx.map(() => idx[(r() * idx.length) | 0]); estim(i, bi).forEach((v, k) => out[k].push(v)); } return out.map((a) => { a.sort((u, v) => u - v); return [a[Math.floor(0.025 * reps)], a[Math.floor(0.975 * reps)]]; }); };
        const allIdx = [...Array(L0).keys()], fewIdx = allIdx.slice(0, 100);
        const est0 = [];
        for (let i = 0; i < 10; i++) est0.push({ F: Ftrue[i], many: estim(i, allIdx), few: estim(i, fewIdx), ciMany: boot(i, allIdx, 60, 900 + i), ciFew: boot(i, fewIdx, 200, 700 + i) });
        // ---------- beats 1–3: identity disequilibrium. Population A: F varies (mixture); population B: F constant.
        // h_il = 1 if individual i is heterozygous at locus l. g2 (David et al. 2007; Stoffel et al. 2016 inbreedR):
        // g2 = [Σ_i Σ_{l≠l'} h_il h_il' / n] / [Σ_{i≠j} Σ_{l≠l'} h_il h_jl' / (n(n−1))] − 1, CI by bootstrapping individuals.
        const n = 40, L = 400;
        const sim = (seed, Fdraw) => {
          const r = rng(seed); const F = Array.from({ length: n }, () => Fdraw(r)); const p = Array.from({ length: L }, () => 0.15 + 0.7 * r());
          const h = F.map((f) => { const row = new Uint8Array(L); for (let l = 0; l < L; l++) row[l] = r() < f ? 0 : ((r() < p[l]) !== (r() < p[l]) ? 1 : 0); return row; });
          const g2 = (idx) => { let num = 0; const T = new Float64Array(L); for (const i of idx) { let H = 0; for (let l = 0; l < L; l++) { H += h[i][l]; T[l] += h[i][l]; } num += H * H - H; } let sT = 0, sT2 = 0; for (let l = 0; l < L; l++) { sT += T[l]; sT2 += T[l] * T[l]; } const m = idx.length; return (num / m) / ((sT * sT - sT2 - num) / (m * (m - 1))) - 1; };
          const all = [...Array(n).keys()]; const est = g2(all); const bs = []; for (let b = 0; b < 400; b++) bs.push(g2(all.map(() => (r() * n) | 0))); bs.sort((a, b) => a - b);
          const splits = []; for (let k = 0; k < 3; k++) { const perm = shuffle(r, [...Array(L).keys()]); const A = perm.slice(0, L / 2), B = perm.slice(L / 2); const xs = h.map((row) => mean(A.map((l) => row[l]))), ys = h.map((row) => mean(B.map((l) => row[l]))); const c = corr(xs, ys); splits.push({ xs, ys, ...c, inA: new Uint8Array(L).map((_, l) => (A.includes(l) ? 1 : 0)) }); }
          return { F, h, est, lo: bs[10], hi: bs[389], splits };
        };
        const mix = (r) => { const u = r(); return u < 0.4 ? 0 : u < 0.6 ? 0.0625 : u < 0.78 ? 0.125 : u < 0.92 ? 0.25 : 0.375; };
        const A = sim(2, mix), B = sim(13, () => 0.08);
        // genotype grid (40 individuals × first 96 loci), pre-rendered; rows ordered as sampled (not by F)
        const NL = 96, CW = 5.6, CH = 11;
        const paint = (pop) => { const cv = Theater.makeCanvas(NL * CW, n * CH); const c = cv.getContext('2d'); for (let i = 0; i < n; i++) for (let l = 0; l < NL; l++) { c.fillStyle = pop.h[i][l] ? U.rgba(PAL.sand, 0.92) : U.rgba(PAL.ink, 0.09); c.fillRect(l * CW + 0.6, i * CH + 1, CW - 1.2, CH - 2); } return cv; };
        // two example loci whose heterozygosity co-varies across individuals in population A
        let best = [0, 1], bestC = -1; for (let l = 0; l < NL; l++) for (let m = l + 6; m < NL; m++) { let both = 0, hl = 0, hm = 0; for (let i = 0; i < n; i++) { both += A.h[i][l] & A.h[i][m]; hl += A.h[i][l]; hm += A.h[i][m]; } if (hl < 14 || hm < 14) continue; const c = both / n - (hl / n) * (hm / n); if (c > bestC && m - l > 30) { bestC = c; best = [l, m]; } }
        return { est0, A, B, imgA: paint(A), imgB: paint(B), NL, CW, CH, n, L, pair: best };
      },
      draw(g, t, S, D) {
        // ================= beat 0: estimator flavours, noisy with few markers =================
        const a0 = vis(S, 0, 1);
        if (a0 > 0) g.withAlpha(a0, () => {
          const EC = [COL, PAL.ochre, PAL.heather], EN = ['F_{hom}', 'F_{GRM}', 'F_{UNI}'], ET = ['PLINK', 'GCTA', 'GCTA'];
          const tp = [0.25, 0.5, 0.65];
          EN.forEach((e, k) => {
            const a = P(S, 0, 0, tp[k]); const x = 200 + k * 260;
            g.withAlpha(a, () => { g.rect(x - 14, 300, 230, 56, { fill: U.rgba(EC[k], 0.12), stroke: U.rgba(EC[k], 0.5), w: 1.5, r: 28 }); const w = g.mathW(e, 32); g.math(e, x + 8, 338, { size: 32, color: EC[k] }); g.text(ET[k], x + 18 + w, 336, { size: 22, role: 'mono', color: PAL.ink2 }); });
          });
          const A = g.axes({ x: 200, y: 420, w: 940, h: 380, xmin: -0.5, xmax: 9.5, ymin: -0.35, ymax: 0.65, arrows: false, progress: S.p(0, 1, 2.0), yticks: [-0.25, 0, 0.25, 0.5].map((v) => ({ v, l: v.toFixed(2) })) });
          g.line(A.X(-0.5), A.Y(0), A.X(9.5), A.Y(0), { color: PAL.ink3, w: 1, dash: [4, 6], alpha: S.p(0, 1, 2.0) });
          yTitle(g, A, 'estimated F', S.p(0, 1, 2.0)); xTitle(g, A, 'individuals', S.p(0, 1, 2.0));
          // few-markers morph
          const few = S.io(0, 1.4, sent(S, 0, 1, 0.7) - S.b(0));
          const Lshow = Math.round(Math.exp(lerp(Math.log(5000), Math.log(100), few)));
          g.text('L = ' + Lshow + ' loci', 1140, 410, { size: 26, role: 'mono', color: few > 0.5 ? COL : PAL.ink, align: 'right', alpha: S.p(0, 0.8, 2.4) });
          D.est0.forEach((q, i) => {
            const x = A.X(i), pi = S.p(0, 0.6, 2.6 + 0.12 * i);
            g.line(x - 34, A.Y(q.F), x + 34, A.Y(q.F), { color: PAL.ink, w: 2.5, alpha: 0.7 * pi });
            for (let k = 0; k < 3; k++) {
              const pk = pi * P(S, 0, 0, tp[k], 0.6); if (pk <= 0) continue;
              const xx = x + (k - 1) * 20; const v = lerp(q.many[k], q.few[k], few);
              const lo = lerp(q.ciMany[k][0], q.ciFew[k][0], few), hi = lerp(q.ciMany[k][1], q.ciFew[k][1], few);
              g.line(xx, A.Y(Math.max(-0.35, lo)), xx, A.Y(Math.min(0.65, hi)), { color: EC[k], w: 2.2, alpha: 0.75 * pk });
              g.dot(xx, A.Y(v), 5.5, EC[k], pk, 2);
            }
          });
          g.withAlpha(S.p(0, 0.8, 3.4), () => { g.line(560, 394, 600, 394, { color: PAL.ink, w: 2.5, alpha: 0.7 }); g.text('true F', 610, 401, { size: 21, color: PAL.ink2 }); });
          g.withAlpha(P(S, 0, 1, 0.05), () => g.text('relative to sample allele frequencies', 200, 875, { size: 22, color: PAL.ochre }));
        });
        // ================= beats 1–2: the genotype grid =================
        const aG = vis(S, 1, 3);
        const split = S.io(2, 1.4, sent(S, 2, 1, 0.0) - S.b(2));
        const { n, NL, CW, CH } = D; const gx = 160, gy = 330;
        // column positions: in the split view, half-A columns move left, half-B right (first split)
        const spl = D.A.splits[0]; const rankA = [], rankB = []; for (let l = 0; l < NL; l++) (spl.inA[l] ? rankA : rankB).push(l);
        const colX = new Float32Array(NL); rankA.forEach((l, k) => { colX[l] = k; }); rankB.forEach((l, k) => { colX[l] = rankA.length + k + 3; });
        const colPos = (l) => gx + lerp(l, colX[l], split) * CW * (NL / (NL + 3 * split));
        if (aG > 0) g.withAlpha(aG, () => {
          label(g, 'Individuals × loci', gx, 300);
          const rev = S.io(1, 1.6, 0.4);
          g.clip(gx, gy, NL * CW * rev + 2, n * CH, () => {
            if (split <= 0) g.ctx.drawImage(D.imgA, gx, gy);
            else { const sc = NL / (NL + 3 * split); for (let l = 0; l < NL; l++) { g.ctx.drawImage(D.imgA, l * CW, 0, CW, n * CH, colPos(l), gy, CW * sc, n * CH); } }
          });
          // legend
          g.withAlpha(S.p(1, 0.8, 1.6), () => {
            g.rect(gx, gy + n * CH + 22, 14, 14, { fill: U.rgba(PAL.sand, 0.92) }); g.text('heterozygous', gx + 22, gy + n * CH + 35, { size: 21, color: PAL.ink2 });
            g.rect(gx + 190, gy + n * CH + 22, 14, 14, { fill: U.rgba(PAL.ink, 0.12) }); g.text('homozygous', gx + 212, gy + n * CH + 35, { size: 21, color: PAL.ink2 });
          });
          // inbred rows flagged (true F ≥ 0.25) when narration says "homozygous across its whole genome"
          const pin = P(S, 1, 1, 0.25) * (1 - split);
          D.A.F.forEach((f, i) => { if (f < 0.25) return; const y = gy + i * CH + CH / 2; g.rect(gx - 6, gy + i * CH, NL * CW + 12, CH, { stroke: COL, w: 1.5, alpha: 0.75 * pin, r: 3 }); g.dot(gx - 16, y, 4, COL, pin, 2); });
          g.text('true F ≥ 0.25', gx + NL * CW, gy - 12, { size: 21, color: COL, align: 'right', alpha: pin });
          // split-half labels
          if (split > 0) {
            const xa = gx + rankA.length * CW * 0.5 * (NL / (NL + 3)), xb = gx + (rankA.length + 3 + rankB.length * 0.5) * CW * (NL / (NL + 3));
            g.text('half A', xa, gy - 12, { size: 22, color: PAL.lagoon, align: 'center', alpha: split });
            g.text('half B', xb, gy - 12, { size: 22, color: PAL.rose, align: 'center', alpha: split });
          }
        });
        // ---- beat 2, sentence 0: two loci co-vary → g2
        const aP = P(S, 2, 0, 0.0) * (1 - split) * aG;
        if (aP > 0) g.withAlpha(aP, () => {
          const [l1, l2] = D.pair; const hl = (i, l) => D.A.h[i][l];
          for (const [l, col] of [[l1, PAL.lagoon], [l2, PAL.rose]]) g.rect(gx + l * CW - 2, gy - 4, CW + 4, n * CH + 8, { stroke: col, w: 2, r: 3 });
          // co-heterozygous rows
          const pr = P(S, 2, 0, 0.35);
          for (let i = 0; i < n; i++) if (hl(i, l1) && hl(i, l2)) g.line(gx + l1 * CW + CW, gy + i * CH + CH / 2, gx + l2 * CW, gy + i * CH + CH / 2, { color: PAL.sand, w: 1.2, alpha: 0.35 * pr });
        });
        // ---- right panel, beat 1: does F vary? (question); beat 2 s0: g2 formula; beat 2 s1+: scatter
        const qa = vis(S, 1, 2) * S.p(1, 0.8, 0.4);
        g.withAlpha(qa, () => {
          g.text('Does F vary', 1000, 470, { size: 46, role: 'display', italic: true, color: PAL.ink, align: 'center' });
          g.text('among individuals?', 1000, 525, { size: 46, role: 'display', italic: true, color: PAL.ink, align: 'center' });
          const pp = P(S, 1, 1, 0.55);
          g.withAlpha(pp, () => {
            g.text('het at one set of loci', 1000, 640, { size: 24, color: PAL.lagoon, align: 'center' });
            g.arrow(1000, 656, 1000, 700, { color: PAL.ink2, w: 2, head: 11 });
            g.text('predicts het at another', 1000, 728, { size: 24, color: PAL.rose, align: 'center' });
          });
        });
        const fa = P(S, 2, 0, 0.1) * (1 - split) * aG;
        g.withAlpha(fa, () => {
          g.text('identity disequilibrium', 1010, 360, { size: 34, role: 'display', italic: true, color: PAL.ink, align: 'center' });
          g.math('g_{2} = \\frac{\\text{cov}(h_{l}, h_{l′})}{\\bar{h}_{l} \\cdot \\bar{h}_{l′}}', 1010, 500, { size: 50, color: COL, align: 'center', alpha: P(S, 2, 0, 0.35) });
          g.text('averaged over all locus pairs', 1010, 570, { size: 21, color: PAL.ink3, align: 'center', alpha: P(S, 2, 0, 0.45) });
          g.math('g_{2} = \\text{' + D.A.est.toFixed(3) + '}', 1010, 650, { size: 40, color: COL, align: 'center', alpha: P(S, 2, 0, 0.7) });
          g.text('95% CI ' + D.A.lo.toFixed(3) + ' to ' + D.A.hi.toFixed(3), 1010, 694, { size: 22, role: 'mono', color: PAL.ink2, align: 'center', alpha: P(S, 2, 0, 0.75) });
          g.text('> 0  →  F varies', 1010, 744, { size: 24, color: PAL.moss, align: 'center', alpha: P(S, 2, 0, 0.85) });
        });
        // ---- scatter: het(half A) vs het(half B); reshuffle splits; beat 3 morphs to population B
        const aS = split * (S.at(2) ? 1 : 0);
        if (aS > 0) {
          const toB = S.io(3, 1.6, 0.2);
          const Sx = g.axes({ x: 860, y: 340, w: 400, h: 400, xmin: 0.08, xmax: 0.52, ymin: 0.08, ymax: 0.52, progress: aS, xticks: [0.1, 0.3, 0.5].map((v) => ({ v, l: v.toFixed(1) })), yticks: [0.1, 0.3, 0.5].map((v) => ({ v, l: v.toFixed(1) })) });
          g.withAlpha(aS, () => {
            g.text('het, half A', Sx.x + Sx.w, Sx.y + Sx.h + 60, { size: 22, color: PAL.lagoon, align: 'right' });
            g.text('het, half B', Sx.x - 14, Sx.y - 26, { size: 22, color: PAL.rose });
            // which split is showing (reshuffle every ~1.6 s during the scatter phase, before beat 3)
            const ts = t - sent(S, 2, 1, 0.3); const nSp = 3; const k = clamp(Math.floor(ts / 1.7), 0, nSp - 1); const u = ease.inOut(clamp((ts - k * 1.7) / 0.6));
            const curA = D.A.splits[k], prvA = D.A.splits[Math.max(0, k - 1)], sp = (k ? u : 1);
            const curB = D.B.splits[0];
            for (let i = 0; i < n; i++) {
              let x = lerp(prvA.xs[i], curA.xs[i], sp), y = lerp(prvA.ys[i], curA.ys[i], sp);
              x = lerp(x, curB.xs[i], toB); y = lerp(y, curB.ys[i], toB);
              const inb = D.A.F[i] >= 0.25 && toB < 0.5;
              g.dot(Sx.X(x), Sx.Y(y), 6, inb ? COL : PAL.sand, clamp((ts + 0.6 - i * 0.012) / 0.4) * 0.95 + (toB > 0 ? 0.05 : 0), 2.2);
            }
            // regression line
            const cA = { b: lerp(prvA.b, curA.b, sp), mx: lerp(prvA.mx, curA.mx, sp), my: lerp(prvA.my, curA.my, sp), r: lerp(prvA.r, curA.r, sp) };
            const c = { b: lerp(cA.b, curB.b, toB), mx: lerp(cA.mx, curB.mx, toB), my: lerp(cA.my, curB.my, toB), r: lerp(cA.r, curB.r, toB) };
            const la = clamp((ts - 0.6) / 0.6);
            const fx = (x) => c.my + c.b * (x - c.mx); const x0 = 0.1, x1 = 0.5;
            g.line(Sx.X(x0), Sx.Y(fx(x0)), Sx.X(x1), Sx.Y(fx(x1)), { color: toB > 0.5 ? PAL.ink2 : PAL.lagoon, w: 3, alpha: la });
            g.math('r_{HHC} = \\text{' + c.r.toFixed(2).replace('-', '−') + '}', Sx.x + 20, Sx.y + 28, { size: 34, color: toB > 0.5 ? PAL.ink2 : PAL.lagoon, alpha: la });
            g.text('split ' + (k + 1) + ' of 3', Sx.x + Sx.w, Sx.y + 26, { size: 21, role: 'mono', color: PAL.ink3, align: 'right', alpha: la * (1 - toB) });
          });
        }
        // ================= beat 3: g2 ≈ 0 when F does not vary =================
        const a3 = S.p(3, 0.9, 0.2);
        if (a3 > 0) g.withAlpha(a3, () => {
          // CI plot replaces the grid
          const C = { x: 200, y: 380, w: 520, h: 260 };
          const lo = -0.006, hi = 0.036, X = (v) => C.x + (v - lo) / (hi - lo) * C.w;
          label(g, 'Identity disequilibrium · 95% CI', C.x, 300);
          g.line(X(0), C.y - 20, X(0), C.y + C.h, { color: PAL.ink3, w: 1.5, dash: [5, 6] });
          g.text('0', X(0), C.y + C.h + 30, { size: 19, color: PAL.ink3, align: 'center' });
          [0.01, 0.02, 0.03].forEach((v) => { g.line(X(v), C.y + C.h, X(v), C.y + C.h + 8, { color: PAL.ink2, w: 1.5 }); g.text(v.toFixed(2), X(v), C.y + C.h + 30, { size: 19, color: PAL.ink3, align: 'center' }); });
          g.line(C.x, C.y + C.h, C.x + C.w, C.y + C.h, { color: PAL.ink2, w: 2 });
          g.math('g_{2}', C.x + C.w + 12, C.y + C.h + 8, { size: 30 });
          const row = (pop, y, name, col, d) => { const pa = S.p(3, 0.8, d); g.withAlpha(pa, () => { g.line(X(pop.lo), y, X(lerp(pop.lo, pop.hi, pa)), y, { color: col, w: 4 }); g.line(X(pop.lo), y - 10, X(pop.lo), y + 10, { color: col, w: 3 }); g.line(X(pop.hi), y - 10, X(pop.hi), y + 10, { color: col, w: 3, alpha: pa >= 0.99 ? 1 : 0 }); g.dot(X(pop.est), y, 8, col, 1, 2.4); g.text(name, C.x, y - 26, { size: 23, color: col }); }); };
          row(D.A, C.y + 60, 'F varies', PAL.lagoon, 0.4);
          row(D.B, C.y + 180, 'F constant', PAL.ink2, 1.2);
          g.text('differences in F are noise', 1060, 880, { size: 26, role: 'display', italic: true, color: PAL.ink, align: 'center', alpha: S.p(3, 0.8, 3.6) });
          g.text('→ weak heterozygosity–fitness correlations', C.x, 760, { size: 23, color: PAL.ochre, alpha: P(S, 3, 0, 0.62) });
          g.pill('inbreedR', C.x, 840, { size: 26, color: PAL.moss, role: 'mono', alpha: P(S, 3, 1, 0.1) });
        });
      },
    },
    /* VISUAL BRIEF (inb-roh): Beat 0: a small loop pedigree (half-sib mating) at left; a founder
       chromosome segment (coloured) travels down BOTH sides of the loop and lands on both homologues of
       the offspring at the same position → the matched stretch glows as a run of homozygosity. Beat 1:
       the offspring's genome as ~ 10 chromosome pairs (bars) with ROH painted; a meter fills to F_ROH =
       fraction of genome in runs; pills "independent of allele frequencies", "captures drift inbreeding".
       Beat 2: tally counter → ~12.5% for a half-sib mating; runs are long. Beat 3: a plot of expected ROH
       length vs g (generations back to common ancestor): L = 100/(2g) cM, points for g = 1…10, with
       chromosome bars below showing long runs (recent) vs many short runs (ancient). Beat 4: scatter of
       F_ROH vs a fitness/realized-inbreeding axis tighter than pedigree F scatter (two panels side by side,
       stylized, labelled "illustrative"). */
    {
      id: 'inb-roh', title: 'Runs of homozygosity',
      beats: [
        { t: 'When an individual\'s parents share an ancestor, the individual can inherit the same chromosome segment twice, once through each parent. The result is a long run of homozygosity: the physical footprint of autozygosity.' },
        { t: 'The fraction of the genome inside such runs is F_ROH. It depends far less on allele frequencies or a reference sample, so it largely sidesteps the base-population problem, and it captures the drift inbreeding that F_IS misses.',
          s: 'The fraction of the genome inside such runs is F roh. It depends far less on allele frequencies or a reference sample, so it largely sidesteps the base-population problem, and it captures the drift inbreeding that F I S misses.' },
        { t: 'A half-sibling mating leaves, on average, one eighth of the genome in runs, and those runs are long, because only a few meioses separate the common ancestor from the individual.' },
        { t: 'Runs also carry a time stamp. A common ancestor g generations back leaves runs with an expected length of about 100 / 2g centimorgans. Recent inbreeding makes long runs; old background relatedness leaves many short ones.',
          s: 'Runs also carry a time stamp. A common ancestor g generations back leaves runs with an expected length of about one hundred over two g centimorgans. Recent inbreeding makes long runs; old background relatedness leaves many short ones.' },
        { t: 'In wild populations, F_ROH has tracked realized inbreeding better than pedigree F, because it measures what was actually inherited, not what the pedigree expects.',
          s: 'In wild populations, F roh has tracked realized inbreeding better than pedigree F, because it measures what was actually inherited, not what the pedigree expects.', pause: 0.6 },
      ],
      terms: [
        { beat: 0.6, term: 'Autozygosity', def: 'Homozygosity because both alleles are IBD copies of one ancestral allele (as opposed to alike in state by chance).' },
        { beat: 1.3, term: 'F_ROH', def: 'Proportion of the (autosomal) genome in runs of homozygosity above a length threshold; a realized, largely frequency-free measure of inbreeding.' },
        { beat: 3.4, term: 'ROH length and age', def: 'A common ancestor g generations back gives runs of expected length ≈ 100 / 2g cM: long runs = recent inbreeding, short runs = ancient.' },
      ],
      init() {
        const SH = shared(); const hs = SH.hs;
        // markers on chromosome 1 for the zoomed pair: alleles per founder copy from a per-marker frequency
        const r = rng(88); const NM = 110; const mk = [];
        for (let m = 0; m < NM; m++) { const pos = (m + 0.15 + 0.7 * r()) / NM; const pf = 0.25 + 0.5 * r(); const al = Array.from({ length: 6 }, () => (r() < pf ? 1 : 0)); mk.push({ pos, al }); }
        const at = (h, pos) => h[Math.min(h.length - 1, Math.floor(pos * h.length))];
        const off = hs.off; const markers = mk.map((q) => { const a = q.al[at(off[0][0], q.pos)], b = q.al[at(off[1][0], q.pos)]; return { pos: q.pos, het: a !== b }; });
        // 250 half-sib offspring: realized F_ROH (runs ≥ 0.5 cM) and run lengths
        const r2 = rng(5150); const Fs = [], lens = [];
        for (let k = 0; k < 250; k++) { const R = runsOf(halfSib(r2).off, 0.5); Fs.push(R.F); R.runs.forEach((q) => lens.push(q.len)); }
        const bins = new Array(14).fill(0); Fs.forEach((f) => { bins[Math.min(13, Math.floor(f / 0.025))]++; });
        // Realized vs pedigree F across pedigree types (unrelated, first cousins, half sibs, full sibs)
        const r3 = rng(616); const pts = [];
        const types = [[0, (rr) => [meiosis(rr, founder(0, 1)), meiosis(rr, founder(2, 3))]], [1 / 16, cousins], [1 / 8, (rr) => halfSib(rr).off], [1 / 4, fullSib]];
        types.forEach(([Fp, fn], k) => { for (let j = 0; j < 16; j++) { const ind = fn(r3); const real = runsOf(ind, 0).F; const roh = runsOf(ind, 2).F * (0.92 + 0.05 * r3()) + 0.012 * gauss(r3); /* 2 cM threshold + calling error */ pts.push({ Fp, real, roh: Math.max(0, roh), jit: (r3() - 0.5) }); } });
        return { hs, hsRuns: SH.hsRuns, old: SH.oldRuns, markers, Fs, bins, meanF: mean(Fs), meanLen: mean(lens), pts };
      },
      draw(g, t, S, D) {
        const ctx = g.ctx; const hs = D.hs;
        // ================= beat 0: a segment inherited twice =================
        const a0 = vis(S, 0, 1);
        const PP = { M1: [200, 330], CA: [430, 330], M2: [660, 330], H1: [315, 520], H2: [545, 520], O: [430, 710] };
        const pair = (x, y, ind, a, w = 150, h = 10) => { if (a <= 0) return; for (let k = 0; k < 2; k++) KIN.chrom(g, x - w / 2, y + k * (h + 5), w, hapSegs(ind[k][0]).map((q) => ({ a: q.a, b: q.b, color: fcol(q.lab) })), { h, alpha: a, progress: a }); };
        const tA = sent(S, 0, 0, 0.3), tB = sent(S, 0, 0, 0.62), tC = sent(S, 0, 0, 0.95);
        if (a0 > 0) g.withAlpha(a0, () => {
          label(g, 'Half-sibling mating', 160, 238);
          const pd = S.p(0, 1.2, 0.2);
          KIN.family(g, PP.M1, PP.CA, [PP.H1], { progress: pd }); KIN.family(g, PP.CA, PP.M2, [PP.H2], { progress: pd });
          KIN.family(g, PP.H1, PP.H2, [PP.O], { progress: S.p(0, 1.2, 0.9) });
          KIN.person(g, ...PP.M1, { sex: 'F', alpha: pd }); KIN.person(g, ...PP.M2, { sex: 'F', alpha: pd });
          KIN.person(g, ...PP.CA, { sex: 'M', alpha: pd, color: PAL.ochre, glow: PAL.ochre });
          KIN.person(g, ...PP.H1, { sex: 'M', alpha: S.p(0, 0.8, 0.7) }); KIN.person(g, ...PP.H2, { sex: 'F', alpha: S.p(0, 0.8, 0.7) });
          const roh = S.p(0, 0.8, sent(S, 0, 1, 0) - S.b(0));
          KIN.person(g, ...PP.O, { sex: 'U', alpha: S.p(0, 0.8, 1.2), inbred: roh > 0.5, color: roh > 0.5 ? COL : PAL.ink2 });
          g.text('common ancestor', PP.CA[0], PP.CA[1] - 44, { size: 21, color: PAL.ochre, align: 'center', alpha: pd });
          const CA = founder(0, 1), M1 = founder(2, 3), M2 = founder(4, 5);
          pair(PP.M1[0], PP.M1[1] + 42, M1, S.p(0, 0.8, 1.0)); pair(PP.CA[0], PP.CA[1] + 42, CA, S.p(0, 0.8, 1.0)); pair(PP.M2[0], PP.M2[1] + 42, M2, S.p(0, 0.8, 1.0));
          pair(PP.H1[0], PP.H1[1] + 42, hs.HS1, S.tp(tB, 0.6)); pair(PP.H2[0], PP.H2[1] + 42, hs.HS2, S.tp(tB, 0.6));
          pair(PP.O[0], PP.O[1] + 42, hs.off, S.tp(tC, 0.6));
          // travelling copies of the ancestor's segment (the one that ends up as the run)
          const run = D.hsRuns.runs.find((q) => q.c === 0); const rc = fcol(run.lab);
          const path = (a, b) => { const my = (a[1] + b[1]) / 2; return [[a[0], a[1] + 30], [a[0], my], [b[0], my], [b[0], b[1] - 30]]; };
          const trav = (pts, u) => { if (u <= 0 || u >= 1) return; let L = 0; const seg = []; for (let k = 1; k < pts.length; k++) { const d = Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); seg.push(d); L += d; } let tg = L * u, k = 0; while (k < seg.length - 1 && tg > seg[k]) { tg -= seg[k]; k++; } const f = tg / seg[k]; g.dot(lerp(pts[k][0], pts[k + 1][0], f), lerp(pts[k][1], pts[k + 1][1], f), 9, rc, 1, 3); };
          const u1 = clamp((t - tA) / (tB - tA)), u2 = clamp((t - tB) / (tC - tB));
          trav(path(PP.CA, PP.H1), ease.inOut(u1)); trav(path(PP.CA, PP.H2), ease.inOut(u1));
          trav(path(PP.H1, PP.O), ease.inOut(u2)); trav(path(PP.H2, PP.O), ease.inOut(u2));
          // ---- right: offspring chromosome 1, enlarged, with markers
          const zx = 770, zw = 430, zy = 520; const pz = S.tp(tC, 0.8);
          label(g, 'Offspring · chromosome 1', zx, 410, pz);
          g.withAlpha(pz, () => {
            for (let k = 0; k < 2; k++) KIN.chrom(g, zx, zy + k * 44, zw, hapSegs(hs.off[k][0]).map((q) => ({ a: q.a, b: q.b, color: fcol(q.lab) })), { h: 22 });
            g.text('paternal', zx + zw + 14, zy + 7, { size: 21, color: PAL.ink3 }); g.text('maternal', zx + zw + 14, zy + 51, { size: 21, color: PAL.ink3 });
            D.markers.forEach((m) => { const x = zx + m.pos * zw; g.line(x, zy + 14, x, zy + 30, { color: m.het ? PAL.ink : PAL.ink3, w: m.het ? 2.2 : 1.2, alpha: m.het ? 0.95 : 0.5 }); });
            g.text('heterozygous sites', zx, zy + 100, { size: 21, color: PAL.ink2 });
          });
          // the run
          if (roh > 0) {
            const x1 = zx + run.a * zw, x2 = zx + run.b * zw;
            g.glow((x1 + x2) / 2, zy + 22, (x2 - x1) * 0.55, COL, 0.25 * roh);
            g.rect(x1 - 4, zy - 18, x2 - x1 + 8, 80, { stroke: COL, w: 2.5, r: 8, alpha: roh });
            g.line(x1, zy - 34, x2, zy - 34, { color: COL, w: 2.5, alpha: roh }); g.line(x1, zy - 40, x1, zy - 28, { color: COL, w: 2.5, alpha: roh }); g.line(x2, zy - 40, x2, zy - 28, { color: COL, w: 2.5, alpha: roh });
            g.text('run of homozygosity · ' + run.len.toFixed(0) + ' cM', (x1 + x2) / 2, zy - 50, { size: 23, color: COL, align: 'center', alpha: roh });
            const pa = P(S, 0, 1, 0.6);
            g.text('autozygous', zx + zw / 2, zy + 190, { size: 40, role: 'display', italic: true, color: PAL.ink, align: 'center', alpha: pa });
            g.text('same ancestral segment, twice', zx + zw / 2, zy + 232, { size: 22, color: PAL.ink2, align: 'center', alpha: pa });
          }
        });
        // ================= beats 1–2: the whole genome and F_ROH =================
        const a1 = vis(S, 1, 3);
        const GX = 170, GW = 640, GY = 330, RH = 40;
        if (a1 > 0) g.withAlpha(a1, () => {
          label(g, 'Offspring genome · 12 autosomes', GX, 280);
          genome(g, GX, GY, GW, D.hsRuns.runs, { rowH: RH, h: 16, progress: S.p(1, 1.6, 0.2), colFn: () => COL });
          for (let c = 0; c < 12; c++) g.text(String(c + 1), GX - 16, GY + c * RH + 7, { size: 19, role: 'mono', color: PAL.ink3, align: 'right', alpha: S.p(1, 0.8, 0.3) });
          g.withAlpha(S.p(1, 0.8, 1.0), () => { g.rect(GX, GY + 12 * RH + 4, 30, 14, { fill: COL, r: 7 }); g.text('run of homozygosity', GX + 40, GY + 12 * RH + 17, { size: 21, color: PAL.ink2 }); });
        });
        const am = vis(S, 1, 2);
        if (am > 0) g.withAlpha(am, () => {
          const mx = 900, my0 = 780, mh = 400, sc = mh / 0.25; const fill = D.hsRuns.F * S.io(1, 1.8, 1.4);
          g.math('F_{ROH} = \\frac{\\sum L_{ROH}}{L_{genome}}', 870, 320, { size: 44, color: PAL.ink, alpha: S.p(1, 0.8, 0.6) });
          g.rect(mx, my0 - mh, 70, mh, { stroke: PAL.rule, w: 1.5, r: 6 });
          g.rect(mx, my0 - fill * sc, 70, fill * sc, { fill: U.rgba(COL, 0.85), r: 6 });
          [0, 0.125, 0.25].forEach((v) => { g.line(mx - 8, my0 - v * sc, mx, my0 - v * sc, { color: PAL.ink2, w: 1.5 }); g.text(v.toFixed(v ? 3 : 0), mx - 14, my0 - v * sc + 7, { size: 19, color: PAL.ink3, align: 'right' }); });
          g.text(fill.toFixed(3), mx + 84, my0 - fill * sc + 8, { size: 26, role: 'mono', color: COL });
          g.pill('largely frequency-free', 1050, 660, { size: 22, color: PAL.moss, alpha: P(S, 1, 1, 0.05) });
          g.pill('no base population needed', 1050, 720, { size: 22, color: PAL.moss, alpha: P(S, 1, 1, 0.45) });
          g.pill('sees drift inbreeding', 1050, 780, { size: 22, color: PAL.moss, alpha: P(S, 1, 1, 0.75) });
        });
        const a2 = vis(S, 2, 3);
        if (a2 > 0) g.withAlpha(a2, () => {
          const A = g.axes({ x: 920, y: 380, w: 360, h: 340, xmin: 0, xmax: 0.35, ymax: Math.max(...D.bins) * 1.15, progress: S.p(2, 1, 0.2), xticks: [0, 0.125, 0.25].map((v) => ({ v, l: v ? v.toFixed(3) : '0' })) });
          label(g, '250 half-sib offspring', 920, 330, S.p(2, 0.8, 0.2));
          g.math('\\text{realized }F_{ROH}', A.x + A.w, A.y + A.h + 62, { size: 26, color: PAL.ink2, align: 'right', alpha: S.p(2, 0.8, 0.4) });
          D.bins.forEach((c, k) => { const pb = S.p(2, 0.5, 0.6 + k * 0.08); const x0 = A.X(k * 0.025), x1 = A.X((k + 1) * 0.025); g.rect(x0 + 1.5, A.Y(c * pb), x1 - x0 - 3, A.Y(0) - A.Y(c * pb), { fill: U.rgba(COL, 0.7), r: 2 }); });
          const pm = S.p(2, 0.8, 2.6);
          g.line(A.X(D.meanF), A.Y(0), A.X(D.meanF), A.y - 6, { color: PAL.ink, w: 2, dash: [6, 5], alpha: pm });
          g.math('\\text{mean} = \\text{' + D.meanF.toFixed(3) + '} ≈ \\frac{1}{8}', A.X(D.meanF) + 12, A.y + 18, { size: 30, color: PAL.ink, alpha: pm });
          g.text('mean run ≈ ' + D.meanLen.toFixed(0) + ' cM: long', 920, 840, { size: 24, color: COL, alpha: S.p(2, 0.8, 4.6) });
        });
        // ================= beat 3: runs as a clock =================
        const a3 = vis(S, 3, 4);
        if (a3 > 0) g.withAlpha(a3, () => {
          const A = g.axes({ x: 200, y: 340, w: 470, h: 420, xmin: 0, xmax: 10.5, ymax: 55, progress: S.p(3, 1, 0.2), xticks: [1, 2, 4, 6, 8, 10].map((v) => ({ v, l: String(v) })), yticks: [0, 25, 50].map((v) => ({ v, l: String(v) })) });
          xTitle(g, A, 'generations to common ancestor, g', S.p(3, 0.8, 0.4)); yTitle(g, A, 'expected run length (cM)', S.p(3, 0.8, 0.4));
          const pc = P(S, 3, 1, 0.1, 1.6);
          g.plot(A, (x) => 100 / (2 * x), { from: 0.95, to: 10.3, color: COL, w: 3.5, progress: pc });
          for (let k = 1; k <= 10; k++) g.dot(A.X(k), A.Y(50 / k), 5.5, COL, P(S, 3, 1, 0.1 + k * 0.05), 2.2);
          g.math('L ≈ \\frac{100}{2g}\\;\\text{cM}', A.X(4.2), A.Y(42), { size: 44, color: COL, alpha: P(S, 3, 1, 0.45) });
          const ph = S.p(3, 0.8, sent(S, 3, 2, 0) - S.b(3));
          g.withAlpha(ph, () => { g.circle(A.X(2), A.Y(25), 13, { stroke: PAL.ink, w: 2 }); g.text('half-sib mating', A.X(2) + 20, A.Y(25) - 16, { size: 21, color: PAL.ink2 }); });
          // right: recent vs ancient
          const rx = 790, rw = 470;
          const pr = P(S, 3, 2, 0.0), po = P(S, 3, 2, 0.5);
          label(g, 'Recent inbreeding', rx, 360, pr, COL);
          genome(g, rx, 400, rw, D.hsRuns.runs.filter((q) => q.c < 5), { rowH: 30, h: 14, progress: pr, colFn: () => COL });
          g.text('few long runs', rx + rw, 390, { size: 22, color: COL, align: 'right', alpha: pr });
          label(g, 'Old background relatedness', rx, 610, po, PAL.lagoon);
          genome(g, rx, 650, rw, D.old.runs.filter((q) => q.c < 5), { rowH: 30, h: 14, progress: po, colFn: () => PAL.lagoon });
          g.text('many short runs', rx + rw, 640, { size: 22, color: PAL.lagoon, align: 'right', alpha: po });
        });
        // ================= beat 4: realized inbreeding, pedigree F vs F_ROH =================
        const a4 = S.p(4, 0.9);
        if (a4 > 0) g.withAlpha(a4, () => {
          const panel = (x, xlab, xf, d, col) => {
            const A = g.axes({ x, y: 340, w: 420, h: 420, xmin: -0.02, xmax: 0.42, ymin: -0.02, ymax: 0.42, progress: S.p(4, 1, d), xticks: [0, 0.2, 0.4].map((v) => ({ v, l: v.toFixed(1) })), yticks: [0, 0.2, 0.4].map((v) => ({ v, l: v.toFixed(1) })) });
            g.line(A.X(0), A.Y(0), A.X(0.4), A.Y(0.4), { color: PAL.ink3, w: 1.2, dash: [5, 6], alpha: S.p(4, 0.8, d + 0.4) });
            g.math(xlab, A.x + A.w, A.y + A.h + 62, { size: 32, color: col, align: 'right', alpha: S.p(4, 0.8, d + 0.3) });
            g.text('realized IBD', A.x - 14, A.y - 26, { size: 22, color: PAL.ink2, alpha: S.p(4, 0.8, d + 0.3) });
            D.pts.forEach((q, k) => g.dot(A.X(xf(q)), A.Y(q.real), 5, col, S.p(4, 0.4, d + 0.6 + k * 0.015) * 0.9, 2));
          };
          panel(200, 'F_{pedigree}', (q) => q.Fp + 0.008 * q.jit, 0.2, PAL.ink2);
          panel(800, 'F_{ROH}', (q) => q.roh, 2.4, COL);
          illus(g, 1220, 900, S.p(4, 0.8, 3));
        });
      },
    },
    /* VISUAL BRIEF (inb-roh-calls): Beat 0: callback diagram: ROH → "how related were the parents?"
       (arrow pointing up a pedigree), contradicting the "need relatedness first" reading. Beat 1: two
       genomes side by side: "random mating, long-term small Ne" (many short runs) vs "recent consanguinity" (few
       long runs); both total F_ROH similar; stacked bar partitioned by length classes (e.g. <2, 2–4, 4–8,
       8–16, >16 cM) shows the difference. Beat 2: calling artefacts: a chromosome with sparse uneven
       markers (RAD-like ticks); PLINK sliding window passes along; real long run breaks into fragments at
       a heterozygous error; a gap with no markers becomes a false run. Beat 3: tool cards: bcftools roh
       (HMM + genotype likelihoods + allele freqs), RZooRoH (age classes), ngsF-HMM / ROHan (low
       coverage), PLINK --homozyg (rule-based; tune window/density). Beat 4: data ladder: amplicon panel
       (✗ no ROH), RADseq (marginal), low-coverage WGS (good), WGS (ideal); chromosome-level reference
       icon. */
    {
      id: 'inb-roh-calls', title: 'Reading runs responsibly',
      beats: [
        { t: 'This is where the warnings in the literature on runs of homozygosity apply. They do not say that you must know relatedness before you look for runs. Runs are how you infer how related the parents were.' },
        { t: 'The first warning is about history. In a population that has long been small, short runs from old shared ancestry are abundant, even without recent consanguinity. Partition F_ROH into length classes instead of reporting a single total.',
          s: 'The first warning is about history. In a population that has long been small, short runs from old shared ancestry are abundant, even without recent consanguinity. Partition F roh into length classes instead of reporting a single total.' },
        { t: 'The second is about calling. PLINK\'s defaults were designed for dense human SNP arrays. With sparse or uneven markers such as RADseq, genotyping errors fragment real runs, and poorly covered regions become false runs.',
          s: 'The second is about calling. Plink\'s defaults were designed for dense human snip arrays. With sparse or uneven markers such as rad seq, genotyping errors fragment real runs, and poorly covered regions become false runs.' },
        { t: 'So choose the caller for the data. The bcftools roh command uses a hidden Markov model with genotype likelihoods and allele frequencies. RZooRoH partitions autozygosity into age classes. For low coverage, ngsF-HMM and ROHan work from genotype likelihoods. PLINK is fast, once its window and density settings match your marker spacing.',
          s: 'So choose the caller for the data. The B C F tools roh command uses a hidden Markov model with genotype likelihoods and allele frequencies. R Zoo Roh partitions autozygosity into age classes. For low coverage, N G S F H M M and Rohan work from genotype likelihoods. Plink is fast, once its window and density settings match your marker spacing.' },
        { t: 'Runs need a reference genome, ideally assembled to chromosomes, and dense, evenly spaced markers. High-coverage whole genomes are ideal, and low coverage works with likelihood-based callers. RADseq is marginal. An amplicon panel of a few hundred SNPs cannot detect runs at all.',
          s: 'Runs need a reference genome, ideally assembled to chromosomes, and dense, evenly spaced markers. High-coverage whole genomes are ideal, and low coverage works with likelihood-based callers. Rad seq is marginal. An amplicon panel of a few hundred snips cannot detect runs at all.', pause: 0.6 },
      ],
      terms: [
        { beat: 1.5, term: 'ROH length classes', def: 'Partitioning F_ROH by run length (e.g. < 2, 2–8, > 8 cM) to separate ancient background autozygosity from recent inbreeding.' },
        { beat: 3.2, term: 'ROH callers', def: 'bcftools roh (HMM, genotype likelihoods), RZooRoH (multi-class HMM by age), ngsF-HMM and ROHan (low coverage), PLINK --homozyg (sliding window).' },
      ],
      init() {
        const SH = shared();
        const cls = (runs) => { const c = [0, 0, 0, 0, 0]; runs.forEach((q) => { c[lenClass(q.len)] += q.len / GENOME; }); return c; };
        // ---- beat 2: a 60 cM stretch with one true 30 cM run (8–30 cM); sparse, uneven RAD-like markers with a
        // marker-free gap near 38–47 cM; one genotyping error (a false het) inside the true run. Naive rule: any
        // stretch of consecutive homozygous markers spanning ≥ 5 cM is a run, regardless of marker density.
        const r = rng(515); const mk = []; let x = 0;
        while (x < 60) { x += -Math.log(1 - r()) * 0.55 * (x > 38 && x < 47 ? 9 : 1); if (x < 60) mk.push(x); }
        const RUN = [8, 30];
        const err = mk.reduce((b, m, k) => (Math.abs(m - 19) < Math.abs(mk[b] - 19) ? k : b), 0);
        const geno = mk.map((m, k) => { const inRun = m >= RUN[0] && m <= RUN[1]; if (k === err) return 1; return inRun ? 0 : (r() < 0.35 ? 1 : 0); });
        // homozygous stretches between heterozygous markers, length ≥ 5 cM, ignoring how far apart markers are
        const calls = []; let s0 = null;
        for (let k = 0; k <= mk.length; k++) { const het = k === mk.length || geno[k] === 1; if (!het && s0 === null) s0 = k; if (het && s0 !== null) { const a = mk[s0], b = mk[k - 1]; if (b - a >= 5) calls.push([a, b]); s0 = null; } }
        return { hs: cls(SH.hsRuns.runs), old: cls(SH.oldRuns.runs), hsRuns: SH.hsRuns, oldRuns: SH.oldRuns, mk, geno, err, RUN, calls };
      },
      draw(g, t, S, D) {
        // ================= beat 0: runs → parental relatedness (not the other way round) =================
        const a0 = vis(S, 0, 1);
        if (a0 > 0) g.withAlpha(a0, () => {
          const L = 170, W = 620;
          label(g, 'Offspring genome', L, 470, S.p(0, 0.8, 0.3));
          genome(g, L, 520, W, D.hsRuns.runs.filter((q) => q.c < 9), { rowH: 30, h: 14, progress: S.p(0, 1.4, 0.4), colFn: () => COL });
          // pedigree above-right
          const pa = S.p(0, 0.8, 1.2); const F1 = [960, 320], M1 = [1180, 320], O = [1070, 520];
          KIN.family(g, F1, M1, [O], { progress: pa });
          KIN.person(g, ...F1, { sex: 'M', alpha: pa }); KIN.person(g, ...M1, { sex: 'F', alpha: pa }); KIN.person(g, ...O, { sex: 'U', alpha: pa, inbred: true, color: COL });
          // the wrong reading, struck out
          const pw = P(S, 0, 1, 0.0), px = P(S, 0, 1, 0.75);
          g.withAlpha(pw, () => {
            g.text('need relatedness first', 1070, 700, { size: 28, role: 'display', italic: true, color: PAL.ink2, align: 'center' });
            g.line(930, 690, 930 + 280 * px, 690, { color: COL, w: 3 });
          });
          // the right reading: arrow from runs up to the parents
          const pr = P(S, 0, 2, 0.0, 1.0);
          g.carrow(800, 560, 1040, 330, -0.25, { color: PAL.lagoon, w: 3, head: 16, progress: pr, alpha: pr });
          g.withAlpha(P(S, 0, 2, 0.4), () => {
            g.line(F1[0] + 26, F1[1], M1[0] - 26, M1[1], { color: PAL.lagoon, w: 4 });
            g.math('φ_{parents} = F_{offspring}', 1070, 270, { size: 34, color: PAL.lagoon, align: 'center' });
            g.text('runs infer relatedness', 1070, 790, { size: 28, role: 'display', italic: true, color: PAL.lagoon, align: 'center' });
          });
        });
        // ================= beat 1: same total, different history =================
        const a1 = vis(S, 1, 2);
        if (a1 > 0) g.withAlpha(a1, () => {
          const W = 470;
          const ph = P(S, 1, 1, 0.0), pr = P(S, 1, 1, 0.45);
          const lc = (q) => LENCOL[lenClass(q.len)];
          label(g, 'Long-term small population', 160, 262, ph, PAL.lagoon);
          genome(g, 160, 300, W, D.oldRuns.runs, { rowH: 28, h: 13, progress: ph, colFn: (q) => (S.since(1) > sent(S, 1, 2, 0) - S.b(1) ? lc(q) : PAL.lagoon) });
          label(g, 'Recent consanguinity', 700, 262, pr, COL);
          genome(g, 700, 300, W, D.hsRuns.runs, { rowH: 28, h: 13, progress: pr, colFn: (q) => (S.since(1) > sent(S, 1, 2, 0) - S.b(1) ? lc(q) : COL) });
          // totals
          const pt = P(S, 1, 1, 0.8);
          const tot = (c) => c.reduce((a, b) => a + b, 0);
          g.math('F_{ROH} = \\text{' + tot(D.old).toFixed(3) + '}', 160, 680, { size: 34, color: PAL.lagoon, alpha: pt });
          g.math('F_{ROH} = \\text{' + tot(D.hs).toFixed(3) + '}', 700, 680, { size: 34, color: COL, alpha: pt });
          // partitioned bars
          const pp = P(S, 1, 2, 0.05, 1.2); const sc = 470 / 0.14;
          const bar = (x, c, y) => { let acc = 0; c.forEach((v, k) => { const w = v * sc * pp; g.rect(x + acc, y, Math.max(0, w - 2), 34, { fill: LENCOL[k], r: 3, alpha: pp }); acc += v * sc * pp; }); };
          bar(160, D.old, 730); bar(700, D.hs, 730);
          g.withAlpha(P(S, 1, 2, 0.3), () => { g.text('run length (cM)', 160, 832, { size: 21, color: PAL.ink3 }); LENLAB.forEach((s, k) => { const x = 340 + k * 130; g.rect(x, 816, 22, 22, { fill: LENCOL[k], r: 3 }); g.text(s, x + 30, 834, { size: 21, color: PAL.ink2 }); }); });
        });
        // ================= beat 2: calling artefacts =================
        const a2 = vis(S, 2, 3);
        if (a2 > 0) g.withAlpha(a2, () => {
          const X0 = 170, W = 1080, X = (cm) => X0 + cm / 60 * W;
          const pd = P(S, 2, 1, 0.0);
          // dense array (top)
          label(g, 'Dense SNP array', X0, 300, pd);
          g.withAlpha(pd, () => { for (let k = 0; k < 240; k++) { const cm = (k + 0.5) / 4; g.line(X(cm), 330, X(cm), 352, { color: PAL.ink3, w: 1.2 }); } KIN.chrom(g, X0, 380, W, [{ a: D.RUN[0] / 60, b: D.RUN[1] / 60, color: COL }], { h: 16 }); g.text('true run', X((D.RUN[0] + D.RUN[1]) / 2), 412 + 0, { size: 21, color: COL, align: 'center' }); });
          // sparse RAD-like (bottom)
          const ps = P(S, 2, 2, 0.05);
          label(g, 'Sparse, uneven markers', X0, 500, ps);
          const yM = 560;
          g.withAlpha(ps, () => {
            g.line(X0, yM, X0 + W, yM, { color: PAL.ink3, w: 1.5 });
            D.mk.forEach((m, k) => { const het = D.geno[k] === 1; const isErr = k === D.err; g.line(X(m), yM - 14, X(m), yM + 14, { color: isErr ? COL : het ? PAL.ink : PAL.ink3, w: het ? 2.6 : 1.4 }); });
            g.text('no markers', X(42.5), yM - 26, { size: 21, color: PAL.ink3, align: 'center' });
          });
          // sliding window
          const sw = S.lin(2, 5.0, sent(S, 2, 2, 0.05) - S.b(2));
          if (sw > 0 && sw < 1) { const wx = X(sw * 56); g.rect(wx, yM - 30, X(4) - X0, 60, { stroke: PAL.ochre, w: 2, r: 6, alpha: 0.9 }); g.text('window', wx + (X(4) - X0) / 2, yM + 52, { size: 21, color: PAL.ochre, align: 'center' }); }
          // calls appear behind the window
          const yC = 650;
          D.calls.forEach(([a, b], k) => { const done = sw * 56 >= b - 2 || sw >= 1; const pc = done ? 1 : 0; if (!pc) return; const isFalse = a > 33; g.rect(X(a), yC - 9, X(b) - X(a), 18, { fill: U.rgba(isFalse ? PAL.ochre : COL, 0.9), r: 9 }); });
          const tSw = S.b(2) + sent(S, 2, 2, 0.05) - S.b(2), atCM = (cm) => tSw + 5.0 * clamp((cm + 2) / 56);
          g.text('called runs', X0, yC + 7, { size: 21, color: PAL.ink2, align: 'left', alpha: S.tp(atCM(10), 0.6) });
          g.withAlpha(S.tp(atCM(D.RUN[1]), 0.6), () => {
            g.line(X(D.mk[D.err]), yM + 18, X(D.mk[D.err]), yC - 14, { color: COL, w: 1.5, dash: [4, 5] });
            g.text('one error → fragmented', X(D.mk[D.err]), yC + 52, { size: 22, color: COL, align: 'center' });
          });
          g.text('gap → false run', X(42.5), yC + 52, { size: 22, color: PAL.ochre, align: 'center', alpha: S.tp(atCM(48), 0.6) });
        });
        // ================= beat 3: tool cards =================
        const a3 = vis(S, 3, 4);
        if (a3 > 0) g.withAlpha(a3, () => {
          label(g, 'Choose the caller for the data', 160, 262, S.p(3, 0.8));
          const cards = [
            ['bcftools roh', 'HMM · genotype likelihoods + allele freqs', PAL.lagoon, P(S, 3, 1, 0.0)],
            ['RZooRoH', 'multi-class HMM · ROH age classes', PAL.heather, P(S, 3, 2, 0.0)],
            ['ngsF-HMM · ROHan', 'low coverage · genotype likelihoods', PAL.moss, P(S, 3, 3, 0.0)],
            ['PLINK --homozyg', 'sliding window · tune window and density', PAL.ochre, P(S, 3, 4, 0.0)],
          ];
          cards.forEach(([ti, no, col, a], k) => { const y = 300 + k * 140; KIN.card(g, 160 + (1 - a) * 30, y, 640, ti, no, { color: col, alpha: a, h: 108, size: 30 }); });
          // RZooRoH age-class mini plot
          const pz = P(S, 3, 2, 0.1);
          g.withAlpha(pz, () => {
            const x0 = 880, y0 = 400; const cl = ['R = 2', '4', '8', '16', '32', '64']; const vals = [0.02, 0.05, 0.015, 0.01, 0.02, 0.03];
            label(g, 'Autozygosity by age class', x0, y0 - 80, 1);
            vals.forEach((v, k) => { const h = v * 1800 * pz; g.rect(x0 + k * 62, y0 + 100 - h, 44, h, { fill: U.rgba(PAL.heather, 0.85), r: 3 }); g.text(cl[k], x0 + k * 62 + 22, y0 + 128, { size: 19, color: PAL.ink3, align: 'center' }); });
            g.text('recent', x0, y0 + 164, { size: 21, color: PAL.ink2 }); g.text('ancient', x0 + 6 * 62 - 18, y0 + 164, { size: 21, color: PAL.ink2, align: 'right' });
            illus(g, x0 + 6 * 62 - 18, y0 + 196);
          });
        });
        // ================= beat 4: data ladder =================
        const a4 = S.p(4, 0.9);
        if (a4 > 0) g.withAlpha(a4, () => {
          label(g, 'What data can see runs', 160, 262, 1);
          // reference genome
          const pr = P(S, 4, 0, 0.0);
          g.withAlpha(pr, () => {
            for (let k = 0; k < 6; k++) g.rect(160 + k * 26, 316, 16, 120 - k * 14, { fill: U.rgba(PAL.sand, 0.55), r: 8 });
            g.text('chromosome-level reference', 330, 360, { size: 24, color: PAL.sand });
            g.text('dense, evenly spaced markers', 330, 400, { size: 24, color: PAL.sand, alpha: P(S, 4, 0, 0.6) });
          });
          const rows = [
            ['High-coverage WGS', 'ideal', PAL.moss, 2400, 0, 1, 0.1],
            ['Low-coverage WGS', 'good · likelihood callers', PAL.moss, 600, 0, 1, 0.55],
            ['RADseq', 'marginal', PAL.ochre, 80, 1, 2, 0.0],
            ['Amplicon panel', 'cannot detect runs', COL, 10, 1, 3, 0.0],
          ];
          rows.forEach(([nm, verdict, col, dens, kk, ss, f], k) => {
            const sIdx = k < 2 ? 1 : k === 2 ? 2 : 3; const a = P(S, 4, sIdx, f); const y = 500 + k * 100;
            g.withAlpha(a, () => {
              g.text(nm, 160, y + 8, { size: 26, color: PAL.ink });
              const x0 = 480, W = 520; g.line(x0, y, x0 + W, y, { color: PAL.ink3, w: 1.5 });
              const r = rng(31 + k); const n = Math.min(dens, 260);
              for (let j = 0; j < n; j++) { const u = dens > 260 ? (j + 0.5) / n : (k === 2 ? Math.min(1, Math.pow(r(), 1.6)) : r()); g.line(x0 + u * W, y - 10, x0 + u * W, y + 10, { color: col, w: dens > 260 ? 1 : 1.6, alpha: k === 1 ? 0.35 + 0.35 * r() : 0.8 }); }
              const ok = k < 2 ? '✓' : k === 2 ? '~' : '✗';
              g.text(ok, 1040, y + 10, { size: 32, color: col, align: 'center', weight: 600 });
              g.text(verdict, 1070, y + 8, { size: 22, color: col });
            });
          });
        });
      },
    },
  ],
});
})();
