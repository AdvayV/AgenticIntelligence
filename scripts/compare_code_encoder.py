"""Evaluate a code-trained encoder on the frozen AppsRetrieval TRAIN subset only."""
import hashlib
import json
import os
import time
from pathlib import Path

import numpy as np
import pyarrow as pa
import pyarrow.ipc as ipc

from evaluate_mteb import EncoderBridge, ROOT


REVISION = "f22508f96b7a36c2415181ed8bb76f76e04ae2d5"
BASE = ROOT / ".cache" / "huggingface" / "datasets" / "CoIR-Retrieval___apps"


def rows(config, filename):
    files = list((BASE / config / "0.0.0" / REVISION).glob(filename))
    if len(files) != 1:
        raise FileNotFoundError(f"Prepare the pinned AppsRetrieval cache first: {config}/{filename}")
    with pa.memory_map(str(files[0]), "r") as source:
        return ipc.open_stream(source).read_all().to_pylist()


def main():
    train = rows("default", "apps-train.arrow")
    train = sorted(train, key=lambda row: hashlib.sha256(row["query-id"].encode()).hexdigest())
    chosen = train[:128]
    positives = {row["corpus-id"] for row in chosen}
    training_ids = {row["corpus-id"] for row in train}
    negatives = sorted(training_ids - positives, key=lambda key: hashlib.sha256(key.encode()).hexdigest())
    ids = sorted(positives | set(negatives[:1000 - len(positives)]))
    wanted = set(ids)
    docs = {row["_id"]: row["text"] for row in rows("corpus", "apps-corpus.arrow") if row["_id"] in wanted}
    wanted_queries = {row["query-id"] for row in chosen}
    queries = {row["_id"]: row["text"] for row in rows("queries", "apps-queries.arrow") if row["_id"] in wanted_queries}
    expected = [ids.index(row["corpus-id"]) for row in chosen]
    os.environ.setdefault("NODE_EXTRA_CA_CERTS", str(ROOT / ".npm-cache" / "windows-ca.pem"))
    bridge = EncoderBridge("jina", False, ROOT / ".cache" / "encodings")
    start = time.perf_counter()
    try:
        def encode(texts, kind):
            batches = []
            for offset in range(0, len(texts), 8):
                batches.append(bridge.encode(texts[offset:offset + 8], kind))
                if offset % 80 == 0:
                    print(f"jina {kind}: {offset}/{len(texts)}", flush=True)
            return np.concatenate(batches)

        documents = encode([docs[key] for key in ids], "document")
        questions = encode([queries[row["query-id"]] for row in chosen], "query")
        ranks = np.argsort(-(questions @ documents.T), axis=1, kind="stable")
        positions = [int(np.where(ranks[i] == target)[0][0]) + 1 for i, target in enumerate(expected)]
        result = {
            "dataset": "Frozen AppsRetrieval train subset; not official test",
            "dataset_revision": REVISION,
            "queries": 128,
            "documents": len(ids),
            "mode": "jina",
            "enrich": False,
            "ndcg_at_10": float(np.mean([1 / np.log2(rank + 1) if rank <= 10 else 0 for rank in positions])),
            "mrr_at_10": float(np.mean([1 / rank if rank <= 10 else 0 for rank in positions])),
            "recall_at_10": float(np.mean([rank <= 10 for rank in positions])),
            "seconds_including_cache": round(time.perf_counter() - start, 2),
        }
        target = ROOT / "evaluation-results" / "code-encoder-development.json"
        target.parent.mkdir(exist_ok=True)
        target.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(result), flush=True)
    finally:
        bridge.close()


if __name__ == "__main__":
    main()
