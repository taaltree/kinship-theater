// Build narration from per-scene ElevenLabs takes (BUILD/el/<scene>.mp3):
// find sentence boundaries by aligning pauses to text, lay out timing, write timing.js,
// narration.wav (44.1 kHz mono) and captions. Usage: node tools/build_audio_el.mjs [--report]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadTheater, SRC, BUILD } from './load.mjs';
import { buildRequests } from './el_script.mjs';

const SR = 44100, FR = 0.01, HOP = Math.round(SR * FR);
const DIR = path.join(BUILD, 'el');
const decode = (f) => { const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', f, '-ac', '1', '-ar', String(SR), '-f', 's16le', '-'], { maxBuffer: 1 << 30 }); return new Int16Array(raw.buffer, raw.byteOffset, raw.length / 2); };

function analyse(pcm) {
  const n = Math.floor(pcm.length / HOP), db = new Float32Array(n);
  for (let k = 0; k < n; k++) { let s = 0; for (let i = k * HOP; i < (k + 1) * HOP; i++) s += (pcm[i] / 32768) ** 2; db[k] = 10 * Math.log10(s / HOP + 1e-12); }
  const voiced = [...db].filter((v) => v > -60).sort((a, b) => a - b); const med = voiced[Math.floor(voiced.length * 0.6)] ?? -30;
  const th = Math.max(-52, med - 26);
  let first = 0, last = n - 1; while (first < n && db[first] < th) first++; while (last > first && db[last] < th) last--;
  const gaps = []; let k = first;
  while (k <= last) { if (db[k] < th) { let j = k; while (j <= last && db[j] < th) j++; const d = (j - k) * FR; if (d >= 0.09) gaps.push({ a: k * FR, b: j * FR, mid: (k + j) / 2 * FR, dur: d }); k = j; } else k++; }
  return { db, th, start: first * FR, end: (last + 1) * FR, gaps };
}

// Spoken-length weight of a sentence: single letters and digits take longer than their character count.
function spokenUnits(t) { return t.split(/\s+/).filter(Boolean).reduce((u, w) => { const core = w.replace(/[^A-Za-z0-9]/g, ''); return u + (core.length <= 1 ? 3.2 : core.length + 1) + (/[,;:]$/.test(w) ? 2 : 0); }, 0); }

// Segment the take into n sentences: choose n-1 pauses so each sentence's speaking rate is plausible,
// strongly preferring long pauses (sentence ends) over short ones (commas).
function align(an, weights) {
  const n = weights.length; if (n === 1) return [];
  const G = an.gaps, m = G.length; if (m < n - 1) return null;
  const pauseTotal = 0; const span = an.end - an.start; const W = weights.reduce((x, y) => x + y, 0);
  const rho = span / W; // seconds per unit, including typical inter-sentence pauses
  const seg = (k, a, b) => { const exp = rho * weights[k], sd = 0.22 * exp + 0.35; return ((b - a - exp) / sd) ** 2; };
  const cut = (g) => -2.6 * Math.log(Math.min(G[g].dur, 1.4) / 0.22);
  const D = Array.from({ length: n - 1 }, () => new Float64Array(m).fill(Infinity)), P = Array.from({ length: n - 1 }, () => new Int32Array(m).fill(-1));
  for (let g = 0; g < m; g++) D[0][g] = seg(0, an.start, G[g].mid) + cut(g);
  for (let k = 1; k < n - 1; k++) for (let g = k; g < m; g++) { let best = Infinity, bi = -1; for (let h = k - 1; h < g; h++) { const v = D[k - 1][h] + seg(k, G[h].mid, G[g].mid); if (v < best) { best = v; bi = h; } } D[k][g] = best + cut(g); P[k][g] = bi; }
  let g = -1, best = Infinity; for (let i = n - 2; i < m; i++) { const v = D[n - 2][i] + seg(n - 1, G[i].mid, an.end); if (v < best) { best = v; g = i; } }
  const out = []; for (let k = n - 2; k >= 0; k--) { out.unshift(G[g]); g = P[k][g]; }
  let acc = 0; return out.map((x, k) => ({ ...x, expected: an.start + rho * (acc += weights[k]) }));
}

function trimSlice(pcm, an, a, b) {
  let s = Math.floor(a / FR), e = Math.ceil(b / FR);
  while (s < e && an.db[s] < an.th) s++; while (e > s && an.db[e - 1] < an.th) e--;
  const i0 = Math.max(0, s * HOP - Math.round(0.03 * SR)), i1 = Math.min(pcm.length, e * HOP + Math.round(0.09 * SR));
  return pcm.subarray(i0, i1);
}
function writeWav(file, pcm) {
  const h = Buffer.alloc(44); const n = pcm.length * 2;
  h.write('RIFF', 0); h.writeUInt32LE(36 + n, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(n, 40);
  fs.writeFileSync(file, Buffer.concat([h, Buffer.from(pcm.buffer, pcm.byteOffset, n)]));
}

const req = buildRequests();
const T0 = loadTheater({ withTiming: false });
T0.TIMING_RULES.gapSentence = 0.4;
const missing = req.filter((r) => !fs.existsSync(path.join(DIR, `${r.scene}.mp3`)));
if (missing.length) { console.log('missing takes:', missing.map((r) => r.scene).join(', ')); process.exit(1); }
const pieces = {}, TIMING = {}, report = [];
for (const r of req) {
  const meta = path.join(DIR, `${r.scene}.json`);
  if (fs.existsSync(meta) && JSON.parse(fs.readFileSync(meta, 'utf8')).hash !== r.hash) console.log(`WARNING ${r.scene}: take was generated from different text`);
  const pcm = decode(path.join(DIR, `${r.scene}.mp3`)); const an = analyse(pcm);
  const cuts = align(an, r.sentences.map((s) => spokenUnits(s.text)));
  if (!cuts) { report.push(`${r.scene}: too few pauses`); continue; }
  const bounds = [an.start, ...cuts.map((c) => c.mid), an.end];
  pieces[r.scene] = r.sentences.map((s, i) => trimSlice(pcm, an, bounds[i], bounds[i + 1]));
  if (process.env.RATECHECK) { const rates = r.sentences.map((s, i) => s.text.length / (pieces[r.scene][i].length / SR)); rates.forEach((v, i) => { if (v < 10.5 || v > 20) console.log(`  RATE ${r.scene} #${i} ${v.toFixed(1)} c/s  "${r.sentences[i].text.slice(0, 60)}"`); }); }
  const worst = cuts.reduce((w, c) => Math.max(w, Math.abs(c.mid - c.expected)), 0);
  const weak = cuts.filter((c) => c.dur < 0.22).length;
  report.push(`${r.scene.padEnd(18)} ${r.sentences.length} sentences · max offset ${worst.toFixed(2)} s · short pauses ${weak}${worst > 2.5 || weak ? '  ← check' : ''}`);
  const sc = T0.scenes.find((x) => x.id === r.scene);
  const tm = T0.layoutTiming(sc, pieces[r.scene].map((p) => p.length / SR)); tm.sig = T0.signature(sc);
  tm.dur = +tm.dur.toFixed(3); tm.beats.forEach((b) => { b.start = +b.start.toFixed(3); b.end = +b.end.toFixed(3); b.sents.forEach((s) => { s.start = +s.start.toFixed(3); s.end = +s.end.toFixed(3); }); });
  TIMING[r.scene] = tm;
}
console.log(report.join('\n'));
if (argvHas('--report')) process.exit(0);
function argvHas(k) { return process.argv.includes(k); }
fs.writeFileSync(path.join(SRC, 'timing.js'), '/* generated by tools/build_audio_el.mjs (ElevenLabs narration) */\nwindow.TIMING = ' + JSON.stringify(TIMING) + ';\n');
const Th = loadTheater({ withTiming: true }); Th.TIMING_RULES.gapSentence = 0.4;
const total = Math.ceil(Th.duration * SR) + SR; const track = new Int16Array(total);
for (const sc of Th.scenes) { let q = 0; for (const b of sc.timing.beats) for (const s of b.sents) { const p = pieces[sc.id][q++]; const at = Math.round((sc.start + s.start) * SR); track.set(p.subarray(0, Math.max(0, Math.min(p.length, total - at))), at); } }
writeWav(path.join(BUILD, 'narration.wav'), track);
const ts = (x, sep) => { const h = Math.floor(x / 3600), m = Math.floor(x / 60) % 60, s = Math.floor(x) % 60, ms = Math.round((x % 1) * 1000); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}${sep}${String(ms).padStart(3, '0')}`; };
const vtt = ['WEBVTT', ''], srt = []; Th.cues.forEach((c, i) => { vtt.push(`${ts(c.start, '.')} --> ${ts(c.end, '.')}`, c.text, ''); srt.push(String(i + 1), `${ts(c.start, ',')} --> ${ts(c.end, ',')}`, c.text, ''); });
fs.writeFileSync(path.join(BUILD, 'captions.vtt'), vtt.join('\n')); fs.writeFileSync(path.join(BUILD, 'captions.srt'), srt.join('\n'));
const mm = (x) => `${Math.floor(x / 60)}:${String(Math.round(x % 60)).padStart(2, '0')}`;
console.log(`Total duration ${mm(Th.duration)} (${Th.duration.toFixed(1)} s); ${Th.cues.length} caption cues`);
