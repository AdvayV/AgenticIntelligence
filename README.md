# CodeStrata

**Find the function version where behavior changed, then turn that finding into a repeatable check.**

CodeStrata is a CPU-first code intelligence workspace for JavaScript and JSX repositories. It searches code across indexed versions, inspects the source behind each result, and shows evidence for changes such as a removed direct `await`, a changed call order, or a guard that disappeared. It can follow a function through some renames and file moves while keeping ambiguous links explicitly unresolved.

## The problem

A code search can find a familiar name in the wrong version. After a refactor, the same behavior may live under a new name or path, and two nearly identical functions may differ by a single `await`. A ranked snippet alone does not tell a developer where the behavior changed or whether a nearby version contradicts the answer.

## How CodeStrata solves it

1. **Index versions of real source.** Babel extracts functions, exact file and line locations, calls, direct awaits, guards, literals, and local import relationships. Indexing reads repository code; it does not execute it.
2. **Investigate a behavior question.** A bounded local agent combines lexical and vector retrieval, parses supported structural constraints, inspects candidate evidence, and expands into related versions when needed. Its actual decisions stream into the workspace.
3. **Show the competing version.** A result can appear beside a neighboring implementation that contradicts the requested pattern. The source, line highlights, and lineage confidence stay visible. Counterexamples explain a ranked result; they do not choose or rerank it.
4. **Save a Behavior Watch.** Pin a result and a static rule. CodeStrata checks the same linked function across indexed snapshots, marks where the rule holds or breaks, and exports the source-backed report. Missing or ambiguous links stay unverified.

The combination of version-aware retrieval, explicit counterexamples, conservative refactor tracking, and saved behavior checks is the project's distinguishing workflow. It takes a developer from *“where did this change?”* to a check they can revisit after the next index update. The planner and agent are deterministic; no hosted model, GPU, or API key is required for the default workspace.

## Architecture

```mermaid
flowchart LR
  S["Git snapshots or working tree"] --> A["Babel analysis: functions, locations, behavior facts"]
  A --> I["Cached lexical and vector index"]
  A --> L["Conservative lineage and import links"]
  Q["Behavior question"] --> P["Local constraint planner"]
  P --> R["Bounded retrieval agent"]
  I --> R
  R --> E["Inspect support, contradiction, or uncertainty"]
  L --> E
  E --> D{"Enough evidence?"}
  D -->|Expand within budget| R
  D -->|Stop| O["Source, timeline, counterexample, decision trace"]
  O --> W["Pin result and static rule"]
  L --> W
  W --> H["Behavior Watch across linked snapshots"]
  H --> J["Inspectable evidence and JSON export"]
```

The index is built by the CLI. The local server exposes search, source inspection, and watch checks to the browser. The light interface has an animated version view, timeline, side explanations on hover/focus/tap, and a reduced-motion control. [Architecture details](docs/architecture.md) explain the modules and evidence boundaries.

## Try the demo

Requires Node 22.22.2+ on the 22 release line, Node 24.15+, or Node 26+.

```sh
npm ci --omit=optional
npm test
npm start
```

Open **http://127.0.0.1:3000** and click **Investigate the refactor**. The prepared three-version example finds `pairDevice@v2`, links it to `connectDevice@v1`, and shows that the direct `await policyCheck()` in v1 is absent in v2 and restored in v3. Click **Watch behavior**, keep the suggested rule `awaits policyCheck`, then **Save and check** to see **v1 Holds → v2 Broken → v3 Holds**. Open any point for exact source or export the JSON report. On PowerShell, use `npm.cmd` if the execution policy blocks `npm.ps1`.

The example contains 25 synthetic snippets and is designed to expose a specific behavior change. “Broken” means the saved static rule is contradicted in that snapshot; it does not claim a runtime failure.

## Use your own repository

```sh
npm run index -- --repo /path/to/repo --history 20 --out .codestrata/history.json
npm run search -- --out .codestrata/history.json --query "Where did pairing stop waiting for policyCheck?" --top-k 3
```

Start the browser with `CODESTRATA_INDEX=.codestrata/history.json npm start` on macOS/Linux. In PowerShell, set `$env:CODESTRATA_INDEX = '.codestrata/history.json'` and run `npm.cmd start`. Restart the server after reindexing so watches use the updated source. The default index uses offline feature hashing. Optional quantized BGE and Jina code encoders run on CPU with `npm ci --include=optional`; see [architecture](docs/architecture.md) for model details. Indexes must be built and searched with the same embedding mode.

## Evidence and limits

| Evaluation | Result | What it measures |
|---|---:|---|
| Controlled version challenge | 8/8 correct top result; NDCG@10 1.0 | Synthetic version discrimination on development examples |
| Pinned Async and Express repositories | BGE NDCG@10 0.6717 / 0.8577 | 60 source-reviewed, partly AI-assisted labels; single-snapshot retrieval |
| Full MTEB AppsRetrieval test | Jina code q8 NDCG@10 0.15711 | Independent encoder retrieval on Python tasks and solutions; no version reranking |

These evaluations test different things and should not be combined into one accuracy claim. [Validation methods and raw results](docs/validation.md) include the BGE baseline, model settings, and limitations. The current implementation has limited natural-language paraphrase matching; use callable names when possible. JavaScript/JSX is supported, while TypeScript and Python parsing are outside the app. Complex branches, repeated calls, deferred awaits, dynamic dispatch, and ambiguous refactors remain uncertain. Static evidence does not prove runtime behavior.

Run `npm run check`, `npm test`, `npm run evaluate`, and `npm run test:browser` for local verification. The browser suite requires `npx playwright install chromium firefox` once. [GitHub Actions](https://github.com/AdvayV/AgenticIntelligence/actions) runs Node tests on Linux and Windows, browser checks, the encoder bridge, and Docker smoke checks.
