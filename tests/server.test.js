import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/server.js';
import { buildDemo } from '../src/demo.js';
import { emptyIndex } from '../src/index.js';

test('search endpoints reject malformed option types and remain usable after errors', async t => {
  const { index } = await buildDemo(), server = createServer(index);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const endpoint of ['/api/search', '/api/search/stream']) {
    for (const options of [{ topK: true }, { topK: [1] }, { topK: '3' }, { topK: 0 }, { topK: 101 }, { mode: false }, { version: 0 }, { version: [] }]) {
      const response = await fetch(base + endpoint, { method: 'POST', body: JSON.stringify({ query: 'awaits constructor', ...options }) });
      assert.equal(response.status, 400, JSON.stringify(options));
      assert.ok((await response.json()).error);
    }
  }
  const valid = await fetch(base + '/api/search', { method: 'POST', body: JSON.stringify({ query: 'awaits constructor' }) });
  assert.equal(valid.status, 200);
  assert.ok(Array.isArray((await valid.json()).results));
});

test('an empty index returns an empty streamed result without loading an encoder', async t => {
  const server = createServer(emptyIndex());
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(base + '/api/search/stream', { method: 'POST', body: JSON.stringify({ query: 'awaits policyCheck' }) });
  assert.equal(response.status, 200);
  const events = (await response.text()).trim().split('\n').map(line => JSON.parse(line));
  assert.equal(events.at(-1).type, 'result');
  assert.deepEqual(events.at(-1).data.results, []);
});
test('watch endpoint validates pins, rules and bounded bodies', async t => {
  const { index } = await buildDemo(), server = createServer(index);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const anchor = index.snapshots.v2.snippets.find(row => row.name === 'pairDevice');
  const input = { id: anchor.id, version: anchor.version, contentHash: anchor.contentHash, query: 'awaits policyCheck' };
  const post = body => fetch(base + '/api/watch', { method: 'POST', body });
  const response = await post(JSON.stringify(input)); assert.equal(response.status, 200);
  assert.equal((await response.json()).firstObservedRegression.to, 'v2');
  assert.equal((await (await fetch(base + '/api/status')).json()).capabilities.behaviorWatch, true);
  for (const body of ['{', 'null', '[]', '{}', JSON.stringify({ ...input, contentHash: 'stale' }), JSON.stringify({ ...input, query: 'regression' })]) assert.equal((await post(body)).status, 400);
  assert.equal((await post('x'.repeat(9000))).status, 413);
});
test('HTTP demo serves assets, search, validation and bounded request bodies', async t => {
  const { index } = await buildDemo(), server = createServer(index);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const home = await fetch(base); assert.equal(home.status, 200); assert.match(await home.text(), /CodeStrata/);
  assert.match(home.headers.get('content-security-policy'), /script-src 'self'/);
  for (const asset of ['/style.css', '/app.js']) assert.equal((await fetch(base + asset)).status, 200);
  const status = await (await fetch(base + '/api/status')).json(); assert.deepEqual(status.versions, ['v1', 'v2', 'v3']);
  const post = body => fetch(base + '/api/search', { method: 'POST', body });
  const result = await (await post(JSON.stringify({ query: 'Find fallback without awaiting primaryTool', topK: 1 }))).json();
  assert.equal(result.results[0].version, 'v2');
  assert.equal((await post('{')).status, 400); assert.equal((await post('{}')).status, 400);
  assert.equal((await post('x'.repeat(9000))).status, 413);
  assert.equal((await fetch(base + '/unknown')).status, 404);
  assert.equal((await fetch(base, { method: 'DELETE' })).status, 405);
});

test('streamed investigation finishes with real results and version-specific source navigation', async t => {
  const { index } = await buildDemo(), server = createServer(index);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(base + '/api/search/stream', { method: 'POST', body: JSON.stringify({ query: 'Where did device pairing stop waiting for policyCheck?', topK: 1 }) });
  assert.match(response.headers.get('content-type'), /ndjson/);
  const events = (await response.text()).trim().split('\n').map(line => JSON.parse(line));
  assert.equal(events[0].step.action, 'plan'); assert.equal(events.at(-1).type, 'result');
  const result = events.at(-1).data.results[0];
  assert.equal(result.name, 'pairDevice'); assert.equal(result.version, 'v2');
  const point = result.timeline[0];
  const snippet = await (await fetch(base + '/api/snippet?' + new URLSearchParams({ id: point.id, version: point.version }))).json();
  assert.equal(snippet.name, 'connectDevice'); assert.match(snippet.code, /await policyCheck/);
  assert.equal((await fetch(base + '/api/snippet?version=v2&id=missing')).status, 404);
  for (const body of ['null', '[]', '{}']) assert.equal((await fetch(base + '/api/search/stream', { method: 'POST', body })).status, 400);
});
