"""Encoder-compatible AppsRetrieval baseline, not temporal graph reranking.

Uses the current MTEB DataLoader-based AbsEncoder interface. Document and query
preprocessing is independent; no test labels or corpus IDs enter the encoder.
"""
import argparse
import json
import subprocess
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]


def encode_texts(texts, mode="features", enrich=True):
    if not texts:
        return np.empty((0, 384), dtype=np.float32)
    result = subprocess.run(
        ["node", str(ROOT / "scripts" / "encode.js")],
        input=json.dumps({"texts": texts, "mode": mode, "enrich": enrich}),
        text=True, encoding="utf-8", capture_output=True, check=True,
        cwd=ROOT,
    )
    return np.asarray(json.loads(result.stdout)["vectors"], dtype=np.float32)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["features", "minilm"], default="features")
    parser.add_argument("--raw", action="store_true", help="Disable behavior enrichment for an ablation")
    parser.add_argument("--smoke", action="store_true", help="Test the encoder bridge without downloading a dataset")
    parser.add_argument("--output", default="evaluation-results/appsretrieval_results.json")
    args = parser.parse_args()
    if args.smoke:
        vectors = encode_texts(["permission check", "async function a() { await checkPermission(); }", "def f(x):\n    return x + 1"], args.mode, not args.raw)
        assert vectors.shape == (3, 384)
        assert np.isfinite(vectors).all()
        assert np.allclose(np.linalg.norm(vectors, axis=1), 1, atol=1e-5)
        print("Encoder bridge passed: JavaScript, natural language, and non-JavaScript fallback.")
        return

    import mteb
    from mteb.models.abs_encoder import AbsEncoder
    from mteb.models.model_meta import ModelMeta

    class CodeStrataEncoder(AbsEncoder):
        mteb_model_meta = ModelMeta.create_empty(overwrites={
            "name": f"codestrata-{args.mode}-{'raw' if args.raw else 'enriched'}",
            "revision": "0.1.0",
        })

        def encode(self, inputs, *, task_metadata, hf_split, hf_subset, prompt_type=None, **kwargs):
            batches = []
            for batch in inputs:
                batches.append(encode_texts(list(batch["text"]), args.mode, not args.raw))
            return np.concatenate(batches, axis=0) if batches else np.empty((0, 384), dtype=np.float32)

    task = mteb.get_task("AppsRetrieval")
    results = mteb.evaluate(CodeStrataEncoder(), [task], encode_kwargs={"batch_size": 64})
    task_result = list(results.task_results)[0]
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(task_result.to_dict(), indent=2), encoding="utf-8")
    print(f"Official task result written to {output}")


if __name__ == "__main__":
    main()
