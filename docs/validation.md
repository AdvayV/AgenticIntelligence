# Initial validation

Measured locally on Windows with Node.js 22.23.2. This report describes the initial implementation, not official hackathon screening performance.

## Controlled development challenge

Seven queries over 16 demo snippets across three versions, plus 1,000 synthetic distractors. Queries overlap development examples and the test suite. Relevance is manually specified in `scripts/evaluate.js`.

| Retriever | Mean NDCG@10 | Mean MRR | Correct top-1 |
|---|---:|---:|---:|
| Lexical | 0.8133 | 0.7381 | 4/7 |
| Hybrid feature-vector baseline | 0.7475 | 0.6905 | 3/7 |
| PALIMPSEST with static/version evidence | 1.0000 | 1.0000 | 7/7 |

One initial run averaged roughly 8–12 ms per query across modes with process RSS around 84 MiB. These are single-run observations and not latency guarantees. Run `npm run evaluate` to regenerate timings and query-level metrics on your machine.

**Do not describe this as 100% accuracy on real repositories or CoIR.** It demonstrates the supported distinctions on controlled examples, not generalization. The lexical baseline outperformed the feature-vector hybrid on this fixture; a learned/code-specific model and held-out comparisons are needed before claiming broader retrieval improvements.

## Executed checks

- Node test suite: 47 passing tests covering parser, evolutionary retrieval, version isolation, update/deletion, Git snapshots, metrics, encoder bridge, and HTTP integration.
- JavaScript syntax checks.
- CLI demo index and exact-version retrieval.
- Python encoder bridge smoke with offline features and quantized MiniLM on CPU. Natural-language, JavaScript, and non-JavaScript fallback inputs all produced finite normalized vectors with preserved row counts.
- npm dependency audit after upgrading Transformers.js to 4.3.0: zero reported advisories at verification time.

## Not yet verified

- Full official CoIR AppsRetrieval test split and MTEB integration end to end.
- Held-out real repository queries and relevance judgments.
- Docker execution.
- Visual browser rendering: no browser was connected in the development environment. HTTP assets and search were exercised by integration tests.
- Hosted GitHub Actions results are separate from locally executed checks; inspect the repository's Actions tab.

The optional MTEB adapter measures independent encoding only. It does not measure historical contrastive reranking. The project remains an initial working prototype, with official screening validation as the next milestone.
