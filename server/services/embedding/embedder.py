#!/usr/bin/env python3
"""
EDUMATE Phase 7 - Standalone SentenceTransformers / BAAI/bge-small-en-v1.5 Embedder
Self-hosted embedding generator with CUDA acceleration and graceful CPU fallback.
"""

import sys
import json

def get_device():
    try:
        import torch
        if torch.cuda.is_available():
            return "cuda"
    except Exception:
        pass
    return "cpu"

def main():
    device = get_device()
    if len(sys.argv) > 1 and sys.argv[1] == "--device":
        print(json.dumps({"device": device, "model": "BAAI/bge-small-en-v1.5", "dimension": 384}))
        return

    try:
        from sentence_transformers import SentenceTransformer
        model = SentenceTransformer("BAAI/bge-small-en-v1.5", device=device)
    except Exception as e:
        sys.stderr.write(f"SentenceTransformers load error: {e}\n")
        sys.exit(1)

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
            texts = req.get("texts", [])
            is_query = req.get("is_query", False)
            if is_query:
                texts = [f"Represent this sentence for searching relevant passages: {t}" for t in texts]
            embeddings = model.encode(texts, normalize_embeddings=True, show_progress_bar=False)
            print(json.dumps({"embeddings": embeddings.tolist()}))
            sys.stdout.flush()
        except Exception as err:
            print(json.dumps({"error": str(err)}))
            sys.stdout.flush()

if __name__ == "__main__":
    main()
