# The Ecological Theater — engine guide for chapter authors

An animated, narrated 1920×1080 lecture for graduate students preparing for ecology comprehensive
exams. Every frame is a **pure function of time**, rendered on a canvas by `engine.js`. Narration
audio is already generated from each scene's `beats`, and `timing.js` holds the real start/end time
of every beat. Your job is to write the `draw()` (and optional `init()`) functions so the visuals
teach the concept and stay in sync with the narration.

## Files

- `engine.js` — engine (read the `makeG` section for the drawing API). **Do not edit.**
- `chapters/ch1_population.js` — **reference implementation**. Read it fully before starting; match its
  quality, idioms, and level of motion.
- `chapters/chN_*.js` — your chapter. Narration, terms, and scene ids are already written.
- `tools/stills.mjs` — preview renderer (see "Checking your work").

## Hard rules

1. **Do not change** any beat text (`t`, `s`), the number of beats, `pause` values, scene `id`s, or
   chapter metadata. The audio was synthesized from them. You may tune the `beat` value of a term
   (when its lexicon card appears) and add a chapter `motif`.
2. **Deterministic.** Never use `Math.random()` or `Date`. Use `U.rng(seed)` inside `init()` and store
   results. `draw(g, t, S, D)` must depend only on its arguments, because frames are rendered out of
   order in parallel.
3. **Performance.** Keep a frame under ~25 ms (stills.mjs prints the average). Precompute simulations
   in `init()`. Pre-render heavy static imagery once to an offscreen canvas (`Theater.makeCanvas(w,h)`)
   and `drawImage` it. Avoid `shadowBlur`, `getImageData`, and thousands of path calls per frame.
4. **Edit only your chapter file(s).** Keep helpers local to the file (the file is an IIFE).

## Frame layout (1920×1080)

| Region | Bounds | Notes |
|---|---|---|
| Header | y < 195 | Engine draws chapter eyebrow, scene title, rule. Never draw here. |
| Stage (scene has terms) | x 80–1330, y 215–915 | The lexicon rail occupies x 1392–1840 automatically. |
| Stage (no terms) | x 80–1840, y 215–915 | |
| Caption band | y > 925 | Must stay empty: captions overlay here. |

Use the space generously. Figures should fill the stage, not huddle at the top. Typical two-panel
layout: panel labels at y≈262; left plot area x 150–640, right plot area x 780–1290; plot areas
y≈300–840. A full-width single figure: x 150–1290. Small-caps panel labels: 17px, `ls` 2.6, `PAL.ink3`.
Minimum text sizes: annotations 21px, axis words 22px, equations 40–56px. Leave clear gaps between
labels and curves; nothing may overlap the rail or caption band.

## Timing API (`S`, bound to the scene-local time `t` in seconds)

- `S.b(k)` start of beat k (fractional k interpolates within beat k: `S.b(2.5)` is mid-beat 2)
- `S.e(k)` end of beat k · `S.dur` scene length · `S.n` beat count
- `S.p(k, d=0.9, delay=0)` eased 0→1 progress starting at beat k (+delay s) over d s
- `S.io(k, d, delay)` ease-in-out version · `S.lin(k, d, delay)` linear version
- `S.ph(k)` linear progress through beat k · `S.span(k0, k1)` progress from start of k0 to start of k1
- `S.at(k)` has beat k started · `S.since(k)` seconds since beat k started · `S.end(d)` fade near scene end

Sync visuals to narration: a beat's speech runs at roughly **2.6 words per second**, so if a term is
mentioned ~20 words into beat 2, reveal it with `S.p(2, 0.8, 7.5)`. **Every beat must visibly change
the picture**, and the element being described should appear when it is spoken. Use a crossfade helper
like ch1's `vis(S, k0, k1)` (in at beat k0, out at beat k1) to swap panel states. The engine adds a
short dip-to-background transition between scenes.

## Drawing API (`g`)

Text and math
- `g.text(str, x, y, {size, role:'sans'|'display'|'math'|'mono', color, align, alpha, weight, italic, ls, maxW})` → width
- `g.wrap(str, x, y, width, {...text opts, lh})` → height · `g.lines(str, width, opts)` → array · `g.measure(str, opts)`
- `g.math(expr, x, y, {size, color, align, alpha})`: TeX-like. Supports `x_{i}`, `x^{2}`, `\frac{a}{b}`,
  `\hat{S}`, `\bar{x}`, `\text{...}`, `\mathbf{n}`, `\ln`, `\sum`, `\prod`, `\cdot`, `\times`, `\approx`,
  `\ge`, `\le`, `\to`, `\,` `\;` `\quad`, and Greek as Unicode (α λ θ ν τ ρ κ …). No `\left(`;
  plain parentheses only. Single Latin letters render italic.

Shapes
- `g.line(x1,y1,x2,y2,{color,w,alpha,dash,progress})` · `g.arrow(...,{head,both,progress})` · `g.carrow(x1,y1,x2,y2,bend,{...})` curved arrow
- `g.poly(pts,{color,w,alpha,progress,fill,close,dash})` partial-draw by arc length · `g.circle(x,y,r,{fill,stroke,w,alpha})` · `g.ellipse(x,y,rx,ry,{rot,...})` · `g.rect(x,y,w,h,{fill,stroke,r,alpha})`
- `g.glow(x,y,r,color,alpha)` additive halo · `g.dot(x,y,r,color,alpha,halo)` luminous dot (the house style for individuals)
- `g.pill(text,x,y,{color,size,align,alpha})` · `g.icon(kind,x,y,size,color,{alpha,flip,rot,flap,sway,flower})`
  kinds: bird, songbird, tree, conifer, fish, bug, butterfly, hare, lynx, plant, grass, barnacle, seastar,
  mussel, urchin, kelp, cell, paramecium, seed, wolf, deer, otter, turtle. Draw any others yourself.
- `g.withAlpha(a, fn)` · `g.with(fn)` save/restore · `g.clip(x,y,w,h,fn)` · `g.ctx` raw 2D context

Plots
- `A = g.axes({x,y,w,h,xmin,xmax,ymin,ymax,xlab,ylab,progress,logx,logy,xticks,yticks,grid,arrows,labSize})`
  → `A.X(v)`, `A.Y(v)` map data to screen. (x,y) is the top-left of the plotting area. Short labels
  (≤3 chars or containing `_ ^ \`) render as math. Ticks: `[{v, l}]`.
- `g.plot(A, fn, {from,to,color,w,progress,dash,alpha,fillTo,fillColor})` → screen point of the tip
- `g.data(A, [[x,y],...], {color,w,progress,...})`

Palette (`PAL`): `bg ink ink2 ink3 rule faint panel moss ochre coral lagoon heather rose sand mint`.
`SPECIES` (via `g.SPECIES`) is the categorical order for multi-species figures. Utilities (`U`):
`clamp lerp inv smooth ease.{out,in,inOut,outBack} rng(seed) gauss(r) noise1 noise2 fbm2 rgba(hex,a) mix(h1,h2,t) hsl fmt`.

## Style

Dark field-station slate with luminous pigment colors, topographic contour background (engine), serif
display titles (Instrument Serif), IBM Plex Sans labels, STIX math. Teach with the canonical
diagrams examiners expect students to sketch (isoclines, phase planes, rate curves, life cycles), and
make them **move**: trajectories that trace, particles that flow, populations that grow, curves that
shift when a parameter changes. Add living vignettes (organisms as icons or luminous dots) where they
clarify. Label every curve and axis. Keep it beautiful and uncluttered: one idea per beat. Use the
chapter accent (`COL`) for highlights, and semantic color consistently (prey/plants moss, predators
coral, resources ochre, dispersal/water lagoon).

Optional chapter card motif: `motif(g, t)` on the chapter object draws a faint decorative line figure
related to the chapter (region x 1100–1800, y 110–360, alpha ≤ 0.4), like ch1's logistic curve.

## Checking your work

```
cd source && node tools/stills.mjs <scene-id>            # contact sheet: one frame per beat + end
node tools/stills.mjs <scene-id> --t 4,12.5,30 --cols 3  # specific local times (seconds)
node tools/stills.mjs <scene-id> --t 20 --full           # also writes a full-size 1920×1080 PNG
node tools/stills.mjs <chapter-id>                        # every scene in the chapter (e.g. "comp")
```

It prints the sheet path, the beat-aligned times, the average ms/frame, and any render errors (non-zero
exit). **Open the PNG with the Read tool and look at it critically**: check overlap, clipping, empty
regions, legibility, sync with what each beat says, and that nothing enters the header, rail or
caption band. Iterate until every scene is polished. Also run `node --check chapters/<file>.js`.
