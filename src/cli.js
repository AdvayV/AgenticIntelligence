import path from 'node:path';
import { emptyIndex, indexVersion, directoryFiles, gitFiles, loadIndex, saveIndex } from './index.js';
import { search } from './retrieval.js';
import { buildDemo, demoQueries } from './demo.js';
import { createEmbedder } from './vector.js';
const [command, ...args] = process.argv.slice(2);
function option(name, fallback) { const i = args.indexOf(`--${name}`); return i < 0 ? fallback : args[i + 1]; }
async function main() {
  const indexFile = path.resolve(option('out', '.palimpsest/index.json'));
  if (command === 'demo') {
    const { index, stats } = await buildDemo(await createEmbedder(option('embedding', 'features')));
    await saveIndex(index, indexFile);
    console.log(JSON.stringify({ indexFile, stats, queries: demoQueries }, null, 2));
  } else if (command === 'index') {
    const root = option('repo', '.');
    let index;
    try { index = await loadIndex(indexFile); } catch (e) { if (e.code !== 'ENOENT') throw e; index = emptyIndex(); }
    const embedder = await createEmbedder(option('embedding', index.embedding === 'Xenova/all-MiniLM-L6-v2:q8' ? 'minilm' : 'features'));
    const refs = option('refs', '').split(',').filter(Boolean), stats = [];
    if (refs.length) for (const ref of refs) stats.push({ version: ref, ...await indexVersion(index, { version: ref, ...gitFiles(root, ref), embedder }) });
    else stats.push(await indexVersion(index, { version: option('version', 'working'), files: await directoryFiles(root), embedder }));
    await saveIndex(index, indexFile);
    console.log(JSON.stringify({ indexFile, stats }, null, 2));
  } else if (command === 'search') {
    const result = await search(await loadIndex(indexFile), option('query'), { topK: Number(option('top-k', 10)), version: option('version'), mode: option('mode', 'palimpsest') });
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('PALIMPSEST\n  npm run demo\n  npm run index -- --repo PATH --refs older,newer\n  npm run search -- --query "calls validateInput before executeTool"\n  npm start\nOptions: --out FILE --embedding features|minilm --version LABEL --top-k N');
    if (command) process.exitCode = 1;
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
