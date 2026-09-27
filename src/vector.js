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

export const embeddingModes = ['features', 'minilm', 'bge'];
export function embeddingMode(name) {
  if (name === 'feature-hash-384') return 'features';
  if (name?.startsWith('Xenova/all-MiniLM-L6-v2:')) return 'minilm';
  if (name?.startsWith('Xenova/bge-small-en-v1.5:')) return 'bge';
  throw new Error(`Unsupported index embedding: ${name}`);
}
export function validateVectors(vectors, count, dimension = 384) {
  if (!Array.isArray(vectors) || vectors.length !== count || vectors.some(v => !Array.isArray(v) || v.length !== dimension || v.some(n => !Number.isFinite(n)))) throw new Error('Embedding provider returned invalid vectors');
  return vectors;
}
// Bounded overlapping character windows keep long snippets from losing their tail.
// The original source is always retained separately for evidence and display.
export function textWindows(text, width = 1200, overlap = 160, limit = 4) {
  if (text.length <= width) return [text];
  const starts = [];
  for (let i = 0; i < text.length; i += width - overlap) { starts.push(i); if (i + width >= text.length) break; }
  const selected = starts.length <= limit ? starts : Array.from({ length: limit }, (_, i) => starts[Math.round(i * (starts.length - 1) / (limit - 1))]);
  return selected.map(i => text.slice(i, i + width));
}
const learnedEmbedders = new Map();
export async function createEmbedder(mode = 'features') {
  if (mode === 'features') return { name: 'feature-hash-384', encode: async texts => texts.map(t => featureVector(t)) };
  if (!embeddingModes.includes(mode)) throw new Error(`Unknown embedding mode: ${mode}`);
  if (!learnedEmbedders.has(mode)) learnedEmbedders.set(mode, (async () => {
    const { pipeline, env } = await import('@huggingface/transformers');
    env.cacheDir = path.resolve(process.env.CODESTRATA_MODEL_CACHE ?? '.cache/models');
    const model = mode === 'bge' ? 'Xenova/bge-small-en-v1.5' : 'Xenova/all-MiniLM-L6-v2';
    const threads = Number(process.env.CODESTRATA_THREADS ?? 2);
    if (!Number.isInteger(threads) || threads < 1 || threads > 16) throw new Error('CODESTRATA_THREADS must be between 1 and 16');
    const extract = await pipeline('feature-extraction', model, { device: 'cpu', dtype: 'q8', session_options: { intraOpNumThreads: threads, interOpNumThreads: 1 } });
    return { name: model + (mode === 'bge' ? ':q8:windows-v1' : ':q8'), encode: async (texts, { kind = 'document' } = {}) => {
      if (!texts.length) return [];
      const groups = texts.map(text => mode === 'bge' && kind !== 'query' ? textWindows(text) : [text]);
      const flat = groups.flat().map(text => mode === 'bge' && kind === 'query' ? 'Represent this sentence for searching relevant passages: ' + text : text);
      const vectors = [];
      for (let i = 0; i < flat.length; i += 8) {
        const output = await extract(flat.slice(i, i + 8), { pooling: 'mean', normalize: true, truncation: true, max_length: mode === 'bge' ? 512 : 256 });
        vectors.push(...output.tolist());
      }
      let offset = 0;
      return validateVectors(groups.map(group => {
        const mean = Array(384).fill(0);
        for (const vector of vectors.slice(offset, offset + group.length)) vector.forEach((v, i) => { mean[i] += v; });
        offset += group.length;
        const norm = Math.hypot(...mean) || 1;
        return mean.map(v => v / norm);
      }), texts.length);
    } };
  })().catch(error => { learnedEmbedders.delete(mode); throw error; }));
  return learnedEmbedders.get(mode);
}
import path from 'node:path';
