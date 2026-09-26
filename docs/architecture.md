# Design notes

## Evidence contract

A result's `certainty` is `semantic-match`, `supported-static-pattern`, `uncertain`, or `contradicted`. A supported pattern is deliberately narrower than a proof of runtime behavior. No confidence percentage is invented.

Calls inside nested functions belong to their own snippets. Arguments precede their enclosing invocation in the collected call order. A direct await applies to its enclosing invocation, not every argument call. A deferred await or awaited promise combinator makes the affected argument/invocation uncertain rather than asserting fire-and-forget behavior.

Order certificates require a straight-line function. Branches, early returns, loops, exceptions, short circuits, and unresolved invocation targets prevent certification. Source position is never substituted for runtime completion order.

## Retrieval policy

1. Parse supported natural-language constraints.
2. Fuse BM25 and vector rank lists with RRF constant 60.
3. Inspect a bounded initial batch.
4. Compare against preceding indexed versions and check constraint evidence.
5. If too few matches satisfy all constraints, expand historical relatives and inspect remaining candidates.
6. Stop on sufficient evidence, candidate exhaustion, candidate budget, or round budget.

Default limits: 3 rounds and 120 inspected snippets. Hard limits: 5 rounds and 1,000 snippets. Corpus candidate scoring is outside the inspected-candidate budget; this prototype does not promise sublinear corpus search.

The current reranking increments are fixed development heuristics. Calibrate them on held-out development data; never tune against the official screening test split.

## Versioning and cache invalidation

File analyses use SHA-256 of file path and source. Vector keys include the embedding identity, original snippet source, and behavior representation. Source locations are reconstructed from each snapshot's own file analysis. Reindexing a label replaces its file manifest and snippets, so removed files cannot appear in active retrieval.

Evolution is computed at query time, so edits to an earlier snapshot cannot leave stale cached deltas. Label insertion order specifies chronology. A same-file/name/ordinal match is heuristic lineage, not a refactoring-aware semantic identity.

## Benchmark boundary

`evaluate_mteb.py` implements independent encoding. It does not use query-conditioned constraint checking or Git history. `scripts/evaluate.js` exercises the complete retriever on a separately labeled controlled development corpus. Their metrics must remain separate.

## References

- [Babel parser API](https://babeljs.io/docs/babel-parser)
- [Transformers.js pipelines](https://huggingface.co/docs/transformers.js/api/pipelines)
- [MTEB evaluation](https://docs.mteb.org/get_started/usage/running_the_evaluation/)
- [MTEB AbsEncoder interface](https://github.com/embeddings-benchmark/mteb/blob/main/mteb/models/abs_encoder.py)
- [CoIR](https://github.com/CoIR-team/CoIR)
- [Sourcegraph Deep Search](https://sourcegraph.com/docs/deep-search)
- [CodeQL JavaScript analysis](https://codeql.github.com/docs/codeql-language-guides/codeql-library-for-javascript/)
