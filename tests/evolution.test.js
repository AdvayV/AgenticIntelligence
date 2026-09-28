import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyIndex, indexVersion, evolution } from '../src/index.js';
import { search } from '../src/retrieval.js';
import { graphFor } from '../src/graph.js';
import { buildDemo } from '../src/demo.js';
import { buildLexical, scoreLexical, corpusView } from '../src/lexical.js';
import { planQuery } from '../src/query.js';
import { textWindows } from '../src/vector.js';

const source = 'export async function connect(device) { await policyCheck(device); return openDevice(device); }';
async function snapshots(before, after) {
  const index = emptyIndex();
  await indexVersion(index, { version: 'old', files: before });
  await indexVersion(index, { version: 'new', files: after });
  return index;
}

test('retrieves a removed await through a simultaneous file move and symbol rename', async () => {
  const index = await snapshots({ 'devices.js': source }, { 'flows/pair.js': source.replace('connect(', 'pair(').replace('await ', '') });
  const result = (await search(index, 'Where did pairing stop waiting for policyCheck?', { topK: 1 })).results[0];
  assert.equal(result.name, 'pair'); assert.equal(result.version, 'new');
  assert.equal(result.history.confidence, 'inferred-structural-match');
  assert.deepEqual(result.history.changes.map(c => c.type), ['removed_await', 'moved_file', 'renamed_symbol']);
  assert.equal(result.counterexample.file, 'devices.js');
  assert.match(result.counterexample.evidence[0].details, /is awaited/);
  assert.deepEqual(result.timeline.map(point => point.version), ['old', 'new']);
});

test('indistinguishable removed symbols do not receive a fabricated predecessor', async () => {
  const index = await snapshots({ 'a.js': source, 'b.js': source }, { 'new.js': source.replace('connect(', 'pair(') });
  const history = evolution(index, index.snapshots.new.snippets[0]);
  assert.equal(history.previousVersion, null); assert.equal(history.confidence, 'ambiguous-refactor');
});

test('one removed symbol cannot become two independent renamed identities', async () => {
  const index = await snapshots({ 'a.js': source }, { 'b.js': source.replace('connect(', 'pair('), 'c.js': source.replace('connect(', 'launch(') });
  assert.ok(index.snapshots.new.snippets.every(row => evolution(index, row).previousVersion === null));
});

test('copying a symbol while retaining the original does not count as a move', async () => {
  const index = await snapshots({ 'a.js': source }, { 'a.js': source, 'b.js': source.replace('connect(', 'pair(') });
  assert.equal(evolution(index, index.snapshots.new.snippets.find(row => row.name === 'pair')).previousVersion, null);
});

test('replacing an older snapshot invalidates lineage and lexical caches', async () => {
  const index = await snapshots({ 'a.js': source }, { 'b.js': source.replace('await ', '') });
  const next = index.snapshots.new.snippets[0];
  assert.equal(evolution(index, next).previousVersion, 'old');
  const previousView = corpusView(index);
  await indexVersion(index, { version: 'old', files: {} });
  assert.equal(evolution(index, next).previousVersion, null);
  assert.notEqual(corpusView(index), previousView);
  assert.equal(corpusView(index).rows.length, 1);
});

test('resolves named aliases, default imports and namespace calls only within the same version', async () => {
  const index = emptyIndex();
  await indexVersion(index, { version: 'v', files: {
    'tools.js': 'export function check() { return true; } export default function execute() { return 1; }',
    'entry.js': "import execute, { check as validate } from './tools.js'; import * as tools from './tools.js'; export function run() { validate(); tools.check(); execute(); }",
  } });
  const graph = graphFor(index, 'v');
  assert.equal(graph.edges.length, 3);
  assert.deepEqual(graph.edges.map(edge => graph.byId.get(edge.to).name), ['check', 'check', 'execute']);
});

test('parameters, local functions, dynamic calls and nested scopes do not create false import links', async () => {
  const index = emptyIndex();
  await indexVersion(index, { version: 'v', files: {
    'tools.js': 'export function check() { return true; }',
    'entry.js': "import {check} from './tools.js'; export function a(check) { check(); } export function b() { function check() {} check(); } export function c(obj, key) { obj[key](); } export function d(check) { return () => check(); }",
  } });
  assert.equal(graphFor(index, 'v').edges.length, 0);
});

test('import navigation invalidates after a helper is deleted', async () => {
  const index = emptyIndex();
  await indexVersion(index, { version: 'v', files: { 'a.js': "import {check} from './b.js'; export function a() { check(); }", 'b.js': 'export function check() {}' } });
  assert.equal(graphFor(index, 'v').edges.length, 1);
  await indexVersion(index, { version: 'v', files: { 'a.js': "import {check} from './b.js'; export function a() { check(); }" } });
  assert.equal(graphFor(index, 'v').edges.length, 0);
});

test('cached lexical postings preserve repeated-term ranking and handle prototype-like tokens', () => {
  const rows = ['constructor prototype prototype', 'prototype unused unused', 'unrelated'].map(code => ({ name: '', file: '', code, behaviorText: '' }));
  const index = JSON.parse(JSON.stringify(buildLexical(rows)));
  const scores = scoreLexical(index, ['prototype']);
  assert.ok(scores[0] > scores[1]); assert.equal(scores[2], 0);
  assert.ok(scoreLexical(index, ['constructor'])[0] > 0);
  assert.deepEqual(scoreLexical(index, ['missing']), [0, 0, 0]);
});

test('invalid embedding batches do not publish a partial version or change its embedding identity', async () => {
  const index = emptyIndex();
  await assert.rejects(indexVersion(index, { version: 'broken', files: { 'a.js': source }, embedder: { name: 'invalid', encode: async () => [[NaN]] } }), /invalid vectors/);
  assert.deepEqual(index.versions, []); assert.equal(index.embedding, null); assert.deepEqual(index.vectors, {});
});

test('index accepts validated code-encoder vectors with 768 dimensions', async () => {
  const index = emptyIndex();
  await indexVersion(index, { version: 'v', files: { 'a.js': source }, embedder: {
    name: 'test-code-768', dimension: 768, encode: async texts => texts.map(() => Array(768).fill(0.01)),
  } });
  const key = index.snapshots.v.snippets[0].vectorKey;
  assert.equal(index.vectors[key].length, 768);
});

test('documentation contributes to retrieval without leaking across unrelated declarations', async () => {
  const index = emptyIndex();
  await indexVersion(index, { version: '*', files: { 'a.js': '/** Telemetry aggregation. */\nexport function collect() { return 1; }\nconst unrelated = 1;\nexport function other() { return unrelated; }' } });
  await indexVersion(index, { version: 'other', files: { 'b.js': 'function second() {}' } });
  assert.match(index.snapshots['*'].snippets[0].documentation, /Telemetry aggregation/);
  assert.equal(index.snapshots['*'].snippets[1].documentation, '');
  assert.equal(corpusView(index).rows.length, 3);
  assert.equal(corpusView(index, '*').rows.length, 2);
  assert.equal((await search(index, 'Telemetry aggregation', { mode: 'lexical', topK: 1 })).results[0].name, 'collect');
});

test('long-snippet windows remain bounded and retain the final source segment', () => {
  const windows = textWindows('begin ' + 'x'.repeat(12000) + ' final behavior');
  assert.equal(windows.length, 4); assert.ok(windows[0].startsWith('begin'));
  assert.ok(windows.at(-1).endsWith('final behavior')); assert.ok(windows.every(value => value.length <= 1200));
});

test('supported paraphrases preserve order and negation, including member names', () => {
  for (const query of ['executeTool after validateInput', 'run executeTool after validateInput']) {
    assert.deepEqual(planQuery(query).constraints, [{ kind: 'order', first: 'validateInput', second: 'executeTool' }]);
  }
  assert.deepEqual(planQuery('validateInput then executeTool').constraints, [{ kind: 'order', first: 'validateInput', second: 'executeTool' }]);
  assert.equal(planQuery("Where does it no longer await permissions.check?").constraints[0].target, 'permissions.check');
  assert.equal(planQuery("Find code that doesn't await policyCheck").constraints[0].expected, false);
  assert.equal(planQuery('Find the removed await from policyCheck').intent, 'evolutionary');
});

test('counterexample checks count toward the total inspection budget', async () => {
  const { index } = await buildDemo();
  const result = await search(index, 'Where did device pairing stop waiting for policyCheck?', { topK: 1, maxCandidates: 12 });
  assert.ok(result.stats.inspected <= 12); assert.equal(result.stats.contrastInspected, 0);
});

test('agent events are emitted in order and cancellation stops an investigation', async () => {
  const { index } = await buildDemo(), events = [];
  const controller = new AbortController();
  await assert.rejects(search(index, 'device pairing', { signal: controller.signal, onStep: step => { events.push(step.action); controller.abort(); } }), { name: 'AbortError' });
  assert.deepEqual(events, ['plan']);
});
