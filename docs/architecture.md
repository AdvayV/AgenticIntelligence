# Architecture

## Indexing

Babel extracts function source and exact locations, direct calls/await relationships, condition text, literals, local bindings, and ESM module metadata. Leading documentation enters retrieval text; executable facts remain separately derived from syntax. Parse failures become diagnostics.

Snapshots store lexical postings and source rows. Content-addressed analyses include the analyzer version; vectors include embedding identity and exact input. Vectors are validated before publishing a snapshot. Reindexing invalidates lexical, graph, and lineage views. Saving uses a temporary file and rename; concurrent writers are unsupported. Old index snapshots may lack new metadata: reindex to enable literal evidence and import navigation.

## Bounded retrieval agent

1. Parse supported await, guard, order, and exact-literal constraints; warn on unsupported structural phrasing.
2. Fuse persistent BM25 postings and normalized vector ranks.
3. Inspect candidates for supported, contradicted, or unknown constraints.
4. If needed, expand version relatives, resolved import neighbors, and remaining ranked candidates.
5. Inspect historical counterexamples within the same total candidate budget.
6. Stop on sufficient evidence, exhaustion, cancellation, or budget limits.

The planner is deterministic, not an LLM. Cross-file links locate source without transferring execution guarantees. No repository code is executed and no fixes are generated.

## Conservative lineage

### Behavior Watch

`src/watch.js` checks a pinned `{version, id, contentHash}` against the loaded index, parses a structural rule, and follows the anchor's conservative lineage through at most 200 snapshots. It never retrieves replacement functions. Each point contains evidence, source, content hash, location, and predecessor-link confidence. Repeated matching await/order calls remain unknown. Regression/restoration transitions require adjacent indexed points with explicit supported/contradicted states; unknown and unlinked gaps are never bridged.

`POST /api/watch` shares the bounded request handling with search. Browser storage holds at most ten watch definitions, not exported source reports. Reload and manual recheck evaluate the current index. Failed checks discard the previous report, so stale evidence cannot be exported as current. Removing a pending watch cannot resurrect it when its request completes. Reports are downloaded locally with schema `codestrata.behavior-watch.v1`.

### Symbol matching

Unique same-file/name pairs link directly. Unmatched removed/added symbols use normalized AST bigrams and call-target overlap. Only sufficiently similar, unambiguous mutual matches link. Matching omits direct await wrappers to preserve identity across await changes; evidence inspection still uses original source.

Retained originals with new copies, competing matches, duplicate symbols, and deleted-version gaps do not receive invented predecessors. Structural links expose inferred confidence and similarity. Significant refactors may remain unresolved; this is not a formal identity proof.

## CPU representations

Features are deterministic hashes, not trained embeddings. MiniLM and BGE use quantized general-text models through Transformers.js. BGE mean-pools at most four overlapping 1,200-character windows, including the tail, and uses instructed queries. The optional Jina code encoder uses quantized `jinaai/jina-embeddings-v2-base-code` with 768-dimensional vectors and averages at most three source windows. Very long functions may lose intermediate text in either learned representation. Model inference uses 512 tokens per BGE window and two CPU threads by default.

Model loading is lazy and retryable. Indexing uses bounded batches. A persistent JSON-lines Node worker serves the Python adapter, with validated NumPy caches keyed by input/configuration. Official encoding preserves corpus order and independently encodes each item.

## Workspace

The server streams NDJSON step/result/error records during retrieval. The UI handles partial UTF-8 chunks, interrupted streams, canceled searches, and JSON fallback for older servers. Source inspection is separately cancelable.

The light interface connects ranked evidence, clickable version timelines, synchronized comparisons, and imported helpers. Hover/focus/tap explanations and reduced-motion support explain both functionality and uncertainty.

## Evaluation boundaries

MTEB evaluates independent AppsRetrieval encoding, excluding historical reranking. The synthetic challenge tests version discrimination. Pinned real-repository queries test broad retrieval with partial AI-assisted labels. These three evaluations must not be combined into a single accuracy claim.
