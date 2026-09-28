import { planQuery, inspectConstraints, targetMatches } from './query.js';
import { lineageRows, previousSymbol } from './lineage.js';

// A watch follows one lineage; relevance search must never substitute another function.
export function checkBehaviorWatch(index, input) {
  if (!input || typeof input !== 'object') throw new Error('Expected a watch object');
  const plan = planQuery(input.query);
  if (plan.intent !== 'structural') throw new Error('State a static rule, for example: awaits policyCheck. Historical questions cannot be watched.');
  if (index.versions.length > 200) throw new Error('Behavior Watch supports up to 200 indexed snapshots');
  const anchor = index.versions.includes(input.version) ? index.snapshots[input.version]?.snippets.find(row => row.id === input.id) : undefined;
  if (!anchor) throw new Error('Pinned function is unavailable. Search again and pin a current result.');
  if (typeof input.contentHash !== 'string' || anchor.contentHash !== input.contentHash) throw new Error('Pinned source has changed. Search again and pin the updated result.');
  const linked = new Map(lineageRows(index, anchor, index.versions.length).map(row => [row.version, row]));
  const points = index.versions.map(version => {
    const row = linked.get(version);
    if (!row) return { version, status: 'unlinked', evidence: [], reason: 'No unambiguous lineage link; absence does not prove deletion or failure.' };
    const evidence = inspectConstraints(row, plan).map(item => {
      const repeated = item.kind === 'await' && row.facts.calls.filter(call => targetMatches(call.target, item.target)).length > 1;
      const repeatedOrder = item.kind === 'order' && [item.first, item.second].some(target => row.facts.calls.filter(call => targetMatches(call.target, target)).length > 1);
      return repeated || repeatedOrder ? { ...item, status: 'unknown', details: 'Repeated matching calls need inspection; no single invocation can certify this watch.' } : { ...item, details: item.details || 'Matching evidence is unavailable in this function.' };
    });
    const link = previousSymbol(index, row);
    return { version, id: row.id, name: row.name, file: row.file, startLine: row.startLine, endLine: row.endLine, commit: row.commit, contentHash: row.contentHash, code: row.code,
      status: evidence.some(item => item.status === 'contradicted') ? 'contradicted' : evidence.every(item => item.status === 'supported') ? 'supported' : 'unknown',
      evidence, link: { confidence: link.confidence, similarity: link.similarity, previousVersion: link.previous?.version } };
  });
  const transitions = [];
  for (let i = 1; i < points.length; i++) {
    const before = points[i - 1], after = points[i];
    if (before.status === 'supported' && after.status === 'contradicted') transitions.push({ type: 'regression', from: before.version, to: after.version });
    if (before.status === 'contradicted' && after.status === 'supported') transitions.push({ type: 'restoration', from: before.version, to: after.version });
  }
  return { schema: 'codestrata.behavior-watch.v1', checkedAt: new Date().toISOString(), query: plan.query,
    anchor: { id: anchor.id, version: anchor.version, name: anchor.name, file: anchor.file, contentHash: anchor.contentHash },
    index: { versions: [...index.versions], embedding: index.embedding }, constraints: plan.constraints, points, transitions,
    firstObservedRegression: transitions.find(item => item.type === 'regression') ?? null,
    limitations: ['Static syntax checks, not runtime proofs. Rules use the local constraint parser.', 'Transitions are between adjacent indexed snapshots, not necessarily adjacent Git commits.', 'Rename and move links can be inferred; ambiguous or missing links remain unverified.', 'Checks run on demand against the currently loaded index; reindex and restart to include new source.'] };
}
