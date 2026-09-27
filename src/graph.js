import path from 'node:path';

const cache = new WeakMap();
export function graphFor(index, version) {
  let state = cache.get(index);
  if (!state || state.revision !== index.revision) { state = { revision: index.revision, versions: new Map() }; cache.set(index, state); }
  if (state.versions.has(version)) return state.versions.get(version);
  const snapshot = index.snapshots[version], rows = snapshot.snippets, modules = snapshot.modules ?? {};
  const edges = [], unresolved = [];
  const byId = new Map(rows.map(row => [row.id, row]));
  for (const row of rows) for (const call of row.facts.calls) {
    const [base, member, ...rest] = call.target.split('.');
    if (!row.moduleLevel || call.uncertain || rest.length || row.facts.locals?.includes(base)) { unresolved.push({ from: row.id, target: call.target, line: call.line }); continue; }
    const imported = modules[row.file]?.imports.find(item => item.local === base);
    let file = row.file, name = base;
    if (imported) {
      if (!imported.source.startsWith('.')) { unresolved.push({ from: row.id, target: call.target, line: call.line }); continue; }
      const stem = path.posix.normalize(path.posix.join(path.posix.dirname(row.file), imported.source));
      file = [stem, ...['.js', '.mjs', '.cjs', '.jsx', '/index.js'].map(ext => stem + ext)].find(candidate => Object.hasOwn(modules, candidate));
      const exported = imported.imported === '*' ? member : !member ? imported.imported : undefined;
      name = file && exported ? modules[file].exports.find(item => item.exported === exported)?.local : undefined;
    } else if (member) name = undefined;
    const targets = name ? rows.filter(other => other.file === file && other.name === name && other.moduleLevel) : [];
    if (targets.length === 1) edges.push({ from: row.id, to: targets[0].id, line: call.line, target: call.target, awaited: call.awaited, kind: imported ? 'import' : 'local' });
    else unresolved.push({ from: row.id, target: call.target, line: call.line });
  }
  const graph = { edges, unresolved, byId };
  state.versions.set(version, graph);
  return graph;
}

export function neighbors(index, row, limit = 12) {
  const graph = graphFor(index, row.version);
  return graph.edges.filter(edge => edge.from === row.id || edge.to === row.id).slice(0, limit).map(edge => ({
    ...edge, direction: edge.from === row.id ? 'calls' : 'called-by',
    snippet: graph.byId.get(edge.from === row.id ? edge.to : edge.from),
  }));
}
