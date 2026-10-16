// Render preview frames of one or more scenes as a contact sheet (and optional full-size PNGs).
// Usage:
//   node tools/stills.mjs <sceneId|chapterId> [--beats] [--at 0.1,0.5,0.9] [--t 3.2,10] [--full] [--captions] [--cols 2]
//   --beats (default): one frame ~2.5 s after each beat starts, plus one near the scene end.
//   --at: fractions of scene duration; --t: local seconds. --full also writes 1920×1080 PNGs.
// Prints the PNG path(s). Exits non-zero if the scene threw render errors.
import fs from 'node:fs';
import path from 'node:path';
import { launch, dataUrlToBuffer } from './cdp.mjs';
import { buildPlayer } from './build_player.mjs';
import { BUILD } from './load.mjs';

const argv = process.argv.slice(2); const target = argv[0];
const opt = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : null);
if (!target) { console.error('usage: node tools/stills.mjs <sceneId|chapterId> [--at ...|--t ...|--beats] [--full]'); process.exit(2); }
const outDir = path.join(BUILD, 'stills'); fs.mkdirSync(outDir, { recursive: true });
const page = path.join(BUILD, `preview-${process.pid}.html`); buildPlayer({ mode: 'local', out: page });
const chrome = await launch();
let code = 0;
try {
  const p0 = await chrome.open('file://' + page + '?render');
  const withTimeout = (pr, ms, what) => Promise.race([pr, new Promise((_, rej) => setTimeout(() => rej(new Error('timed out: ' + what)), ms))]);
  const p = { ...p0, evaluate: (e) => withTimeout(p0.evaluate(e), 90000, e.slice(0, 60)) };
  await p.evaluate('window.__theater.ready');
  const scenes = await p.evaluate('window.__theater.scenes');
  const list = scenes.filter((s) => s.id === target || s.id.startsWith(target + '-'));
  if (!list.length) throw new Error('no scene matches ' + target + '. Known: ' + scenes.map((s) => s.id).join(', '));
  for (const sc of list) {
    let local;
    if (opt('--t')) local = opt('--t').split(',').map(Number);
    else if (opt('--at')) local = opt('--at').split(',').map((f) => Number(f) * sc.dur);
    else { local = sc.beats.map(([b]) => Math.min(sc.dur - 0.5, b + 2.5)); local.push(sc.dur - 1.0); if (!local.length) local = [sc.dur * 0.5]; }
    const times = local.map((x) => sc.start + Math.max(0.05, Math.min(sc.dur - 0.05, x)));
    const cols = Number(opt('--cols') || (times.length > 4 ? 3 : 2)); const w = cols === 3 ? 640 : 960;
    const sheet = await p.evaluate(`window.__theater.sheet(${JSON.stringify(times)}, {cols:${cols}, w:${w}, captions:${argv.includes('--captions')}})`);
    const f = path.join(outDir, `${sc.id}.jpg`); fs.writeFileSync(f, dataUrlToBuffer(sheet));
    console.log(`${sc.id}  dur ${sc.dur.toFixed(1)}s${sc.estimated ? ' (estimated timing)' : ''}  frames at local t = ${local.map((x) => x.toFixed(1)).join(', ')}`);
    console.log(`  sheet: ${f}`);
    if (argv.includes('--full')) for (const [i, T] of times.entries()) { const fp = path.join(outDir, `${sc.id}_${i}.jpg`); fs.writeFileSync(fp, dataUrlToBuffer(await p.evaluate(`window.__theater.frame(${T}, {q:0.95, captions:${argv.includes('--captions')}})`))); console.log('  full: ' + fp); }
  }
  // timing check: render 30 frames across the scenes
  const t0 = Date.now(); const probe = list.flatMap((sc) => Array.from({ length: 10 }, (_, k) => sc.start + (k + 0.5) / 10 * sc.dur));
  for (const T of probe) await p.evaluate(`(window.__theater.frame(${T}), 0)`);
  console.log(`  avg render+encode ${((Date.now() - t0) / probe.length).toFixed(0)} ms/frame`);
  const errs = await p.evaluate('window.__theater.errors()');
  const logs = [...new Set([...errs, ...p.logs])];
  if (logs.length) { code = 1; console.log('  ERRORS:\n   ' + logs.slice(0, 12).join('\n   ')); }
} catch (e) { console.error(e.message); code = 1; }
chrome.close(); fs.rmSync(page, { force: true });
process.exit(code);
