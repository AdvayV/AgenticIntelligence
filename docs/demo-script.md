# Five-minute walkthrough

**0:00–0:40 — The problem.** Show two almost identical functions; removing one `await` changes waiting behavior. Explain why finding the right file is insufficient when the wrong version looks almost identical.

**0:40–1:40 — Retrieval.** Run the Bluetooth query using the hybrid baseline, then CodeStrata. Show ranked code and exact locations. Expand the predecessor comparison and the `removed_await` evidence.

**1:40–2:30 — Structural discrimination.** Query `calls validateInput before executeTool`. Show that reversed order is contradicted and the mutually exclusive branch example remains uncertain.

**2:30–3:10 — Evolution.** Query the removed device-support guard. Filter to a version. Explain the chronological snapshot index and reuse counters from `npm run demo`.

**3:10–4:10 — How it works.** Walk through the planner, rank fusion, inspection, historical expansion, and bounded stopping trace. State that the current agent policy is deterministic and local.

**4:10–5:00 — Evidence and limits.** Show the measured challenge JSON, label it synthetic, then show passing tests. Separate official AppsRetrieval evaluation from temporal challenge evaluation. State the lack of general runtime proofs and the heuristic lineage limitation.
