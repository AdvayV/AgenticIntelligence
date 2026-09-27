import assert from 'node:assert/strict';
const base = process.argv[2] ?? 'http://127.0.0.1:3000';
let ready = false;
for (let attempt = 0; attempt < 30; attempt++) {
  try { ready = (await fetch(base + '/api/status', { signal: AbortSignal.timeout(2000) })).ok; } catch { /* Container may still be starting. */ }
  if (ready) break;
  await new Promise(resolve => setTimeout(resolve, 500));
}
assert.ok(ready, 'Server failed to become ready');
const home = await fetch(base); assert.match(await home.text(), /CodeStrata/);
const response = await fetch(base + '/api/search/stream', { method: 'POST', body: JSON.stringify({ query: 'Where did device pairing stop waiting for policyCheck?', topK: 1 }) });
assert.equal(response.status, 200);
const events = (await response.text()).trim().split('\n').map(line => JSON.parse(line));
const result = events.at(-1).data.results[0];
assert.equal(result.name, 'pairDevice'); assert.equal(result.version, 'v2');
assert.equal(result.history.confidence, 'inferred-structural-match');
assert.equal(result.counterexample.name, 'connectDevice');
assert.equal(result.related.length, 2);
console.log('HTTP smoke passed: streaming, refactor retrieval, counterexample, and imports.');
