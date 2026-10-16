/* Player shell: clock, narration sync, captions, scrubber, drawer, render hooks. */
(function () {
'use strict';
const Th = window.Theater.build(window.TIMING);
const $ = (id) => document.getElementById(id);
const cv = $('cv'), ctx = cv.getContext('2d');
const RENDER = /[?&#]render\b/.test(location.search + location.hash);
const store = { get(k, d) { try { const v = localStorage.getItem('kin-theater:' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('kin-theater:' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } } };
const fmt = (x) => { x = Math.max(0, x); const m = Math.floor(x / 60), s = Math.floor(x % 60); return `${m}:${String(s).padStart(2, '0')}`; };
const chapters = Th.chapters.map((ch) => { const sc = Th.scenes.filter((s) => s.chapter === ch); return { ch, start: sc[0].start, end: sc[sc.length - 1].end, scenes: sc }; });

// ---------------------------------------------------------------- fonts
const FONT_SPECS = ['48px "Instrument Serif"', 'italic 48px "Instrument Serif"', '400 24px "IBM Plex Sans"', '500 24px "IBM Plex Sans"', '600 24px "IBM Plex Sans"', '40px "STIX Two Text"', 'italic 40px "STIX Two Text"', 'bold 40px "STIX Two Text"', '24px "IBM Plex Mono"'];
const fontsReady = (async () => {
  if (!document.fonts) return;
  const timeout = new Promise((r) => setTimeout(r, 6000));
  try { await Promise.race([Promise.all(FONT_SPECS.map((f) => document.fonts.load(f, 'Aαλθ'))), timeout]); } catch (e) { /* fall back to system faces */ }
  Th.fontsChanged();
})();

// ------------------------------------------------------- render-mode API
if (RENDER) {
  document.body.classList.add('render');
  window.__theater = {
    duration: Th.duration, scenes: Th.scenes.map((s) => ({ id: s.id, start: s.start, dur: s.dur, beats: s.timing.beats.map((b) => [b.start, b.end]), estimated: !!s.timing.estimated })),
    ready: fontsReady.then(() => true),
    frame(t, o = {}) { Th.renderAt(ctx, t, { captions: !!o.captions, debug: !!o.debug }); if (o.noImage) return ''; return cv.toDataURL(o.png ? 'image/png' : 'image/jpeg', o.q || 0.93); },
    errors: () => (Th.errors || []).slice(),
    sheet(times, o = {}) { // contact sheet: grid of frames
      const cols = o.cols || 2, tw = o.w || 960, th = tw * 9 / 16, rows = Math.ceil(times.length / cols);
      const sh = document.createElement('canvas'); sh.width = cols * tw + (cols - 1) * 8; sh.height = rows * th + (rows - 1) * 8; const sc = sh.getContext('2d');
      sc.fillStyle = '#000'; sc.fillRect(0, 0, sh.width, sh.height);
      times.forEach((t, i) => { Th.renderAt(ctx, t, { captions: !!o.captions, debug: true }); sc.drawImage(cv, (i % cols) * (tw + 8), Math.floor(i / cols) * (th + 8), tw, th); });
      return sh.toDataURL('image/jpeg', 0.9);
    },
  };
  return;
}

// ----------------------------------------------------------------- state
let time = 0, playing = false, rate = Number(store.get('rate', 1)), captions = store.get('cc', true), muted = store.get('muted', false);
let lastPerf = performance.now(), dirty = true, started = false, audioOK = false;
const audio = new Audio(); audio.preload = 'auto';
audio.addEventListener('canplay', () => { audioOK = true; });
// Soundtrack: prefer AAC (.m4a), fall back to MP3 where .m4a is not hosted.
const AUDIO_FILES = ['soundtrack.m4a', 'soundtrack.mp3']; let audioFile = AUDIO_FILES[0], triedDirect = false;
audio.addEventListener('error', () => { audioOK = false; if (!triedDirect && audio.src.startsWith('blob:')) { triedDirect = true; audio.src = audioFile; } });
(async () => {
  if (window.NARRATION_SRC) { audio.src = window.NARRATION_SRC; return; }
  for (const f of AUDIO_FILES) {
    try { const r = await fetch(f); if (!r.ok) continue; audioFile = f; audio.src = URL.createObjectURL(await r.blob()); return; } catch (e) { /* try next */ }
  }
  audio.src = AUDIO_FILES[0]; // file:// pages cannot fetch; let the media element load it directly
})();
audio.muted = muted; audio.playbackRate = rate;
$('rate').value = String(rate);
$('durNote').textContent = `${chapters.filter((c) => c.ch.roman).length} chapters · ${Math.round(Th.duration / 60)} minutes`;

// -------------------------------------------------------------- scrubber
const segs = $('segs');
chapters.forEach((c) => { const d = document.createElement('div'); d.className = 'seg'; d.style.flex = String(c.end - c.start); d.style.setProperty('--c', c.ch.color || '#E8B44A'); d.appendChild(document.createElement('i')); segs.appendChild(d); });
const segFills = [...segs.querySelectorAll('.seg i')];
function scrubPos(clientX) { const r = $('scrub').getBoundingClientRect(); return Math.max(0, Math.min(1, (clientX - r.left) / r.width)); }
// account for gaps: map fraction of track width to time via chapter boxes
function fracToTime(f) {
  const boxes = [...segs.children].map((el) => el.getBoundingClientRect()); const r = segs.getBoundingClientRect(); const x = r.left + f * r.width;
  for (let i = 0; i < boxes.length; i++) { const b = boxes[i]; if (x <= b.right + 1.5 || i === boxes.length - 1) { const u = Math.max(0, Math.min(1, (x - b.left) / b.width)); return chapters[i].start + u * (chapters[i].end - chapters[i].start); } }
  return 0;
}
function timeToX(t) {
  const i = Math.max(0, chapters.findIndex((c) => t < c.end)); const c = chapters[i === -1 ? chapters.length - 1 : i]; const el = segs.children[chapters.indexOf(c)];
  const r = segs.getBoundingClientRect(), b = el.getBoundingClientRect(); return b.left - r.left + b.width * Math.max(0, Math.min(1, (t - c.start) / (c.end - c.start)));
}
let dragging = false;
$('scrub').addEventListener('pointerdown', (e) => { dragging = true; $('scrub').setPointerCapture(e.pointerId); seek(fracToTime(scrubPos(e.clientX))); });
$('scrub').addEventListener('pointermove', (e) => {
  const tt = fracToTime(scrubPos(e.clientX)); if (dragging) seek(tt);
  const sc = Th.sceneAt(tt); const tip = $('tip'); tip.hidden = false; tip.innerHTML = `<b>${sc.chapter.roman ? sc.chapter.roman + ' · ' : ''}</b>${sc.kind === 'card' ? sc.chapter.title : sc.title}<span>${fmt(tt)}</span>`;
  const r = $('scrub').getBoundingClientRect(); const w = tip.offsetWidth; tip.style.left = Math.max(w / 2, Math.min(r.width - w / 2, e.clientX - r.left)) + 'px';
});
$('scrub').addEventListener('pointerup', () => { dragging = false; });
$('scrub').addEventListener('pointerleave', () => { $('tip').hidden = true; });
$('scrub').addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') { seek(time - 5); e.preventDefault(); } if (e.key === 'ArrowRight') { seek(time + 5); e.preventDefault(); } });

// --------------------------------------------------------------- control
function setPlaying(p) {
  playing = p; lastPerf = performance.now();
  $('playIcon').setAttribute('d', p ? 'M6 4.5h4v15H6zm8 0h4v15h-4z' : 'M7 4.5v15l13-7.5z'); $('btnPlay').setAttribute('aria-label', p ? 'Pause' : 'Play');
  $('bigPlay').hidden = true; started = true;
  if (p) { if (time >= Th.duration - 0.05) time = 0; try { audio.currentTime = time; } catch (e) { /* not seekable yet */ } const pr = audio.play(); if (pr) pr.catch(() => { audioOK = false; }); }
  else audio.pause();
}
function seek(t) { time = Math.max(0, Math.min(Th.duration - 0.01, t)); try { audio.currentTime = time; } catch (e) { /* not seekable yet */ } dirty = true; lastPerf = performance.now(); if (!started) { started = true; $('bigPlay').hidden = true; } }
function chapterIndex(t) { let i = 0; chapters.forEach((c, k) => { if (t >= c.start - 0.01) i = k; }); return i; }
$('btnPlay').onclick = () => setPlaying(!playing);
$('bigPlay').onclick = () => setPlaying(true);
cv.addEventListener('click', () => setPlaying(!playing));
$('btnPrev').onclick = () => { const i = chapterIndex(time); seek(time - chapters[i].start > 3 ? chapters[i].start : chapters[Math.max(0, i - 1)].start); };
$('btnNext').onclick = () => { const i = chapterIndex(time); if (i < chapters.length - 1) seek(chapters[i + 1].start); };
$('btnCC').onclick = () => { captions = !captions; store.set('cc', captions); syncButtons(); };
$('btnMute').onclick = () => { muted = !muted; audio.muted = muted; store.set('muted', muted); syncButtons(); };
$('rate').onchange = (e) => { rate = Number(e.target.value); audio.playbackRate = rate; store.set('rate', rate); };
$('btnFull').onclick = () => { const el = document.documentElement; if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else if (el.requestFullscreen) el.requestFullscreen().catch(() => {}); };
function syncButtons() {
  $('btnCC').setAttribute('aria-pressed', String(captions)); $('cap').classList.toggle('off', !captions);
  $('btnMute').setAttribute('aria-pressed', String(muted)); $('btnMute').setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
  $('volIcon').setAttribute('d', muted ? 'M4 9h4l5-4v14l-5-4H4zm12.3.3 1.4-1.4 2.1 2.1 2.1-2.1 1.4 1.4-2.1 2.1 2.1 2.1-1.4 1.4-2.1-2.1-2.1 2.1-1.4-1.4 2.1-2.1z' : 'M4 9h4l5-4v14l-5-4H4zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z');
}
syncButtons();
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.metaKey || e.ctrlKey) return;
  const k = e.key;
  if (k === ' ' || k === 'k') { setPlaying(!playing); e.preventDefault(); }
  else if (k === 'ArrowLeft' && e.target.id !== 'scrub') seek(time - 5);
  else if (k === 'ArrowRight' && e.target.id !== 'scrub') seek(time + 5);
  else if (k === 'j') seek(time - 10); else if (k === 'l') seek(time + 10);
  else if (k === 'c') $('btnCC').click(); else if (k === 'm') $('btnMute').click(); else if (k === 'f') $('btnFull').click();
  else if (k === '[') $('btnPrev').click(); else if (k === ']') $('btnNext').click();
  else if (k === 'Escape' && !$('drawer').hidden) closeDrawer();
});

// ---------------------------------------------------------------- drawer
let tab = 'toc';
function openDrawer(which) { tab = which || tab; $('drawer').hidden = false; renderDrawer(); $(tab === 'toc' ? 'tabToc' : 'tabLex').focus(); }
function closeDrawer() { $('drawer').hidden = true; $('btnToc').focus(); }
$('btnToc').onclick = () => ($('drawer').hidden ? openDrawer() : closeDrawer());
$('btnClose').onclick = closeDrawer;
$('tabToc').onclick = () => { tab = 'toc'; renderDrawer(); };
$('tabLex').onclick = () => { tab = 'lex'; renderDrawer(); };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function renderDrawer(filter) {
  $('tabToc').setAttribute('aria-selected', String(tab === 'toc')); $('tabLex').setAttribute('aria-selected', String(tab === 'lex'));
  const body = $('drawerBody');
  if (tab === 'toc') {
    const ci = chapterIndex(time); const cur = Th.sceneAt(time);
    body.innerHTML = chapters.map((c, i) => `<section class="chap${i === ci ? ' now' : ''}" style="--c:${c.ch.color}"><h3 data-t="${c.start}"><span class="rn">${c.ch.roman || '·'}</span>${esc(c.ch.title)}<span class="dur">${fmt(c.end - c.start)}</span></h3><ol>${c.scenes.filter((s) => s.kind !== 'card').map((s) => `<li data-t="${s.start}" class="${s === cur ? 'now' : ''}">${esc(s.title)}<span class="tm">${fmt(s.start)}</span></li>`).join('')}</ol></section>`).join('');
  } else {
    const q = (filter ?? ($('lexSearch') && $('lexSearch').value) ?? '').toLowerCase();
    const items = Th.termIndex.filter((tm) => !q || (tm.term + ' ' + tm.def).toLowerCase().includes(q));
    body.innerHTML = `<input id="lexSearch" type="search" placeholder="Search ${Th.termIndex.length} terms" value="${esc(q)}" aria-label="Search lexicon">` +
      items.map((tm) => { const ch = Th.chapters.find((c) => c.title === tm.chapter); return `<div class="term" data-t="${tm.time}" style="--c:${ch ? ch.color : '#E8B44A'}"><div class="no">No. ${String(tm.no).padStart(3, '0')}</div><div class="nm">${esc(tm.term)}</div><div class="df">${esc(tm.def)}</div><div class="ch">${ch && ch.roman ? ch.roman + ' · ' : ''}${esc(tm.chapter)} · ${fmt(tm.time)}</div></div>`; }).join('') || '<p style="color:var(--ink3)">No matching terms.</p>';
    const inp = $('lexSearch'); inp.oninput = () => { const v = inp.value; renderDrawer(v); const n = $('lexSearch'); n.focus(); n.setSelectionRange(v.length, v.length); };
  }
  body.querySelectorAll('[data-t]').forEach((el) => { el.onclick = () => { seek(Number(el.dataset.t) + 0.01); if (!playing) setPlaying(true); }; });
}

// ---------------------------------------------------------------- sizing
function fit() {
  const avail = window.innerHeight - 150; const w = Math.max(280, Math.min(window.innerWidth - 32, avail * 16 / 9));
  document.documentElement.style.setProperty('--stageW', Math.round(w) + 'px');
  const sw = $('stage').getBoundingClientRect().width; document.documentElement.style.setProperty('--capSize', Math.max(13, sw * 0.0178).toFixed(1) + 'px');
}
window.addEventListener('resize', fit); fit();

// ------------------------------------------------------------- deep link
const hm = location.hash.match(/^#ch(\d)$/); if (hm) { const c = chapters.find((x) => x.ch.index === Number(hm[1])); if (c) time = c.start + 0.01; }
const saved = store.get('pos', 0);
if (!hm && saved > 20 && saved < Th.duration - 20) {
  const b = document.createElement('button'); b.id = 'resume'; b.type = 'button'; b.textContent = `Resume at ${fmt(saved)}`;
  b.onclick = (e) => { e.stopPropagation(); b.remove(); seek(saved); setPlaying(true); }; $('stage').appendChild(b);
  setTimeout(() => b.remove(), 15000);
}

// ------------------------------------------------------------------ loop
let lastCap = null, lastScene = null, lastSave = 0;
function frame(now) {
  const dt = (now - lastPerf) / 1000; lastPerf = now;
  if (playing) {
    time += dt * rate;
    if (audioOK && !audio.paused && Math.abs(audio.currentTime - time) > 0.3) time = audio.currentTime;
    if (audioOK && audio.paused && time < Th.duration - 0.5) { const pr = audio.play(); if (pr) pr.catch(() => {}); }
    if (time >= Th.duration) { time = Th.duration; setPlaying(false); }
    dirty = true;
  }
  if (dirty) {
    const T = started ? time : Math.min(9, Th.duration);
    Th.renderAt(ctx, T);
    const cue = started ? Th.cueAt(time) : null; const txt = cue ? cue.text : '';
    if (txt !== lastCap) { $('cap').textContent = txt; lastCap = txt; }
    const sc = Th.sceneAt(time);
    if (sc !== lastScene) { lastScene = sc; $('nlR').textContent = sc.chapter.roman || ''; $('nlT').textContent = sc.chapter.title; $('nlS').textContent = sc.kind === 'card' ? (sc.chapter.question || '') : sc.title; if (!$('drawer').hidden && tab === 'toc') renderDrawer(); }
    $('time').textContent = `${fmt(time)} / ${fmt(Th.duration)}`;
    const ci = chapterIndex(time);
    segFills.forEach((f, i) => { const c = chapters[i]; f.style.width = (i < ci ? 100 : i > ci ? 0 : 100 * (time - c.start) / (c.end - c.start)) + '%'; });
    $('knob').style.left = timeToX(time) + 'px';
    $('scrub').setAttribute('aria-valuenow', String(Math.round(100 * time / Th.duration))); $('scrub').setAttribute('aria-valuetext', fmt(time));
    if (playing && now - lastSave > 3000) { store.set('pos', time); lastSave = now; }
    dirty = false;
  }
  requestAnimationFrame(frame);
}
fontsReady.then(() => { dirty = true; requestAnimationFrame(frame); });
document.addEventListener('visibilitychange', () => { lastPerf = performance.now(); });
})();
