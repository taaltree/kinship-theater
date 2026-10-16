// Minimal Chrome DevTools Protocol driver (Node 22+ global WebSocket; no npm deps).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME = process.env.CHROME || '/opt/google/chrome/chrome';

export async function launch({ port = 0 } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'theater-chrome-'));
  const proc = spawn(CHROME, ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, '--no-first-run', '--no-default-browser-check',
    '--hide-scrollbars', '--mute-audio', '--window-size=1920,1080', '--force-device-scale-factor=1', '--allow-file-access-from-files',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  const wsUrl = await new Promise((res, rej) => {
    let buf = ''; const to = setTimeout(() => rej(new Error('Chrome did not start')), 90000);
    proc.stderr.on('data', (d) => { buf += d; const m = buf.match(/DevTools listening on (ws:\/\/\S+)/); if (m) { clearTimeout(to); res(m[1]); } });
  });
  const killer = () => { try { proc.kill('SIGKILL'); } catch (e) {} };
  process.once('exit', killer);
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.once(sig, () => { killer(); process.exit(130); });
  const ws = new WebSocket(wsUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const pending = new Map(); const listeners = [];
  ws.onmessage = (ev) => { const msg = JSON.parse(ev.data); if (msg.id && pending.has(msg.id)) { const { res, rej } = pending.get(msg.id); pending.delete(msg.id); msg.error ? rej(new Error(msg.error.message)) : res(msg.result); } else listeners.forEach((l) => l(msg)); };
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
  const close = () => { try { ws.close(); } catch (e) {} try { proc.kill('SIGKILL'); } catch (e) {} try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} };
  async function open(url) {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const s = (m, p) => send(m, p, sessionId);
    await s('Page.enable'); await s('Runtime.enable');
    await s('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
    const logs = []; listeners.push((msg) => { if (msg.sessionId === sessionId && msg.method === 'Runtime.exceptionThrown') logs.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text); if (msg.sessionId === sessionId && msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') logs.push(msg.params.args.map((a) => a.value ?? a.description).join(' ')); });
    const loaded = new Promise((r) => listeners.push((msg) => { if (msg.sessionId === sessionId && msg.method === 'Page.loadEventFired') r(); }));
    await s('Page.navigate', { url }); await loaded;
    const evaluate = async (expr) => { const r = await s('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
    return { evaluate, logs, send: s };
  }
  return { open, close };
}

export const dataUrlToBuffer = (s) => Buffer.from(s.slice(s.indexOf(',') + 1), 'base64');

// Print a page to PDF after web fonts load (Letter, CSS @page sizes honored).
export async function printPDF(url, out) {
  const chrome = await launch();
  try {
    const p = await chrome.open(url);
    await p.evaluate('Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 8000))]).then(() => true)');
    const { data } = await p.send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true,
      headerTemplate: '<span></span>', footerTemplate: '<div style="font:8px Helvetica,Arial,sans-serif;color:#8a948f;width:100%;text-align:center;">The Kinship Theater · Study guide · <span class="pageNumber"></span> / <span class="totalPages"></span></div>',
      marginTop: 0.6, marginBottom: 0.7, marginLeft: 0.6, marginRight: 0.6 });
    fs.writeFileSync(out, Buffer.from(data, 'base64'));
  } finally { chrome.close(); }
}
