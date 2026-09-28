# Judge Q&A: CodeStrata

**What is the idea in one sentence?** CodeStrata finds the version where a behavior changed through a rename or move, then shows the matching source beside a nearby version that contradicts the question.

**Why is it agentic?** A bounded local planner parses supported constraints, searches, inspects candidate snippets, follows version and import links, and stops when its evidence budget is exhausted. The streamed events are actual decisions. It is deterministic and does not claim to be an LLM agent.

**What is distinctive?** The retrieval result is an evidence pair: the best-supported version and a concrete counterexample from its history. Conservative lineage connects renamed or moved functions, while ambiguous copies remain unresolved. Ordinary top-k code retrieval and an animated timeline alone do not provide that contrast.

**How can a judge verify the result?** Run the offline demo and ask where device pairing stopped awaiting `policyCheck`. Open `pairDevice@v2`, compare `connectDevice@v1`, inspect their exact files and lines, and follow the imported helper. Change the version filter and inspect the live trace.

**Does a missing direct `await` prove a race?** No. CodeStrata reports a static syntax and control-flow observation. Deferred awaits, dynamic dispatch, and cross-file behavior need runtime or deeper analysis, so the UI labels uncertainty.

**How was accuracy measured?** The eight-query version challenge is synthetic development evidence. The 60 Async/Express questions are frozen and source-reviewed but AI-assisted, not independently annotated. AppsRetrieval is the separate full MTEB code-retrieval test; its JSON and exact scores are in [validation](validation.md). None of these sets alone proves general performance.

**Why was the first official score low?** The BGE baseline scored NDCG@10 0.0505. The official task pairs long English programming questions with Python solutions, while the application specializes in JavaScript version investigations. BGE's limited input context and JavaScript-specific enrichment are plausible contributors, not a causal proof. A code-trained CPU encoder was selected using training data only; its official result must be read from the separate MTEB artifact when available.

**Can it run without a GPU or paid API?** Yes. `npm start` runs the offline demo with deterministic features. Optional quantized embedding models execute locally on CPU after their first download. The MTEB adapter and slide generation use Python separately from the application.

**What would you build next?** Independently annotated multi-commit repository questions, stronger conservative interprocedural evidence, and scaling measurements on larger histories. The current benchmark and UI deliberately expose unsupported cases instead of fabricating lineage.
