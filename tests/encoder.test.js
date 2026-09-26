import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
test('benchmark encoder bridge preserves document count and supports non-JavaScript fallback', () => {
  const encode = texts => JSON.parse(execFileSync(process.execPath, ['scripts/encode.js'], { input: JSON.stringify({ texts }), encoding: 'utf8' }));
  const result = encode(['permission check', 'async function x() { await permission(); }', 'def f(x): return x']);
  assert.equal(result.vectors.length, 3); assert.ok(result.vectors.every(v => v.length === 384 && v.every(Number.isFinite)));
  assert.deepEqual(encode([]).vectors, []);
});
