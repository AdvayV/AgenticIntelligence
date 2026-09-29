import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { emptyIndex, indexVersion, allSnippets, evolution, saveIndex, loadIndex, directoryFiles, gitFiles } from '../src/index.js';
import { analyzeFile, hash } from '../src/analyze.js';
const files = { 'a.js': 'async function a() { await permission(); settings(); }' };
test('reindexing invalidates cached facts from the previous analyzer', async () => {
  const index = emptyIndex(), source = 'async function f() { await !permission(); }';
  const stale = analyzeFile(source, 'a.js');
  stale.snippets[0].facts.calls[0].awaited = true;
  stale.snippets[0].facts.calls[0].uncertain = false;
  index.analyses[hash(`analyzer-v5\0a.js\0${source}`)] = stale;
  const stats = await indexVersion(index, { version: 'v', files: { 'a.js': source } });
  assert.equal(stats.parsedFiles, 1);
  assert.equal(index.snapshots.v.snippets[0].facts.calls[0].uncertain, true);
});
test('unchanged files and vectors are reused across versions', async () => {
  const index = emptyIndex(); await indexVersion(index, { version: 'old', files });
  const stats = await indexVersion(index, { version: 'new', files });
  assert.equal(stats.parsedFiles, 0); assert.equal(stats.reusedFiles, 1); assert.equal(stats.embeddedSnippets, 0);
  assert.equal(allSnippets(index).length, 2);
});
test('updating a version removes deleted files without leaking stale results', async () => {
  const index = emptyIndex(); await indexVersion(index, { version: 'work', files });
  const stats = await indexVersion(index, { version: 'work', files: {} });
  assert.equal(stats.deletedFiles, 1); assert.equal(allSnippets(index).length, 0); assert.deepEqual(index.versions, ['work']);
});
test('behavior evolution records removed and restored await', async () => {
  const index = emptyIndex();
  await indexVersion(index, { version: 'old', files });
  await indexVersion(index, { version: 'new', files: { 'a.js': files['a.js'].replace('await ', '') } });
  await indexVersion(index, { version: 'fixed', files });
  assert.equal(evolution(index, index.snapshots.new.snippets[0]).changes[0].type, 'removed_await');
  assert.equal(evolution(index, index.snapshots.fixed.snippets[0]).changes[0].type, 'added_await');
});
test('records guard removal and changed order', async () => {
  const index = emptyIndex();
  await indexVersion(index, { version: 'old', files: { 'a.js': 'function a(x) { if (x) { first(); second(); } }' } });
  await indexVersion(index, { version: 'new', files: { 'a.js': 'function a(x) { second(); first(); }' } });
  const changes = evolution(index, index.snapshots.new.snippets[0]).changes;
  assert.ok(changes.some(c => c.type === 'removed_guard')); assert.ok(changes.some(c => c.type === 'changed_call_order'));
});
test('line positions are refreshed when only preceding text moves', async () => {
  const index = emptyIndex(); await indexVersion(index, { version: 'old', files });
  const stats = await indexVersion(index, { version: 'new', files: { 'a.js': '\n\n' + files['a.js'] } });
  assert.equal(index.snapshots.new.snippets[0].startLine, 3); assert.equal(stats.embeddedSnippets, 0);
});
test('index persists with schema checking', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'codestrata-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'index.json'), index = emptyIndex(); await indexVersion(index, { version: 'v', files });
  await saveIndex(index, file); assert.deepEqual(await loadIndex(file), index);
  await writeFile(file, '{"schema":99}'); await assert.rejects(loadIndex(file), /schema/);
});
test('does not mix incompatible embedding spaces', async () => {
  const index = emptyIndex(); await indexVersion(index, { version: 'v', files });
  await assert.rejects(indexVersion(index, { version: 'next', files, embedder: { name: 'other', encode: async () => [] } }), /Embedding mode/);
});
test('rejects reserved version labels', async () => {
  await assert.rejects(indexVersion(emptyIndex(), { version: '__proto__', files }), /Reserved/);
});
test('repeated callees do not fabricate await evolution', async () => {
  const index = emptyIndex();
  const source = 'async function a() { await permission(); permission(); }';
  await indexVersion(index, { version: 'old', files: { 'a.js': source } });
  await indexVersion(index, { version: 'new', files: { 'a.js': source } });
  assert.deepEqual(evolution(index, index.snapshots.new.snippets[0]).changes, []);
});
test('a deleted then reintroduced symbol is not assumed to have continuous lineage', async () => {
  const index = emptyIndex();
  await indexVersion(index, { version: 'old', files });
  await indexVersion(index, { version: 'deleted', files: {} });
  await indexVersion(index, { version: 'new', files: { 'a.js': files['a.js'].replace('await ', '') } });
  assert.equal(evolution(index, index.snapshots.new.snippets[0]).previousVersion, null);
});
test('directory indexing excludes dependencies and includes JSX', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'codestrata-')); t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(path.join(dir, 'node_modules')); await writeFile(path.join(dir, 'node_modules', 'bad.js'), 'bad');
  await writeFile(path.join(dir, 'view.jsx'), 'const View = () => <div/>;');
  assert.deepEqual(Object.keys(await directoryFiles(dir)), ['view.jsx']);
});
test('reads real Git snapshots without checking out or running repository code', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'codestrata-git-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const git = args => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  git(['init', '-b', 'main']); git(['config', 'user.name', 'Test']); git(['config', 'user.email', 'test@example.com']);
  await writeFile(path.join(dir, 'a.js'), files['a.js']); git(['add', '.']); git(['commit', '-m', 'old']);
  const old = git(['rev-parse', 'HEAD']).trim(); await writeFile(path.join(dir, 'a.js'), files['a.js'].replace('await ', ''));
  git(['add', '.']); git(['commit', '-m', 'new']);
  assert.equal(gitFiles(dir, old).files['a.js'], files['a.js']);
  assert.ok(!gitFiles(dir, 'HEAD').files['a.js'].includes('await '));
  assert.throws(() => gitFiles(dir, '--help'));
});
