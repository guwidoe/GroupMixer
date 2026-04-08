#!/usr/bin/env python3
import json
import sys
from pathlib import Path
from statistics import mean


def load_json(path: str):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def index_cases(reports):
    cases = {}
    for report in reports:
        for case in report["cases"]:
            case_id = case["case_id"]
            if case_id in cases:
                raise SystemExit(f"duplicate case id in reports: {case_id}")
            cases[case_id] = case
    return cases


def external_validation_failures(cases):
    failures = 0
    for case in cases:
        external = case.get("external_validation") or {}
        if not bool(external.get("validation_passed")):
            failures += 1
    return failures


def total_score_mismatches(cases):
    mismatches = 0
    for case in cases:
        external = case.get("external_validation") or {}
        if not bool(external.get("total_score_agreement")):
            mismatches += 1
    return mismatches


def breakdown_mismatches(cases):
    mismatches = 0
    for case in cases:
        external = case.get("external_validation") or {}
        if not bool(external.get("score_breakdown_agreement")):
            mismatches += 1
    return mismatches


def slugify(case_id: str) -> str:
    return case_id.replace(".", "_").replace("-", "_")


def compute_lane_metrics(metric_config, case_map):
    configured_ids = [entry["case_id"] for entry in metric_config["cases"]]
    missing = [case_id for case_id in configured_ids if case_id not in case_map]
    extra = [case_id for case_id in case_map.keys() if case_id not in configured_ids]

    if missing:
        raise SystemExit(f"metric config missing run results for cases: {missing}")
    if extra:
        raise SystemExit(f"run reports contain unconfigured cases: {extra}")

    weighted_sum = 0.0
    total_weight = 0.0
    raw_scores = []
    runtimes = []
    resolved_cases = []
    per_case_metrics = {}
    metric_scale = float(metric_config.get("metric_scale", 1.0))

    for entry in metric_config["cases"]:
        case = case_map[entry["case_id"]]
        final_score = case.get("final_score")
        if final_score is None:
            raise SystemExit(f"case {entry['case_id']} has no final_score")
        reference_final_score = float(entry["reference_final_score"])
        if reference_final_score <= 0.0:
            raise SystemExit(
                f"case {entry['case_id']} has non-positive reference_final_score"
            )
        weight = float(entry["weight"])
        if weight <= 0.0:
            raise SystemExit(f"case {entry['case_id']} has non-positive weight")

        final_score = float(final_score)
        normalized_case_score = final_score / reference_final_score
        weighted_contribution = normalized_case_score * weight

        weighted_sum += weighted_contribution
        total_weight += weight
        raw_scores.append(final_score)
        runtimes.append(float(case.get("runtime_seconds") or 0.0))
        resolved_cases.append(case)

        slug = slugify(entry["case_id"])
        per_case_metrics[f"{slug}_final_score"] = final_score
        per_case_metrics[f"{slug}_reference_final_score"] = reference_final_score
        per_case_metrics[f"{slug}_weight"] = weight
        per_case_metrics[f"{slug}_normalized_score"] = normalized_case_score
        per_case_metrics[f"{slug}_weighted_contribution"] = weighted_contribution

    raw_primary_metric = weighted_sum / total_weight
    primary_metric = raw_primary_metric * metric_scale
    metric_name = metric_config["primary_metric_name"]
    if not metric_name:
        raise SystemExit("metric config missing primary_metric_name")

    metrics = {
        metric_name: primary_metric,
        f"{metric_name}_delta_from_reference": (raw_primary_metric - 1.0) * metric_scale,
        f"{metric_name}_weight_sum": total_weight,
        "objective_suite_total_final_score_raw": sum(raw_scores),
        "objective_suite_average_final_score_raw": mean(raw_scores),
        "objective_suite_case_count": float(len(raw_scores)),
        "objective_suite_total_runtime_seconds": sum(runtimes),
        "objective_suite_average_runtime_seconds": mean(runtimes),
        "objective_suite_external_validation_failures": float(
            external_validation_failures(resolved_cases)
        ),
        "objective_suite_total_score_mismatches": float(
            total_score_mismatches(resolved_cases)
        ),
        "objective_suite_score_breakdown_mismatches": float(
            breakdown_mismatches(resolved_cases)
        ),
    }

    for suffix, value in per_case_metrics.items():
        metrics[f"objective_suite_case_{suffix}"] = value

    return metrics, resolved_cases


def compute_correctness_metrics(correctness_report):
    cases = correctness_report["cases"]
    runtimes = [float(case.get("runtime_seconds") or 0.0) for case in cases]
    return {
        "correctness_suite_case_count": float(len(cases)),
        "correctness_suite_total_runtime_seconds": sum(runtimes),
        "correctness_suite_average_runtime_seconds": mean(runtimes),
        "correctness_suite_external_validation_failures": float(
            external_validation_failures(cases)
        ),
        "correctness_suite_total_score_mismatches": float(total_score_mismatches(cases)),
    }, cases


def compute_diagnostic_lane_metrics(metric_config, case_map):
    metrics, resolved_cases = compute_lane_metrics(metric_config, case_map)
    primary_metric_name = metric_config["primary_metric_name"]

    remapped = {}
    for key, value in metrics.items():
        if key.startswith("objective_suite_"):
            remapped[key.replace("objective_suite_", "objective_fixed_iteration_")] = value
        elif key == primary_metric_name:
            remapped[key] = value
        elif key == f"{primary_metric_name}_delta_from_reference":
            remapped[key] = value
        elif key == f"{primary_metric_name}_weight_sum":
            remapped[key] = value
        else:
            remapped[key] = value
    return remapped, resolved_cases


def main(argv):
    if len(argv) < 3:
        raise SystemExit(
            "usage: aggregate_objective_metrics.py <mode> <metric-config> <report...>"
        )

    mode = argv[0]
    metric_config = load_json(argv[1])
    reports = [load_json(path) for path in argv[2:]]

    print(f"INFO metric_config={Path(argv[1]).as_posix()}")
    print(f"INFO case_formula={metric_config['case_formula']}")
    print(f"INFO aggregate_formula={metric_config['aggregate_formula']}")
    print(f"INFO weighting_note={metric_config['weighting_note']}")
    print(f"INFO metric_scale={float(metric_config.get('metric_scale', 1.0))}")

    if mode == "fixed-time":
        if len(reports) < 2:
            raise SystemExit("fixed-time mode expects at least 1 canonical report plus 1 correctness report")
        canonical_reports = reports[:-1]
        correctness_report = reports[-1]
        case_map = index_cases(canonical_reports)
        metrics, canonical_cases = compute_lane_metrics(metric_config, case_map)
        correctness_metrics, correctness_cases = compute_correctness_metrics(correctness_report)
        all_runtimes = [float(case.get("runtime_seconds") or 0.0) for case in canonical_cases + correctness_cases]
        canonical_runtimes = [float(case.get("runtime_seconds") or 0.0) for case in canonical_cases]
        metrics.update(correctness_metrics)
        metrics["runtime_total_seconds"] = sum(all_runtimes)
        metrics["runtime_canonical_share_percent"] = (
            (sum(canonical_runtimes) / sum(all_runtimes)) * 100.0 if sum(all_runtimes) else 0.0
        )
    elif mode == "fixed-iteration":
        if len(reports) < 1:
            raise SystemExit("fixed-iteration mode expects at least 1 canonical report")
        case_map = index_cases(reports)
        metrics, _ = compute_diagnostic_lane_metrics(metric_config, case_map)
    else:
        raise SystemExit(f"unsupported mode: {mode}")

    for name, value in metrics.items():
        print(f"METRIC {name}={value}")


if __name__ == "__main__":
    main(sys.argv[1:])
