#!/usr/bin/env python3
import json
import sys
from pathlib import Path


def parse_metric_value(raw: str):
    raw = raw.strip()
    try:
        return int(raw)
    except ValueError:
        pass
    try:
        return float(raw)
    except ValueError:
        return raw


def main(argv):
    if len(argv) != 1:
        raise SystemExit("usage: metrics_lines_to_json.py <metrics-output-log>")

    path = Path(argv[0])
    metrics = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.startswith("METRIC "):
            continue
        payload = line[len("METRIC ") :]
        if "=" not in payload:
            continue
        name, value = payload.split("=", 1)
        metrics[name.strip()] = parse_metric_value(value)

    json.dump(metrics, sys.stdout, indent=2, sort_keys=True)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main(sys.argv[1:])
