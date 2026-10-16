/* Shared visual vocabulary for The Kinship Theater (not a chapter).
 * Every chapter uses the same glyphs for individuals, alleles, pedigrees and chromosomes,
 * so the language stays consistent from scene to scene. Exposed as window.KIN. */
(function () {
const { PAL, U, Theater } = window; const { clamp, lerp, ease } = U;

// Founder-allele colours: each ancestral allele copy gets its own pigment.
const FOUNDER = [PAL.heather, PAL.ochre, PAL.lagoon, PAL.coral, PAL.moss, PAL.rose, PAL.sand, PAL.mint];
// Sex colours used whenever sex matters (rel-sexbias, pedigrees with sex).
const SEX = { F: PAL.rose, M: PAL.lagoon };

const KIN = {
  FOUNDER, SEX,
  // visibility envelope: fade in at beat k0, out at beat k1 (optional)
  vis: (S, k0, k1, d = 0.8) => S.p(k0, d) * (k1 === undefined ? 1 : 1 - S.p(k1, 0.6)),
  // small-caps panel label
  label: (g, s, x, y, a = 1, col = PAL.ink3, align = 'left') => g.text(String(s).toUpperCase(), x, y, { size: 17, weight: 600, color: col, ls: 2.6, alpha: a, align }),

  /* An individual. Pedigree convention: square = male, circle = female, diamond = unknown sex.
     o: { sex:'M'|'F'|'U', r, color (outline), fill, alpha, alleles:[c1,c2] (two bead colours drawn under the glyph),
          inbred:bool (draws a small inner ring), label:'i' (italic math label to the right) } */
  person(g, x, y, o = {}) {
    const { sex = 'U', r = 26, color = PAL.ink2, fill = 'rgba(11,22,24,0.92)', alpha = 1, w = 2.4 } = o;
    if (alpha <= 0) return;
    g.withAlpha(alpha, () => {
      if (o.glow) g.glow(x, y, r * 2.2, o.glow, 0.35);
      if (sex === 'M') g.rect(x - r, y - r, 2 * r, 2 * r, { fill, stroke: color, w, r: 4 });
      else if (sex === 'F') g.circle(x, y, r, { fill, stroke: color, w });
      else { g.poly([[x, y - r * 1.2], [x + r * 1.2, y], [x, y + r * 1.2], [x - r * 1.2, y]], { fill, color, w, close: true }); }
      if (o.inbred) g.circle(x, y, r * 0.55, { stroke: PAL.coral, w: 2, alpha: 0.9 });
      if (o.alleles) KIN.alleles(g, x, y, o.alleles, { size: r * 0.42 });
      if (o.label) g.math(o.label, x + r + 10, y + 10, { size: Math.max(26, r * 0.95), color: o.labelColor || PAL.ink2 });
    });
  },
  // Two allele beads side by side, centred at (x, y). cols: [c1, c2]; null = empty slot.
  alleles(g, x, y, cols, o = {}) {
    const s = o.size || 11, gap = s * 1.25;
    cols.forEach((c, k) => { if (!c) return; const xx = x + (k ? gap : -gap) * 0.85; g.dot(xx, y, s, c, o.alpha ?? 1, o.halo ?? 1.8); });
  },
  // One allele bead (luminous), optionally with a letter (allelic state) on it.
  bead(g, x, y, color, o = {}) {
    const s = o.size || 12; g.dot(x, y, s, color, o.alpha ?? 1, o.halo ?? 2);
    if (o.letter) g.text(o.letter, x, y + s * 0.42, { size: s * 1.25, weight: 600, color: PAL.bg, align: 'center', alpha: o.alpha ?? 1 });
  },
  /* Pedigree connector: mating line between parents a,b; drop to sibship bar; drops to children.
     a,b: [x,y] of the two parents; kids: [[x,y],...]; o: {color, w, alpha, progress, r (glyph radius)} */
  family(g, a, b, kids, o = {}) {
    const { color = PAL.ink3, w = 2, alpha = 1, progress = 1, r = 26 } = o; if (alpha <= 0 || progress <= 0) return;
    const p1 = clamp(progress * 3), p2 = clamp(progress * 3 - 1), p3 = clamp(progress * 3 - 2);
    const my = (a[1] + b[1]) / 2, mx = (a[0] + b[0]) / 2;
    const ax = a[0] + Math.sign(b[0] - a[0]) * r, bx = b[0] - Math.sign(b[0] - a[0]) * r;
    g.line(ax, a[1], bx, b[1], { color, w, alpha, progress: p1 });
    if (!kids.length) return;
    const sibY = (my + Math.min(...kids.map((k) => k[1]))) / 2 + r * 0.2;
    g.line(mx, my, mx, sibY, { color, w, alpha, progress: p2 });
    const xs = kids.map((k) => k[0]); const lo = Math.min(mx, ...xs), hi = Math.max(mx, ...xs);
    g.line(mx, sibY, lo, sibY, { color, w, alpha, progress: p2 }); g.line(mx, sibY, hi, sibY, { color, w, alpha, progress: p2 });
    for (const k of kids) g.line(k[0], sibY, k[0], k[1] - r, { color, w, alpha, progress: p3 });
  },
  // Single parent-to-child line (used when only one parent is drawn), orthogonal elbow.
  link(g, a, b, o = {}) {
    const { color = PAL.ink3, w = 2, alpha = 1, progress = 1, r = 26 } = o; const my = (a[1] + b[1]) / 2;
    g.poly([[a[0], a[1] + r], [a[0], my], [b[0], my], [b[0], b[1] - r]], { color, w, alpha, progress });
  },
  /* A chromosome drawn as a rounded bar. segs: [{a, b, color, alpha}] in 0–1 units along the bar.
     o: {base (bar colour), h, alpha, progress (left-to-right reveal), outline} */
  chrom(g, x, y, w, segs = [], o = {}) {
    const { h = 18, base = 'rgba(238,231,215,0.14)', alpha = 1, progress = 1 } = o; if (alpha <= 0) return;
    const W = w * clamp(progress); if (W <= 1) return;
    g.withAlpha(alpha, () => {
      g.clip(x, y - h / 2 - 2, W, h + 4, () => {
        g.rect(x, y - h / 2, w, h, { fill: base, r: h / 2 });
        for (const s of segs) { const a = clamp(s.a), b = clamp(s.b); if (b <= a) continue; g.rect(x + a * w, y - h / 2, (b - a) * w, h, { fill: U.rgba(s.color, s.alpha ?? 0.92), r: Math.min(h / 2, (b - a) * w / 2) }); }
      });
      if (o.outline) g.rect(x, y - h / 2, w, h, { stroke: o.outline, w: 1.5, r: h / 2 });
    });
  },
  // A rounded "tool card": title (mono) + one-line note. Returns height.
  card(g, x, y, w, title, note, o = {}) {
    const { color = PAL.ink, alpha = 1, h = 92, size = 26 } = o; if (alpha <= 0) return h;
    g.withAlpha(alpha, () => {
      g.rect(x, y, w, h, { fill: 'rgba(18,36,38,0.82)', stroke: U.rgba(color, 0.55), w: 1.5, r: 10 });
      g.rect(x, y + 12, 4, h - 24, { fill: color, r: 2 });
      g.text(title, x + 24, y + 38, { size, role: 'mono', color });
      if (note) g.wrap(note, x + 24, y + 70, w - 44, { size: 21, color: PAL.ink2, lh: 1.25 });
    });
    return h;
  },
  // Placeholder used before a scene is animated.
  pending(g, t, S) {
    const sc = S.scene; const L = sc.terms && sc.terms.length ? 1250 : 1760;
    g.rect(80, 230, L, 660, { stroke: PAL.rule, w: 1.5, r: 12, dash: [8, 10] });
    g.text('(animation pending)', 80 + L / 2, 560, { size: 30, role: 'display', italic: true, color: PAL.ink3, align: 'center' });
    const b = Math.min(S.n - 1, Math.max(0, sc.timing.beats.findIndex((bb) => t < bb.end + 0.75)));
    g.text('beat ' + (b < 0 ? S.n - 1 : b), 80 + L / 2, 610, { size: 22, role: 'mono', color: PAL.ink3, align: 'center' });
  },
};
window.KIN = KIN;
})();
