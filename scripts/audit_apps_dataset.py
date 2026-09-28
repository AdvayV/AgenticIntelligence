"""Describe pinned AppsRetrieval text lengths; never read relevance labels."""
import json
from collections import Counter
from pathlib import Path
from statistics import median

import pyarrow as pa
import pyarrow.ipc as ipc

from evaluate_mteb import ROOT

REVISION = "f22508f96b7a36c2415181ed8bb76f76e04ae2d5"
BASE = ROOT / ".cache" / "huggingface" / "datasets" / "CoIR-Retrieval___apps"


def rows(config, filename):
    files = list((BASE / config / "0.0.0" / REVISION).glob(filename))
    if len(files) != 1:
        raise FileNotFoundError(f"Pinned local corpus is required: {filename}")
    with pa.memory_map(str(files[0]), "r") as source:
        return ipc.open_stream(source).read_all().to_pylist()


def summary(items):
    lengths = sorted(len(item["text"]) for item in items)
    return {"count": len(items), "median_characters": median(lengths),
            "p90_characters": lengths[int(.9 * (len(lengths) - 1))],
            "maximum_characters": lengths[-1],
            "languages": dict(Counter(item.get("language", "unknown") for item in items))}


def main():
    corpus = rows("corpus", "apps-corpus.arrow")
    queries = rows("queries", "apps-queries.arrow")
    result = {"dataset": "CoIR AppsRetrieval", "revision": REVISION,
              "method": "Descriptive dataset audit only; relevance labels not read",
              "test_queries": summary([item for item in queries if item["partition"] == "test"]),
              "all_documents": summary(corpus)}
    target = ROOT / "docs" / "results" / "appsretrieval-dataset-audit.json"
    target.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
