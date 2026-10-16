// Inline engine, chapters, timing and player into one HTML page.
// Usage: node tools/build_player.mjs [--mode local|artifact] [--out path]
import fs from 'node:fs';
import path from 'node:path';
import { SRC, BUILD, sourceFiles } from './load.mjs';

const inlineJS = (f) => `<script>/* ${f} */\n${fs.readFileSync(path.join(SRC, f), 'utf8').replace(/<\/script/gi, '<\\/script')}\n</script>`;

export function buildPlayer({ mode = 'local', out } = {}) {
  let html = fs.readFileSync(path.join(SRC, 'player.html'), 'utf8');
  const chapters = sourceFiles().filter((f) => f.startsWith('chapters/'));
  html = html.replace('<script src="engine.js"></script>', () => inlineJS('engine.js'));
  html = html.replace('<!-- CHAPTERS -->', () => chapters.map(inlineJS).join('\n'));
  html = html.replace('<script src="timing.js"></script>', () => (fs.existsSync(path.join(SRC, 'timing.js')) ? inlineJS('timing.js') : ''));
  html = html.replace('<script src="player.js"></script>', () => inlineJS('player.js'));
  if (mode === 'local') html = `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${html}\n</html>\n`;
  if (out) { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, html); }
  return html;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = process.argv.slice(2); const mode = a.includes('--mode') ? a[a.indexOf('--mode') + 1] : 'local';
  const out = a.includes('--out') ? a[a.indexOf('--out') + 1] : path.join(BUILD, 'player.html');
  buildPlayer({ mode, out });
  console.log(`wrote ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KB, ${mode})`);
}
