#!/usr/bin/env python3
"""
EDUMATE Phase 7: Real BAAI/bge-small-en-v1.5 Python Embedding Worker

Requirements addressed:
- Loads the real BAAI/bge-small-en-v1.5 sentence-transformers model.
- Automatically selects CUDA if available; cleanly falls back to CPU.
- Probe mode: when passed `--device`, prints a JSON capability report and exits 0.
- Interactive mode: reads JSON lines from stdin, computes 384-dimensional unit-normalized embeddings,
  and prints JSON lines containing {"embeddings": [[...]]} to stdout.
- Uses sys.stdout.flush() after each response to guarantee instant delivery over stdout pipes.
- Handles search query prefixing (adds 'Represent this sentence for searching relevant passages: ' for queries).
"""

import sys
import json
import torch
from sentence_transformers import SentenceTransformer

MODEL_NAME = "BAAI/bge-small-en-v1.5"
QUERY_INSTRUCTION = "Represent this sentence for searching relevant passages: "
DIMENSION = 384

def get_device() -> str:
    return "cuda" if torch.cuda.is_available() else "cpu"

def main():
    device = get_device()

    # Capability / Probe mode
    if len(sys.argv) > 1 and sys.argv[1] == "--device":
        probe_result = {
            "device": device,
            "model": MODEL_NAME,
            "dimension": DIMENSION
        }
        print(json.dumps(probe_result))
        sys.stdout.flush()
        return

    # Interactive JSON-lines mode: Load model into target device
    model = SentenceTransformer(MODEL_NAME, device=device)

    # Signal readiness to Node.js runner process
    ready_msg = {
        "ready": True,
        "device": device,
        "model": MODEL_NAME,
        "dimension": DIMENSION
    }
    print(json.dumps(ready_msg))
    sys.stdout.flush()

    # Process requests sequentially over stdin
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
            texts = req.get("texts", [])
            is_query = req.get("is_query", False)

            if is_query:
                # Prepend BGE query instruction for queries as recommended by BAAI
                texts = [QUERY_INSTRUCTION + t for t in texts]

            # Compute L2-normalized embeddings directly
            embeddings = model.encode(texts, normalize_embeddings=True, show_progress_bar=False)
            response = {"embeddings": embeddings.tolist()}
            print(json.dumps(response))
            sys.stdout.flush()
        except Exception as e:
            error_response = {"error": str(e)}
            print(json.dumps(error_response))
            sys.stdout.flush()

if __name__ == "__main__":
    main()