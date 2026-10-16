// Render the whole program every 0.5 s (no encoding) and report render errors and slow frames.
import path from 'node:path';
import { launch } from './cdp.mjs';
import { buildPlayer } from './build_player.mjs';
import { BUILD } from './load.mjs';
const page = path.join(BUILD, 'scan.html'); buildPlayer({ mode: 'local', out: page });
const chrome = await launch();
try {
  const p = await chrome.open('file://' + page + '?render'); await p.evaluate('window.__theater.ready');
  const res = await p.evaluate(`(() => { const T = window.__theater; const slow = []; let worst = 0, n = 0;
    for (let t = 0.05; t < T.duration; t += 0.5) { const a = performance.now(); T.frame(t, { noImage: true }); const d = performance.now() - a; n++; if (d > worst) worst = d; if (d > 40) slow.push([+t.toFixed(1), +d.toFixed(0)]); }
    return { n, worst: +worst.toFixed(1), slow: slow.slice(0, 20), errors: T.errors().slice(0, 30), duration: T.duration, estimated: T.scenes.filter(s => s.estimated).map(s => s.id) }; })()`);
  console.log(JSON.stringify(res, null, 1));
  if (p.logs.length) console.log('console:', p.logs.slice(0, 10));
} finally { chrome.close(); }
