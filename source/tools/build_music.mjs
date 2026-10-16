// Procedural ambient score mixed under the narration.
// Slow voice-led pads (D major / B minor colours), bell chimes at chapter cards,
// swells on chapter cards, and side-chain ducking driven by the narration envelope.
// Writes BUILD/soundtrack.wav (stereo) and BUILD/soundtrack.m4a (mono, for the player).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadTheater, BUILD } from './load.mjs';

const Th = loadTheater();
const narr = fs.readFileSync(path.join(BUILD, 'narration.wav'));
const SR = narr.readUInt32LE(24);
const nPCM = new Int16Array(narr.buffer.slice(narr.byteOffset + 44, narr.byteOffset + narr.length - ((narr.length - 44) % 2)));
const N = nPCM.length; const dur = N / SR;

// ---- narration envelope (100 Hz control rate), attack 80 ms / release 700 ms
const CR = 100, hop = SR / CR, nCtl = Math.ceil(N / hop) + 2; const env = new Float32Array(nCtl);
{ let e = 0; const att = 1 - Math.exp(-1 / (0.08 * CR)), rel = 1 - Math.exp(-1 / (0.7 * CR));
  for (let k = 0; k < nCtl; k++) { let s = 0; const a = Math.floor(k * hop), b = Math.min(N, Math.floor((k + 1) * hop)); for (let i = a; i < b; i++) s += (nPCM[i] / 32768) ** 2; const rms = b > a ? Math.sqrt(s / (b - a)) : 0; const x = Math.min(1, rms / 0.045); e += (x > e ? att : rel) * (x - e); env[k] = e; } }

// ---- chapter card windows (swell) and chime times
const cards = Th.scenes.filter((s) => s.kind === 'card').map((s) => [s.start, s.end]);
const chimes = [1.2, ...cards.map(([a]) => a + 0.35)];
const swellAt = (t) => { let w = 0; for (const [a, b] of cards) { const up = Math.min(1, Math.max(0, (t - a + 1.5) / 2.5)), dn = Math.min(1, Math.max(0, (b + 1.0 - t) / 2.5)); w = Math.max(w, Math.min(up, dn)); } const intro = Math.max(0, Math.min(1, (14 - t) / 6)); return Math.max(w, intro); };

// ---- harmony: four chords, 22 s each, raised-cosine crossfades
const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
const CHORDS = [[50, 62, 66, 69, 73, 76], [47, 62, 66, 69, 73], [43, 62, 66, 69, 71], [45, 64, 66, 69, 71, 76]];
const CLEN = 22, XF = 10;
const rand = (() => { let a = 12345; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; })();
const voices = [];
CHORDS.forEach((ch, ci) => ch.forEach((m, vi) => {
  const f = midi(m); const root = vi === 0;
  voices.push({ ci, f1: f - 0.09, f2: f + 0.09, amp: root ? 0.55 : 1 / (1 + 0.15 * vi), pan: root ? 0 : ((vi % 2 ? -1 : 1) * (0.25 + 0.12 * vi)), lfoF: 0.03 + rand() * 0.05, lfoP: rand() * 6.28, p1: rand() * 6.28, p2: rand() * 6.28, p3: rand() * 6.28 });
}));
const chordW = (ci, t) => {
  const pos = t / CLEN; const cur = Math.floor(pos) % CHORDS.length; const frac = (t % CLEN);
  const into = frac > CLEN - XF / 2 ? (frac - (CLEN - XF / 2)) / XF : frac < XF / 2 ? 0.5 + frac / XF : 1;
  const nxt = (cur + 1) % CHORDS.length, prv = (cur + CHORDS.length - 1) % CHORDS.length;
  const cosw = (x) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, x)));
  if (frac > CLEN - XF / 2) { const w = cosw(into); if (ci === cur) return Math.sqrt(1 - w); if (ci === nxt) return Math.sqrt(w); return 0; }
  if (frac < XF / 2) { const w = cosw(into); if (ci === cur) return Math.sqrt(w); if (ci === prv) return Math.sqrt(1 - w); return 0; }
  return ci === cur ? 1 : 0;
};

// ---- bells
const BELL = [[1, 1, 4.0], [2.01, 0.32, 2.2], [2.99, 0.16, 1.4], [4.12, 0.08, 0.9]];
const bellNotes = []; chimes.forEach((t0, k) => { const base = [74, 81, 78][k % 3]; bellNotes.push({ t0, f: midi(base), pan: -0.3 }); bellNotes.push({ t0: t0 + 0.42, f: midi(base + 5), pan: 0.3 }); });

// ---- synthesis (streamed in 1 s blocks)
const out = path.join(BUILD, 'soundtrack.wav'); const fd = fs.openSync(out, 'w');
const hdr = Buffer.alloc(44); const bytes = N * 4;
hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + bytes, 4); hdr.write('WAVE', 8); hdr.write('fmt ', 12); hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(2, 22);
hdr.writeUInt32LE(SR, 24); hdr.writeUInt32LE(SR * 4, 28); hdr.writeUInt16LE(4, 32); hdr.writeUInt16LE(16, 34); hdr.write('data', 36); hdr.writeUInt32LE(bytes, 40); fs.writeSync(fd, hdr);
const BASE = 0.0085, TAU = Math.PI * 2;
let peak = 0;
for (let s0 = 0; s0 < N; s0 += SR) {
  const n = Math.min(SR, N - s0); const buf = Buffer.alloc(n * 4);
  const tb = s0 / SR; const wA = CHORDS.map((_, ci) => chordW(ci, tb)), wB = CHORDS.map((_, ci) => chordW(ci, tb + 1)); const w = wA.slice();
  for (let i = 0; i < n; i++) {
    const s = s0 + i, t = s / SR; const fi = i / SR;
    for (let c = 0; c < w.length; c++) w[c] = wA[c] + (wB[c] - wA[c]) * fi;
    let L = 0, R = 0;
    for (const v of voices) {
      const cw = w[v.ci]; if (cw < 1e-4) { v.p1 += TAU * v.f1 / SR; v.p2 += TAU * v.f2 / SR; v.p3 += TAU * 2 * v.f1 / SR; continue; }
      v.p1 += TAU * v.f1 / SR; v.p2 += TAU * v.f2 / SR; v.p3 += TAU * 2 * v.f1 / SR;
      const lfo = 0.7 + 0.3 * Math.sin(TAU * v.lfoF * t + v.lfoP);
      const x = (Math.sin(v.p1) + Math.sin(v.p2) + 0.18 * Math.sin(v.p3)) * v.amp * lfo * cw;
      L += x * Math.cos((v.pan + 1) * Math.PI / 4); R += x * Math.sin((v.pan + 1) * Math.PI / 4);
    }
    const kf = s / hop, k = Math.min(nCtl - 2, Math.floor(kf)); const ev = env[k] + (env[k + 1] - env[k]) * (kf - k); const duck = 1 - 0.62 * ev;
    const sw = swellAt(t); const fade = Math.min(1, t / 4, (dur - t) / 6);
    const g = BASE * duck * (1 + 0.9 * sw) * Math.max(0, fade);
    L *= g; R *= g;
    for (const b of bellNotes) { const dt = t - b.t0; if (dt < 0 || dt > 8) continue; let y = 0; for (const [ratio, a, tau] of BELL) y += a * Math.sin(TAU * b.f * ratio * dt) * Math.exp(-dt / tau); y *= 0.05 * Math.min(1, dt / 0.004) * Math.max(0, fade); L += y * Math.cos((b.pan + 1) * Math.PI / 4); R += y * Math.sin((b.pan + 1) * Math.PI / 4); }
    const voice = nPCM[s] / 32768;
    const ol = Math.max(-1, Math.min(1, voice * 0.92 + L)), or = Math.max(-1, Math.min(1, voice * 0.92 + R));
    peak = Math.max(peak, Math.abs(ol), Math.abs(or));
    buf.writeInt16LE(Math.round(ol * 32767), i * 4); buf.writeInt16LE(Math.round(or * 32767), i * 4 + 2);
  }
  fs.writeSync(fd, buf);
}
fs.closeSync(fd);
console.log(`soundtrack ${dur.toFixed(1)} s, peak ${(20 * Math.log10(peak)).toFixed(1)} dBFS, ${chimes.length} chimes, ${cards.length} card swells`);
// Player audio: mono AAC ~40 kbps, loudness-normalised (≤ 15 MB for artifact hosting).
const LN = 'loudnorm=I=-16:TP=-1.5:LRA=11';
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', out, '-af', LN, '-ac', '1', '-ar', '22050', '-c:a', 'aac', '-b:a', '40k', path.join(BUILD, 'soundtrack.m4a')]);
console.log('player audio', (fs.statSync(path.join(BUILD, 'soundtrack.m4a')).size / 1e6).toFixed(1), 'MB');
