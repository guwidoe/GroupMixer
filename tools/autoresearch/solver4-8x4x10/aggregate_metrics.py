#!/usr/bin/env python3
import json
import statistics
import sys
from pathlib import Path


def metric(name: str, value):
    print(f"METRIC {name}={value}")


def parse_seed_label(purpose_summary: str, index: int) -> str:
    marker = ".seed_"
    if marker in purpose_summary:
        tail = purpose_summary.split(marker, 1)[1]
        digits = []
        for ch in tail:
            if ch.isdigit():
                digits.append(ch)
            else:
                break
        if digits:
            return f"seed_{''.join(digits)}"
    return f"case_{index + 1}"


def main(argv):
    if len(argv) != 1:
        raise SystemExit("usage: aggregate_metrics.py <run-report.json>")

    report_path = Path(argv[0])
    report = json.loads(report_path.read_text(encoding="utf-8"))
    cases = report["cases"]
    if not cases:
        raise SystemExit("run report contained no cases")

    final_scores = [float(case["final_score"]) for case in cases]
    unique_contacts = [int(case["unique_contacts"]) for case in cases]
    best_conflicts = [float(case.get("best_score", 0.0)) for case in cases]

    metric("mean_final_score", statistics.mean(final_scores))
    metric("best_final_score", min(final_scores))
    metric("worst_final_score", max(final_scores))
    metric("mean_unique_contacts", statistics.mean(unique_contacts))
    metric("best_unique_contacts", max(unique_contacts))
    metric("worst_unique_contacts", min(unique_contacts))
    metric("solved_runs", sum(1 for score in final_scores if score == 0.0))
    metric("mean_best_conflict_positions", statistics.mean(best_conflicts))
    metric("best_best_conflict_positions", min(best_conflicts))
    metric("runtime_total_seconds", float(report["totals"]["total_runtime_seconds"]))

    for index, case in enumerate(cases):
        label = parse_seed_label(case["case_identity"].get("purpose_provenance_summary", ""), index)
        metric(f"{label}_final_score", float(case["final_score"]))
        metric(f"{label}_unique_contacts", int(case["unique_contacts"]))
        metric(f"{label}_best_conflict_positions", float(case.get("best_score", 0.0)))
        metric(f"{label}_runtime_seconds", float(case["runtime_seconds"]))


if __name__ == "__main__":
    main(sys.argv[1:])
