import path from 'node:path';
import { emptyIndex, indexVersion, directoryFiles, gitFiles, gitHistory, loadIndex, saveIndex } from './index.js';
import { search } from './retrieval.js';
import { buildDemo, demoQueries } from './demo.js';
import { createEmbedder, embeddingMode } from './vector.js';
const [command, ...args] = process.argv.slice(2);
function option(name, fallback) {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const value = args[i + 1];
  if (!value || value.startsWith('--')) throw new Error(`Option --${name} requires a value`);
  return value;
}
async function main() {
  const indexFile = path.resolve(option('out', '.codestrata/index.json'));
  if (command === 'demo') {
    const { index, stats } = await buildDemo(await createEmbedder(option('embedding', 'features')));
    await saveIndex(index, indexFile);
    console.log(JSON.stringify({ indexFile, stats, queries: demoQueries }, null, 2));
  } else if (command === 'index') {
    const root = option('repo', '.');
    let index;
    try { index = await loadIndex(indexFile); } catch (e) { if (e.code !== 'ENOENT') throw e; index = emptyIndex(); }
    const embedder = await createEmbedder(option('embedding', index.embedding ? embeddingMode(index.embedding) : 'features'));
    const refs = option('history') ? gitHistory(root, Number(option('history'))) : option('refs', '').split(',').filter(Boolean), stats = [];
    if (refs.length) for (const ref of refs) stats.push({ version: ref, ...await indexVersion(index, { version: ref, ...gitFiles(root, ref), embedder }) });
    else stats.push(await indexVersion(index, { version: option('version', 'working'), files: await directoryFiles(root), embedder }));
    await saveIndex(index, indexFile);
    console.log(JSON.stringify({ indexFile, stats }, null, 2));
  } else if (command === 'search') {
    const result = await search(await loadIndex(indexFile), option('query'), { topK: Number(option('top-k', 10)), version: option('version'), mode: option('mode', 'codestrata') });
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('CodeStrata\n  npm run demo\n  npm run index -- --repo PATH --history 20\n  npm run search -- --query "calls validateInput before executeTool"\n  npm start\nOptions: --out FILE --embedding features|minilm|bge|jina --version LABEL --top-k N --refs older,newer');
    if (command) process.exitCode = 1;
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
