# The Kinship Theater

An animated, narrated lecture on relatedness, inbreeding and identity by descent: the mechanisms, the estimators and software, and which methods work, why, and when (19:22, 39 numbered lexicon terms). Written for wildlife-ecology graduate students working with SNP data, from amplicon panels to whole genomes.

It starts from a student's question: if estimating relatedness depends on inbreeding, and estimating inbreeding depends on relatedness, how can you estimate either? The short answer is that both are identity by descent, between two individuals or within one, estimated together in one kinship matrix. The real dependency is on the reference population (allele frequencies and structure), which is handled by modeling structure, using methods that allow inbreeding, using runs of homozygosity when the data can see them, and validating by simulation.

**Watch:** https://taaltree.github.io/kinship-theater/
**Study guide:** [HTML](https://taaltree.github.io/kinship-theater/The_Kinship_Theater_Study_Guide.html) · [PDF](https://taaltree.github.io/kinship-theater/The_Kinship_Theater_Study_Guide.pdf)
**Series:** [The Ecological Theater](https://taaltree.github.io/ecological-theater/) · [The Epistemic Theater](https://taaltree.github.io/epistemic-theater/) · The Kinship Theater

| | Chapter | Starts | Scenes |
|---|---|---|---|
| I | [Identity by Descent](https://taaltree.github.io/kinship-theater/#ch1) | 0:42 | Alike in state, alike by descent · The kinship coefficient · Inbreeding is kinship, one generation back · Relatedness, rescaled |
| II | [The Reference Population](https://taaltree.github.io/kinship-theater/#ch2) | 3:51 | Identical by descent, since when? · Rare alleles carry the signal · When structure masquerades as kinship |
| III | [Reading Relationships](https://taaltree.github.io/kinship-theater/#ch3) | 6:37 | Cotterman's triangle · Nine ways to share · Segments, not loci · Asking a relative question |
| IV | [Measuring Inbreeding](https://taaltree.github.io/kinship-theater/#ch4) | 10:42 | Inbred, yet in equilibrium · What fakes inbreeding · Does inbreeding vary? · Runs of homozygosity · Reading runs responsibly |
| V | [Choosing Methods](https://taaltree.github.io/kinship-theater/#ch5) | 15:44 | Let the pedigree generate the sharing · Which method, when · Simulate your own power · The egg was never the problem |

## What is here

- `index.html`: the interactive player (chapters, captions, playback speed, searchable lexicon). Keyboard: space to play, ←/→ to skip 5 s, [ and ] to change chapter, c for captions.
- `soundtrack.m4a`: narration (synthesized voice) mixed with a generated ambient score.
- `The_Kinship_Theater_Study_Guide.*`: equations, key references and software, a "which method, when" table, lexicon with timestamps, self-check questions, references.
- `The_Kinship_Theater_captions.*`: WebVTT and SRT captions.
- `source/`: the deterministic canvas engine (shared with The Ecological Theater), chapter scripts, and build tools.

Most figures are computed from deterministic simulations inside the chapter files (gene dropping through pedigrees, recombination, Wright–Fisher drift, GRM, KING-robust and PC-Relate estimates, Cotterman and Jacquard fits). Figures tagged "illustrative" show qualitative patterns.

## Rebuilding

Requires Node 22+, ffmpeg, and Google Chrome (set `CHROME` to its path). Narration comes from ElevenLabs (one take per scene).

```bash
cd source
node tools/el_script.mjs        # per-scene narration texts → build/el/requests.json; synthesize each, save as build/el/<scene>.mp3
node tools/build_audio_el.mjs   # align sentences, lay out timing, narration track + captions
node tools/build_music.mjs                               # score mixed under narration
node tools/stills.mjs <scene-id>                         # preview frames of any scene
node tools/render_video.mjs                              # 1080p MP4 (add --captions for burned-in captions)
node tools/assemble.mjs && node tools/build_site.mjs     # player, study guide, this site
```
