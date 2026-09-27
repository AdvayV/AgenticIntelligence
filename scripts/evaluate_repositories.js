import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { emptyIndex, indexVersion, directoryFiles, loadIndex, saveIndex } from '../src/index.js';
import { createEmbedder } from '../src/vector.js';
import { search } from '../src/retrieval.js';
import { metrics } from '../src/metrics.js';
import { hash } from '../src/analyze.js';

const specs = JSON.parse(await readFile('benchmarks/repositories.json', 'utf8'));
const queryFile = await readFile('benchmarks/repository-queries.json', 'utf8');
const cases = JSON.parse(queryFile).cases;
const result = { dataset: 'Frozen source-reviewed repository queries; NOT CoIR', querySetSha256: hash(queryFile), queries: cases.length,
  hardware: { cpu: os.cpus()[0].model, ramGiB: Math.round(os.totalmem() / 2 ** 30) }, repositories: [], limitations: ['AI-assisted relevance judgments; not independently annotated.', 'One pinned snapshot per repository; evolutionary retrieval is tested separately.', 'Partial relevance labels identify the intended API entry point; helpers may also be useful.'] };
for (const spec of specs) {
  const files = await directoryFiles(path.join('.cache/repositories', spec.name));
  if (!Object.keys(files).length) throw new Error('Prepare benchmark sources first');
  const versions = {};
  for (const embedding of ['features', 'bge']) {
    const cache = path.join('.cache/repositories', spec.name, `index-${embedding}-v5.json`);
    let index, indexing;
    try { index = await loadIndex(cache); indexing = { cached: true }; }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      index = emptyIndex(); indexing = await indexVersion(index, { version: spec.revision, files, embedder: await createEmbedder(embedding) });
      await saveIndex(index, cache);
    }
    const rows = index.snapshots[spec.revision].snippets;
    const modes = {};
    for (const mode of embedding === 'features' ? ['lexical', 'codestrata'] : ['hybrid', 'codestrata']) {
      const runs = [];
      for (const item of cases.filter(item => item.repo === spec.name)) {
        const relevance = Object.fromEntries(rows.filter(row => item.relevant.some(label => row.file === label.file && row.name === label.name)).map(row => [row.id, 1]));
        if (!Object.keys(relevance).length) throw new Error('Missing relevance target: ' + item.id);
        const response = await search(index, item.query, { mode, topK: 10 });
        runs.push({ id: item.id, ...metrics(response.results.map(row => row.id), relevance, 10), elapsedMs: response.stats.elapsedMs,
          top1: response.results[0] ? { file: response.results[0].file, name: response.results[0].name } : null });
      }
      const mean = key => runs.reduce((sum, run) => sum + run[key], 0) / runs.length;
      const latency = runs.map(run => run.elapsedMs).sort((a, b) => a - b);
      modes[mode] = { ndcg_at_10: mean('ndcg'), mrr_at_10: mean('mrr'), recall_at_10: mean('recall'), precision_at_10: mean('precision'),
        meanLatencyMs: mean('elapsedMs'), p95LatencyMs: latency[Math.ceil(latency.length * 0.95) - 1], runs };
    }
    versions[embedding] = { snippets: rows.length, indexing, modes };
    console.log(JSON.stringify({ repository: spec.name, embedding, snippets: rows.length, metrics: Object.fromEntries(Object.entries(modes).map(([name, { runs, ...summary }]) => [name, summary])) }));
  }
  result.repositories.push({ ...spec, measurements: versions });
}
result.rssMiB = Math.round(process.memoryUsage().rss / 2 ** 20);
await mkdir('evaluation-results', { recursive: true });
await writeFile('evaluation-results/repositories.json', JSON.stringify(result, null, 2));
