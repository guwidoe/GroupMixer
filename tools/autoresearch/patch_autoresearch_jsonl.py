#!/usr/bin/env python3
import json
import sys
from pathlib import Path


def main(argv):
    if len(argv) != 2:
        raise SystemExit(
            "usage: patch_autoresearch_jsonl.py <autoresearch.jsonl> <metrics.json>"
        )

    jsonl_path = Path(argv[0])
    metrics_path = Path(argv[1])

    lines = jsonl_path.read_text(encoding="utf-8").splitlines()
    metrics = json.loads(metrics_path.read_text(encoding="utf-8"))

    target_idx = None
    for idx in range(len(lines) - 1, -1, -1):
        record = json.loads(lines[idx])
        if "run" in record:
            target_idx = idx
            break

    if target_idx is None:
        raise SystemExit(f"no run entry found in {jsonl_path}")

    record = json.loads(lines[target_idx])
    record["metrics"] = metrics
    lines[target_idx] = json.dumps(record, separators=(",", ":"))
    jsonl_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main(sys.argv[1:])
