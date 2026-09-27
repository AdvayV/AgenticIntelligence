// Refactoring links are conservative, inspectable hypotheses, not semantic identity proofs.
const cache = new WeakMap();
function overlap(a, b) {
  const union = new Set([...a, ...b]);
  return union.size ? [...a].filter(x => b.has(x)).length / union.size : 1;
}
function fingerprint(row) {
  const words = row.normalized.replaceAll('AwaitExpression ', '').split(' ');
  return { shape: new Set(words.slice(1).map((word, i) => words[i] + ' ' + word)), calls: new Set(row.facts.calls.map(c => c.target)) };
}
function similarity(a, b) {
  const x = fingerprint(a), y = fingerprint(b);
  if (!x.calls.size && !y.calls.size) return a.shapeHash === b.shapeHash ? 1 : 0;
  if (!overlap(x.calls, y.calls)) return 0;
  return 0.55 * overlap(x.shape, y.shape) + 0.45 * overlap(x.calls, y.calls);
}
export function previousSymbol(index, snippet) {
  let state = cache.get(index);
  if (!state || state.revision !== index.revision) { state = { revision: index.revision, versions: new Map() }; cache.set(index, state); }
  const position = index.versions.indexOf(snippet.version);
  if (position <= 0) return { confidence: 'no-predecessor' };
  if (!state.versions.has(snippet.version)) {
    const before = index.snapshots[index.versions[position - 1]].snippets;
    const after = index.snapshots[snippet.version].snippets;
    const links = new Map(), oldLineages = new Map(before.map(s => [s.lineage, s]));
    const newLineages = new Set(after.map(s => s.lineage));
    const added = after.filter(s => !oldLineages.has(s.lineage));
    const removed = before.filter(s => !newLineages.has(s.lineage));
    for (const row of after) {
      const exact = oldLineages.get(row.lineage);
      if (exact) {
        const duplicates = before.filter(s => s.file === row.file && s.name === row.name);
        const currentDuplicates = after.filter(s => s.file === row.file && s.name === row.name);
        if (duplicates.length === 1 && currentDuplicates.length === 1) links.set(row.id, { previous: exact, confidence: 'same-file-symbol' });
        else links.set(row.id, { confidence: 'ambiguous-symbol' });
      }
    }
    const rankings = new Map(added.map(row => [row.id, removed.map(previous => ({ previous, score: similarity(row, previous) })).filter(x => x.score >= 0.78).sort((a, b) => b.score - a.score)]));
    for (const row of added) {
      const choices = rankings.get(row.id), best = choices[0];
      const collision = best && added.some(other => other.id !== row.id && (rankings.get(other.id)[0]?.previous.id === best.previous.id));
      if (best && !collision && (!choices[1] || best.score - choices[1].score >= 0.12)) {
        links.set(row.id, { previous: best.previous, confidence: 'inferred-structural-match', similarity: Number(best.score.toFixed(3)) });
      } else links.set(row.id, { confidence: best ? 'ambiguous-refactor' : 'no-predecessor' });
    }
    state.versions.set(snippet.version, links);
  }
  return state.versions.get(snippet.version).get(snippet.id) ?? { confidence: 'no-predecessor' };
}

export function lineageRows(index, snippet, limit = 40) {
  const rows = [snippet];
  let current = snippet;
  while (rows.length < limit) {
    const previous = previousSymbol(index, current).previous;
    if (!previous) break;
    rows.unshift(previous); current = previous;
  }
  // Follow only unambiguous links into later snapshots.
  current = snippet;
  for (let i = index.versions.indexOf(snippet.version) + 1; i < index.versions.length && rows.length < limit; i++) {
    const next = index.snapshots[index.versions[i]].snippets.filter(row => previousSymbol(index, row).previous?.id === current.id);
    if (next.length !== 1) break;
    current = next[0]; rows.push(current);
  }
  return rows;
}
