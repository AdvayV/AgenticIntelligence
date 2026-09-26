// JSON stdin bridge for independent document/query preprocessing. Never executes code.
import { analyzeFile } from '../src/analyze.js';
import { createEmbedder } from '../src/vector.js';
let input = '';
for await (const chunk of process.stdin) input += chunk;
const { texts, mode = 'features', enrich = true } = JSON.parse(input);
if (!Array.isArray(texts) || texts.some(t => typeof t !== 'string')) throw new Error('texts must be a string array');
const prepared = texts.map(text => {
  if (!enrich) return text;
  const { snippets } = analyzeFile(text);
  const expanded = text.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return snippets.length ? `${expanded}\n${snippets.map(s => s.behaviorText).join('\n')}` : expanded;
});
const embedder = await createEmbedder(mode);
console.log(JSON.stringify({ vectors: texts.length ? await embedder.encode(prepared) : [], model: embedder.name }));
