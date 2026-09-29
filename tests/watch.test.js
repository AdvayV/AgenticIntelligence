import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDemo } from '../src/demo.js';
import { emptyIndex, indexVersion } from '../src/index.js';
import { checkBehaviorWatch } from '../src/watch.js';

const pin = (row, query = 'awaits policyCheck') => ({ id: row.id, version: row.version, contentHash: row.contentHash, query });
async function fixture(sources) {
  const index = emptyIndex();
  for (const [version, source] of Object.entries(sources)) await indexVersion(index, { version, files: source === null ? {} : { 'a.js': source } });
  return index;
}
test('watch follows a renamed function and exports regression, restoration and exact evidence', async () => {
  const { index } = await buildDemo();
  const anchor = index.snapshots.v2.snippets.find(row => row.name === 'pairDevice');
  const report = checkBehaviorWatch(index, pin(anchor));
  assert.deepEqual(report.points.map(row => row.status), ['supported', 'contradicted', 'supported']);
  assert.equal(report.points[0].name, 'connectDevice');
  assert.equal(report.points[1].link.confidence, 'inferred-structural-match');
  assert.deepEqual(report.transitions, [{ type: 'regression', from: 'v1', to: 'v2' }, { type: 'restoration', from: 'v2', to: 'v3' }]);
  assert.deepEqual(report.firstObservedRegression, report.transitions[0]);
  for (const point of report.points) {
    assert.ok(point.contentHash); assert.match(point.code, /policyCheck/);
    assert.ok(point.evidence[0].lines.every(line => line >= point.startLine && line <= point.endLine));
  }
  assert.equal(JSON.parse(JSON.stringify(report)).schema, 'codestrata.behavior-watch.v1');
});
test('watch rejects stale pins and queries with no static rule', async () => {
  const index = await fixture({ v1: 'async function f() { await policyCheck(); }' });
  const input = pin(index.snapshots.v1.snippets[0]);
  for (const query of ['find a function', 'Where did f stop waiting for policyCheck?', '', 'x'.repeat(2001)]) assert.throws(() => checkBehaviorWatch(index, { ...input, query }));
  assert.throws(() => checkBehaviorWatch(index, { ...input, id: 'missing' }), /unavailable/);
  assert.throws(() => checkBehaviorWatch(index, { ...input, version: '__proto__' }), /unavailable/);
  assert.throws(() => checkBehaviorWatch(index, { ...input, contentHash: undefined }), /changed/);
  await indexVersion(index, { version: 'v1', files: { 'a.js': 'async function f() { policyCheck(); }' } });
  assert.throws(() => checkBehaviorWatch(index, input), /changed/);
  index.versions = Array.from({ length: 201 }, (_, i) => 'v' + i);
  assert.throws(() => checkBehaviorWatch(index, input), /200 indexed snapshots/);
});
test('missing snapshots never create a regression or silently substitute another function', async () => {
  const index = await fixture({ v1: 'async function f() { await policyCheck(); }', v2: null, v3: 'async function f() { policyCheck(); }' });
  const report = checkBehaviorWatch(index, pin(index.snapshots.v1.snippets[0]));
  assert.deepEqual(report.points.map(row => row.status), ['supported', 'unlinked', 'unlinked']);
  assert.deepEqual(report.transitions, []); assert.equal(report.firstObservedRegression, null);
});
test('repeated calls and delayed awaits stay unknown and cannot bridge a transition', async () => {
  const index = await fixture({
    v1: 'async function f() { await policyCheck(); }',
    v2: 'async function f() { await policyCheck(); policyCheck(); }',
    v3: 'async function f() { policyCheck(); }',
    v4: 'async function f() { const p = policyCheck(); await p; }',
  });
  const report = checkBehaviorWatch(index, pin(index.snapshots.v1.snippets[0]));
  assert.deepEqual(report.points.map(row => row.status), ['supported', 'unknown', 'contradicted', 'unknown']);
  assert.deepEqual(report.transitions, []);
});
test('ambiguous renames stay unlinked', async () => {
  const index = await fixture({ v1: 'async function old() { await policyCheck(); }', v2: 'async function one() { policyCheck(); } async function two() { policyCheck(); }' });
  assert.equal(checkBehaviorWatch(index, pin(index.snapshots.v1.snippets[0])).points[1].status, 'unlinked');
});
test('computed awaits do not invent watch regressions or restorations', async () => {
  const index = await fixture({ v1: 'async function f() { policyCheck(); }', v2: 'async function f() { await !policyCheck(); }', v3: 'async function f() { await policyCheck(); }' });
  const report = checkBehaviorWatch(index, pin(index.snapshots.v1.snippets[0]));
  assert.deepEqual(report.points.map(row => row.status), ['contradicted', 'unknown', 'supported']);
  assert.deepEqual(report.transitions, []);
});
test('call order watches detect reversal but do not certify repeated or branched calls', async () => {
  const index = await fixture({ v1: 'function f() { validate(); execute(); }', v2: 'function f() { execute(); validate(); }', v3: 'function f() { validate(); execute(); validate(); }', v4: 'function f(x) { if (x) validate(); else execute(); }' });
  const report = checkBehaviorWatch(index, pin(index.snapshots.v1.snippets[0], 'calls validate before execute'));
  assert.deepEqual(report.points.map(row => row.status), ['supported', 'contradicted', 'unknown', 'unknown']);
  assert.equal(report.transitions.length, 1);
});
