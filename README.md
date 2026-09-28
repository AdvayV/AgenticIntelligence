# CodeStrata

**Find the version where behavior changed, even after the function was renamed and moved.**

A CPU-only code investigation workspace for Samsung PRISM Theme 01. Ask **"Where did device pairing stop waiting for policyCheck?"** CodeStrata finds `pairDevice@v2`, links it to `connectDevice@v1`, shows the removed direct `await`, and opens the imported helper. Every result includes source, file/line locations, version identity, and inspectable evidence.

The distinctive idea is **counterexample-guided evolutionary retrieval**: display the matching implementation beside a nearby version that contradicts the requested behavior. A bounded local agent searches, inspects static facts, follows import/version links, and streams its actual decisions.

## Run locally

Requires Node 22.22.2+ on the 22 release line, Node 24.15+, or Node 26+. No GPU, API key, or Python is required for the application.

```sh
npm ci --omit=optional
npm test
npm start
```

Open **http://127.0.0.1:3000** and click **Investigate the refactor**. On PowerShell, use `npm.cmd` if execution policy blocks `npm.ps1`.

The light workspace has animated version layers, a clickable timeline, synchronized code comparisons, imported-helper navigation, and a side guide that explains controls on hover, focus, or tap. Motion can be paused and respects reduced-motion preferences. The default demo contains 25 snippets across three versions.

### Learned CPU retrieval

The default offline mode uses deterministic feature hashing, which is **not a learned semantic model**. BGE is a learned option for broader natural-language queries:

```sh
npm ci --include=optional
npm run start:semantic
```

The first run downloads quantized `Xenova/bge-small-en-v1.5` into `.cache/models`. CPU inference uses two threads by default; set `CODESTRATA_THREADS` (1?16) or `CODESTRATA_MODEL_CACHE` to customize. MiniLM remains available through `--embedding minilm`. BGE samples at most four overlapping source windows, including the tail; very long functions can still lose intermediate evidence in embeddings.

A separate optional code-trained encoder is available with `npm run index -- --repo /path/to/repo --version working --embedding jina --out .codestrata/code.json` and `npm run search -- --out .codestrata/code.json --query "find the changed function"`. It downloads quantized `jinaai/jina-embeddings-v2-base-code` on first use and uses 768-dimensional vectors. The training-only AppsRetrieval selection subset improved to NDCG@10 0.7096; the full official result is reported separately in [validation](docs/validation.md). The index and search modes must match.

## Investigate your repository

Only JavaScript/JSX is analyzed. Repository code is read, never executed.

```sh
npm run index -- --repo /path/to/repo --version working

# Last 20 first-parent commits, ordered oldest to newest
npm run index -- --repo /path/to/repo --history 20 --embedding bge --out .codestrata/history.json

# Or supply chronological refs explicitly
npm run index -- --repo /path/to/repo --refs OLDER,NEWER --out .codestrata/selected.json

npm run search -- --out .codestrata/history.json --query "Where did pairing stop waiting for policyCheck?" --top-k 3
```

Use a separate index for each embedding mode. Reindexing replaces a snapshot, removes deleted files, and reuses unchanged analyses/vectors. Explicit refs follow insertion order; use a fresh index when changing chronological ordering.

Set `CODESTRATA_INDEX` to an index path before `npm start` to browse your code. `HOST` defaults to localhost; `PORT` defaults to 3000.

| API | Purpose |
|---|---|
| GET /api/status | Index counts and capabilities |
| POST /api/search | Ranked snippets and evidence |
| POST /api/search/stream | Actual agent steps and final result as NDJSON |
| GET /api/snippet?version=...&id=... | Indexed source, history, and call links |

Search accepts `{ "query": "...", "version": "optional", "topK": 5, "mode": "codestrata" }`. Requests are bounded to 8 KB, concurrent CPU searches to two.

## Architecture

```mermaid
flowchart LR
  G[Git snapshots / files] --> A[Babel AST + comments + behavior facts]
  A --> I[Cached vectors + lexical postings]
  A --> V[Conservative lineage + import graph]
  Q[Question] --> P[Local constraint planner]
  P --> R[BM25 + vector rank fusion]
  I --> R
  R --> E[Inspect support / contradiction / uncertainty]
  V --> E
  E --> D{Enough evidence?}
  D -->|Within budget: inspect more| R
  D -->|Stop| O[Source + timeline + counterexample]
```

The deterministic planner supports constrained await, order, guard, and exact-literal questions. **It does not use an LLM or understand arbitrary English.** The agent is the bounded search/inspect/refine policy; trace events describe actual work. Unsupported patterns produce warnings or uncertain evidence.

Lineage uses unique same-file symbols, then conservative mutual structural matching for removed/added functions. Ambiguous copies and duplicate symbols remain unresolved. Simple local ESM import links support navigation, not cross-function execution proofs.

## Measured results

See [validation and raw artifacts](docs/validation.md) for setup and limitations.

- **Controlled version challenge:** 8 demo-related queries, 1,025 snippets. CodeStrata achieves 8/8 correct top results and NDCG@10 1.0. This is synthetic development evidence.
- **Real code:** 60 frozen, source-reviewed queries on pinned Async and Express snapshots. BGE hybrid NDCG@10 is 0.6717 and 0.8577; code-trained Jina yields 0.6500 and 0.9262 respectively. Labels are AI-assisted, not independent human judgments.
- **Official AppsRetrieval:** full MTEB BGE test run completed on CPU. **NDCG@10 0.0505; MRR@10 0.043363.** This is a weak screening baseline. The encoder evaluation does not test historical reranking.
- **Code-encoder development check:** Jina q8 scored NDCG@10 0.7096 on a 128-query, 1,000-document training-only subset. This is model-selection evidence, not an official test score.

The demonstrated strength is behavior/version discrimination. Broad code-retrieval accuracy still needs improvement for a strong P0 submission.

## Verification

```sh
npm run check
npm test
npm run evaluate
python scripts/evaluate_mteb.py --smoke  # NumPy required

# Pinned real-repository evaluation; optional npm models required
python scripts/prepare_repositories.py
node scripts/evaluate_repositories.js

# Official evaluation in an isolated Python environment
python -m venv .venv
# Activate .venv, then:
python -m pip install -r requirements-eval.txt
python scripts/compare_encoders.py
python scripts/evaluate_mteb.py --mode bge

npx playwright install chromium firefox
npm run test:browser
```

GitHub Actions runs Node tests on Linux/Windows, the encoder bridge, Chromium/Firefox/mobile interactions, and a Docker HTTP smoke test. Browser reports and screenshots are uploaded as artifacts.

```sh
docker build -t codestrata .
docker run --rm -p 127.0.0.1:3000:3000 codestrata
```

The image runs the offline demo; learned-model downloads and Python evaluation are separate.

## Limits

Static syntax evidence cannot prove runtime races, security guarantees, or cross-file control flow. Complex branches, duplicate callees, deferred awaits, and dynamic dispatch remain conservative. Exact CPU scans and heuristic lineage target small repositories; monorepo throughput is unvalidated. Caches retain obsolete entries and concurrent index writers are unsupported. Public deployment needs authentication and resource isolation.

See [architecture](docs/architecture.md), [five-minute demo](docs/demo-script.md), [editable submission deck](docs/CodeStrata-Submission-Draft.pptx), [filled disclosure draft awaiting signature](docs/CodeStrata-AI-Disclosure-Draft.docx), [submission handoff](docs/submission-guide.md), [submission checklist](docs/submission-checklist.md), and [AI usage record](docs/ai-usage.md).
