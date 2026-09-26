import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeFile } from '../src/analyze.js';
import { inspectConstraints, planQuery } from '../src/query.js';
const one = code => analyzeFile(code).snippets[0];
const evidence = (code, query) => inspectConstraints(one(code), planQuery(query), { changes: [], previousVersion: null });

test('extracts exact function source and multiline locations', () => {
  const source = '// note\nexport async function start() {\n  await permission();\n}\n';
  const snippet = one(source);
  assert.equal(snippet.startLine, 2); assert.equal(snippet.endLine, 4);
  assert.equal(snippet.code, 'async function start() {\n  await permission();\n}');
  assert.equal(snippet.facts.calls[0].line, 3);
});
test('does not confuse call arguments with awaited invocation', () => {
  const calls = one('async function x() { await send(permission()); }').facts.calls;
  assert.deepEqual(calls.map(c => [c.target, c.awaited]), [['permission', false], ['send', true]]);
});
test('nested callbacks do not contaminate enclosing function facts', () => {
  const snippets = analyzeFile('function outer() { setTimeout(() => permission(), 1); settings(); }').snippets;
  assert.deepEqual(snippets[0].facts.calls.map(c => c.target), ['setTimeout', 'settings']);
  assert.deepEqual(snippets[1].facts.calls.map(c => c.target), ['permission']);
});
test('recognizes arrow functions and class methods', () => {
  assert.deepEqual(analyzeFile('const run = async () => tool(); class Device { open() { settings(); } }').snippets.map(s => s.name), ['run', 'open']);
});
test('invalid JavaScript yields diagnostics instead of invented snippets', () => {
  const result = analyzeFile('function broken( {');
  assert.equal(result.snippets.length, 0); assert.equal(result.diagnostics.length, 1);
});
test('identifier normalization tolerates local renaming', () => {
  assert.equal(one('function a(input) { return input.trim(); }').shapeHash, one('function b(text) { return text.trim(); }').shapeHash);
});
test('normalization preserves await, negation, operators and literals', () => {
  assert.notEqual(one('async function a() { await check(); }').shapeHash, one('async function a() { check(); }').shapeHash);
  assert.notEqual(one('function a(x) { if (x) tool("a"); }').shapeHash, one('function a(x) { if (!x) tool("a"); }').shapeHash);
  assert.notEqual(one('function a() { tool("a"); }').shapeHash, one('function a() { tool("b"); }').shapeHash);
});
test('straight-line invocation order is supported and reversed order contradicted', () => {
  assert.equal(evidence('function a() { first(); second(); }', 'calls first before second')[0].status, 'supported');
  assert.equal(evidence('function a() { second(); first(); }', 'calls first before second')[0].status, 'contradicted');
});
test('supports the organizer tool-order phrasing and single-letter symbols', () => {
  assert.equal(evidence('function x() { XYZ(); ABC(); }', 'which files call tool XYZ before tool ABC?')[0].status, 'supported');
  assert.equal(evidence('function x() { A(); B(); }', 'calls A before B')[0].status, 'supported');
});
for (const [label, code] of [
  ['exclusive branches', 'function a(x) { if (x) first(); else second(); }'],
  ['early return', 'function a() { first(); return; second(); }'],
  ['loop', 'function a() { while (true) { first(); second(); } }'],
  ['exception path', 'function a() { try { first(); } catch { second(); } }'],
  ['short circuit', 'function a(x) { x && first(); second(); }'],
  ['dynamic dispatch', 'function a(tools, name) { tools[name](); second(); }'],
  ['optional call', 'function a() { first?.(); second(); }'],
]) test(`does not certify order through ${label}`, () => {
  const result = evidence(code, label === 'dynamic dispatch' ? 'calls tools before second' : 'calls first before second');
  assert.equal(result[0].status, 'unknown');
});
test('recognizes early-return guard syntax', () => {
  assert.equal(evidence('function a(device) { if (!device.supported) return; tool(); }', 'without checking device supported')[0].status, 'contradicted');
});
test('a promise awaited later is not certified as unawaited execution', () => {
  assert.equal(evidence('async function a() { const p = permission(); await p; settings(); }', 'without awaiting permission')[0].status, 'unknown');
});
test('calls inside awaited promise combinators remain uncertain', () => {
  assert.equal(evidence('async function a() { await Promise.all([permission()]); settings(); }', 'without awaiting permission')[0].status, 'unknown');
});
test('normalization preserves member names', () => {
  assert.notEqual(one('function a(x) { x.trim(); }').shapeHash, one('function a(x) { x.filter(); }').shapeHash);
});
test('string literals do not create fake calls', () => {
  assert.equal(one('function a() { return "await permission();"; }').facts.calls.length, 0);
});
