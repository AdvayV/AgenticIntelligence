import { tokenize } from './vector.js';

export function buildLexical(rows) {
  const postings = Object.create(null), lengths = [];
  rows.forEach((row, id) => {
    const terms = tokenize(`${row.name} ${row.file} ${row.documentation ?? ''} ${row.code} ${row.behaviorText}`), counts = new Map();
    lengths.push(terms.length);
    for (const term of terms) counts.set(term, (counts.get(term) ?? 0) + 1);
    for (const [term, count] of counts) (postings[term] ??= []).push([id, count]);
  });
  return { lengths, postings: Object.fromEntries(Object.entries(postings)), average: lengths.reduce((a, b) => a + b, 0) / (lengths.length || 1) || 1 };
}

export function scoreLexical(index, terms) {
  const scores = Array(index.lengths.length).fill(0);
  for (const term of new Set(terms)) {
    const posting = Object.hasOwn(index.postings, term) ? index.postings[term] : [];
    const idf = Math.log(1 + (scores.length - posting.length + 0.5) / (posting.length + 0.5));
    for (const [id, count] of posting) scores[id] += idf * count * 2.2 / (count + 1.2 * (0.25 + 0.75 * index.lengths[id] / index.average));
  }
  return scores;
}

const cached = new WeakMap();
export function corpusView(index, version) {
  let state = cached.get(index);
  if (!state || state.revision !== index.revision) { state = { revision: index.revision, views: new Map() }; cached.set(index, state); }
  const key = version ?? null;
  if (!state.views.has(key)) {
    const rows = version ? index.snapshots[version].snippets : index.versions.flatMap(v => index.snapshots[v].snippets);
    const lexical = version ? index.snapshots[version].lexical ?? buildLexical(rows) : buildLexical(rows);
    state.views.set(key, { rows, lexical });
  }
  return state.views.get(key);
}
