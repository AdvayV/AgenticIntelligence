import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildDemo } from './demo.js';
import { loadIndex } from './index.js';
import { search } from './retrieval.js';
const publicRoot = fileURLToPath(new URL('../public/', import.meta.url));
const assets = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] };
export function createServer(index, indexStats = []) {
  return http.createServer(async (request, response) => {
    const json = (status, body) => { response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(body)); };
    try {
      const url = new URL(request.url, 'http://localhost');
      response.setHeader('X-Content-Type-Options', 'nosniff');
      response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'");
      if (request.method === 'GET' && url.pathname === '/api/status') return json(200, { versions: index.versions, embedding: index.embedding, indexStats, snippets: index.versions.reduce((n, v) => n + index.snapshots[v].snippets.length, 0), diagnostics: index.versions.flatMap(v => index.snapshots[v].diagnostics) });
      if (request.method === 'POST' && url.pathname === '/api/search') {
        let body = '';
        for await (const chunk of request) { body += chunk; if (Buffer.byteLength(body) > 8192) return json(413, { error: 'Request too large' }); }
        let input;
        try { input = JSON.parse(body); } catch { return json(400, { error: 'Invalid JSON' }); }
        try { return json(200, await search(index, input.query, { topK: input.topK ?? 5, version: input.version || undefined, mode: input.mode ?? 'codestrata' })); }
        catch (error) { return json(400, { error: error.message }); }
      }
      if (request.method !== 'GET') return json(405, { error: 'Method not allowed' });
      if (assets[url.pathname]) { const [file, mime] = assets[url.pathname]; response.writeHead(200, { 'Content-Type': `${mime}; charset=utf-8` }); return response.end(await readFile(path.join(publicRoot, file))); }
      return json(404, { error: 'Not found' });
    } catch { if (!response.headersSent) json(500, { error: 'Internal server error' }); else response.end(); }
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.env.CODESTRATA_INDEX;
  const { index, stats } = file ? { index: await loadIndex(file), stats: [] } : await buildDemo();
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? '127.0.0.1';
  createServer(index, stats).listen(port, host, () => console.log(`CodeStrata ready at http://${host}:${port}`));
}
