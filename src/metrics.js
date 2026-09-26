export function metrics(ranking, relevance, k = 10) {
  const seen = new Set();
  const unique = ranking.filter(id => { if (seen.has(id)) return false; seen.add(id); return true; });
  const gain = grade => 2 ** Math.max(0, grade) - 1;
  const dcg = grades => grades.slice(0, k).reduce((s, g, i) => s + gain(g) / Math.log2(i + 2), 0);
  const ideal = dcg(Object.values(relevance).sort((a, b) => b - a));
  const first = unique.findIndex(id => (relevance[id] ?? 0) > 0);
  const relevant = Object.values(relevance).filter(g => g > 0).length;
  const hits = unique.slice(0, k).filter(id => (relevance[id] ?? 0) > 0).length;
  return { ndcg: ideal ? dcg(unique.map(id => relevance[id] ?? 0)) / ideal : 0,
    mrr: first < 0 ? 0 : 1 / (first + 1), precision: hits / k, recall: relevant ? hits / relevant : 0 };
}
