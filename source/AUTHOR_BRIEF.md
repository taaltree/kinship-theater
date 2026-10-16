# The Kinship Theater — brief for scene animators

You are animating one chapter of **The Kinship Theater**, a narrated, animated 1920×1080 lecture (≈19 min) for
wildlife-ecology graduate students on relatedness, inbreeding and identity by descent (IBD): the mechanisms,
the estimators and tools, and which methods work, why, and when. It is Part 3 of a series whose engine and
house style come from "The Ecological Theater" (https://taaltree.github.io/ecological-theater/).

## Read first (in this order)
1. `ENGINE_GUIDE.md` — engine contract, layout regions, timing API (`S`), drawing API (`g`), hard rules.
   (Where it says "do not change beat text", that applies here too: narration audio is already recorded and
   `timing.js` holds real beat times. Do NOT edit any `t`, `s`, `pause`, beat count, scene ids, or chapter
   metadata. You may tune a term's `beat` value, and you may add a chapter `motif(g, t)`.)
2. `../ref/ch1_population.js` — reference implementation from the earlier program. Match its quality, idioms
   (`vis(S,k0,k1)` crossfades, `S.p(k, d, delay)` syncing, init() precomputation), and level of motion.
   Skim one or two other files in `../ref/` for more idioms (e.g. ch4_predation.js, ch8_neutral.js).
3. `chapters/ch00_kit.js` — the shared visual vocabulary, `window.KIN`: `KIN.person` (square = male,
   circle = female, diamond = unknown; optional allele beads), `KIN.alleles`, `KIN.bead`, `KIN.family`
   (pedigree connectors), `KIN.link`, `KIN.chrom` (chromosome bar with coloured IBD segments), `KIN.card`
   (tool card), `KIN.vis`, `KIN.label`, `KIN.FOUNDER` (founder-allele colours), `KIN.SEX`. Use these so the
   whole program speaks one visual language. Do not edit the kit; add local helpers inside your file.
4. Your chapter file. Each scene has a `/* VISUAL BRIEF */` comment describing the intended animation, beat by
   beat. Treat it as a strong starting point, not a straitjacket: improve it if a clearer picture exists, but
   keep every beat's picture in sync with what the narration says at that moment. Delete each
   `KIN.pending(...)` stub and replace it with the real `draw` (and `init` if needed).

## What "good" means here
- **Teach the mechanism visually.** The viewer should *see* why: alleles flowing down pedigrees, probability
  draws converging, points landing in k-space, distributions widening as loci drop, runs of homozygosity
  appearing where a segment arrives twice. Motion should carry meaning, not decorate.
- **Every beat visibly changes the picture**, and each named thing appears when it is spoken (≈2.6 words/s;
  e.g. something mentioned ~15 words into beat 2 → `S.p(2, 0.8, 5.8)`). Use `node tools/stills.mjs <scene> --t ...`
  at the moments a term is spoken to verify sync.
- **Scientific accuracy is non-negotiable.** Values on screen must be correct (Cotterman: PO (k0,k1,k2) =
  (0,1,0); FS (¼,½,¼); HS/avuncular/GP (½,½,0); U (1,0,0); φ = k1/4 + k2/2; Jacquard Δ7,Δ8,Δ9 = k2,k1,k0
  when outbred; φ = Δ1 + ½(Δ3+Δ5+Δ7) + ¼Δ8; self-kinship (1+F)/2; r = 2φ/√((1+F_i)(1+F_j)); F_t = 1−(1−1/2N)^t;
  ROH mean length ≈ 100/(2g) cM; half-sib mating F = 1/8; GRM A_ij = (1/L)Σ(x_i−2p)(x_j−2p)/(2p(1−p)), estimating
  2φ off-diagonal and 1+F on the diagonal). Where a figure shows simulated or stylized data, compute it
  deterministically in `init()` with `U.rng(seed)` from a real model when practical (e.g. simulate genotypes
  and actually compute estimates), and add a small "illustrative" tag (17px, ink3) when it is stylized.
- **Clean figures.** The user's standing preference: keep figures clean; explanatory notes and value
  definitions belong in the narration/lexicon, not as paragraphs of text inside the figure. Use short labels,
  axis titles, equations and pills — no sentences longer than ~8 words on the stage.
- **House style:** dark slate, luminous pigment dots, Instrument Serif display text, IBM Plex Sans labels,
  STIX math via `g.math`. Chapter accent colour `COL` for highlights. Semantic colours used program-wide:
  IBD/founder alleles from `KIN.FOUNDER`; females rose, males lagoon (`KIN.SEX`); kinship (pairwise) lagoon,
  inbreeding (within-individual) coral, reference/allele frequency ochre, warnings/misclassification coral,
  "works" moss, "caution" ochre. Fill the stage generously; avoid huddling at the top.
- **Layout rules (hard):** nothing in the header (y < 195), nothing in the caption band (y > 915), nothing
  overlapping the lexicon rail (x > 1330) when the scene has terms. Min sizes: annotations 21px, axis words
  22px, equations 40–56px. No overlapping labels.
- **Determinism and speed:** no Math.random/Date; precompute in init(); keep frames < ~25 ms average (the stills
  tool prints ms/frame — the reference chapters run ~100 ms/frame here including JPEG encode, so judge by
  comparison: don't be dramatically slower than `node tools/stills.mjs pop-exp` would be).

## Checking your work (do this repeatedly)
```
cd /home/claude/kinship-theater/source
node --check chapters/<your file>.js
node tools/stills.mjs <scene-id>                        # one frame per beat + end, contact sheet
node tools/stills.mjs <scene-id> --t 4,12.5,30 --cols 3 # specific local times
node tools/stills.mjs <scene-id> --t 20 --full          # full-size frame for close inspection
node tools/stills.mjs <chapter-id>                      # all scenes in the chapter
```
Open every sheet/frame with the Read tool and look critically: overlap, clipping, empty regions, legibility,
sync with narration, rail and caption-band violations, render errors. Iterate until each scene is polished.
Print the beat timing for a scene with:
`node -e "import('./tools/load.mjs').then(({loadTheater})=>{const T=loadTheater();const s=T.scenes.find(x=>x.id==='SCENE');s.timing.beats.forEach((b,k)=>console.log(k,b.start.toFixed(1),b.end.toFixed(1),b.sents.map(z=>z.cap).join(' | ')))})"`

## Deliverable
Edit only your chapter file. When done, reply with: per scene, one or two lines on what the animation shows,
any deviations from the brief and why, and the final average ms/frame. Do not paste code.
