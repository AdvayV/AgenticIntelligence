// JSON / JSON-lines bridge. Persistent workers keep the CPU model warm.
// Inputs are parsed as data and are never executed.
import { createInterface } from 'node:readline';
import { analyzeFile } from '../src/analyze.js';
import { createEmbedder } from '../src/vector.js';

async function encode({ texts, mode = 'features', enrich = true, kind = 'document' }) {
  if (!Array.isArray(texts) || texts.some(t => typeof t !== 'string')) throw new Error('texts must be a string array');
  if (!['query', 'document'].includes(kind)) throw new Error('kind must be query or document');
  const prepared = texts.map(text => {
    if (!enrich) return text;
    const expanded = text.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
    if (kind === 'query') return expanded;
    const { snippets } = analyzeFile(text);
    return snippets.length ? expanded + '\n' + snippets.map(s => s.behaviorText).join('\n') : expanded;
  });
  const embedder = await createEmbedder(mode);
  return { vectors: texts.length ? await embedder.encode(prepared, { kind }) : [], model: embedder.name };
}
if (process.argv.includes('--serve')) {
  for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
    try { process.stdout.write(JSON.stringify(await encode(JSON.parse(line))) + '\n'); }
    catch (error) { process.stdout.write(JSON.stringify({ error: error.message }) + '\n'); }
  }
} else {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  console.log(JSON.stringify(await encode(JSON.parse(input))));
}
