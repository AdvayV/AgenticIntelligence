"""Official independent encoder evaluation. History reranking is evaluated separately."""
import argparse
import atexit
import hashlib
import json
import os
import queue
import subprocess
import threading
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]


class EncoderBridge:
    """One CPU model process per evaluation; bounded batches and durable vector cache."""

    def __init__(self, mode="features", enrich=True, cache=None):
        self.mode, self.enrich = mode, enrich
        self.cache = Path(cache) if cache else None
        self.process = subprocess.Popen(
            ["node", str(ROOT / "scripts" / "encode.js"), "--serve"],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=None,
            text=True, encoding="utf-8", cwd=ROOT, bufsize=1,
        )
        self.responses = queue.Queue()
        threading.Thread(target=self._read, daemon=True).start()
        atexit.register(self.close)

    def _read(self):
        for line in self.process.stdout:
            self.responses.put(line)
        self.responses.put(None)

    def close(self):
        if self.process.poll() is None:
            self.process.stdin.close()
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait()

    def encode(self, texts, kind="document"):
        if not texts:
            return np.empty((0, 384), dtype=np.float32)
        payload = {"texts": texts, "mode": self.mode, "enrich": self.enrich, "kind": kind}
        serialized = json.dumps(payload, ensure_ascii=True)
        key = hashlib.sha256(("encoder-v2:" + serialized).encode()).hexdigest()
        target = self.cache / (key + ".npy") if self.cache else None
        if target and target.exists():
            values = np.load(target, allow_pickle=False)
        else:
            self.process.stdin.write(serialized + "\n")
            self.process.stdin.flush()
            try:
                line = self.responses.get(timeout=600)
            except queue.Empty as error:
                self.close()
                raise TimeoutError("CPU encoder exceeded its ten-minute batch budget") from error
            if line is None:
                raise RuntimeError("CPU encoder stopped before returning embeddings")
            response = json.loads(line)
            if "error" in response:
                raise RuntimeError(response["error"])
            values = np.asarray(response["vectors"], dtype=np.float32)
        if values.shape != (len(texts), 384) or not np.isfinite(values).all():
            raise ValueError("Invalid embedding matrix")
        if target and not target.exists():
            target.parent.mkdir(parents=True, exist_ok=True)
            np.save(target, values, allow_pickle=False)
        return values


def encode_texts(texts, mode="features", enrich=True):
    bridge = EncoderBridge(mode, enrich)
    try:
        return bridge.encode(texts)
    finally:
        bridge.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["features", "minilm", "bge"], default="bge")
    parser.add_argument("--raw", action="store_true", help="Disable behavior enrichment")
    parser.add_argument("--smoke", action="store_true")
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--output", default="evaluation-results/appsretrieval_results.json")
    args = parser.parse_args()
    if not 1 <= args.batch_size <= 64:
        parser.error("batch-size must be between 1 and 64")
    import sys
    mode = "features" if args.smoke and "--mode" not in sys.argv else args.mode
    bridge = EncoderBridge(mode, not args.raw, None if args.smoke else ROOT / ".cache" / "encodings")
    try:
        if args.smoke:
            vectors = bridge.encode(["permission check", "async function a() { await checkPermission(); }", "def f(x):\n    return x + 1"])
            assert vectors.shape == (3, 384)
            assert np.allclose(np.linalg.norm(vectors, axis=1), 1, atol=1e-5)
            assert bridge.encode(["a second batch"], kind="query").shape == (1, 384)
            print("Persistent CPU encoder passed: JavaScript, natural language, fallback, and repeated batches.")
            return

        os.environ.setdefault("HF_HOME", str(ROOT / ".cache" / "huggingface"))
        os.environ.setdefault("MTEB_CACHE", str(ROOT / ".cache" / "mteb"))
        import torch
        torch.set_num_threads(2)
        import mteb
        from mteb.models.abs_encoder import AbsEncoder
        from mteb.models.model_meta import ModelMeta

        class CodeStrataEncoder(AbsEncoder):
            mteb_model_meta = ModelMeta.create_empty(overwrites={
                "name": f"codestrata-{mode}-{'raw' if args.raw else 'enriched'}",
                "revision": "0.2.0",
            })

            def encode(self, inputs, *, task_metadata, hf_split, hf_subset, prompt_type=None, **kwargs):
                kind = "query" if "query" in str(prompt_type).lower() else "document"
                batches = [bridge.encode(list(batch["text"]), kind) for batch in inputs]
                return np.concatenate(batches, axis=0) if batches else np.empty((0, 384), dtype=np.float32)

        task = mteb.get_task("AppsRetrieval")
        results = mteb.evaluate(CodeStrataEncoder(), [task], encode_kwargs={"batch_size": args.batch_size}, cache=mteb.ResultCache(cache_path=ROOT / ".cache" / "mteb"))
        task_result = list(results.task_results)[0]
        output = Path(args.output)
        output.parent.mkdir(parents=True, exist_ok=True)
        task_result.to_disk(output)
        print(f"Official task result written to {output}")
    finally:
        bridge.close()


if __name__ == "__main__":
    main()
