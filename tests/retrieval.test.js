import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDemo } from '../src/demo.js';
import { search } from '../src/retrieval.js';
import { planQuery } from '../src/query.js';
import { featureVector, cosine, createEmbedder } from '../src/vector.js';
import { metrics } from '../src/metrics.js';
import { emptyIndex, indexVersion } from '../src/index.js';
const { index } = await buildDemo();
test('retrieves the exact version that removed permission await', async () => {
  const result = await search(index, 'Where did Bluetooth settings stop waiting for permission checking?', { topK: 1 });
  assert.equal(result.results[0].name, 'openBluetooth'); assert.equal(result.results[0].version, 'v2');
  assert.equal(result.results[0].certainty, 'supported-static-pattern');
  assert.equal(result.plan.intent, 'evolutionary');
});
test('a missing predecessor does not establish an evolutionary removal', async () => {
  const single = emptyIndex();
  await indexVersion(single, { version: 'v', files: { 'a.js': 'async function a() { permission(); settings(); }' } });
  const result = await search(single, 'Where did settings stop waiting for permission?', { topK: 1 });
  assert.equal(result.results[0].certainty, 'uncertain');
});
test('retrieves guard removal rather than versions with the same deeplink', async () => {
  const result = await search(index, 'Find the version with removed guard for device supported', { topK: 1 });
  assert.equal(result.results[0].name, 'launchDevice'); assert.equal(result.results[0].version, 'v2');
});
test('ranks correct invocation order above reverse and exclusive branches', async () => {
  const result = await search(index, 'Find calls validateInput before executeTool', { topK: 2 });
  assert.ok(result.results.every(r => r.name === 'handleInput' && r.version !== 'v2' && r.certainty === 'supported-static-pattern'));
});
test('finds unawaited primary tool', async () => {
  const result = await search(index, 'Find fallback without awaiting primaryTool', { topK: 1 });
  assert.equal(result.results[0].name, 'runPrimary'); assert.equal(result.results[0].version, 'v2');
});
test('version filter never returns another version', async () => {
  const result = await search(index, 'Bluetooth settings', { version: 'v1' });
  assert.ok(result.results.length); assert.ok(result.results.every(r => r.version === 'v1'));
});
test('literal usage query returns the corresponding snippets', async () => {
  const result = await search(index, 'settings://device', { topK: 3 });
  assert.ok(result.results.every(r => r.name === 'launchDevice'));
});
test('agent expands when initial evidence is insufficient and obeys budgets', async () => {
  const large = emptyIndex();
  await indexVersion(large, { version: 'v', files: { 'tools.js': Array.from({ length: 30 }, (_, i) => `function f${i}() { first(); second(); }`).join('\n') } });
  const result = await search(large, 'calls nonexistent before second', { topK: 1, maxRounds: 2, maxCandidates: 14 });
  assert.ok(result.stats.inspected <= 14); assert.ok(result.trace.some(s => s.action === 'refine_candidates' || s.action === 'expand_version_relatives'));
  assert.ok(result.results.every(r => r.certainty !== 'supported-static-pattern'));
});
test('baseline comparison does not silently apply structural reranking', async () => {
  const result = await search(index, 'calls validateInput before executeTool', { mode: 'hybrid' });
  assert.ok(result.results.every(r => r.evidence.length === 0));
});
test('rejects invalid queries, versions, ranking modes and budgets', async () => {
  for (const [query, options] of [['', {}], ['x', { version: 'missing' }], ['x', { topK: 0 }], ['x', { maxRounds: 99 }], ['x', { mode: 'fake' }]]) await assert.rejects(search(index, query, options));
  assert.throws(() => planQuery('x'.repeat(2001)));
});
test('feature vectors are deterministic, normalized, and handle empty input', async () => {
  assert.deepEqual(featureVector('BluetoothSettings'), featureVector('bluetooth settings'));
  assert.ok(Math.abs(cosine(featureVector('same'), featureVector('same')) - 1) < 1e-10);
  assert.equal(cosine(featureVector(''), featureVector('x')), 0);
  await assert.rejects(createEmbedder('fake'));
});
test('metrics handle graded relevance, duplicates and missing relevant documents', () => {
  assert.deepEqual(metrics(['a', 'b'], { a: 2, b: 1 }, 2), { ndcg: 1, mrr: 1, precision: 1, recall: 1 });
  assert.equal(metrics(['x', 'a'], { a: 1 }, 2).mrr, 0.5);
  assert.equal(metrics(['a', 'a'], { a: 1 }, 2).precision, 0.5);
  assert.deepEqual(metrics([], {}, 10), { ndcg: 0, mrr: 0, precision: 0, recall: 0 });
});
