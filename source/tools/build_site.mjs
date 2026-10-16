// Assemble the GitHub Pages site in ../site (index.html player + assets + source).
// Run tools/assemble.mjs first so the study guide and captions are current.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildPlayer } from './build_player.mjs';
import { launch, dataUrlToBuffer } from './cdp.mjs';
import { BUILD, OUT, SRC, loadTheater } from './load.mjs';

const SITE = path.join(OUT, 'site');
fs.mkdirSync(SITE, { recursive: true });
const cp = (a, b) => { fs.mkdirSync(path.dirname(b), { recursive: true }); fs.copyFileSync(a, b); };

buildPlayer({ mode: 'local', out: path.join(SITE, 'index.html') });
cp(path.join(BUILD, 'soundtrack.m4a'), path.join(SITE, 'soundtrack.m4a'));
for (const f of ['The_Kinship_Theater_Study_Guide.html', 'The_Kinship_Theater_Study_Guide.pdf', 'The_Kinship_Theater_captions.vtt', 'The_Kinship_Theater_captions.srt']) cp(path.join(OUT, f), path.join(SITE, f));
fs.writeFileSync(path.join(SITE, '.nojekyll'), '');

// Social preview poster (title frame), 1200×675.
const chrome = await launch();
try {
  const p = await chrome.open('file://' + path.join(SITE, 'index.html') + '?render'); await p.evaluate('window.__theater.ready');
  const tmp = path.join(BUILD, 'poster_full.jpg'); fs.writeFileSync(tmp, dataUrlToBuffer(await p.evaluate('window.__theater.frame(10.5, {q: 0.95})')));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', tmp, '-vf', 'scale=1200:675:flags=lanczos', '-q:v', '3', path.join(SITE, 'poster.jpg')]);
} finally { chrome.close(); }

// Source code, so the program can be rebuilt from the repo.
const SRC_OUT = path.join(SITE, 'source');
fs.rmSync(SRC_OUT, { recursive: true, force: true });
for (const f of ['engine.js', 'player.html', 'player.js', 'timing.js', 'guide_content.mjs', 'ENGINE_GUIDE.md', 'AUTHOR_BRIEF.md']) cp(path.join(SRC, f), path.join(SRC_OUT, f));
for (const d of ['chapters', 'tools']) for (const f of fs.readdirSync(path.join(SRC, d))) if (/\.(m?js)$/.test(f)) cp(path.join(SRC, d, f), path.join(SRC_OUT, d, f));

// Portable build-cache default for the published copy (no local paths).
{ const lf = path.join(SRC_OUT, 'tools', 'load.mjs'); let L = fs.readFileSync(lf, 'utf8');
  L = L.replace(/export const BUILD = process\.env\.THEATER_BUILD \|\| '[^']*';/, "export const BUILD = process.env.THEATER_BUILD || path.join(os.tmpdir(), 'kinship-theater-build');");
  if (!L.includes("import os from 'node:os'")) L = L.replace("import path from 'node:path';", "import path from 'node:path';\nimport os from 'node:os';");
  fs.writeFileSync(lf, L); }
const Th = loadTheater();
const mm = (x) => `${Math.floor(x / 60)}:${String(Math.floor(x % 60)).padStart(2, '0')}`;
const rows = Th.chapters.filter((c) => c.roman).map((c) => { const s = Th.scenes.filter((x) => x.chapter === c); return `| ${c.roman} | [${c.title}](https://taaltree.github.io/kinship-theater/#ch${c.index}) | ${mm(s[0].start)} | ${s.filter((x) => x.kind !== 'card').map((x) => x.title).join(' · ')} |`; }).join('\n');
fs.writeFileSync(path.join(SITE, 'README.md'), `# The Kinship Theater

An animated, narrated lecture on relatedness, inbreeding and identity by descent: the mechanisms, the estimators and software, and which methods work, why, and when (${mm(Th.duration)}, ${Th.termIndex.length} numbered lexicon terms). Written for wildlife-ecology graduate students working with SNP data, from amplicon panels to whole genomes.

It starts from a student's question: if estimating relatedness depends on inbreeding, and estimating inbreeding depends on relatedness, how can you estimate either? The short answer is that both are identity by descent, between two individuals or within one, estimated together in one kinship matrix. The real dependency is on the reference population (allele frequencies and structure), which is handled by modeling structure, using methods that allow inbreeding, using runs of homozygosity when the data can see them, and validating by simulation.

**Watch:** https://taaltree.github.io/kinship-theater/
**Study guide:** [HTML](https://taaltree.github.io/kinship-theater/The_Kinship_Theater_Study_Guide.html) · [PDF](https://taaltree.github.io/kinship-theater/The_Kinship_Theater_Study_Guide.pdf)
**Series:** [The Ecological Theater](https://taaltree.github.io/ecological-theater/) · [The Epistemic Theater](https://taaltree.github.io/epistemic-theater/) · The Kinship Theater

| | Chapter | Starts | Scenes |
|---|---|---|---|
${rows}

## What is here

- \`index.html\`: the interactive player (chapters, captions, playback speed, searchable lexicon). Keyboard: space to play, ←/→ to skip 5 s, [ and ] to change chapter, c for captions.
- \`soundtrack.m4a\`: narration (synthesized voice) mixed with a generated ambient score.
- \`The_Kinship_Theater_Study_Guide.*\`: equations, key references and software, a "which method, when" table, lexicon with timestamps, self-check questions, references.
- \`The_Kinship_Theater_captions.*\`: WebVTT and SRT captions.
- \`source/\`: the deterministic canvas engine (shared with The Ecological Theater), chapter scripts, and build tools.

Most figures are computed from deterministic simulations inside the chapter files (gene dropping through pedigrees, recombination, Wright–Fisher drift, GRM, KING-robust and PC-Relate estimates, Cotterman and Jacquard fits). Figures tagged "illustrative" show qualitative patterns.

## Rebuilding

Requires Node 22+, ffmpeg, and Google Chrome (set \`CHROME\` to its path). Narration comes from ElevenLabs (one take per scene).

\`\`\`bash
cd source
node tools/el_script.mjs        # per-scene narration texts → build/el/requests.json; synthesize each, save as build/el/<scene>.mp3
node tools/build_audio_el.mjs   # align sentences, lay out timing, narration track + captions
node tools/build_music.mjs                               # score mixed under narration
node tools/stills.mjs <scene-id>                         # preview frames of any scene
node tools/render_video.mjs                              # 1080p MP4 (add --captions for burned-in captions)
node tools/assemble.mjs && node tools/build_site.mjs     # player, study guide, this site
\`\`\`
`);
console.log('site assembled at', SITE);
