import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildDemo } from '../src/demo.js';
import { indexVersion, allSnippets } from '../src/index.js';
import { search } from '../src/retrieval.js';
import { metrics } from '../src/metrics.js';

const { index, stats: indexing } = await buildDemo();
const distractors = Number(process.env.DISTRACTORS ?? 1000);
if (!Number.isInteger(distractors) || distractors < 0 || distractors > 20000) throw new Error('DISTRACTORS must be 0–20000');
indexing.push({ version: 'noise', ...await indexVersion(index, { version: 'noise', files: { 'utilities.js': Array.from({ length: distractors }, (_, i) => `function utility${i}(value) { return Math.max(value, ${i}); }`).join('\n') } }) });
const cases = [
  { query: 'Where did device pairing stop waiting for policyCheck?', relevant: [['pairDevice', 'v2']] },
  { query: 'Where did Bluetooth settings stop waiting for permission checking?', relevant: [['openBluetooth', 'v2']] },
  { query: 'Find calls validateInput before executeTool', relevant: [['handleInput', 'v1'], ['handleInput', 'v3']] },
  { query: 'Find the version with removed guard for device supported', relevant: [['launchDevice', 'v2']] },
  { query: 'Find fallback without awaiting primaryTool', relevant: [['runPrimary', 'v2']] },
  { query: 'Find calls executeTool before validateInput', relevant: [['handleInput', 'v2']] },
  { query: 'Find Bluetooth settings waiting for permission checking', relevant: [['openBluetooth', 'v1'], ['openBluetooth', 'v3']] },
  { query: 'Where is the settings://device deeplink used?', relevant: [['launchDevice', 'v1'], ['launchDevice', 'v2'], ['launchDevice', 'v3']] },
];
const result = { generatedAt: new Date().toISOString(), dataset: 'Controlled synthetic development challenge; NOT CoIR AppsRetrieval', corpusSnippets: allSnippets(index).length, distractors, embedding: index.embedding, indexing, modes: {}, limitations: ['Queries overlap demo development cases; these results do not establish generalization.', 'Latency includes one query execution per case, not a production load test.', 'No official screening scores are claimed.'] };
for (const mode of ['lexical', 'hybrid', 'codestrata']) {
  const runs = [];
  for (const item of cases) {
    const relevance = Object.fromEntries(allSnippets(index).filter(s => item.relevant.some(([name, version]) => s.name === name && s.version === version)).map(s => [s.id, 1]));
    const response = await search(index, item.query, { topK: 10, mode });
    runs.push({ query: item.query, ...metrics(response.results.map(r => r.id), relevance, 10), correctTop1: Boolean(relevance[response.results[0]?.id]), elapsedMs: response.stats.elapsedMs, inspected: response.stats.inspected, top1: response.results[0] ? `${response.results[0].name}@${response.results[0].version}` : null });
  }
  const mean = key => runs.reduce((sum, run) => sum + Number(run[key]), 0) / runs.length;
  result.modes[mode] = { meanNdcg10: mean('ndcg'), meanMrr: mean('mrr'), top1Accuracy: mean('correctTop1'), meanLatencyMs: mean('elapsedMs'), runs };
}
result.rssMiB = Number((process.memoryUsage().rss / 1024 ** 2).toFixed(2));
const out = path.resolve(process.env.EVAL_OUT ?? 'evaluation-results/challenge.json');
await mkdir(path.dirname(out), { recursive: true }); await writeFile(out, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ out, corpusSnippets: result.corpusSnippets, modes: Object.fromEntries(Object.entries(result.modes).map(([name, { runs, ...summary }]) => [name, summary])), rssMiB: result.rssMiB }, null, 2));
