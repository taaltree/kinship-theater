// Build all deliverables from source: local player + audio, artifact bundle, captions, study guide.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildPlayer } from './build_player.mjs';
import { BUILD, OUT, SRC } from './load.mjs';

const cp = (a, b) => { fs.copyFileSync(a, b); console.log('  ', path.relative(OUT, b) || b); };
buildPlayer({ mode: 'local', out: path.join(OUT, 'The_Kinship_Theater.html') }); console.log('   The_Kinship_Theater.html');
cp(path.join(BUILD, 'soundtrack.m4a'), path.join(OUT, 'soundtrack.m4a'));
cp(path.join(BUILD, 'captions.vtt'), path.join(OUT, 'The_Kinship_Theater_captions.vtt'));
cp(path.join(BUILD, 'captions.srt'), path.join(OUT, 'The_Kinship_Theater_captions.srt'));
execFileSync('node', [path.join(SRC, 'tools/build_guide.mjs')], { stdio: 'inherit' });
const art = path.join(BUILD, 'artifact'); fs.mkdirSync(art, { recursive: true });
buildPlayer({ mode: 'artifact', out: path.join(art, 'kinship-theater.html') });
cp(path.join(BUILD, 'soundtrack.m4a'), path.join(art, 'soundtrack.m4a'));
cp(path.join(OUT, 'The_Kinship_Theater_Study_Guide.html'), path.join(art, 'The_Kinship_Theater_Study_Guide.html'));
console.log('artifact bundle:', art);
