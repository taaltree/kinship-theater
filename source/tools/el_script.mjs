// Build per-scene ElevenLabs narration texts from the chapter beats.
// Writes BUILD/el/requests.json: [{ scene, text, chars, hash, sentences: [{beat, text}] }].
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { loadTheater, BUILD } from './load.mjs';

// Undo respellings that were tuned for macOS `say`; ElevenLabs reads the real names well.
const REVERSE = [
  ['Grin-nell', 'Grinnell'], ['Lie-bold', 'Leibold'], ['Levvins', 'Levins'], ['Para-meesium', 'Paramecium'],
  ['Pie-sasster', 'Pisaster'], ['Rosen-zwyg', 'Rosenzweig'], ['Sharnoff', 'Charnov'], ['Zuh-net', 'Zanette'],
  ['Soolay', 'Soulé'], ['Kodrick-Brown', 'Kodric-Brown'], ['Krakatow', 'Krakatau'], ['Ilka', 'Ilkka'],
  ['Semmy-balanus', 'Semibalanus'], ['uh-lee-lopathy', 'allelopathy'], ['Soberon', 'Soberón'],
  ['Z-N-G-I', 'Z-N-G-I'], ['B A M', 'B-A-M'], ['C S R', 'C-S-R'], ['Lotka Volterra', 'Lotka-Volterra'],
  ['Nicholson Bailey', 'Nicholson-Bailey'], ['Beverton Holt', 'Beverton-Holt'], ['Rosen-zwyg MacArthur', 'Rosenzweig-MacArthur'],
];
// Respellings and symbol readings that still help.
const FORWARD = [
  [/–/g, '-'], [/—/g, ', '], [/ʻ/g, ''], [/Ŝ/g, 'S hat'], [/R\*/g, 'R star'], [/p\*/g, 'p star'],
  [/λ/g, 'lambda'], [/α/g, 'alpha'], [/θ/g, 'theta'], [/ν/g, 'nu'], [/τ/g, 'tau'], [/γ/g, 'gamma'], [/β/g, 'beta'],
  [/Type III\b/g, 'Type three'], [/Type II\b/g, 'Type two'], [/Type I\b/g, 'Type one'],
  [/Chthamalus/g, 'Thamalus'], [/\bGause\b/g, 'Gowza'], [/Mouquet/g, 'Moo-kay'], [/Loreau/g, 'Lor-oh'],
  [/juglone/g, 'jug-lone'], [/Cumbrae/g, 'Cumbray'], [/Åland/g, 'Oh-land'], [/\bSLOSS\b/g, 'sloss'], [/\bZNGI\b/g, 'Z-N-G-I'],
  [/\bBAM\b/g, 'B-A-M'], [/Hawai'?i/g, 'Hawaii'],
];
export function elText(s) {
  let x = s;
  for (const [a, b] of REVERSE) x = x.split(a).join(b);
  for (const [re, rep] of FORWARD) x = x.replace(re, rep);
  return x.replace(/\s+/g, ' ').trim();
}

export function buildRequests() {
  const Th = loadTheater({ withTiming: false });
  return Th.scenes.map((sc) => {
    const groups = Th.sentencesOf(sc);
    const sentences = groups.flatMap((g, beat) => g.map((s) => ({ beat, text: elText(s.say) })));
    // Beats separated by a paragraph break (a longer natural pause); sentences by spaces.
    const text = groups.map((g, beat) => sentences.filter((s) => s.beat === beat).map((s) => s.text).join(' ')).join('\n\n');
    const hash = crypto.createHash('sha1').update('el|' + text).digest('hex').slice(0, 12);
    return { scene: sc.id, text, chars: text.length, hash, sentences };
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const req = buildRequests(); const dir = path.join(BUILD, 'el'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'requests.json'), JSON.stringify(req, null, 1));
  const total = req.reduce((a, r) => a + r.chars, 0);
  console.log(`${req.length} scenes · ${req.reduce((a, r) => a + r.sentences.length, 0)} sentences · ${total} characters · longest scene ${Math.max(...req.map((r) => r.chars))} chars`);
}
