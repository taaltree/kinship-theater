/* The Ecological Theater — deterministic canvas engine.
 * Every frame is a pure function of time T, so the same code drives the
 * interactive player, frame-exact MP4 rendering, and still previews.
 * Chapter files call Theater.chapter({...}); see ENGINE_GUIDE.md. */
(function (root) {
'use strict';

const W = 1920, H = 1080;

// Palette: deep field-station slate with pigment accents.
const PAL = {
  bg: '#0B1618', bg2: '#10201F', panel: '#122426',
  ink: '#EEE7D7', ink2: '#AEB8B1', ink3: '#6F7F7C',
  rule: 'rgba(238,231,215,0.18)', faint: 'rgba(238,231,215,0.07)',
  moss: '#9CC77E', ochre: '#E8B44A', coral: '#E8735A', lagoon: '#5FC0D2',
  heather: '#B49CE6', rose: '#E58FB0', sand: '#D8C49B', mint: '#7FD6B0',
};
const SPECIES = [PAL.moss, PAL.ochre, PAL.lagoon, PAL.coral, PAL.heather, PAL.rose, PAL.sand, PAL.mint];

const FONTS = {
  display: '"Instrument Serif", "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
  sans: '"IBM Plex Sans", "Avenir Next", "Segoe UI", "Helvetica Neue", Arial, sans-serif',
  math: '"STIX Two Text", "Times New Roman", Times, serif',
  mono: '"IBM Plex Mono", "SF Mono", Menlo, Consolas, monospace',
};

// Layout: header band on top, stage left, lexicon rail right, caption band at bottom.
const LAYOUT = {
  stage: { x: 80, y: 200, w: 1250, h: 720 },
  full: { x: 80, y: 200, w: 1760, h: 720 },
  rail: { x: 1392, y: 206, w: 448, h: 714 },
  capY: 944,
};

// Timing rules shared by the estimator and the audio builder.
const TIMING_RULES = { lead: 1.1, tail: 1.3, gapSentence: 0.32, gapBeat: 0.75, wps: 2.55 };

/* ------------------------------------------------------------------ utils */
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const inv = (a, b, x) => (x - a) / (b - a);
const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
const ease = {
  lin: (t) => clamp(t),
  out: (t) => 1 - Math.pow(1 - clamp(t), 3),
  out2: (t) => 1 - Math.pow(1 - clamp(t), 2),
  in: (t) => Math.pow(clamp(t), 3),
  inOut: (t) => { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
  outBack: (t) => { t = clamp(t); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
};
function rng(seed) {
  let a = (seed >>> 0) || 1;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(r) { let u = 0, v = 0; while (u === 0) u = r(); while (v === 0) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function hash3(i, j, s) {
  let h = (Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}
function noise1(x, seed = 0) { const i = Math.floor(x), f = x - i; return lerp(hash3(i, 0, seed), hash3(i + 1, 0, seed), smooth(f)) * 2 - 1; }
function noise2(x, y, seed = 0) {
  const i = Math.floor(x), j = Math.floor(y), fx = smooth(x - i), fy = smooth(y - j);
  const a = hash3(i, j, seed), b = hash3(i + 1, j, seed), c = hash3(i, j + 1, seed), d = hash3(i + 1, j + 1, seed);
  return lerp(lerp(a, b, fx), lerp(c, d, fx), fy) * 2 - 1;
}
function fbm2(x, y, seed = 0, oct = 4) { let s = 0, a = 0.5, f = 1; for (let k = 0; k < oct; k++) { s += a * noise2(x * f, y * f, seed + k * 17); f *= 2; a *= 0.5; } return s; }
function hex2rgb(h) { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map((c) => c + c).join(''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgba(hex, a) { if (hex.startsWith('rgb')) return hex; const [r, g, b] = hex2rgb(hex); return `rgba(${r},${g},${b},${a})`; }
function mix(h1, h2, t) { const a = hex2rgb(h1), b = hex2rgb(h2); const c = a.map((v, k) => Math.round(lerp(v, b[k], clamp(t)))); return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join(''); }
function hsl(h, s, l, a = 1) { return `hsla(${h},${s}%,${l}%,${a})`; }
function fmt(x, d = 2) { return Number(x).toFixed(d); }

const U = { clamp, lerp, inv, smooth, ease, rng, gauss, noise1, noise2, fbm2, hash3, hex2rgb, rgba, mix, hsl, fmt };

/* ------------------------------------------------------------ sentences */
// Split on sentence ends, but not after initials ("E. O. Wilson", "G. fortis") or common abbreviations.
function splitSentences(text) {
  const out = []; let start = 0;
  const re = /([.?!])["”’)]?\s+(?=[A-Z0-9“"(\u0370-\u03FF])/g; let m;
  while ((m = re.exec(text))) {
    const before = text.slice(start, m.index + 1);
    const lastTok = before.trim().split(/\s+/).pop();
    if (/^[A-Z]\.$/.test(lastTok) || /^(e\.g|i\.e|cf|vs|et al|Dr|St|No|approx|ca)\.$/i.test(lastTok) || /^(al)\.$/.test(lastTok)) continue;
    out.push(text.slice(start, m.index + m[0].length).trim()); start = m.index + m[0].length;
  }
  const rest = text.slice(start).trim(); if (rest) out.push(rest);
  return out;
}
function wordCount(s) { return s.split(/\s+/).filter(Boolean).length; }

/* --------------------------------------------------------------- canvas */
const isBrowser = typeof document !== 'undefined';
function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}

const glowCache = new Map();
function glowSprite(color) {
  let s = glowCache.get(color); if (s) return s;
  s = makeCanvas(128, 128); const c = s.getContext('2d');
  const gr = c.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, rgba(color, 1)); gr.addColorStop(0.25, rgba(color, 0.55)); gr.addColorStop(0.6, rgba(color, 0.14)); gr.addColorStop(1, rgba(color, 0));
  c.fillStyle = gr; c.fillRect(0, 0, 128, 128); glowCache.set(color, s); return s;
}

/* ------------------------------------------------------- math typesetter */
// A small TeX-like layout: x_{i}, x^{2}, \frac{a}{b}, \hat{S}, \bar{x}, \text{...}, \ln, \sum, \alpha via unicode.
const GREEK = 'αβγδεζηθικλμνξπρστυφχψωΓΔΘΛΞΠΣΦΨΩ';
const UPGREEK = 'ΓΔΘΛΞΠΣΦΨΩ';
const MSYM = { cdot: '·', times: '×', approx: '≈', ge: '≥', le: '≤', geq: '≥', leq: '≤', neq: '≠', to: '→', infty: '∞', sum: 'Σ', prod: 'Π', partial: '∂', pm: '±', propto: '∝', in: '∈', minus: '−', sim: '∼', ell: 'ℓ', rightarrow: '→', gg: '≫', ll: '≪', prime: '′', lt: '<', gt: '>', star: '*', vert: '|', dots: '…', cdots: '⋯' };
const MFUN = ['ln', 'log', 'exp', 'max', 'min', 'lim', 'var', 'cov', 'E'];
const RELS = '=<>≤≥≈→∝≠∼≫≪';
const BINS = '+−±×·';

function mparse(src) {
  let i = 0;
  const raw = () => {
    while (src[i] === ' ') i++;
    if (src[i] !== '{') return '';
    let d = 0, j = i;
    for (; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}') { d--; if (d === 0) break; } }
    const s = src.slice(i + 1, j); i = j + 1; return s;
  };
  const arg = () => { while (src[i] === ' ') i++; if (src[i] === '{') { i++; return seq('}'); } const n = node(); return n ? [n] : []; };
  const node = () => {
    const c = src[i];
    if (c === undefined) return null;
    if (c === '{') { i++; return { t: 'grp', k: seq('}') }; }
    if (c === '\\') {
      let j = i + 1;
      if (/[A-Za-z]/.test(src[j])) { while (j < src.length && /[A-Za-z]/.test(src[j])) j++; } else j++;
      const cmd = src.slice(i + 1, j); i = j;
      if (cmd === 'frac') { const a = arg(), b = arg(); return { t: 'frac', a, b }; }
      if (cmd === 'hat' || cmd === 'bar' || cmd === 'tilde' || cmd === 'dot') return { t: 'acc', k: cmd, a: arg() };
      if (cmd === 'text' || cmd === 'mathrm' || cmd === 'rm') return { t: 'txt', s: raw() };
      if (cmd === 'mathbf' || cmd === 'bf') return { t: 'bold', s: raw() };
      if (cmd === ',') return { t: 'sp', w: 0.17 };
      if (cmd === ';') return { t: 'sp', w: 0.28 };
      if (cmd === 'quad') return { t: 'sp', w: 1 };
      if (cmd === '!') return { t: 'sp', w: -0.12 };
      if (cmd === ' ') return { t: 'sp', w: 0.25 };
      if (MFUN.includes(cmd)) return { t: 'txt', s: cmd, fn: true };
      if (cmd === 'sum' || cmd === 'prod') return { t: 'big', s: MSYM[cmd] };
      if (MSYM[cmd]) return { t: RELS.includes(MSYM[cmd]) ? 'rel' : BINS.includes(MSYM[cmd]) ? 'bin' : 'sym', s: MSYM[cmd] };
      return { t: 'txt', s: cmd };
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      let j = i; while (j < src.length && /[0-9.]/.test(src[j])) j++;
      const s = src.slice(i, j); i = j; return { t: 'num', s };
    }
    i++;
    if (c === ' ') return null;
    if (/[A-Za-z]/.test(c) || GREEK.includes(c)) return { t: 'var', s: c };
    if (c === '-') return { t: 'bin', s: '−' };
    if (RELS.includes(c)) return { t: 'rel', s: c };
    if (BINS.includes(c)) return { t: 'bin', s: c };
    return { t: 'sym', s: c };
  };
  const seq = (end) => {
    const out = [];
    while (i < src.length) {
      if (end && src[i] === end) { i++; break; }
      if (src[i] === '_' || src[i] === '^') {
        const k = src[i]; i++; const a = arg();
        let prev = out[out.length - 1];
        if (!prev || prev.t === 'sp') { prev = { t: 'sym', s: '' }; out.push(prev); }
        if (k === '_') prev.sub = a; else prev.sup = a;
        continue;
      }
      const n = node(); if (n) out.push(n);
    }
    return out;
  };
  return seq(null);
}
function mglyph(ctx, s, size, style) {
  const font = `${style} ${size}px ${FONTS.math}`;
  ctx.font = font; const w = ctx.measureText(s).width;
  return { w, asc: size * 0.7, desc: size * 0.2, draw(c, X, Y, col) { c.font = font; c.fillStyle = col; c.fillText(s, X, Y); } };
}
function mlayout(ctx, nodes, size) {
  const items = []; let x = 0, asc = size * 0.7, desc = size * 0.2;
  nodes.forEach((n, k) => {
    const b = mbox(ctx, n, size, k === 0);
    items.push({ x, b }); x += b.w; asc = Math.max(asc, b.asc); desc = Math.max(desc, b.desc);
  });
  return { w: x, asc, desc, draw(c, X, Y, col) { for (const it of items) it.b.draw(c, X + it.x, Y, col); } };
}
function mbox(ctx, n, size, first) {
  let b;
  switch (n.t) {
    case 'var': b = mglyph(ctx, n.s, size, UPGREEK.includes(n.s) ? '' : 'italic'); b.w += size * 0.04; b.italic = true; break;
    case 'num': b = mglyph(ctx, n.s, size, ''); break;
    case 'bold': b = mglyph(ctx, n.s, size, 'bold'); b.w += size * 0.03; break;
    case 'txt': b = mglyph(ctx, n.s, size, ''); if (n.fn) b.w += size * 0.12; break;
    case 'rel': case 'bin': {
      const g = mglyph(ctx, n.s, size, ''); const pad = first ? 0 : size * (n.t === 'rel' ? 0.3 : 0.22);
      const padR = size * (n.t === 'rel' ? 0.3 : 0.22);
      b = { w: g.w + pad + padR, asc: g.asc, desc: g.desc, draw(c, X, Y, col) { g.draw(c, X + pad, Y, col); } }; break;
    }
    case 'big': { const g = mglyph(ctx, n.s, size * 1.35, ''); b = { w: g.w + size * 0.12, asc: size * 0.95, desc: size * 0.3, draw(c, X, Y, col) { g.draw(c, X, Y + size * 0.12, col); } }; break; }
    case 'sp': b = { w: n.w * size, asc: 0, desc: 0, draw() {} }; break;
    case 'grp': b = mlayout(ctx, n.k, size); break;
    case 'frac': {
      const a = mlayout(ctx, n.a, size * 0.84), d = mlayout(ctx, n.b, size * 0.84);
      const w = Math.max(a.w, d.w) + size * 0.2, axis = size * 0.27, gap = size * 0.1, lw = Math.max(1.2, size * 0.045);
      b = {
        w: w + size * 0.12, asc: axis + gap + a.desc + a.asc, desc: -axis + gap + d.asc + d.desc,
        draw(c, X, Y, col) {
          const x0 = X + size * 0.06;
          c.fillStyle = col; c.fillRect(x0, Y - axis - lw / 2, w, lw);
          a.draw(c, x0 + (w - a.w) / 2, Y - axis - gap - a.desc, col);
          d.draw(c, x0 + (w - d.w) / 2, Y - axis + gap + d.asc, col);
        },
      };
      break;
    }
    case 'acc': {
      const a = mlayout(ctx, n.a, size); const k = n.k;
      b = {
        w: a.w, asc: a.asc + size * 0.2, desc: a.desc,
        draw(c, X, Y, col) {
          a.draw(c, X, Y, col);
          const cx = X + a.w * 0.56, top = Y - size * 0.78; c.strokeStyle = col; c.lineWidth = Math.max(1.2, size * 0.05); c.lineCap = 'round';
          c.beginPath();
          if (k === 'hat') { c.moveTo(cx - size * 0.15, top + size * 0.02); c.lineTo(cx, top - size * 0.11); c.lineTo(cx + size * 0.15, top + size * 0.02); }
          else if (k === 'bar') { c.moveTo(cx - size * 0.2, top - size * 0.04); c.lineTo(cx + size * 0.2, top - size * 0.04); }
          else if (k === 'tilde') { c.moveTo(cx - size * 0.18, top); c.quadraticCurveTo(cx - size * 0.09, top - size * 0.12, cx, top - size * 0.04); c.quadraticCurveTo(cx + size * 0.09, top + size * 0.05, cx + size * 0.18, top - size * 0.08); }
          else if (k === 'dot') { c.arc(cx, top - size * 0.03, size * 0.05, 0, Math.PI * 2); c.fillStyle = col; c.fill(); }
          c.stroke();
        },
      };
      break;
    }
    default: b = mglyph(ctx, n.s, size, '');
  }
  if (n.sup || n.sub) {
    const ss = size * 0.66;
    const sp = n.sup && mlayout(ctx, n.sup, ss), sb = n.sub && mlayout(ctx, n.sub, ss);
    const base = b, kern = base.italic ? size * 0.05 : 0;
    const supY = -Math.max(size * 0.4, base.asc - size * 0.28), subY = size * 0.24 + (sp ? size * 0.04 : 0);
    const w = base.w + Math.max(sp ? sp.w + kern : 0, sb ? sb.w : 0) + size * 0.04;
    b = {
      w, asc: Math.max(base.asc, sp ? -supY + sp.asc : 0), desc: Math.max(base.desc, sb ? subY + sb.desc : 0),
      draw(c, X, Y, col) {
        base.draw(c, X, Y, col);
        if (sp) sp.draw(c, X + base.w + kern - (base.italic ? size * 0.02 : 0), Y + supY, col);
        if (sb) sb.draw(c, X + base.w - (base.italic ? size * 0.06 : 0), Y + subY, col);
      },
    };
  }
  return b;
}
const mathCache = new Map();
function mathBox(ctx, expr, size) {
  const key = size + '|' + expr; let m = mathCache.get(key);
  if (!m) { m = mlayout(ctx, mparse(expr), size); mathCache.set(key, m); }
  return m;
}

/* ------------------------------------------------------- drawing helper */
function makeG(ctx) {
  const g = { ctx, W, H, PAL, FONTS, LAYOUT, SPECIES, U };
  g.font = (role = 'sans', size = 28, weight = 400, italic = false) => `${italic ? 'italic ' : ''}${weight} ${size}px ${FONTS[role] || role}`;
  const hasLS = isBrowser && typeof CanvasRenderingContext2D !== 'undefined' && 'letterSpacing' in CanvasRenderingContext2D.prototype;

  g.text = (str, x, y, o = {}) => {
    const { size = 28, role = 'sans', color = PAL.ink, align = 'left', base = 'alphabetic', alpha = 1, weight = 400, italic = false, ls = 0, maxW, shadow } = o;
    if (alpha <= 0) return 0;
    ctx.save(); ctx.globalAlpha *= alpha; ctx.font = g.font(role, size, weight, italic);
    ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = base;
    if (ls && hasLS) ctx.letterSpacing = ls + 'px';
    if (shadow) { ctx.shadowColor = shadow; ctx.shadowBlur = 12; }
    if (maxW) ctx.fillText(str, x, y, maxW); else ctx.fillText(str, x, y);
    const w = ctx.measureText(str).width; ctx.restore(); return w;
  };
  g.measure = (str, o = {}) => {
    const { size = 28, role = 'sans', weight = 400, italic = false, ls = 0 } = o;
    ctx.save(); ctx.font = g.font(role, size, weight, italic); if (ls && hasLS) ctx.letterSpacing = ls + 'px';
    const w = ctx.measureText(str).width; ctx.restore(); return w;
  };
  // Word-wrap text into a box. Returns total height. o.lh = line height multiplier.
  g.lines = (str, w, o = {}) => {
    const words = String(str).split(/\s+/); const lines = []; let cur = '';
    ctx.save(); ctx.font = g.font(o.role || 'sans', o.size || 28, o.weight || 400, o.italic);
    for (const wd of words) { const test = cur ? cur + ' ' + wd : wd; if (ctx.measureText(test).width > w && cur) { lines.push(cur); cur = wd; } else cur = test; }
    if (cur) lines.push(cur); ctx.restore(); return lines;
  };
  g.wrap = (str, x, y, w, o = {}) => {
    const size = o.size || 28, lh = (o.lh || 1.35) * size;
    const lines = g.lines(str, w, o);
    lines.forEach((ln, k) => g.text(ln, x, y + k * lh, o));
    return lines.length * lh;
  };
  g.math = (expr, x, y, o = {}) => {
    const { size = 40, color = PAL.ink, align = 'left', alpha = 1 } = o;
    const m = mathBox(ctx, expr, size); if (alpha <= 0) return m.w;
    let X = x; if (align === 'center') X = x - m.w / 2; else if (align === 'right') X = x - m.w;
    ctx.save(); ctx.globalAlpha *= alpha; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; m.draw(ctx, X, y, color); ctx.restore();
    return m.w;
  };
  g.mathW = (expr, size = 40) => mathBox(ctx, expr, size).w;

  const stroke = (o, defColor = PAL.ink) => {
    ctx.strokeStyle = o.color || defColor; ctx.lineWidth = o.w ?? 3; ctx.lineCap = o.cap || 'round'; ctx.lineJoin = 'round';
    if (o.dash) ctx.setLineDash(o.dash); else ctx.setLineDash([]);
    if (o.dashOffset) ctx.lineDashOffset = o.dashOffset;
  };
  g.line = (x1, y1, x2, y2, o = {}) => {
    const a = o.alpha ?? 1; if (a <= 0) return; const p = o.progress ?? 1; if (p <= 0) return;
    ctx.save(); ctx.globalAlpha *= a; stroke(o); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(lerp(x1, x2, p), lerp(y1, y2, p)); ctx.stroke(); ctx.restore();
  };
  // Polyline with partial-draw progress (by arc length). pts: [[x,y],...]
  g.poly = (pts, o = {}) => {
    const a = o.alpha ?? 1, p = o.progress ?? 1; if (a <= 0 || p <= 0 || pts.length < 2) return;
    ctx.save(); ctx.globalAlpha *= a;
    let n = pts.length, lastPt = null;
    if (p < 1) {
      let L = 0; const seg = []; for (let k = 1; k < n; k++) { const d = Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); seg.push(d); L += d; }
      let target = L * p, acc = 0, k = 0; for (; k < seg.length; k++) { if (acc + seg[k] >= target) break; acc += seg[k]; }
      const f = seg[k] ? (target - acc) / seg[k] : 0; n = k + 1;
      if (k < seg.length) lastPt = [lerp(pts[k][0], pts[k + 1][0], f), lerp(pts[k][1], pts[k + 1][1], f)];
    }
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let k = 1; k < n; k++) ctx.lineTo(pts[k][0], pts[k][1]); if (lastPt) ctx.lineTo(lastPt[0], lastPt[1]);
    if (o.close && p >= 1) ctx.closePath();
    if (o.fill) { ctx.fillStyle = o.fill; ctx.fill(); }
    if (o.color !== null && o.w !== 0) { stroke(o); ctx.stroke(); }
    ctx.restore();
    return lastPt || pts[n - 1];
  };
  g.arrowHead = (x, y, ang, size, color) => {
    ctx.save(); ctx.fillStyle = color; ctx.translate(x, y); ctx.rotate(ang);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-size, -size * 0.48); ctx.lineTo(-size * 0.72, 0); ctx.lineTo(-size, size * 0.48); ctx.closePath(); ctx.fill(); ctx.restore();
  };
  g.arrow = (x1, y1, x2, y2, o = {}) => {
    const a = o.alpha ?? 1, p = o.progress ?? 1; if (a <= 0 || p <= 0) return;
    const head = o.head ?? 16, col = o.color || PAL.ink; const ex = lerp(x1, x2, p), ey = lerp(y1, y2, p); const ang = Math.atan2(y2 - y1, x2 - x1);
    ctx.save(); ctx.globalAlpha *= a; stroke(o);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(ex - Math.cos(ang) * head * 0.6, ey - Math.sin(ang) * head * 0.6); ctx.stroke();
    g.arrowHead(ex, ey, ang, head, col); if (o.both) g.arrowHead(x1, y1, ang + Math.PI, head, col); ctx.restore();
  };
  // Curved arrow: bend = signed fraction of length for the control-point offset.
  g.carrow = (x1, y1, x2, y2, bend = 0.25, o = {}) => {
    const a = o.alpha ?? 1, p = o.progress ?? 1; if (a <= 0 || p <= 0) return;
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, dx = x2 - x1, dy = y2 - y1;
    const cx = mx - dy * bend, cy = my + dx * bend; const pts = [];
    for (let k = 0; k <= 40; k++) { const t = k / 40; pts.push([(1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * cx + t * t * x2, (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * cy + t * t * y2]); }
    const head = o.head ?? 15; const end = Math.floor(40 * p);
    const tip = g.poly(pts.slice(0, Math.max(2, end + 1)), { ...o, progress: 1 });
    if (p > 0.05 && end >= 1) { const q = pts[end], r = pts[Math.max(0, end - 2)]; g.withAlpha(a, () => g.arrowHead(q[0], q[1], Math.atan2(q[1] - r[1], q[0] - r[0]), head, o.color || PAL.ink)); }
    return tip;
  };
  g.circle = (x, y, r, o = {}) => {
    const a = o.alpha ?? 1; if (a <= 0 || r <= 0) return;
    ctx.save(); ctx.globalAlpha *= a; ctx.beginPath(); ctx.arc(x, y, r, o.a0 ?? 0, o.a1 ?? Math.PI * 2);
    if (o.fill) { ctx.fillStyle = o.fill; ctx.fill(); }
    if (o.stroke) { stroke({ ...o, color: o.stroke }); ctx.stroke(); }
    ctx.restore();
  };
  g.ellipse = (x, y, rx, ry, o = {}) => {
    const a = o.alpha ?? 1; if (a <= 0) return;
    ctx.save(); ctx.globalAlpha *= a; ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), o.rot || 0, 0, Math.PI * 2);
    if (o.fill) { ctx.fillStyle = o.fill; ctx.fill(); }
    if (o.stroke) { stroke({ ...o, color: o.stroke }); ctx.stroke(); }
    ctx.restore();
  };
  g.rect = (x, y, w, h, o = {}) => {
    const a = o.alpha ?? 1; if (a <= 0) return;
    ctx.save(); ctx.globalAlpha *= a; ctx.beginPath();
    if (o.r) ctx.roundRect(x, y, w, h, o.r); else ctx.rect(x, y, w, h);
    if (o.fill) { ctx.fillStyle = o.fill; ctx.fill(); }
    if (o.stroke) { stroke({ ...o, color: o.stroke }); ctx.stroke(); }
    ctx.restore();
  };
  g.glow = (x, y, r, color, alpha = 1) => {
    if (alpha <= 0 || r <= 0) return; ctx.save(); ctx.globalAlpha *= alpha; ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(glowSprite(color), x - r, y - r, 2 * r, 2 * r); ctx.restore();
  };
  // Luminous dot: core plus soft halo.
  g.dot = (x, y, r, color, alpha = 1, halo = 2.6) => {
    if (alpha <= 0) return; g.glow(x, y, r * halo, color, 0.55 * alpha); g.circle(x, y, r, { fill: color, alpha });
  };
  g.withAlpha = (a, fn) => { if (a <= 0) return; ctx.save(); ctx.globalAlpha *= a; fn(); ctx.restore(); };
  g.with = (fn) => { ctx.save(); fn(); ctx.restore(); };
  g.clip = (x, y, w, h, fn) => { ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); fn(); ctx.restore(); };
  // Small rounded label.
  g.pill = (str, x, y, o = {}) => {
    const size = o.size || 20, padX = size * 0.6, padY = size * 0.38; const w = g.measure(str, { size, weight: o.weight || 500, role: o.role || 'sans' }) + padX * 2; const h = size + padY * 2;
    let X = x; if (o.align === 'center') X = x - w / 2; else if (o.align === 'right') X = x - w;
    const a = o.alpha ?? 1;
    g.rect(X, y - h / 2, w, h, { r: h / 2, fill: o.fill || rgba(o.color || PAL.ink, 0.12), stroke: o.stroke, w: 1.5, alpha: a });
    g.text(str, X + padX, y + size * 0.36, { size, color: o.color || PAL.ink, weight: o.weight || 500, alpha: a, role: o.role || 'sans' });
    return w;
  };
  // Axes. Returns mapping {X(v), Y(v), x, y, w, h, x0, y0}. (x,y) = top-left of plotting area.
  g.axes = (o) => {
    const { x, y, w, h, xmin = 0, xmax = 1, ymin = 0, ymax = 1, progress = 1, color = PAL.ink2, alpha = 1, xlab, ylab, labSize = 26, logx = false, logy = false, arrows = true, xticks, yticks, tickSize = 19, grid = false } = o;
    const fx = logx ? (v) => (Math.log10(v) - Math.log10(xmin)) / (Math.log10(xmax) - Math.log10(xmin)) : (v) => (v - xmin) / (xmax - xmin);
    const fy = logy ? (v) => (Math.log10(v) - Math.log10(ymin)) / (Math.log10(ymax) - Math.log10(ymin)) : (v) => (v - ymin) / (ymax - ymin);
    const A = { x, y, w, h, X: (v) => x + fx(v) * w, Y: (v) => y + h - fy(v) * h, xmin, xmax, ymin, ymax };
    A.x0 = x; A.y0 = y + h;
    if (alpha > 0 && progress > 0) {
      g.withAlpha(alpha, () => {
        const p1 = clamp(progress * 2), p2 = clamp(progress * 2 - 1);
        if (grid) { for (const v of (xticks || [])) g.line(A.X(v.v ?? v), y, A.X(v.v ?? v), y + h, { color: PAL.faint, w: 1, alpha: p2 }); for (const v of (yticks || [])) g.line(x, A.Y(v.v ?? v), x + w, A.Y(v.v ?? v), { color: PAL.faint, w: 1, alpha: p2 }); }
        if (arrows) { g.arrow(x, y + h, x, y - 14, { color, w: 2.2, head: 13, progress: p1 }); g.arrow(x, y + h, x + w + 14, y + h, { color, w: 2.2, head: 13, progress: p1 }); }
        else { g.line(x, y + h, x, y, { color, w: 2.2, progress: p1 }); g.line(x, y + h, x + w, y + h, { color, w: 2.2, progress: p1 }); }
        if (xlab) { if (/[\\_^]/.test(xlab) || xlab.length <= 3) g.math(xlab, x + w + 8, y + h + labSize * 1.45, { size: labSize * 1.15, color: PAL.ink, align: 'right', alpha: p2 }); else g.text(xlab, x + w, y + h + labSize * 1.6, { size: labSize, color: PAL.ink2, align: 'right', alpha: p2 }); }
        if (ylab) { if (/[\\_^]/.test(ylab) || ylab.length <= 3) g.math(ylab, x - 14, y - 10, { size: labSize * 1.15, color: PAL.ink, align: 'right', alpha: p2 }); else g.with(() => { ctx.translate(x - labSize * 1.2, y); ctx.rotate(-Math.PI / 2); g.text(ylab, 0, 0, { size: labSize, color: PAL.ink2, align: 'right', alpha: p2 }); }); }
        for (const v of (xticks || [])) { const val = v.v ?? v, lab = v.l ?? String(v); g.line(A.X(val), y + h, A.X(val), y + h + 8, { color, w: 1.6, alpha: p2 }); g.text(lab, A.X(val), y + h + tickSize + 12, { size: tickSize, color: PAL.ink3, align: 'center', alpha: p2, role: v.math ? 'math' : 'sans' }); }
        for (const v of (yticks || [])) { const val = v.v ?? v, lab = v.l ?? String(v); g.line(x - 8, A.Y(val), x, A.Y(val), { color, w: 1.6, alpha: p2 }); g.text(lab, x - 14, A.Y(val) + tickSize * 0.35, { size: tickSize, color: PAL.ink3, align: 'right', alpha: p2 }); }
      });
    }
    return A;
  };
  // Plot y = fn(x) on axes A. Returns screen point at the drawn tip.
  g.plot = (A, fn, o = {}) => {
    const from = o.from ?? A.xmin, to = o.to ?? A.xmax, steps = o.steps || 220; const pts = [];
    for (let k = 0; k <= steps; k++) { const xv = lerp(from, to, k / steps); const yv = fn(xv); if (!isFinite(yv)) continue; pts.push([A.X(xv), A.Y(o.clampY ? clamp(yv, A.ymin, A.ymax) : yv)]); }
    if (o.fillTo !== undefined && (o.progress ?? 1) >= 1) { const base = A.Y(o.fillTo); const poly = [[pts[0][0], base], ...pts, [pts[pts.length - 1][0], base]]; g.poly(poly, { fill: o.fillColor || rgba(o.color || PAL.ink, 0.12), color: null, w: 0, alpha: (o.alpha ?? 1) * (o.fillAlpha ?? 1) }); }
    return g.poly(pts, { color: o.color || PAL.ink, w: o.w ?? 3.5, alpha: o.alpha, progress: o.progress, dash: o.dash });
  };
  g.data = (A, arr, o = {}) => g.poly(arr.map(([u, v]) => [A.X(u), A.Y(v)]), o);
  g.icon = (kind, x, y, s, color, o = {}) => drawIcon(ctx, kind, x, y, s, color, o);
  // Placeholder for unbuilt scenes (dev only).
  g.todo = (scene, t, S) => {
    const L = scene.terms && scene.terms.length ? LAYOUT.stage : LAYOUT.full;
    g.rect(L.x, L.y, L.w, L.h, { stroke: PAL.rule, w: 2, dash: [10, 10] });
    g.text('Scene in progress: ' + scene.id, L.x + 30, L.y + 50, { size: 30, color: PAL.ink3 });
    (scene.beats || []).forEach((b, k) => g.text(`${S.at(k) ? '▸' : '·'} beat ${k}: ${b.t.slice(0, 80)}…`, L.x + 30, L.y + 110 + k * 40, { size: 20, color: S.at(k) ? PAL.ink2 : PAL.ink3 }));
  };
  return g;
}

/* ---------------------------------------------------------------- icons */
// Icons live in a 100-unit box centred on (0,0); s = rendered size in px.
function drawIcon(ctx, kind, x, y, s, color, o = {}) {
  ctx.save(); ctx.translate(x, y); if (o.rot) ctx.rotate(o.rot); if (o.flip) ctx.scale(-1, 1); ctx.scale(s / 100, s / 100);
  ctx.globalAlpha *= o.alpha ?? 1; ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = o.lw ?? 6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const bg = o.bg || PAL.bg; const E = (cx, cy, rx, ry, r = 0) => { ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, r, 0, Math.PI * 2); ctx.fill(); };
  switch (kind) {
    case 'bird': { const f = o.flap ?? 0.5; const wy = -22 + 36 * f; ctx.lineWidth = o.lw ?? 7; ctx.beginPath(); ctx.moveTo(-48, wy); ctx.quadraticCurveTo(-24, wy - 22, 0, 6); ctx.quadraticCurveTo(24, wy - 22, 48, wy); ctx.stroke(); break; }
    case 'songbird': { E(0, 4, 30, 20, -0.15); E(26, -14, 14, 13); ctx.beginPath(); ctx.moveTo(38, -16); ctx.lineTo(52, -12); ctx.lineTo(38, -9); ctx.fill(); ctx.beginPath(); ctx.moveTo(-26, 4); ctx.lineTo(-52, -6); ctx.lineTo(-48, 12); ctx.closePath(); ctx.fill(); ctx.fillStyle = bg; E(29, -17, 3, 3); ctx.strokeStyle = color; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-4, 22); ctx.lineTo(-6, 40); ctx.moveTo(8, 22); ctx.lineTo(8, 40); ctx.stroke(); break; }
    case 'tree': { ctx.fillRect(-5, 8, 10, 44); E(0, -14, 32, 30); E(-22, 4, 22, 20); E(22, 4, 22, 20); break; }
    case 'conifer': { ctx.fillRect(-4, 34, 8, 16); for (const [ty, by, hw] of [[-52, -8, 24], [-32, 16, 32], [-12, 40, 40]]) { ctx.beginPath(); ctx.moveTo(0, ty); ctx.lineTo(-hw, by); ctx.lineTo(hw, by); ctx.closePath(); ctx.fill(); } break; }
    case 'fish': { E(-4, 0, 36, 16); ctx.beginPath(); ctx.moveTo(26, 0); ctx.lineTo(50, -18); ctx.lineTo(50, 18); ctx.closePath(); ctx.fill(); ctx.fillStyle = bg; E(-26, -3, 3.5, 3.5); break; }
    case 'bug': { E(0, 8, 18, 26); E(0, -24, 10, 9); ctx.lineWidth = 4; ctx.beginPath(); for (const yy of [-4, 8, 20]) { ctx.moveTo(-16, yy); ctx.lineTo(-32, yy - 8); ctx.moveTo(16, yy); ctx.lineTo(32, yy - 8); } ctx.moveTo(-4, -32); ctx.lineTo(-12, -46); ctx.moveTo(4, -32); ctx.lineTo(12, -46); ctx.stroke(); ctx.strokeStyle = bg; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(0, 32); ctx.stroke(); break; }
    case 'butterfly': { const f = o.flap ?? 1; ctx.save(); ctx.scale(lerp(0.25, 1, f), 1); E(-22, -14, 22, 17, -0.5); E(22, -14, 22, 17, 0.5); E(-15, 16, 14, 12, 0.4); E(15, 16, 14, 12, -0.4); ctx.restore(); ctx.fillStyle = o.body || bg; E(0, 0, 4, 26); break; }
    case 'hare': { E(-4, 12, 34, 23); E(30, -12, 15, 14); E(25, -44, 5.5, 22, -0.18); E(35, -42, 5.5, 21, 0.22); E(-36, 4, 9, 9); E(-18, 30, 16, 9); ctx.fillStyle = bg; E(35, -14, 2.6, 2.6); break; }
    case 'lynx': { E(0, 6, 38, 19); ctx.fillRect(-30, 14, 9, 32); ctx.fillRect(-14, 16, 9, 30); ctx.fillRect(14, 16, 9, 30); ctx.fillRect(26, 12, 9, 34); E(40, -16, 17, 16); for (const ex of [30, 48]) { ctx.beginPath(); ctx.moveTo(ex - 7, -26); ctx.lineTo(ex, -46); ctx.lineTo(ex + 7, -26); ctx.fill(); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(ex, -46); ctx.lineTo(ex, -54); ctx.stroke(); } E(-38, 0, 8, 6, 0.6); ctx.fillStyle = bg; E(46, -18, 2.6, 2.6); break; }
    case 'plant': { ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(0, 50); ctx.quadraticCurveTo(-6, 10, 0, -34); ctx.stroke(); E(-16, 14, 16, 7, -0.5); E(15, -2, 16, 7, 0.5); E(-12, -18, 13, 6, -0.6); if (o.flower) { ctx.fillStyle = o.flower; for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; E(Math.cos(a) * 9, -40 + Math.sin(a) * 9, 7, 5, a); } ctx.fillStyle = color; E(0, -40, 5, 5); } break; }
    case 'grass': { ctx.lineWidth = 4.5; ctx.beginPath(); for (const [dx, h, b] of [[-14, 70, -14], [-5, 92, -4], [5, 84, 8], [14, 66, 16]]) { ctx.moveTo(dx, 48); ctx.quadraticCurveTo(dx, 48 - h * 0.6, dx + b, 48 - h); } ctx.stroke(); break; }
    case 'barnacle': { ctx.beginPath(); ctx.moveTo(-34, 30); ctx.lineTo(-14, -20); ctx.lineTo(14, -20); ctx.lineTo(34, 30); ctx.closePath(); ctx.fill(); ctx.strokeStyle = bg; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-6, -20); ctx.lineTo(-16, 30); ctx.moveTo(6, -20); ctx.lineTo(16, 30); ctx.stroke(); ctx.fillStyle = bg; E(0, -20, 12, 4); break; }
    case 'seastar': { ctx.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 17 : 50; const px = Math.cos(a) * r, py = Math.sin(a) * r; if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); } ctx.closePath(); ctx.lineWidth = 12; ctx.stroke(); ctx.fill(); break; }
    case 'mussel': { ctx.beginPath(); ctx.moveTo(-8, -46); ctx.bezierCurveTo(26, -40, 30, 30, 6, 48); ctx.bezierCurveTo(-24, 40, -26, -20, -8, -46); ctx.fill(); ctx.strokeStyle = bg; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-6, -40); ctx.bezierCurveTo(4, -10, 6, 20, 4, 44); ctx.stroke(); break; }
    case 'urchin': { E(0, 0, 22, 22); ctx.lineWidth = 3.5; ctx.beginPath(); for (let k = 0; k < 20; k++) { const a = k * Math.PI / 10; ctx.moveTo(Math.cos(a) * 20, Math.sin(a) * 20); ctx.lineTo(Math.cos(a) * 46, Math.sin(a) * 46); } ctx.stroke(); break; }
    case 'kelp': { const sw = o.sway ?? 0; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(0, 50); ctx.bezierCurveTo(-10 + sw * 10, 20, 10 + sw * 14, -10, sw * 18, -50); ctx.stroke(); for (let k = 0; k < 5; k++) { const yy = 36 - k * 20; E(sw * k * 3 + (k % 2 ? 14 : -14), yy, 14, 5, k % 2 ? 0.6 : -0.6); } break; }
    case 'cell': { ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(0, 0, 40, 0, Math.PI * 2); ctx.globalAlpha *= 0.35; ctx.fill(); ctx.globalAlpha /= 0.35; ctx.stroke(); E(8, -6, 12, 10); break; }
    case 'paramecium': { ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(0, 0, 48, 20, 0.1, 0, Math.PI * 2); ctx.globalAlpha *= 0.4; ctx.fill(); ctx.globalAlpha /= 0.4; ctx.stroke(); E(-6, 2, 9, 6); for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 48, Math.sin(a) * 20); ctx.lineTo(Math.cos(a) * 56, Math.sin(a) * 26); ctx.stroke(); } break; }
    case 'seed': { ctx.beginPath(); ctx.moveTo(0, -40); ctx.bezierCurveTo(30, -10, 26, 34, 0, 40); ctx.bezierCurveTo(-26, 34, -30, -10, 0, -40); ctx.fill(); break; }
    case 'wolf': { E(-2, 4, 38, 18); ctx.fillRect(-30, 12, 9, 34); ctx.fillRect(-14, 14, 9, 32); ctx.fillRect(14, 14, 9, 32); ctx.fillRect(26, 10, 9, 36); ctx.beginPath(); ctx.moveTo(30, -8); ctx.lineTo(44, -32); ctx.lineTo(50, -18); ctx.lineTo(64, -10); ctx.lineTo(48, 0); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.moveTo(40, -26); ctx.lineTo(42, -42); ctx.lineTo(48, -28); ctx.fill(); ctx.beginPath(); ctx.moveTo(-38, 0); ctx.quadraticCurveTo(-58, 14, -56, 30); ctx.lineTo(-48, 26); ctx.quadraticCurveTo(-48, 12, -34, 8); ctx.fill(); break; }
    case 'deer': { E(-2, 2, 34, 17); ctx.fillRect(-28, 10, 7, 38); ctx.fillRect(-14, 12, 7, 36); ctx.fillRect(14, 12, 7, 36); ctx.fillRect(24, 8, 7, 40); ctx.beginPath(); ctx.moveTo(22, -6); ctx.lineTo(36, -34); ctx.lineTo(44, -30); ctx.lineTo(34, -2); ctx.fill(); E(44, -34, 11, 7, 0.4); ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(40, -40); ctx.lineTo(34, -60); ctx.moveTo(36, -52); ctx.lineTo(26, -58); ctx.moveTo(46, -40); ctx.lineTo(52, -60); ctx.moveTo(51, -52); ctx.lineTo(60, -58); ctx.stroke(); break; }
    case 'turtle': { E(0, 0, 40, 28); ctx.fillStyle = bg; ctx.lineWidth = 3; ctx.strokeStyle = bg; ctx.beginPath(); ctx.moveTo(-20, -18); ctx.lineTo(0, -8); ctx.lineTo(20, -18); ctx.moveTo(-26, 6); ctx.lineTo(0, -8); ctx.lineTo(26, 6); ctx.moveTo(0, -8); ctx.lineTo(0, 26); ctx.stroke(); ctx.fillStyle = color; E(48, -4, 13, 10); E(-26, -30, 15, 7, -0.6); E(26, -30, 15, 7, 0.6); E(-26, 30, 12, 6, 0.6); E(26, 30, 12, 6, -0.6); E(-44, 0, 7, 4); break; }
    case 'otter': { E(0, 6, 40, 13, -0.05); E(40, -2, 13, 11); ctx.beginPath(); ctx.moveTo(-36, 8); ctx.quadraticCurveTo(-60, 14, -64, 4); ctx.quadraticCurveTo(-58, 2, -36, 0); ctx.fill(); ctx.fillStyle = bg; E(44, -5, 2.4, 2.4); break; }
    default: E(0, 0, 30, 30);
  }
  ctx.restore();
}

/* ------------------------------------------------------------ background */
let BG = null, GRAIN = null;
function buildBackground() {
  const bw = W + 240, bh = H + 160;
  BG = makeCanvas(bw, bh); const c = BG.getContext('2d');
  const cols = 210, rows = 120, sx = bw / cols, sy = bh / rows; const f = [];
  for (let j = 0; j <= rows; j++) { f[j] = []; for (let i = 0; i <= cols; i++) f[j][i] = fbm2(i * 0.035, j * 0.035 * (sy / sx), 7, 4) + 0.35 * fbm2(i * 0.01, j * 0.01, 3, 2); }
  c.lineCap = 'round';
  for (let L = -0.7, idx = 0; L <= 0.7; L += 0.075, idx++) {
    c.strokeStyle = idx % 5 === 0 ? 'rgba(238,231,215,0.085)' : 'rgba(238,231,215,0.045)'; c.lineWidth = idx % 5 === 0 ? 1.6 : 1.1;
    c.beginPath();
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const a = f[j][i], b = f[j][i + 1], d = f[j + 1][i + 1], e = f[j + 1][i];
      const code = (a > L ? 8 : 0) | (b > L ? 4 : 0) | (d > L ? 2 : 0) | (e > L ? 1 : 0);
      if (code === 0 || code === 15) continue;
      const x = i * sx, y = j * sy;
      const T = [x + sx * inv(a, b, L), y], R = [x + sx, y + sy * inv(b, d, L)], B = [x + sx * inv(e, d, L), y + sy], Lf = [x, y + sy * inv(a, e, L)];
      const segs = { 1: [[Lf, B]], 2: [[B, R]], 3: [[Lf, R]], 4: [[T, R]], 5: [[Lf, T], [B, R]], 6: [[T, B]], 7: [[Lf, T]], 8: [[Lf, T]], 9: [[T, B]], 10: [[T, R], [Lf, B]], 11: [[T, R]], 12: [[Lf, R]], 13: [[B, R]], 14: [[Lf, B]] }[code];
      for (const [p, q] of segs) { c.moveTo(p[0], p[1]); c.lineTo(q[0], q[1]); }
    }
    c.stroke();
  }
  GRAIN = makeCanvas(256, 256); const gc = GRAIN.getContext('2d'); const img = gc.createImageData(256, 256); const r = rng(99);
  for (let k = 0; k < img.data.length; k += 4) { const v = Math.floor(r() * 255); img.data[k] = v; img.data[k + 1] = v; img.data[k + 2] = v; img.data[k + 3] = 255; }
  gc.putImageData(img, 0, 0);
}
function drawBackground(g, tint, T) {
  const ctx = g.ctx; if (!BG) buildBackground();
  ctx.fillStyle = PAL.bg; ctx.fillRect(0, 0, W, H);
  let gr = ctx.createRadialGradient(W * 0.4, H * 0.48, 50, W * 0.4, H * 0.48, 1250);
  gr.addColorStop(0, 'rgba(26,48,50,0.85)'); gr.addColorStop(1, 'rgba(26,48,50,0)'); ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
  if (tint) { gr = ctx.createRadialGradient(W * 0.9, H * 0.02, 10, W * 0.9, H * 0.02, 1000); gr.addColorStop(0, rgba(tint, 0.1)); gr.addColorStop(1, rgba(tint, 0)); ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H); }
  ctx.drawImage(BG, Math.round(-120 + 70 * Math.sin(T * 0.011)), Math.round(-80 + 45 * Math.cos(T * 0.0087)));
  gr = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 1.15); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.5)'); ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
}
function drawGrain(g) {
  const ctx = g.ctx; if (!GRAIN) buildBackground();
  ctx.save(); ctx.globalAlpha = 0.022; ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = ctx.createPattern(GRAIN, 'repeat'); ctx.fillRect(0, 0, W, H); ctx.restore();
}

/* ----------------------------------------------------------- the theater */
const Theater = {
  W, H, PAL, FONTS, LAYOUT, SPECIES, U, TIMING_RULES,
  chapters: [], scenes: [], cues: [], duration: 0, built: false, termIndex: [],
  chapter(def) { this.chapters.push(def); },
  splitSentences, wordCount,
};

// Sentence pairs (caption, speech) for a scene, grouped by beat. Speech defaults to caption.
Theater.sentencesOf = function (scene) {
  return (scene.beats || []).map((b) => {
    const cap = splitSentences(b.t), sp = splitSentences(b.s || b.t);
    if (cap.length === sp.length) return cap.map((c, k) => ({ cap: c, say: sp[k] }));
    return [{ cap: b.t, say: b.s || b.t }];
  });
};
// Lay out beat/sentence times from per-sentence durations (seconds).
Theater.layoutTiming = function (scene, durs) {
  const R = TIMING_RULES; const groups = Theater.sentencesOf(scene);
  let t = scene.lead ?? R.lead, q = 0; const beats = [];
  groups.forEach((sents, k) => {
    const b = { start: t, sents: [] };
    sents.forEach((s, j) => { const d = durs[q++]; b.sents.push({ start: t, end: t + d, cap: s.cap }); t += d; if (j < sents.length - 1) t += R.gapSentence; });
    b.end = t; t += (scene.beats[k].pause || 0); if (k < groups.length - 1) t += R.gapBeat;
    beats.push(b);
  });
  const dur = Math.max(t + (scene.tail ?? R.tail), scene.minDur || 0);
  return { dur, beats };
};
Theater.estimateTiming = function (scene) {
  const durs = Theater.sentencesOf(scene).flat().map((s) => wordCount(s.say) / TIMING_RULES.wps + 0.25);
  return Theater.layoutTiming(scene, durs);
};

Theater.build = function (TIMING) {
  TIMING = TIMING || {};
  const scenes = []; let T = 0, termNo = 0; const cues = [];
  this.chapters.forEach((ch, ci) => {
    ch.index = ci;
    const list = [];
    if (ch.card !== false) {
      list.push({ id: ch.id + '-card', title: ch.title, kind: 'card', beats: ch.intro ? [ch.intro] : [], lead: 0.9, tail: 1.6, minDur: 6, header: false, draw: (g, t, S) => drawChapterCard(g, ch, t, S) });
    }
    for (const sc of ch.scenes) list.push(sc);
    for (const sc of list) {
      sc.chapter = ch;
      let tm = TIMING[sc.id];
      const nb = (sc.beats || []).length;
      if (!tm || !tm.beats || tm.beats.length !== nb || (tm.sig && tm.sig !== Theater.signature(sc))) tm = Theater.estimateTiming(sc), tm.estimated = true;
      sc.timing = tm; sc.start = T; sc.dur = tm.dur; sc.end = T + tm.dur; T += tm.dur;
      (sc.terms || []).forEach((tr) => { if (tr.demo) { tr.no = 0; return; } tr.no = ++termNo; this.termIndex.push({ ...tr, scene: sc.id, chapter: ch.title, time: sc.start + (tm.beats[Math.floor(tr.beat)] || { start: 0 }).start }); });
      tm.beats.forEach((b) => b.sents.forEach((s) => {
        for (const ch2 of chunkCaption(s.cap, s.start, s.end)) cues.push({ start: sc.start + ch2.start, end: sc.start + ch2.end, text: ch2.text });
      }));
      scenes.push(sc);
    }
  });
  this.scenes = scenes; this.duration = T; this.cues = cues; this.built = true;
  return this;
};
Theater.signature = function (scene) { return Theater.sentencesOf(scene).flat().map((s) => s.say).join('|').length + ':' + (scene.beats || []).map((b) => (b.pause || 0)).join(','); };

function chunkCaption(text, start, end) {
  const MAX = 96;
  if (text.length <= MAX) return [{ text, start, end }];
  const n = Math.ceil(text.length / MAX); const target = text.length / n; const pieces = []; let rest = text;
  for (let k = 0; k < n - 1; k++) {
    let best = -1, bestScore = 1e9;
    for (let i = 20; i < rest.length - 15; i++) {
      const ch = rest[i]; if (ch !== ' ') continue;
      const prev = rest[i - 1]; const bonus = /[,;:]/.test(prev) ? -28 : (/^(and|but|which|where|while|so|or|because|that|then|with)\b/.test(rest.slice(i + 1)) ? -14 : 0);
      const score = Math.abs(i - target) + bonus; if (score < bestScore && i < MAX + 10) { bestScore = score; best = i; }
    }
    if (best < 0) break;
    pieces.push(rest.slice(0, best).trim()); rest = rest.slice(best + 1);
  }
  pieces.push(rest.trim());
  const total = pieces.reduce((s, p) => s + p.length, 0); let t = start;
  return pieces.map((p) => { const d = (end - start) * p.length / total; const c = { text: p, start: t, end: t + d }; t += d; return c; });
}

Theater.sceneAt = function (T) {
  const S = this.scenes; let lo = 0, hi = S.length - 1;
  if (T <= 0) return S[0]; if (T >= this.duration) return S[S.length - 1];
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (S[mid].start <= T) lo = mid; else hi = mid - 1; }
  return S[lo];
};
Theater.cueAt = function (T) {
  const C = this.cues; let lo = 0, hi = C.length - 1, ans = null;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (C[mid].start <= T) { ans = C[mid]; lo = mid + 1; } else hi = mid - 1; }
  return ans && T <= ans.end + 0.6 ? ans : null;
};

// Scene-local timing helper, bound to local time t.
function makeS(sc, t) {
  const tm = sc.timing; const B = tm.beats; const nb = B.length;
  const bstart = (k) => {
    if (nb === 0) return 0; if (k >= nb) return tm.dur; if (k < 0) return 0;
    const i = Math.floor(k), f = k - i; const b = B[i]; return f ? lerp(b.start, b.end, f) : b.start;
  };
  const S = {
    t, dur: tm.dur, n: nb, scene: sc,
    b: bstart,
    e: (k) => (B[k] ? B[k].end : tm.dur),
    p: (k, d = 0.9, delay = 0) => ease.out((t - bstart(k) - delay) / d),
    io: (k, d = 0.9, delay = 0) => ease.inOut((t - bstart(k) - delay) / d),
    lin: (k, d = 1, delay = 0) => clamp((t - bstart(k) - delay) / d),
    ph: (k) => { const s = bstart(k), e = B[k] ? B[k].end : tm.dur; return clamp((t - s) / Math.max(0.001, e - s)); },
    span: (k0, k1) => { const s = bstart(k0), e = bstart(k1); return clamp((t - s) / Math.max(0.001, e - s)); },
    at: (k) => t >= bstart(k),
    since: (k) => t - bstart(k),
    tp: (s0, d = 0.9) => ease.out((t - s0) / d),
    out: (k, d = 0.6) => 1 - ease.inOut((t - bstart(k)) / d),
    end: (d = 0.8) => ease.inOut((t - (tm.dur - d)) / d),
  };
  return S;
}
Theater.makeS = makeS;

/* --------------------------------------------------------- chrome layers */
function romanOf(ch) { return ch.roman || ''; }
function drawHeader(g, sc, S) {
  const ch = sc.chapter; const col = ch.color || PAL.ink; const p = ease.out((S.t - 0.15) / 0.9);
  if (ch.roman) g.text(`${romanOf(ch)}   ·   ${ch.title.toUpperCase()}`, 80, 92, { size: 17, weight: 600, color: col, ls: 3.2, alpha: 0.95 });
  g.text(sc.title, 80 + (1 - p) * 0, 158 + (1 - p) * 14, { size: 58, role: 'display', color: PAL.ink, alpha: p });
  // chapter ticks, top right
  const chs = Theater.chapters.filter((c) => c.roman); const x0 = W - 80 - chs.length * 30;
  chs.forEach((c, k) => {
    const on = c === ch; const x = x0 + k * 30 + 10;
    g.rect(x - (on ? 9 : 4), 84, on ? 18 : 8, 4, { fill: on ? col : PAL.ink3, alpha: on ? 1 : 0.55, r: 2 });
  });
  g.line(80, 186, W - 80, 186, { color: PAL.rule, w: 1, alpha: 0.6 * p });
}
function drawRail(g, sc, S) {
  const terms = sc.terms || []; if (!terms.length) return;
  const R = LAYOUT.rail; const col = sc.chapter.color || PAL.ink;
  const shown = terms.filter((tm) => S.t >= S.b(tm.beat) - 0.25);
  if (!shown.length) return;
  const prog = shown.map((tm) => ease.out((S.t - S.b(tm.beat) + 0.25) / 0.85));
  const MAXFULL = 3, padX = 22, inner = R.w - 2 * padX, compactH = 60;
  const lay = shown.map((tm) => { const tLines = g.lines(tm.term, inner - 20, { role: 'display', size: 35 }); const dLines = g.lines(tm.def, inner, { size: 22 }); return { tLines, dLines, fullH: 62 + tLines.length * 38 + dLines.length * 29 + 18 }; });
  // Collapse the oldest cards until at most MAXFULL are full and the stack fits the rail.
  const collapsed = (n) => { const set = new Set(); let total = 0, full = n; for (let i = 0; i < n; i++) total += lay[i].fullH; for (let i = 0; i < n - 1 && (total > R.h || full > MAXFULL); i++) { set.add(i); total -= lay[i].fullH - compactH; full--; } return set; };
  const prev = collapsed(shown.length - 1), cur = collapsed(shown.length), pNew = prog[prog.length - 1];
  let y = R.y;
  shown.forEach((tm, idx) => {
    const p = prog[idx]; const { tLines, dLines, fullH } = lay[idx];
    const c = prev.has(idx) ? 1 : cur.has(idx) ? ease.inOut(pNew) : 0;
    const h = lerp(fullH, compactH, c); const x = R.x + (1 - p) * 36;
    g.withAlpha(p, () => {
      g.rect(x, y, R.w, h - 12, { fill: 'rgba(14,29,31,0.78)', stroke: 'rgba(238,231,215,0.16)', w: 1.2, r: 3 });
      g.text('No. ' + String(tm.no).padStart(3, '0'), x + padX, y + lerp(30, 37, c), { size: lerp(15, 14, c), role: 'mono', color: col, ls: 1 });
      g.rect(x + R.w - 32, y + 18, 11, 11, { fill: col, alpha: 0.9 * (1 - c) });
      if (c < 0.5) {
        g.withAlpha(1 - c * 2, () => {
          tLines.forEach((ln, k) => g.text(ln, x + padX, y + 70 + k * 38, { size: 35, role: 'display', color: PAL.ink }));
          dLines.forEach((ln, k) => g.text(ln, x + padX, y + 70 + tLines.length * 38 + 2 + k * 29, { size: 22, color: PAL.ink2 }));
        });
      } else {
        const avail = R.w - 112 - padX; let size = 27; const w0 = g.measure(tm.term, { role: 'display', size });
        if (w0 > avail) size = Math.max(18, size * avail / w0);
        g.text(tm.term, x + 104, y + 39, { size, role: 'display', color: PAL.ink, alpha: (c - 0.5) * 2 });
      }
    });
    y += h;
  });
}
function drawChapterCard(g, ch, t, S) {
  const col = ch.color || PAL.ink; const p0 = ease.out((t - 0.2) / 1.2), p1 = ease.out((t - 0.7) / 1.2), p2 = ease.out((t - 1.3) / 1.2);
  const dy = 40;
  g.text(ch.roman, 120, 720 + dy, { size: 420, role: 'display', italic: true, color: col, alpha: 0.9 * p0 });
  const tx = 120 + g.measure(ch.roman, { size: 420, role: 'display', italic: true }) + 70;
  g.text(`CHAPTER ${ch.index}`, tx, 400 + dy, { size: 20, weight: 600, color: col, ls: 4, alpha: p1 });
  g.text(ch.title, tx, 516 + dy + (1 - p1) * 20, { size: 120, role: 'display', color: PAL.ink, alpha: p1 });
  if (ch.question) g.text(ch.question, tx, 594 + dy, { size: 42, role: 'display', italic: true, color: PAL.ink2, alpha: p2 });
  g.line(tx, 642 + dy, tx + Math.min(1000, W - 100 - tx) * ease.inOut((t - 1.1) / 1.6), 642 + dy, { color: PAL.rule, w: 1.5 });
  const titles = ch.scenes.map((s) => s.title); const colW = Math.min(520, (W - 90 - tx) / 2);
  titles.forEach((st, k) => {
    const pk = ease.out((t - 1.8 - k * 0.32) / 0.8);
    const cx = tx + (k % 2) * colW, cy = 700 + dy + Math.floor(k / 2) * 48;
    g.text(String(k + 1).padStart(2, '0'), cx, cy, { size: 18, role: 'mono', color: col, alpha: pk });
    g.text(st, cx + 42, cy, { size: 26, color: PAL.ink2, alpha: pk, maxW: colW - 60 });
  });
  if (ch.motif) g.with(() => ch.motif(g, t, S));
}

const CAPTION = { size: 34 };
function drawCaption(g, text) {
  if (!text) return; const ctx = g.ctx; const lines = g.lines(text, 1500, { size: CAPTION.size, weight: 500 });
  const lh = CAPTION.size * 1.3, h = lines.length * lh + 26; const y0 = H - 36 - h;
  const w = Math.max(...lines.map((l) => g.measure(l, { size: CAPTION.size, weight: 500 }))) + 56;
  g.rect(W / 2 - w / 2, y0, w, h, { fill: 'rgba(5,11,12,0.78)', r: 6 });
  lines.forEach((ln, k) => g.text(ln, W / 2, y0 + 13 + CAPTION.size * 0.98 + k * lh, { size: CAPTION.size, weight: 500, color: '#F4EEDF', align: 'center' }));
}

// Render the frame at global time T.
Theater.renderAt = function (ctx, T, opts = {}) {
  if (!this.built) this.build(root.TIMING);
  const g = ctx.__g || (ctx.__g = makeG(ctx));
  const sc = this.sceneAt(T); const t = T - sc.start; const S = makeS(sc, t);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  drawBackground(g, sc.chapter && sc.chapter.color, T);
  try {
    if (sc.init && !sc._data) sc._data = sc.init(makeS(sc, 0), U) || {};
    if (sc.draw) { ctx.save(); sc.draw(g, t, S, sc._data); ctx.restore(); }
  } catch (err) {
    ctx.restore(); ctx.save();
    g.text('Render error in ' + sc.id + ': ' + err.message, 80, 980, { size: 22, color: PAL.coral });
    (Theater.errors || (Theater.errors = [])).push(sc.id + ' @' + t.toFixed(2) + ': ' + err.message);
    if (root.console) console.error(err);
  }
  if (sc.header !== false) { const ha = sc.headerAlpha ? clamp(sc.headerAlpha(S)) : 1; if (ha > 0) g.withAlpha(ha, () => drawHeader(g, sc, S)); }
  drawRail(g, sc, S);
  drawGrain(g);
  // Transitions: dip from/to the background colour at scene boundaries.
  const isFirst = sc === this.scenes[0], isLast = sc === this.scenes[this.scenes.length - 1];
  const fin = isFirst ? 1.2 : 0.42, fout = isLast ? 2.0 : 0.38;
  let dip = 0; if (t < fin) dip = 1 - ease.inOut(t / fin); if (t > sc.dur - fout) dip = Math.max(dip, ease.inOut((t - (sc.dur - fout)) / fout));
  if (dip > 0) { ctx.globalAlpha = dip; ctx.fillStyle = isLast && t > sc.dur - fout ? '#050A0B' : PAL.bg; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
  if (opts.captions) { const cue = this.cueAt(T); if (cue) drawCaption(g, cue.text); }
  if (opts.debug) g.text(`${sc.id}  t=${t.toFixed(2)}  T=${T.toFixed(2)}${sc.timing.estimated ? '  (est.)' : ''}`, 80, 1060, { size: 18, role: 'mono', color: PAL.ink3 });
  ctx.restore();
};
Theater.fontsChanged = function () { mathCache.clear(); };
Theater.makeG = makeG; Theater.drawIcon = drawIcon; Theater.makeCanvas = makeCanvas;

root.Theater = Theater; root.PAL = PAL; root.U = U;
})(typeof window !== 'undefined' ? window : globalThis);
