# Five-minute demo

Prepare with `npm ci --omit=optional`, `npm test`, and `npm start`. Open localhost:3000. Use the offline mode for predictable startup; predownload BGE if demonstrating learned retrieval and label the mode.

**0:00?0:35 ? Problem.** A refactor moved and renamed a function while removing one await. Explain why finding the correct version matters.

**0:35?1:35 ? Investigation.** Click "Investigate the refactor." Show the streamed agent decisions, pairDevice at v2, exact path/lines, and the removed direct await. Do not claim this proves a runtime race.

**1:35?2:25 ? Counterexample.** Compare with connectDevice at v1. Explain that this version contradicts "stopped waiting." Show the inferred rename/move label. Open v1 and v3 using the timeline.

**2:25?3:00 ? Follow evidence.** Open the imported policyCheck helper. Its link resolves an import, not cross-function execution. Demonstrate hover explanations, version filtering, and motion controls.

**3:00?3:40 ? Agent design.** Show search, inspection, expansion, and stop decisions. This is a bounded deterministic local agent. Source and uncertainty are the output.

**3:40?4:30 ? Results.** Show docs/validation.md. Separate 8 controlled queries, 60 real-repository queries, and official AppsRetrieval. State the weak official NDCG@10 of 0.0505; never substitute favorable development metrics.

**4:30?5:00 ? Next research.** Show CI and CPU setup. Prioritize code-specific embeddings and independently labeled multi-commit repositories. Close with the concrete value: tracing behavioral changes through refactors with reviewable evidence.

Recording remains a team action. Add the actual video URL to the presentation and checklist after recording.
