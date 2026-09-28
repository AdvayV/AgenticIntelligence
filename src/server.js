import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildDemo } from './demo.js';
import { loadIndex, evolution } from './index.js';
import { search } from './retrieval.js';
import { checkBehaviorWatch } from './watch.js';
import { neighbors } from './graph.js';
import { createEmbedder } from './vector.js';
const publicRoot = fileURLToPath(new URL('../public/', import.meta.url));
const assets = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] };
export function createServer(index, indexStats = []) {
  let activeSearches = 0;
  return http.createServer(async (request, response) => {
    const json = (status, body) => { response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(body)); };
    try {
      const url = new URL(request.url, 'http://localhost');
      response.setHeader('X-Content-Type-Options', 'nosniff');
      response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'");
      if (request.method === 'GET' && url.pathname === '/api/status') return json(200, { versions: index.versions, embedding: index.embedding, indexStats, capabilities: { streaming: true, history: true, callNavigation: true, behaviorWatch: true }, snippets: index.versions.reduce((n, v) => n + index.snapshots[v].snippets.length, 0), diagnostics: index.versions.flatMap(v => index.snapshots[v].diagnostics) });
      if (request.method === 'GET' && url.pathname === '/api/snippet') {
        const version = url.searchParams.get('version'), id = url.searchParams.get('id');
        if (!index.versions.includes(version)) return json(404, { error: 'Unknown snapshot' });
        const snippet = index.snapshots[version].snippets.find(row => row.id === id);
        if (!snippet) return json(404, { error: 'Unknown snippet' });
        return json(200, { id: snippet.id, name: snippet.name, code: snippet.code, file: snippet.file, version: snippet.version, startLine: snippet.startLine, endLine: snippet.endLine, commit: snippet.commit,
          history: evolution(index, snippet), calls: neighbors(index, snippet).map(edge => ({ direction: edge.direction, name: edge.snippet.name, file: edge.snippet.file, startLine: edge.snippet.startLine, id: edge.snippet.id, version: edge.snippet.version })) });
      }
      if (request.method === 'POST' && ['/api/search', '/api/search/stream', '/api/watch'].includes(url.pathname)) {
        const chunks = []; let bytes = 0;
        for await (const chunk of request) { bytes += chunk.length; if (bytes > 8192) return json(413, { error: 'Request too large' }); chunks.push(chunk); }
        let input;
        try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return json(400, { error: 'Invalid JSON' }); }
        if (!input || typeof input !== 'object' || Array.isArray(input)) return json(400, { error: 'Expected a search object' });
        if (activeSearches >= 2) return json(429, { error: 'Two CPU searches are already running. Please try again shortly.' });
        const streaming = url.pathname.endsWith('/stream'), controller = new AbortController();
        response.on('close', () => { if (!response.writableEnded) controller.abort(); });
        const send = value => { if (!response.destroyed) response.write(JSON.stringify(value) + '\n'); };
        activeSearches++;
        try {
          if (url.pathname === '/api/watch') return json(200, checkBehaviorWatch(index, input));
          const result = await search(index, input.query, { topK: input.topK ?? 5, version: input.version || undefined, mode: input.mode ?? 'codestrata', signal: controller.signal,
            onStep: streaming ? async step => {
              if (!response.headersSent) response.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
              send({ type: 'step', step });
              await new Promise(resolve => setImmediate(resolve));
            } : undefined });
          if (streaming) { send({ type: 'result', data: result }); return response.end(); }
          return json(200, result);
        } catch (error) {
          if (controller.signal.aborted) return response.end();
          if (response.headersSent) { send({ type: 'error', error: error.message }); return response.end(); }
          return json(400, { error: error.message });
        } finally { activeSearches--; }
      }
      if (request.method !== 'GET') return json(405, { error: 'Method not allowed' });
      if (assets[url.pathname]) { const [file, mime] = assets[url.pathname]; response.writeHead(200, { 'Content-Type': `${mime}; charset=utf-8` }); return response.end(await readFile(path.join(publicRoot, file))); }
      return json(404, { error: 'Not found' });
    } catch { if (!response.headersSent) json(500, { error: 'Internal server error' }); else response.end(); }
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.env.CODESTRATA_INDEX;
  const embeddingArg = process.argv.indexOf('--embedding');
  const mode = process.env.CODESTRATA_EMBEDDING ?? (embeddingArg < 0 ? 'features' : process.argv[embeddingArg + 1]);
  const { index, stats } = file ? { index: await loadIndex(file), stats: [] } : await buildDemo(await createEmbedder(mode));
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? '127.0.0.1';
  createServer(index, stats).listen(port, host, () => console.log(`CodeStrata ready at http://${host}:${port}`));
}
