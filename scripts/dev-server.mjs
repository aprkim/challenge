// Local server that mirrors vercel.json routing.
//   node scripts/dev-server.mjs                       -> uses config.js (your Supabase project)
//   POSTGREST_URL=http://localhost:3001 node scripts/dev-server.mjs
//                                                     -> proxies /rest/v1 to a local PostgREST (tests)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const port = Number(process.env.PORT || 8080);
const postgrest = process.env.POSTGREST_URL;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');

  if (postgrest && url.pathname.startsWith('/rest/v1/')) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const headers = { ...req.headers };
    delete headers.host;
    delete headers.apikey;
    const r = await fetch(postgrest + url.pathname.slice('/rest/v1'.length) + url.search, {
      method: req.method, headers, body: chunks.length ? Buffer.concat(chunks) : undefined,
    });
    res.writeHead(r.status, { 'content-type': r.headers.get('content-type') || 'application/json' });
    res.end(Buffer.from(await r.arrayBuffer()));
    return;
  }

  if (postgrest && url.pathname === '/config.js') {
    res.writeHead(200, { 'content-type': types['.js'] });
    res.end("export const SUPABASE_URL = '';\nexport const SUPABASE_KEY = 'local';\n");
    return;
  }

  if (url.pathname === '/') {
    res.writeHead(307, { location: '/exercise' });
    res.end();
    return;
  }

  const file = normalize(join(root, url.pathname));
  const isAsset = file.startsWith(root) && extname(file) && !file.includes('/.');
  try {
    const body = await readFile(isAsset ? file : join(root, 'index.html'));
    res.writeHead(200, { 'content-type': types[isAsset ? extname(file) : '.html'] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}).listen(port, () => console.log(`http://localhost:${port}`));
