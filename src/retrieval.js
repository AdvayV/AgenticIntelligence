import { evolution } from './index.js';
import { createEmbedder, cosine, embeddingMode, validateVectors } from './vector.js';
import { planQuery, inspectConstraints } from './query.js';
import { corpusView, scoreLexical } from './lexical.js';
import { lineageRows } from './lineage.js';
import { neighbors } from './graph.js';

export async function search(index, query, options = {}) {
  const started = performance.now();
  const topK = Number(options.topK ?? 10), maxRounds = Number(options.maxRounds ?? 3), maxCandidates = Number(options.maxCandidates ?? 120);
  if (!Number.isInteger(topK) || topK < 1 || topK > 100) throw new Error('topK must be an integer between 1 and 100');
  if (!Number.isInteger(maxRounds) || maxRounds < 1 || maxRounds > 5 || !Number.isInteger(maxCandidates) || maxCandidates < 1 || maxCandidates > 1000) throw new Error('Invalid agent budget');
  if (options.mode && !['codestrata', 'hybrid', 'lexical'].includes(options.mode)) throw new Error('Unknown retrieval mode');
  if (options.version && !index.versions.includes(options.version)) throw new Error(`Unknown version: ${options.version}`);
  const trace = [], plan = planQuery(query);
  const emit = async step => {
    options.signal?.throwIfAborted();
    const event = { ...step, elapsedMs: Number((performance.now() - started).toFixed(2)) };
    trace.push(event);
    await options.onStep?.(event);
  };
  await emit({ round: 0, action: 'plan', reason: plan.constraints.length ? `Translate the query into ${plan.constraints.length} checkable constraint(s)` : 'Use relevance ranking; no supported structural constraint extracted', constraints: plan.constraints });
  const { rows, lexical: lexicalIndex } = corpusView(index, options.version);
  if (!rows.length) return { plan, results: [], trace, stats: { elapsedMs: 0, inspected: 0, corpusSnippets: 0, stopReason: 'candidate_exhaustion' } };
  const useEvidence = !options.mode || options.mode === 'codestrata';
  const lexical = scoreLexical(lexicalIndex, plan.terms);
  let dense = Array(rows.length).fill(0);
  if (options.mode !== 'lexical') {
    const embedder = options.embedder ?? await createEmbedder(embeddingMode(index.embedding));
    if (embedder.name !== index.embedding) throw new Error('Query embedder must match index embedding');
    const vector = validateVectors(await embedder.encode([query], { kind: 'query' }), 1)[0];
    dense = rows.map(row => cosine(vector, index.vectors[row.vectorKey]));
  }
  const lexRank = new Map([...rows.keys()].sort((a, b) => lexical[b] - lexical[a]).map((id, rank) => [id, rank + 1]));
  const vectorRank = new Map([...rows.keys()].sort((a, b) => dense[b] - dense[a]).map((id, rank) => [id, rank + 1]));
  const everyCandidate = rows.map((row, i) => ({ row, lexical: lexical[i], dense: dense[i],
    base: options.mode === 'lexical' ? lexical[i] : 1 / (60 + lexRank.get(i)) + 1 / (60 + vectorRank.get(i)) }));
  const candidates = everyCandidate.filter(c => c.lexical > 0 || c.dense > 0.1).sort((a, b) => b.base - a.base || a.row.id.localeCompare(b.row.id));
  const candidateById = new Map(everyCandidate.map(c => [c.row.id, c]));
  await emit({ round: 0, action: options.mode === 'lexical' ? 'lexical_retrieve' : 'hybrid_retrieve', candidates: candidates.length, reason: options.mode === 'lexical' ? 'Search cached lexical postings' : 'Fuse cached lexical and CPU vector ranks' });
  const inspected = new Map();
  let pending = candidates.slice(0, Math.min(maxCandidates, Math.max(topK * 2, 12))), stopReason = 'candidate_exhaustion';
  for (let round = 1; round <= maxRounds; round++) {
    for (const candidate of pending) {
      options.signal?.throwIfAborted();
      if (inspected.size >= maxCandidates) break;
      if (inspected.has(candidate.row.id)) continue;
      const history = evolution(index, candidate.row);
      const evidence = useEvidence ? inspectConstraints(candidate.row, plan, history) : [];
      const supported = evidence.filter(e => e.status === 'supported').length;
      const contradicted = evidence.filter(e => e.status === 'contradicted').length;
      const unknown = evidence.filter(e => e.status === 'unknown').length;
      const score = candidate.base + supported * 0.08 - contradicted * 0.12 - unknown * 0.01;
      inspected.set(candidate.row.id, { ...candidate, history, evidence, score });
    }
    await emit({ round, action: 'inspect', inspected: inspected.size, reason: useEvidence ? 'Check requested behavior against AST facts and predecessor' : 'Baseline ranking without behavior evidence' });
    if (!useEvidence || !plan.constraints.length) { stopReason = 'semantic_ranking_complete'; break; }
    const complete = [...inspected.values()].filter(c => c.evidence.length && c.evidence.every(e => e.status === 'supported'));
    if (complete.length >= topK) { stopReason = 'enough_supported_results'; break; }
    if (inspected.size >= maxCandidates) { stopReason = 'candidate_budget'; break; }
    if (round === maxRounds) { stopReason = 'round_budget'; break; }
    const discovered = new Map();
    let graphCount = 0, relativeCount = 0;
    for (const item of inspected.values()) {
      for (const relative of lineageRows(index, item.row)) {
        const candidate = candidateById.get(relative.id);
        if (candidate && !inspected.has(relative.id) && !discovered.has(relative.id)) { discovered.set(relative.id, candidate); relativeCount++; }
      }
      for (const edge of neighbors(index, item.row)) {
        const candidate = candidateById.get(edge.snippet.id);
        if (candidate && !inspected.has(candidate.row.id) && !discovered.has(candidate.row.id)) { discovered.set(candidate.row.id, candidate); graphCount++; }
      }
    }
    const unseen = candidates.filter(c => !inspected.has(c.row.id) && !discovered.has(c.row.id));
    pending = [...discovered.values(), ...unseen].slice(0, Math.min(maxCandidates - inspected.size, 40));
    if (!pending.length) break;
    await emit({ round, action: graphCount ? 'follow_imports' : relativeCount ? 'expand_version_relatives' : 'refine_candidates', candidates: pending.length,
      reason: `Insufficient supported results; inspect ${relativeCount} version relatives, ${graphCount} call neighbors, then remaining candidates` });
  }
  const ranked = [...inspected.values()].sort((a, b) => b.score - a.score || a.row.id.localeCompare(b.row.id)).slice(0, topK);
  let contrastInspected = 0;
  const results = ranked.map((c, i) => {
    const relatives = lineageRows(index, c.row);
    let counterexample = null;
    if (useEvidence && plan.constraints.length) {
      const alternatives = relatives.filter(row => row.id !== c.row.id).sort((a, b) => Math.abs(index.versions.indexOf(a.version) - index.versions.indexOf(c.row.version)) - Math.abs(index.versions.indexOf(b.version) - index.versions.indexOf(c.row.version)));
      for (const alternative of alternatives) {
        if (inspected.size + contrastInspected >= maxCandidates) break;
        contrastInspected++;
        const evidence = inspectConstraints(alternative, { ...plan, intent: 'structural' }, evolution(index, alternative));
        if (evidence.some(e => e.status === 'contradicted')) {
          counterexample = { id: alternative.id, name: alternative.name, file: alternative.file, startLine: alternative.startLine, endLine: alternative.endLine, version: alternative.version, code: alternative.code, evidence };
          break;
        }
      }
    }
    const related = neighbors(index, c.row).map(edge => ({ direction: edge.direction, kind: edge.kind, line: edge.line, target: edge.target,
      id: edge.snippet.id, name: edge.snippet.name, file: edge.snippet.file, startLine: edge.snippet.startLine, version: edge.snippet.version }));
    return {
      rank: i + 1, id: c.row.id, name: c.row.name, file: c.row.file, startLine: c.row.startLine, endLine: c.row.endLine,
      version: c.row.version, commit: c.row.commit, code: c.row.code, score: Number(c.score.toFixed(6)),
      signals: { lexical: Number(c.lexical.toFixed(4)), vector: Number(c.dense.toFixed(4)) },
      evidence: c.evidence, history: c.history, counterexample, related,
      timeline: relatives.map(row => ({ id: row.id, name: row.name, file: row.file, startLine: row.startLine, endLine: row.endLine, version: row.version, commit: row.commit,
        selected: row.id === c.row.id, changes: evolution(index, row).changes.map(change => change.type) })),
      certainty: !c.evidence.length ? 'semantic-match' : c.evidence.every(e => e.status === 'supported') ? 'supported-static-pattern' : c.evidence.some(e => e.status === 'contradicted') ? 'contradicted' : 'uncertain',
    };
  });
  if (contrastInspected) await emit({ action: 'compare_counterexamples', inspected: contrastInspected, reason: `Checked ${contrastInspected} neighboring versions for conflicting structural evidence` });
  await emit({ action: 'stop', reason: stopReason });
  return { plan, results, trace, stats: { elapsedMs: Number((performance.now() - started).toFixed(2)), inspected: inspected.size + contrastInspected, rankedCandidates: inspected.size, contrastInspected,
    corpusSnippets: rows.length, stopReason, embedding: index.embedding, lexicalIndex: 'cached-postings', budget: { maxRounds, maxCandidates } } };
}
