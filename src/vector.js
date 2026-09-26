export function tokenize(text) {
  return String(text).replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().match(/[a-z0-9]+/g) ?? [];
}
export function featureVector(text, size = 384) {
  const vector = new Array(size).fill(0);
  for (const token of tokenize(text)) {
    let h = 2166136261;
    for (const c of token) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    vector[(h >>> 0) % size] += 1;
  }
  const norm = Math.hypot(...vector) || 1;
  return vector.map(v => v / norm);
}
export const cosine = (a, b) => a.reduce((sum, v, i) => sum + v * (b[i] ?? 0), 0);

let learnedEmbedder;
export async function createEmbedder(mode = 'features') {
  if (mode === 'features') return { name: 'feature-hash-384', encode: async texts => texts.map(t => featureVector(t)) };
  if (mode !== 'minilm') throw new Error(`Unknown embedding mode: ${mode}`);
  if (!learnedEmbedder) learnedEmbedder = (async () => {
    const { pipeline, env } = await import('@huggingface/transformers');
    env.cacheDir = path.resolve(process.env.PALIMPSEST_MODEL_CACHE ?? '.cache/models');
    const extract = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { device: 'cpu', dtype: 'q8' });
    return { name: 'Xenova/all-MiniLM-L6-v2:q8', encode: async texts => {
      if (!texts.length) return [];
      const output = await extract(texts, { pooling: 'mean', normalize: true });
      return output.tolist();
    } };
  })().catch(error => { learnedEmbedder = undefined; throw error; });
  return learnedEmbedder;
}
import path from 'node:path';
