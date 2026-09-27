"""Development-only model selection. Never reads official test relevance labels."""
import hashlib
import json
import os
import time
from pathlib import Path

import numpy as np

from evaluate_mteb import EncoderBridge, ROOT

os.environ.setdefault("HF_HOME", str(ROOT / ".cache" / "huggingface"))
from datasets import load_dataset

REVISION = "f22508f96b7a36c2415181ed8bb76f76e04ae2d5"


def main():
    qrels = load_dataset("CoIR-Retrieval/apps", "default", split="train", revision=REVISION)
    corpus = load_dataset("CoIR-Retrieval/apps", "corpus", split="corpus", revision=REVISION)
    queries = load_dataset("CoIR-Retrieval/apps", "queries", split="queries", revision=REVISION)
    ordered = sorted(qrels, key=lambda row: hashlib.sha256(row["query-id"].encode()).hexdigest())
    chosen = ordered[:128]
    positives = {row["corpus-id"] for row in chosen}
    train_ids = {row["corpus-id"] for row in ordered}
    negatives = sorted(train_ids - positives, key=lambda value: hashlib.sha256(value.encode()).hexdigest())
    document_ids = sorted(positives | set(negatives[:1000 - len(positives)]))
    docs = {row["_id"]: row["text"] for row in corpus if row["_id"] in set(document_ids)}
    query_ids = {row["query-id"] for row in chosen}
    query_texts = {row["_id"]: row["text"] for row in queries if row["_id"] in query_ids}
    expected = [document_ids.index(row["corpus-id"]) for row in chosen]
    result = {"dataset": "CoIR Apps train development subset; NOT official screening", "revision": REVISION,
              "queries": len(chosen), "documents": len(document_ids), "device": "cpu", "threads": 2,
              "selection": "SHA-256 ordered training queries and training-only distractors", "models": {}}
    for mode in ["features", "minilm", "bge"]:
        bridge = EncoderBridge(mode, True, ROOT / ".cache" / "encodings")
        started = time.perf_counter()
        try:
            def encode(texts, kind):
                batches = []
                for offset in range(0, len(texts), 16):
                    batches.append(bridge.encode(texts[offset:offset + 16], kind))
                    if offset % 160 == 0:
                        print(f"{mode} {kind}: {offset}/{len(texts)}", flush=True)
                return np.concatenate(batches)
            documents = encode([docs[key] for key in document_ids], "document")
            questions = encode([query_texts[row["query-id"]] for row in chosen], "query")
            ranks = np.argsort(-(questions @ documents.T), axis=1, kind="stable")
            positions = [int(np.where(ranks[i] == target)[0][0]) + 1 for i, target in enumerate(expected)]
            result["models"][mode] = {
                "ndcg_at_10": float(np.mean([1 / np.log2(rank + 1) if rank <= 10 else 0 for rank in positions])),
                "mrr_at_10": float(np.mean([1 / rank if rank <= 10 else 0 for rank in positions])),
                "recall_at_10": float(np.mean([rank <= 10 for rank in positions])),
                "seconds_including_cache": round(time.perf_counter() - started, 2),
            }
            print(json.dumps({mode: result["models"][mode]}), flush=True)
        finally:
            bridge.close()
    result["selected"] = max(result["models"], key=lambda mode: result["models"][mode]["ndcg_at_10"])
    out = ROOT / "evaluation-results" / "encoder-development.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(f"Development selection: {result['selected']}; written to {out}", flush=True)


if __name__ == "__main__":
    main()
