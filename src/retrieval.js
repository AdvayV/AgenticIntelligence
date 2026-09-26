import { allSnippets, evolution } from './index.js';
import { createEmbedder, cosine, tokenize } from './vector.js';
import { planQuery, inspectConstraints } from './query.js';

function bm25(rows, terms) {
  const bags = rows.map(row => tokenize(`${row.name} ${row.file} ${row.code} ${row.behaviorText}`));
  const average = bags.reduce((s, bag) => s + bag.length, 0) / (bags.length || 1) || 1;
  const unique = [...new Set(terms)];
  const df = new Map(unique.map(t => [t, bags.filter(b => b.includes(t)).length]));
  return bags.map(bag => unique.reduce((score, term) => {
    const count = bag.filter(t => t === term).length;
    if (!count) return score;
    const idf = Math.log(1 + (rows.length - df.get(term) + 0.5) / (df.get(term) + 0.5));
    return score + idf * count * 2.2 / (count + 1.2 * (0.25 + 0.75 * bag.length / average));
  }, 0));
}

export async function search(index, query, options = {}) {
  const started = performance.now();
  const topK = Number(options.topK ?? 10), maxRounds = Number(options.maxRounds ?? 3), maxCandidates = Number(options.maxCandidates ?? 120);
  if (!Number.isInteger(topK) || topK < 1 || topK > 100) throw new Error('topK must be an integer between 1 and 100');
  if (!Number.isInteger(maxRounds) || maxRounds < 1 || maxRounds > 5 || !Number.isInteger(maxCandidates) || maxCandidates < 1 || maxCandidates > 1000) throw new Error('Invalid agent budget');
  if (options.mode && !['codestrata', 'hybrid', 'lexical'].includes(options.mode)) throw new Error('Unknown retrieval mode');
  if (options.version && !index.versions.includes(options.version)) throw new Error(`Unknown version: ${options.version}`);
  const plan = planQuery(query), trace = [];
  const rows = options.version ? index.snapshots[options.version].snippets : allSnippets(index);
  if (!rows.length) return { plan, results: [], trace: [], stats: { elapsedMs: 0, inspected: 0, corpusSnippets: 0 } };
  const embedder = options.embedder ?? await createEmbedder(index.embedding === 'feature-hash-384' ? 'features' : 'minilm');
  if (embedder.name !== index.embedding) throw new Error('Query embedder must match index embedding');
  const vector = (await embedder.encode([query]))[0];
  const lexical = bm25(rows, plan.terms), dense = rows.map(row => cosine(vector, index.vectors[row.vectorKey]));
  const lexRank = new Map([...rows.keys()].sort((a, b) => lexical[b] - lexical[a]).map((id, rank) => [id, rank + 1]));
  const vectorRank = new Map([...rows.keys()].sort((a, b) => dense[b] - dense[a]).map((id, rank) => [id, rank + 1]));
  const candidates = rows.map((row, i) => ({ row, lexical: lexical[i], dense: dense[i],
    base: options.mode === 'lexical' ? lexical[i] : 1 / (60 + lexRank.get(i)) + 1 / (60 + vectorRank.get(i)) }))
    .filter(c => c.lexical > 0 || c.dense > 0.1).sort((a, b) => b.base - a.base || a.row.id.localeCompare(b.row.id));
  trace.push({ round: 0, action: 'hybrid_retrieve', candidates: candidates.length, reason: 'Fuse lexical and vector ranks; retain original snippets' });
  const inspected = new Map();
  const useEvidence = !options.mode || options.mode === 'codestrata';
  let pending = candidates.slice(0, Math.min(maxCandidates, Math.max(topK * 2, 12))), stopReason = 'candidate_exhaustion';
  for (let round = 1; round <= maxRounds; round++) {
    for (const candidate of pending) {
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
    trace.push({ round, action: 'inspect', inspected: inspected.size, reason: useEvidence ? 'Check requested behavior against AST facts and predecessor' : 'Baseline ranking without behavior evidence' });
    if (!useEvidence || !plan.constraints.length) { stopReason = 'semantic_ranking_complete'; break; }
    const complete = [...inspected.values()].filter(c => c.evidence.length && c.evidence.every(e => e.status === 'supported'));
    if (complete.length >= topK) { stopReason = 'enough_supported_results'; break; }
    if (inspected.size >= maxCandidates) { stopReason = 'candidate_budget'; break; }
    if (round === maxRounds) { stopReason = 'round_budget'; break; }
    const lineages = new Set([...inspected.values()].map(c => c.row.lineage));
    const unseen = candidates.filter(c => !inspected.has(c.row.id));
    const relatives = unseen.filter(c => lineages.has(c.row.lineage));
    // Decision-driven refinement: expand historical relatives first, then inspect
    // unvisited structural candidates. No whole-repository LLM context is needed.
    pending = [...relatives, ...unseen.filter(c => !lineages.has(c.row.lineage))].slice(0, Math.min(maxCandidates - inspected.size, 40));
    if (!pending.length) break;
    trace.push({ round, action: relatives.length ? 'expand_version_relatives' : 'refine_candidates', candidates: pending.length, reason: 'Too few candidates satisfy all requested conditions' });
  }
  trace.push({ action: 'stop', reason: stopReason });
  const results = [...inspected.values()].sort((a, b) => b.score - a.score || a.row.id.localeCompare(b.row.id)).slice(0, topK).map((c, i) => ({
    rank: i + 1, id: c.row.id, name: c.row.name, file: c.row.file, startLine: c.row.startLine, endLine: c.row.endLine,
    version: c.row.version, commit: c.row.commit, code: c.row.code, score: Number(c.score.toFixed(6)),
    signals: { lexical: Number(c.lexical.toFixed(4)), vector: Number(c.dense.toFixed(4)) },
    evidence: c.evidence, history: c.history, certainty: !c.evidence.length ? 'semantic-match' : c.evidence.every(e => e.status === 'supported') ? 'supported-static-pattern' : c.evidence.some(e => e.status === 'contradicted') ? 'contradicted' : 'uncertain',
  }));
  return { plan, results, trace, stats: { elapsedMs: Number((performance.now() - started).toFixed(2)), inspected: inspected.size, corpusSnippets: rows.length, stopReason, embedding: index.embedding } };
}
