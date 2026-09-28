# Validation ? CodeStrata 0.2.0

Baseline runs were measured on 27 September 2026; the Jina selection and real-repository rerun were measured on 28 September. Hardware: Windows, Intel i5-1135G7 (8 logical processors), 8 GB RAM, Node 22.23.2. Neural inference runs on CPU with two threads. Timings are single local measurements, not load tests.

## Regression and integration

77 Node tests pass locally; the previous 76-test revision passed GitHub Linux/Windows. They cover source locations, conservative control-flow evidence, rename/move ambiguity, copy/deletion behavior, import aliases and shadowing, documentation extraction, cache invalidation, vector validation, bounded inspection, cancellation, HTTP streaming, UTF-8 splitting, UI interactions, and failure handling. The persistent Python/Node bridge and Docker image passed GitHub CI. All six browser checks pass across Chromium, Firefox, and a mobile viewport, including no horizontal page overflow. [Verified workflow](https://github.com/AdvayV/AgenticIntelligence/actions/runs/36407794742).

## Controlled development challenge

[Raw result](results/challenge.json): 8 queries, 25 demo snippets and 1,000 synthetic distractors, feature-hash embeddings.

| Retrieval | NDCG@10 | MRR@10 | Correct top-1 |
|---|---:|---:|---:|
| BM25 | 0.7406 | 0.6493 | 4/8 |
| Feature hybrid | 0.6775 | 0.6014 | 3/8 |
| CodeStrata evidence reranking | 1.0000 | 1.0000 | 8/8 |

Mean CodeStrata query time: 5.76 ms; process RSS: 88.46 MiB. Queries overlap demo development. This demonstrates controlled version discrimination, not generalization or official screening accuracy.

## Frozen real-repository queries

[Raw result](results/repositories.json), [query labels](../benchmarks/repository-queries.json), [pinned revisions](../benchmarks/repositories.json).

40 Async queries target 327 extracted functions; 20 Express queries target 109 functions. Source was never executed. Labels identify intended API entry points and may omit useful helpers. Queries were frozen before the first run. A regression-test-discovered documentation extraction bug was fixed and evaluation rerun on unchanged queries.

| Repository | Retrieval | NDCG@10 | MRR@10 | Recall@10 |
|---|---|---:|---:|---:|
| Async | BM25 | 0.5959 | 0.5317 | 0.800 |
| Async | CodeStrata features | 0.4124 | 0.3374 | 0.650 |
| Async | BGE hybrid / CodeStrata BGE | 0.6717 | 0.5917 | 0.925 |
| Async | Jina code hybrid / CodeStrata Jina | 0.6500 | 0.5847 | 0.850 |
| Express | BM25 | 0.8347 | 0.7829 | 1.000 |
| Express | CodeStrata features | 0.7089 | 0.6181 | 1.000 |
| Express | BGE hybrid / CodeStrata BGE | 0.8577 | 0.8083 | 1.000 |
| Express | Jina code hybrid / CodeStrata Jina | 0.9262 | 0.9000 | 1.000 |

Learned embeddings improve these sets, while feature hashing harms broad semantic retrieval relative to BM25. Jina helps Express but trails BGE on Async, so the local code-encoder effect is mixed. These single-snapshot queries do not exercise evolutionary reranking; identical hybrid/CodeStrata scores are expected. Labels are AI-assisted and source-reviewed, not independently human annotated. The earlier isolated warm BGE hybrid mean latency was 13.06 ms on Async and 12.41 ms on Express, excluding model load/indexing. The updated artifact's timings were measured while the official CPU evaluation ran, so they are not a fair latency comparison.

## Encoder selection ? development only

[Selection artifact](results/encoder-development.json). Deterministic SHA256 selection of 128 training queries against 1,000 training-only corpus snippets, pinned AppsRetrieval revision. No official test relevance labels were used to select the model.

| Encoder | Development NDCG@10 | Development MRR@10 |
|---|---:|---:|
| Feature hashing | 0.0792 | 0.0674 |
| MiniLM q8 | 0.5083 | 0.4844 |
| BGE small q8 | 0.5737 | 0.5476 |
| Jina code q8, raw code | 0.7096 | 0.6771 |

[Code-encoder selection artifact](results/code-encoder-development.json). Jina uses the same deterministic training question and document IDs as the earlier comparison, but raw code rather than JavaScript-specific enrichment. The small development corpus differs substantially from the full test. These scores must not be presented as official results.

## Official AppsRetrieval ? full test

[Unmodified MTEB task JSON](results/appsretrieval_results.json). MTEB 2.21.8; dataset revision f22508f96b7a36c2415181ed8bb76f76e04ae2d5. 3,765 test queries and 8,765 corpus items. Selected configuration: BGE q8, bounded windows, independent behavior-enriched encoding, query instruction, CPU inference. Full evaluation took 2,577.27 seconds (about 43 minutes).

| Metric | Official value |
|---|---:|
| NDCG@10 | **0.0505** |
| MRR@10 | **0.043363** |
| Recall@10 | 0.07384 |

**This is a weak screening baseline.** The train-sample/test gap has not been explained conclusively. Adapter ordering and query/document routing were inspected; export used MTEB's supported serializer after a datetime serialization error. Cached scoring results were preserved. No test-label tuning or successful-accuracy claim is made.

[Dataset-only audit](results/appsretrieval-dataset-audit.json): all 3,765 test questions describe Python programming tasks, with median length 1,601 characters; all 8,765 documents are Python solutions, with median length 332 characters. This differs from the application's JavaScript version-investigation demo. BGE is a general text encoder with a 512-token cap, and the JavaScript AST enrichment rarely applies to the Python code. These are plausible contributors to the low score, not a proved decomposition of its cause. The audit reads text and metadata only, never test relevance labels.

The official independent encoder does not test query-dependent historical evidence reranking. A code-specific encoder is integrated, but a completed full official evaluation is not yet available; broader development data remain future work.

## Reproduce

Run README commands. Evaluation outputs go to evaluation-results; reviewed snapshots are checked into docs/results.

Sources: [BGE model card](https://huggingface.co/Xenova/bge-small-en-v1.5), [Jina Code model card](https://huggingface.co/jinaai/jina-embeddings-v2-base-code), [MTEB evaluation interface](https://docs.mteb.org/get_started/usage/running_the_evaluation/), [CoIR](https://github.com/CoIR-team/coir).
