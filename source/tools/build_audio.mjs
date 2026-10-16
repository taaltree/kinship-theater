// Synthesize narration per sentence (cached), lay out timing, write timing.js + narration track.
// Usage: node tools/build_audio.mjs [--voice Daniel] [--rate 172]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile, execFileSync } from 'node:child_process';
import { loadTheater, SRC, BUILD } from './load.mjs';

const args = Object.fromEntries(process.argv.slice(2).join(' ').split('--').filter(Boolean).map((s) => s.trim().split(/\s+/)).map(([k, ...v]) => [k, v.join(' ') || true]));
const VOICE = args.voice || 'Samantha';
const RATE = Number(args.rate || 165);
const SR = 22050;
const AUD = path.join(BUILD, 'audio');
fs.mkdirSync(AUD, { recursive: true });

// Pronunciation fixes applied to all speech text.
const PRON = [
  [/–/g, ' '], [/—/g, ', '], [/ʻ/g, ''], [/Ŝ/g, 'S hat'], [/R\*/g, 'R star'], [/p\*/g, 'p star'],
  [/λ/g, 'lambda'], [/α/g, 'alpha'], [/θ/g, 'theta'], [/ν/g, 'nu'], [/τ/g, 'tau'], [/γ/g, 'gamma'], [/β/g, 'beta'],
  [/Type III\b/g, 'Type three'], [/Type II\b/g, 'Type two'], [/Type I\b/g, 'Type one'],
  [/Lefkovitch/g, 'Lefkovich'], [/Leibold/g, 'Lie-bold'], [/\bLevins\b/g, 'Levvins'], [/\bGause\b/g, 'Gowza'],
  [/Chthamalus/g, 'Thamalus'], [/Semibalanus/g, 'Semmy-balanus'], [/Krakatau/g, 'Krakatow'], [/Zanette/g, 'Zuh-net'],
  [/Rosenzweig/g, 'Rosen-zwyg'], [/Charnov/g, 'Sharnoff'], [/Mouquet/g, 'Moo-kay'], [/Loreau/g, 'Lor-oh'],
  [/Soberón/g, 'Soberon'], [/Soulé/g, 'Soolay'], [/Kodric/g, 'Kodrick'], [/Åland/g, 'Oland'], [/Ilkka/g, 'Ilka'],
  [/Cumbrae/g, 'Cumbray'], [/Geospiza/g, 'Jee-oh-spiza'], [/fuliginosa/g, 'fooli-jih-no-sa'], [/allelopathy/g, 'uh-lee-lopathy'],
  [/juglone/g, 'jug-lone'], [/Paramecium/g, 'Para-meesium'], [/Pisaster/g, 'Pie-sasster'], [/\bZNGI\b/g, 'Z N G I'],
  [/\bSLOSS\b/g, 'sloss'], [/\bBAM\b/g, 'B A M'], [/C-S-R/g, 'C S R'], [/Motoo/g, 'Motoh'], [/Galápagos/g, 'Galapagos'],
];
const speechOf = (s) => PRON.reduce((acc, [re, rep]) => acc.replace(re, rep), s);

function readWav(file) {
  const buf = fs.readFileSync(file);
  let off = 12, data = null;
  while (off < buf.length - 8) {
    const id = buf.toString('ascii', off, off + 4), size = buf.readUInt32LE(off + 4);
    if (id === 'data') { data = buf.subarray(off + 8, off + 8 + size); break; }
    off += 8 + size + (size % 2);
  }
  const pcm = new Int16Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.length));
  // trim near-silence at both ends, keeping short pads
  const TH = 260; let a = 0, b = pcm.length - 1;
  while (a < pcm.length && Math.abs(pcm[a]) < TH) a++;
  while (b > a && Math.abs(pcm[b]) < TH) b--;
  a = Math.max(0, a - Math.round(0.03 * SR)); b = Math.min(pcm.length - 1, b + Math.round(0.08 * SR));
  return pcm.subarray(a, b + 1);
}
function writeWav(file, pcm) {
  const h = Buffer.alloc(44); const n = pcm.length * 2;
  h.write('RIFF', 0); h.writeUInt32LE(36 + n, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(n, 40);
  fs.writeFileSync(file, Buffer.concat([h, Buffer.from(pcm.buffer, pcm.byteOffset, n)]));
}
const sayFile = (text) => path.join(AUD, crypto.createHash('sha1').update(`${VOICE}|${RATE}|${text}`).digest('hex').slice(0, 16) + '.wav');
function synth(text) {
  const f = sayFile(text);
  if (fs.existsSync(f) && fs.statSync(f).size > 1000) return Promise.resolve(f);
  return new Promise((res, rej) => execFile('say', ['-v', VOICE, '-r', String(RATE), `--data-format=LEI16@${SR}`, '-o', f + '.tmp.wav', text], (err) => {
    if (err) return rej(err); fs.renameSync(f + '.tmp.wav', f); res(f);
  }));
}

const T0 = loadTheater({ withTiming: false });
const jobs = [];
for (const sc of T0.scenes) for (const s of T0.sentencesOf(sc).flat()) jobs.push(speechOf(s.say));
const uniq = [...new Set(jobs)];
console.log(`${T0.scenes.length} scenes, ${jobs.length} sentences, ${uniq.length} unique; voice ${VOICE} @ ${RATE}`);
let done = 0; const queue = [...uniq]; const N = 8;
await Promise.all(Array.from({ length: N }, async () => { while (queue.length) { const s = queue.shift(); await synth(s); done++; if (done % 25 === 0) console.log(`  synthesized ${done}/${uniq.length}`); } }));

// Timing per scene from trimmed durations.
const pcmCache = new Map(); const pcmOf = (text) => { const f = sayFile(text); if (!pcmCache.has(f)) pcmCache.set(f, readWav(f)); return pcmCache.get(f); };
const TIMING = {};
for (const sc of T0.scenes) {
  const durs = T0.sentencesOf(sc).flat().map((s) => pcmOf(speechOf(s.say)).length / SR);
  const tm = T0.layoutTiming(sc, durs); tm.sig = T0.signature(sc);
  // round for compactness
  tm.dur = +tm.dur.toFixed(3); tm.beats.forEach((b) => { b.start = +b.start.toFixed(3); b.end = +b.end.toFixed(3); b.sents.forEach((s) => { s.start = +s.start.toFixed(3); s.end = +s.end.toFixed(3); }); });
  TIMING[sc.id] = tm;
}
fs.writeFileSync(path.join(SRC, 'timing.js'), '/* generated by tools/build_audio.mjs */\nwindow.TIMING = ' + JSON.stringify(TIMING) + ';\n');

// Assemble the narration track using the same scene order and timing.
const Th = loadTheater({ withTiming: true });
const total = Math.ceil(Th.duration * SR) + SR; const track = new Int16Array(total);
for (const sc of Th.scenes) {
  const sents = Th.sentencesOf(sc).flat(); let q = 0;
  for (const b of sc.timing.beats) for (const s of b.sents) {
    const pcm = pcmOf(speechOf(sents[q++].say)); const at = Math.round((sc.start + s.start) * SR);
    track.set(pcm.subarray(0, Math.max(0, Math.min(pcm.length, total - at))), at);
  }
}
const wav = path.join(BUILD, 'narration.wav'); writeWav(wav, track);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wav, '-ac', '1', '-ar', '22050', '-b:a', '48k', path.join(BUILD, 'narration.mp3')]);
// Captions (WebVTT + SRT)
const ts = (x, sep) => { const h = Math.floor(x / 3600), m = Math.floor(x / 60) % 60, s = Math.floor(x) % 60, ms = Math.round((x % 1) * 1000); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}${sep}${String(ms).padStart(3, '0')}`; };
const vtt = ['WEBVTT', ''], srt = [];
Th.cues.forEach((c, i) => { vtt.push(`${ts(c.start, '.')} --> ${ts(c.end, '.')}`, c.text, ''); srt.push(String(i + 1), `${ts(c.start, ',')} --> ${ts(c.end, ',')}`, c.text, ''); });
fs.writeFileSync(path.join(BUILD, 'captions.vtt'), vtt.join('\n')); fs.writeFileSync(path.join(BUILD, 'captions.srt'), srt.join('\n'));
const mm = (x) => `${Math.floor(x / 60)}:${String(Math.round(x % 60)).padStart(2, '0')}`;
console.log(`Total duration ${mm(Th.duration)} (${Th.duration.toFixed(1)} s); ${Th.cues.length} caption cues; ${Th.termIndex.length} lexicon terms`);
for (const ch of Th.chapters) { const sc = Th.scenes.filter((s) => s.chapter === ch); console.log(`  ${(ch.roman || '·').padEnd(5)} ${ch.title.padEnd(22)} ${mm(sc.reduce((a, s) => a + s.dur, 0))}`); }
