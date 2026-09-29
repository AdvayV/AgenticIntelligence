import { readFile, readdir, writeFile, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { analyzeFile, hash } from './analyze.js';
import { createEmbedder, validateVectors } from './vector.js';
import { buildLexical } from './lexical.js';
import { previousSymbol } from './lineage.js';

const excluded = new Set(['node_modules', '.git', '.codestrata', '.cache', '.venv', '.npm-cache', 'test-results', 'playwright-report', 'coverage', 'dist', 'build']);
export function emptyIndex() {
  return { schema: 1, embedding: null, versions: [], files: {}, analyses: {}, vectors: {}, snapshots: {} };
}
export async function loadIndex(file) {
  const index = JSON.parse(await readFile(file, 'utf8'));
  if (index.schema !== 1) throw new Error('Unsupported index schema');
  return index;
}
export async function saveIndex(index, file) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(index));
  await rename(temp, file);
}
export async function directoryFiles(root) {
  const result = {};
  async function visit(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && !excluded.has(entry.name) && !entry.name.startsWith('.')) await visit(full);
      if (entry.isFile() && /\.(?:js|mjs|cjs|jsx)$/.test(entry.name)) {
        const text = await readFile(full, 'utf8');
        if (Buffer.byteLength(text) <= 2_000_000) result[path.relative(root, full).split(path.sep).join('/')] = text;
      }
    }
  }
  await visit(path.resolve(root));
  return result;
}
export function gitFiles(root, ref) {
  // Resolve untrusted ref to a commit before using it in object expressions.
  const git = args => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  const commit = git(['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`]).trim();
  const names = git(['ls-tree', '-r', '--name-only', '-z', commit]).split('\0').filter(Boolean);
  const files = {};
  for (const name of names) {
    if (/\.(?:js|mjs|cjs|jsx)$/.test(name) && !name.split('/').some(p => excluded.has(p))) {
      const text = git(['show', `${commit}:${name}`]);
      if (Buffer.byteLength(text) <= 2_000_000) files[name] = text;
    }
  }
  return { files, commit };
}
export function gitHistory(root, limit = 20, ref = 'HEAD') {
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new Error('History must contain 1–200 commits');
  const git = args => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  const commit = git(['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`]).trim();
  return git(['rev-list', '--first-parent', `--max-count=${limit}`, '--reverse', commit]).trim().split('\n').filter(Boolean);
}
export async function indexVersion(index, { version, files, commit = null, embedder }) {
  if (!version || typeof version !== 'string') throw new Error('A version label is required');
  if (['__proto__', 'constructor', 'prototype'].includes(version)) throw new Error('Reserved version label');
  embedder ??= await createEmbedder();
  if (index.embedding && index.embedding !== embedder.name) throw new Error('Embedding mode differs from existing index; create a new index');
  const started = performance.now();
  const stats = { parsedFiles: 0, reusedFiles: 0, embeddedSnippets: 0, reusedVectors: 0, deletedFiles: 0 };
  const rows = [], diagnostics = [], manifest = {}, modules = {}, pendingVectors = new Map();
  const previousFiles = index.files[version] ?? {};
  stats.deletedFiles = Object.keys(previousFiles).filter(f => !(f in files)).length;
  for (const [file, source] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
    const key = hash(`analyzer-v6\0${file}\0${source}`);
    manifest[file] = key;
    if (!index.analyses[key]) { index.analyses[key] = analyzeFile(source, file); stats.parsedFiles++; }
    else stats.reusedFiles++;
    const analysis = index.analyses[key];
    modules[file] = analysis.module ?? { imports: [], exports: [] };
    diagnostics.push(...analysis.diagnostics);
    const occurrences = new Map();
    for (const snippet of analysis.snippets) {
      const ordinal = occurrences.get(snippet.name) ?? 0;
      occurrences.set(snippet.name, ordinal + 1);
      const lineage = `${file}::${snippet.name}::${ordinal}`;
      const isCodeEncoder = embedder.name.startsWith('jinaai/jina-embeddings-v2-base-code:');
      const vectorText = isCodeEncoder
        ? (snippet.documentation ? snippet.documentation + '\n' : '') + snippet.code
        : (snippet.documentation ? snippet.documentation + '\n' : '') + snippet.code + '\n' + snippet.behaviorText;
      const vectorKey = isCodeEncoder
        ? hash(`${embedder.name}\0${vectorText}`)
        : hash(`${embedder.name}\0${snippet.documentation ?? ''}\0${snippet.code}\0${snippet.behaviorText}`);
      if (!index.vectors[vectorKey] && !pendingVectors.has(vectorKey)) {
        pendingVectors.set(vectorKey, vectorText);
        stats.embeddedSnippets++;
      } else stats.reusedVectors++;
      rows.push({ ...snippet, id: hash(`${version}\0${lineage}`).slice(0, 24), version, commit, lineage, vectorKey });
    }
  }
  const entries = [...pendingVectors.entries()], completedVectors = {};
  for (let offset = 0; offset < entries.length; offset += 16) {
    const batch = entries.slice(offset, offset + 16);
    const vectors = validateVectors(await embedder.encode(batch.map(([, text]) => text)), batch.length, embedder.dimension ?? 384);
    batch.forEach(([key], i) => { completedVectors[key] = vectors[i]; });
  }
  Object.assign(index.vectors, completedVectors);
  index.embedding = embedder.name;
  if (!index.versions.includes(version)) index.versions.push(version);
  index.files[version] = manifest;
  index.snapshots[version] = { commit, snippets: rows, diagnostics, modules, lexical: buildLexical(rows) };
  index.revision = (index.revision ?? 0) + 1;
  stats.snippets = rows.length;
  stats.elapsedMs = Number((performance.now() - started).toFixed(2));
  return stats;
}
export function allSnippets(index) { return index.versions.flatMap(v => index.snapshots[v].snippets); }
export function evolution(index, snippet) {
  const link = previousSymbol(index, snippet);
  const previous = link.previous;
  if (previous) {
    const changes = [];
    const grouped = new Map();
    for (const call of previous.facts.calls) {
      if (!grouped.has(call.target)) grouped.set(call.target, []);
      grouped.get(call.target).push(call);
    }
    const occurrences = new Map();
    for (const call of snippet.facts.calls) {
      const ordinal = occurrences.get(call.target) ?? 0;
      occurrences.set(call.target, ordinal + 1);
      const old = grouped.get(call.target)?.[ordinal];
      if (!old) changes.push({ type: 'added_call', target: call.target, line: call.line });
      // Multiple identical callees have ambiguous identity after insertions/moves.
      else if (grouped.get(call.target).length === 1 && snippet.facts.calls.filter(c => c.target === call.target).length === 1 && old.awaited !== call.awaited) changes.push({ type: call.awaited ? 'added_await' : 'removed_await', target: call.target, line: call.line, previousLine: old.line });
    }
    for (const target of grouped.keys()) if (!snippet.facts.calls.some(c => c.target === target)) changes.push({ type: 'removed_call', target });
    const oldGuards = previous.facts.guards.map(g => g.condition), newGuards = snippet.facts.guards.map(g => g.condition);
    for (const condition of oldGuards) if (!newGuards.includes(condition)) changes.push({ type: 'removed_guard', condition });
    for (const condition of newGuards) if (!oldGuards.includes(condition)) changes.push({ type: 'added_guard', condition });
    const oldOrder = previous.facts.calls.map(c => c.target), newOrder = snippet.facts.calls.map(c => c.target);
    if (oldOrder.length === newOrder.length && [...oldOrder].sort().join() === [...newOrder].sort().join() && oldOrder.join() !== newOrder.join()) changes.push({ type: 'changed_call_order', before: oldOrder, after: newOrder });
    if (previous.file !== snippet.file) changes.push({ type: 'moved_file', before: previous.file, after: snippet.file });
    if (previous.name !== snippet.name) changes.push({ type: 'renamed_symbol', before: previous.name, after: snippet.name });
    return { previousVersion: previous.version, previousId: previous.id, previousLocation: { file: previous.file, startLine: previous.startLine, endLine: previous.endLine }, previousCode: previous.code, changes, confidence: link.confidence, similarity: link.similarity };
  }
  return { previousVersion: null, changes: [], confidence: link.confidence };
}
