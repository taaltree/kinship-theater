// Render the program to MP4: parallel headless-Chrome workers produce H.264 segments
// (idempotent per content hash), then segments are concatenated and muxed with narration + subtitles.
// Usage: node tools/render_video.mjs [--captions] [--workers 6] [--fps 30] [--out file.mp4] [--from s --to s]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { launch } from './cdp.mjs';
import { buildPlayer } from './build_player.mjs';
import { BUILD, OUT } from './load.mjs';

const argv = process.argv.slice(2); const opt = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const CAPS = argv.includes('--captions'); const FPS = Number(opt('--fps', 30)); const WORKERS = Number(opt('--workers', 6));
const CHUNK = FPS * 60; // 60-second segments
const page = path.join(BUILD, 'render.html'); const html = buildPlayer({ mode: 'local', out: page });
const hash = crypto.createHash('sha1').update(html).digest('hex').slice(0, 10);
const segDir = path.join(BUILD, 'segments', `${CAPS ? 'cap' : 'clean'}-${FPS}-${hash}`); fs.mkdirSync(segDir, { recursive: true });
const outFile = opt('--out', path.join(OUT, CAPS ? 'The_Ecological_Theater_captioned.mp4' : 'The_Ecological_Theater.mp4'));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// Probe duration
const probe = await launch(); const pp = await probe.open('file://' + page + '?render'); await pp.evaluate('window.__theater.ready');
const duration = await pp.evaluate('window.__theater.duration'); probe.close();
const t0 = Number(opt('--from', 0)), t1 = Math.min(duration, Number(opt('--to', duration)));
const f0 = Math.floor(t0 * FPS), f1 = Math.ceil(t1 * FPS);
const chunks = []; for (let f = f0; f < f1; f += CHUNK) chunks.push([f, Math.min(f1, f + CHUNK)]);
const segName = ([a]) => path.join(segDir, `seg_${String(a).padStart(7, '0')}.mp4`);
const todo = chunks.filter((c) => !fs.existsSync(segName(c) + '.done'));
log(`duration ${duration.toFixed(1)} s · frames ${f0}–${f1} · ${chunks.length} segments (${todo.length} to render) · ${WORKERS} workers · ${segDir}`);

let done = chunks.length - todo.length; const start = Date.now(); let framesDone = 0; const framesTodo = todo.reduce((s, [a, b]) => s + b - a, 0);
async function worker(id) {
  const chrome = await launch();
  try {
    const p = await chrome.open('file://' + page + '?render'); await p.evaluate('window.__theater.ready');
    while (todo.length) {
      const [a, b] = todo.shift(); const file = segName([a, b]);
      const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
        '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-tune', 'animation', '-pix_fmt', 'yuv420p', '-g', String(FPS * 10), '-r', String(FPS), file + '.tmp.mp4'], { stdio: ['pipe', 'ignore', 'inherit'] });
      const exited = new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg exit ' + c)))));
      for (let f = a; f < b; f++) {
        const url = await p.evaluate(`window.__theater.frame(${(f / FPS).toFixed(5)}, {captions:${CAPS}, q:0.93})`);
        const buf = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
        if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
        framesDone++;
      }
      ff.stdin.end(); await exited; fs.renameSync(file + '.tmp.mp4', file); fs.writeFileSync(file + '.done', '');
      done++; const el = (Date.now() - start) / 1000; const rate = framesDone / el;
      log(`w${id} segment ${done}/${chunks.length} · ${rate.toFixed(1)} fps · ETA ${((framesTodo - framesDone) / rate / 60).toFixed(1)} min`);
    }
    const errs = await p.evaluate('window.__theater.errors()'); if (errs.length) log(`w${id} render errors:`, errs.slice(0, 5));
  } finally { chrome.close(); }
}
await Promise.all(Array.from({ length: Math.min(WORKERS, Math.max(1, todo.length)) }, (_, i) => worker(i)));

// Concatenate + mux
const list = path.join(segDir, 'list.txt'); fs.writeFileSync(list, chunks.map((c) => `file '${segName(c)}'`).join('\n'));
const narr = fs.existsSync(path.join(BUILD, 'soundtrack.wav')) ? path.join(BUILD, 'soundtrack.wav') : path.join(BUILD, 'narration.wav'), srt = path.join(BUILD, 'captions.srt');
const full = t0 === 0 && t1 === duration;
const args = ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list];
if (full) { args.push('-i', narr); if (!CAPS) args.push('-i', srt); }
else args.push('-ss', String(t0), '-i', narr);
args.push('-map', '0:v', '-map', '1:a');
if (full && !CAPS) args.push('-map', '2:s', '-c:s', 'mov_text', '-metadata:s:s:0', 'language=eng', '-metadata:s:s:0', 'title=English');
args.push('-c:v', 'copy', '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '44100', '-c:a', 'aac_at', '-b:a', '160k', '-ac', '2', '-t', String(t1 - t0),
  '-metadata', 'title=The Ecological Theater', '-metadata', 'comment=Core ecological theory for the comprehensive exam', '-movflags', '+faststart', outFile);
execFileSync('ffmpeg', args, { stdio: 'inherit' });
log(`wrote ${outFile} (${(fs.statSync(outFile).size / 1e6).toFixed(1)} MB) in ${((Date.now() - start) / 60000).toFixed(1)} min`);
