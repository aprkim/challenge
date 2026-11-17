// Local server that behaves like GitHub Pages: serves files, dir/index.html, and falls back
// to 404.html (the app shell) for every other path, so /exercise and /exercise/3 work.
//   node scripts/dev-server.mjs                       -> production Firebase (config.js)
//   EMULATOR=1 node scripts/dev-server.mjs            -> Firebase emulators (tests)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const port = Number(process.env.PORT || 8080);
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8',
};

async function isFile(p) {
  try { return (await stat(p)).isFile(); } catch { return false; }
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const send = async (status, file, override) => {
    res.writeHead(status, { 'content-type': types[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(override ?? (await readFile(file)));
  };

  if (url.pathname === '/config.js' && process.env.EMULATOR) {
    const src = await readFile(join(root, 'config.js'), 'utf8');
    return send(200, 'config.js', src.replace(/export const EMULATOR = .*/, "export const EMULATOR = { firestore: 8085, auth: 9099 };")
      .replace(/projectId: '[^']+'/, "projectId: 'demo-challenge'"));
  }

  // Tests: add a challenge that is already running today, so days can be checked.
  if (url.pathname === '/challenges.json' && process.env.EMULATOR) {
    const list = JSON.parse(await readFile(join(root, 'challenges.json'), 'utf8'));
    const { addDays, todayLocal } = await import('../assets/dates.js');
    const t = todayLocal();
    list.push({ category: 'test', slug: 't1', community_label: '오늘도 했다', title: '테스트 챌린지',
      start_date: addDays(t, -25), end_date: addDays(t, 16), bonus_date: addDays(t, 17), goal: 24, weekly_target: 4 });
    return send(200, 'challenges.json', JSON.stringify(list));
  }

  const p = normalize(join(root, decodeURIComponent(url.pathname)));
  if (!p.startsWith(root) || p.includes('/.')) return send(404, join(root, '404.html'));
  if (await isFile(p)) return send(200, p);
  if (await isFile(join(p, 'index.html'))) return send(200, join(p, 'index.html'));
  return send(404, join(root, '404.html'));
}).listen(port, () => console.log(`http://localhost:${port}`));
