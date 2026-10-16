// Download finished ElevenLabs takes listed in saved run-status JSON files.
// Usage: node tools/el_fetch.mjs <status.json> [...]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { BUILD } from './load.mjs';
import { buildRequests } from './el_script.mjs';

const DIR = path.join(BUILD, 'el');
const bySession = Object.fromEntries(fs.readFileSync(path.join(DIR, 'sessions.tsv'), 'utf8').trim().split('\n').map((l) => l.split('\t').reverse()));
const req = Object.fromEntries(buildRequests().map((r) => [r.scene, r]));
for (const f of process.argv.slice(2)) {
  const st = JSON.parse(fs.readFileSync(f, 'utf8'));
  for (const g of st.generations) {
    const sess = (g.content_url || '').match(/content_generation\/([^/]+)\//)?.[1]; const scene = bySession[sess];
    if (!scene) { console.log('unmapped generation', g.id, sess); continue; }
    if (g.status !== 'completed') { console.log(scene, 'status', g.status); continue; }
    const out = path.join(DIR, `${scene}.mp3`);
    if (!fs.existsSync(out)) execFileSync('curl', ['-sS', '--fail', '-o', out, g.content_url]);
    const dur = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out]).toString());
    fs.writeFileSync(path.join(DIR, `${scene}.json`), JSON.stringify({ scene, hash: req[scene].hash, generation_id: g.id, session: sess, duration: dur }));
    console.log(`${scene.padEnd(16)} ${dur.toFixed(1)} s  (${(req[scene].chars / dur).toFixed(1)} chars/s)`);
  }
}
const have = fs.readdirSync(DIR).filter((x) => x.endsWith('.mp3')).length;
console.log(`${have}/${Object.keys(req).length} takes on disk`);
