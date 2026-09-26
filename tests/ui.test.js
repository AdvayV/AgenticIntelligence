import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { buildDemo } from '../src/demo.js';
import { search } from '../src/retrieval.js';

const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const script = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const { index } = await buildDemo();
const initialResult = await search(index, 'Where did Bluetooth settings stop waiting for permission checking?', { topK: 5 });
const response = (data, ok = true) => ({ ok, json: async () => data });
async function settle(condition) {
  for (let i = 0; i < 100; i++) {
    if (condition()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.fail('UI did not settle within the test timeout');
}
async function boot(t, options = {}) {
  const dom = new JSDOM(html, { url: 'http://localhost:3000', runScripts: 'outside-only', pretendToBeVisual: true });
  t.after(() => dom.window.close());
  const { window } = dom, calls = [], mediaListeners = [];
  const media = { matches: options.reduced ?? false, addEventListener: (name, fn) => mediaListeners.push(fn) };
  window.matchMedia = () => media;
  if (options.paused) window.localStorage.setItem('palimpsest-motion', 'paused');
  window.fetch = async (url, init) => {
    if (url === '/api/status') return response({ versions: index.versions, snippets: 16, embedding: index.embedding });
    const input = JSON.parse(init.body);
    const call = { input, signal: init.signal };
    calls.push(call);
    if (options.fetchSearch) return options.fetchSearch(input, calls.length, call);
    return response(await search(index, input.query, { version: input.version || undefined, mode: input.mode, topK: input.topK }));
  };
  // Run only trusted application source; no external page scripts or code snippets.
  await window.eval('(async () => {\n' + script + '\n})()');
  return { window, document: window.document, calls, media, mediaListeners };
}

test('light workspace renders actual retrieval, syntax highlighting, evidence and predecessor locations', async t => {
  const { document } = await boot(t);
  assert.equal(document.querySelector('.result-card .card-title').textContent, 'openBluetooth');
  assert.equal(document.querySelector('.result-card .version-tag').textContent, 'v2');
  assert.match(document.querySelector('#status-text').textContent, /16 snippets · 3 versions/);
  assert.match(document.querySelector('.certainty-badge').textContent, /Pattern supported/);
  assert.ok(document.querySelector('.code-line.hit'));
  assert.ok(document.querySelector('.token-function'));
  assert.equal(document.querySelector('.results-region').getAttribute('aria-busy'), 'false');
  assert.equal(document.querySelector('#query-metrics').hidden, false);
  const comparison = document.querySelector('.comparison');
  comparison.querySelector('summary').click();
  assert.equal(comparison.open, true);
  assert.match(comparison.querySelector('.code-block').textContent, /await checkPermission/);
  assert.match(comparison.querySelector('.comparison-label').textContent, /assistant.js:1–4/);
});

test('hover, keyboard focus and tap show contextual side explanations without submitting a search', async t => {
  const { window, document, calls } = await boot(t);
  const help = document.querySelector('button[data-help="version"]');
  help.dispatchEvent(new window.Event('pointerover', { bubbles: true }));
  assert.equal(document.querySelector('#help-title').textContent, 'The right code. In the right version.');
  document.querySelector('button[data-help="mode"]').focus();
  assert.equal(document.querySelector('#help-title').textContent, 'Three ways to look at the same code.');
  document.querySelector('button[data-help="query"]').click();
  assert.equal(document.querySelector('#help-title').textContent, 'Search for a behavior, not just a name.');
  assert.equal(calls.length, 1);
});

test('dynamically rendered evidence explains its own result and location on focus', async t => {
  const { document } = await boot(t);
  document.querySelector('.certainty-badge').focus();
  assert.match(document.querySelector('#help-example').textContent, /openBluetooth @ v2/);
  document.querySelector('.code-line.hit').focus();
  assert.match(document.querySelector('#help-example').textContent, /evidence on line 2/);
  assert.match(document.querySelector('#help-body').textContent, /not a full execution trace/);
});

test('version and lens changes automatically rerun the current query', async t => {
  const { window, document, calls } = await boot(t);
  const version = document.querySelector('#version');
  version.value = 'v1'; version.dispatchEvent(new window.Event('change', { bubbles: true }));
  await settle(() => calls.length === 2 && !document.querySelector('#submit').disabled);
  assert.equal(calls[1].input.version, 'v1');
  assert.ok([...document.querySelectorAll('.version-tag')].every(tag => tag.textContent === 'v1'));
  const mode = document.querySelector('#mode');
  mode.value = 'hybrid'; mode.dispatchEvent(new window.Event('change', { bubbles: true }));
  await settle(() => calls.length === 3 && !document.querySelector('#submit').disabled);
  assert.equal(calls[2].input.mode, 'hybrid');
  assert.equal(document.querySelector('#metric-supported').textContent, '0');
});

test('pattern buttons update query and selected state; Ctrl+Enter submits', async t => {
  const { window, document, calls } = await boot(t);
  const pattern = document.querySelector('[data-query*="fallback"]');
  pattern.click();
  await settle(() => calls.length === 2 && !document.querySelector('#submit').disabled);
  assert.equal(document.querySelector('#query').value, pattern.dataset.query);
  assert.equal(pattern.getAttribute('aria-pressed'), 'true');
  assert.equal(document.querySelector('.card-title').textContent, 'runPrimary');
  const query = document.querySelector('#query');
  query.value = 'Find calls validateInput before executeTool';
  query.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }));
  await settle(() => calls.length === 3 && !document.querySelector('#submit').disabled);
  assert.equal(calls[2].input.query, query.value);
});

test('motion controls persist and respond to reduced-motion preference changes', async t => {
  const { window, document, media, mediaListeners } = await boot(t);
  const toggle = document.querySelector('#motion-toggle');
  toggle.click();
  assert.equal(document.body.classList.contains('motion-paused'), true);
  assert.equal(toggle.getAttribute('aria-pressed'), 'true');
  assert.equal(window.localStorage.getItem('palimpsest-motion'), 'paused');
  toggle.click();
  assert.equal(document.body.classList.contains('motion-paused'), false);
  media.matches = true; mediaListeners.forEach(listener => listener());
  assert.equal(toggle.disabled, true);
  assert.equal(document.body.classList.contains('motion-paused'), true);
  assert.equal(document.querySelector('#motion-label').textContent, 'Motion reduced');
});

test('stored paused motion is restored on load', async t => {
  const { document } = await boot(t, { paused: true });
  assert.equal(document.body.classList.contains('motion-paused'), true);
  assert.equal(document.querySelector('#motion-label').textContent, 'Resume motion');
});

test('code and result metadata are rendered as text, never executable HTML', async t => {
  const result = structuredClone(initialResult);
  result.results[0].name = '<script>window.injected=true</script>';
  result.results[0].code = 'return "<img src=x onerror=window.injected=true>";';
  result.results[0].file = '<svg onload=window.injected=true>';
  const { window, document } = await boot(t, { fetchSearch: async () => response(result) });
  assert.equal(document.querySelector('#results img'), null);
  assert.equal(document.querySelector('#results script'), null);
  assert.equal(document.querySelector('#results svg'), null);
  assert.match(document.querySelector('.code-block').textContent, /<img src=x/);
  assert.equal(window.injected, undefined);
});

test('rapid changes cancel the older request and cannot overwrite the newest results', async t => {
  const pending = [];
  const { document, calls } = await boot(t, { fetchSearch: (input, number) => number === 1 ? response(initialResult) : new Promise(resolve => pending.push({ input, resolve })) });
  const patterns = document.querySelectorAll('[data-query]');
  patterns[0].click(); patterns[2].click();
  assert.equal(calls.length, 3); assert.equal(calls[1].signal.aborted, true);
  assert.equal(document.querySelector('.results-region').getAttribute('aria-busy'), 'true');
  const newest = structuredClone(initialResult); newest.results[0].name = 'newestResult';
  pending[1].resolve(response(newest));
  await settle(() => document.querySelector('.card-title').textContent === 'newestResult');
  const old = structuredClone(initialResult); old.results[0].name = 'staleResult';
  pending[0].resolve(response(old));
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(document.querySelector('.card-title').textContent, 'newestResult');
  assert.equal(document.querySelector('#submit').disabled, false);
});

test('failed and empty searches present useful states and release the loading control', async t => {
  const { window, document } = await boot(t, { fetchSearch: async (input, number) => number === 1 ? response({ error: 'Unsupported query' }, false) : response({ ...initialResult, results: [], trace: [] }) });
  assert.equal(document.querySelector('#error').hidden, false);
  assert.equal(document.querySelector('#error').textContent, 'Unsupported query');
  assert.equal(document.querySelector('#submit').disabled, false);
  document.querySelector('#search-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await settle(() => document.querySelector('#result-count').textContent === '0');
  assert.match(document.querySelector('.empty-state').textContent, /No matching snippets/);
  assert.equal(document.querySelector('#error').hidden, true);
});
