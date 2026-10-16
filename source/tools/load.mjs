// Load engine + chapters into a Node VM context (no DOM) to read scripts and timing.
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

export const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const BUILD = process.env.THEATER_BUILD || path.join(os.tmpdir(), 'kinship-theater-build');
export const OUT = path.resolve(SRC, '..');

export function sourceFiles() {
  const ch = fs.readdirSync(path.join(SRC, 'chapters')).filter((f) => /^ch\d.*\.js$/.test(f)).sort().map((f) => 'chapters/' + f);
  return ['engine.js', ...ch];
}

export function loadTheater({ withTiming = true } = {}) {
  const ctx = { console, Math, Date, JSON };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of sourceFiles()) vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), ctx, { filename: f });
  const tf = path.join(SRC, 'timing.js');
  if (withTiming && fs.existsSync(tf)) vm.runInContext(fs.readFileSync(tf, 'utf8'), ctx, { filename: 'timing.js' });
  return ctx.Theater.build(withTiming ? ctx.TIMING : {});
}
