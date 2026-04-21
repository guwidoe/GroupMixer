#!/usr/bin/env python3
import argparse
import json
from pathlib import Path


REQUIRED_CELL_FIELDS = {
    "g",
    "p",
    "scored",
    "visual_only",
    "constructed_weeks",
    "target_weeks",
    "upper_bound_weeks",
    "proven_optimal_weeks",
    "glyph_center_text",
    "glyph_top_left_text",
    "glyph_top_right_text",
    "glyph_bottom_left_text",
    "glyph_bottom_right_text",
    "fill_basis_weeks",
    "fill_basis_kind",
    "border_kind",
    "target_kind",
    "method_abbreviation",
    "desired_method_abbreviation",
    "method_policy_status",
    "method_preference_reason_code",
    "method_preference_reason",
    "target_basis",
    "target_reference_keys",
    "upper_bound_basis",
    "heuristic_target_weeks",
    "optimality_lower_bound_weeks",
    "family_label",
    "operator_labels",
    "quality_label",
    "visual_note",
}


def validate_cell(cell, label):
    missing = REQUIRED_CELL_FIELDS - set(cell.keys())
    if missing:
        raise AssertionError(f"{label} missing required fields: {sorted(missing)}")

    target_weeks = cell.get("target_weeks")
    target_text = cell.get("glyph_top_right_text")
    if target_weeks is None:
        if target_text is not None:
            raise AssertionError(f"{label} has top-right glyph without target_weeks")
    else:
        expected = f"T{target_weeks}"
        if target_text != expected:
            raise AssertionError(
                f"{label} expected glyph_top_right_text={expected!r}, got {target_text!r}"
            )

    upper_bound_weeks = cell.get("upper_bound_weeks")
    upper_text = cell.get("glyph_bottom_left_text")
    if upper_bound_weeks is None:
        if upper_text is not None:
            raise AssertionError(f"{label} has bottom-left glyph without upper_bound_weeks")
    else:
        expected = f"U{upper_bound_weeks}"
        if upper_text != expected:
            raise AssertionError(
                f"{label} expected glyph_bottom_left_text={expected!r}, got {upper_text!r}"
            )

    optimal_weeks = cell.get("proven_optimal_weeks")
    optimal_text = cell.get("glyph_top_left_text")
    if optimal_weeks is None:
        if optimal_text is not None:
            raise AssertionError(f"{label} has top-left glyph without proven_optimal_weeks")
    else:
        expected = f"O{optimal_weeks}"
        if optimal_text != expected:
            raise AssertionError(
                f"{label} expected glyph_top_left_text={expected!r}, got {optimal_text!r}"
            )

    visual_only = cell.get("visual_only")
    method = cell.get("method_abbreviation")
    desired_method = cell.get("desired_method_abbreviation")
    method_policy_status = cell.get("method_policy_status")
    preference_reason_code = cell.get("method_preference_reason_code")
    preference_reason = cell.get("method_preference_reason")
    bottom_right = cell.get("glyph_bottom_right_text")
    if visual_only:
        if method_policy_status != "none":
            raise AssertionError(
                f"{label} visual-only cells must use method_policy_status='none'"
            )
        expected_bottom_right = method
    elif method is not None and desired_method is not None and method != desired_method:
        if method_policy_status != "upgrade_pending":
            raise AssertionError(
                f"{label} must use method_policy_status='upgrade_pending' for trusted upgrades"
            )
        if not preference_reason_code or not preference_reason:
            raise AssertionError(
                f"{label} must provide a method preference reason for trusted upgrades"
            )
        expected_bottom_right = f"{method}→{desired_method}"
    elif method is not None:
        expected_status = "accepted" if desired_method == method else "unresolved"
        if method_policy_status != expected_status:
            raise AssertionError(
                f"{label} expected method_policy_status={expected_status!r}, got {method_policy_status!r}"
            )
        expected_bottom_right = method
    else:
        if method_policy_status != "none":
            raise AssertionError(
                f"{label} expected method_policy_status='none' without a method, got {method_policy_status!r}"
            )
        expected_bottom_right = None
    if desired_method == method and (preference_reason_code is not None or preference_reason is not None):
        raise AssertionError(
            f"{label} should not attach a preference reason when current method already matches desired method"
        )
    if desired_method is None and (preference_reason_code is not None or preference_reason is not None):
        raise AssertionError(
            f"{label} cannot attach a preference reason without an explicit desired method"
        )
    if expected_bottom_right != bottom_right:
        raise AssertionError(
            f"{label} expected glyph_bottom_right_text={expected_bottom_right!r}, got {bottom_right!r}"
        )

    fill_basis_weeks = cell.get("fill_basis_weeks")
    fill_basis_kind = cell.get("fill_basis_kind")
    if visual_only:
        if fill_basis_weeks is not None or fill_basis_kind is not None:
            raise AssertionError(f"{label} visual-only cells must not define fill basis")
        if cell.get("border_kind") != "visual_only":
            raise AssertionError(f"{label} visual-only cells must use border_kind='visual_only'")
    else:
        expected_fill_basis = None
        expected_fill_kind = None
        if target_weeks is not None:
            expected_fill_basis = target_weeks
            expected_fill_kind = "target"
        elif upper_bound_weeks is not None:
            expected_fill_basis = upper_bound_weeks
            expected_fill_kind = "upper_bound"
        if fill_basis_weeks != expected_fill_basis or fill_basis_kind != expected_fill_kind:
            raise AssertionError(
                f"{label} expected fill basis ({expected_fill_basis!r}, {expected_fill_kind!r}) got ({fill_basis_weeks!r}, {fill_basis_kind!r})"
            )

        constructed_weeks = cell.get("constructed_weeks") or 0
        if optimal_weeks is None:
            expected_border = "optimal_unknown"
        elif constructed_weeks >= optimal_weeks:
            expected_border = "optimal_reached"
        else:
            expected_border = "optimal_known_unreached"
        if cell.get("border_kind") != expected_border:
            raise AssertionError(
                f"{label} expected border_kind={expected_border!r}, got {cell.get('border_kind')!r}"
            )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("artifact")
    args = parser.parse_args()

    artifact = json.loads(Path(args.artifact).read_text())
    if "cells" in artifact or "supplementary_matrices" in artifact:
        raise AssertionError(
            "artifact must not use legacy top-level canonical/supplementary matrix fields"
        )
    matrices = artifact.get("matrices", [])
    if not matrices:
        raise AssertionError("artifact must expose non-empty matrices views")
    required_matrix_fields = {"title", "subtitle", "bounds", "cells"}
    for matrix in matrices:
        missing_matrix_fields = required_matrix_fields - set(matrix.keys())
        if missing_matrix_fields:
            raise AssertionError(
                f"matrix view {matrix.get('title', '<untitled>')} missing fields: {sorted(missing_matrix_fields)}"
            )
        for cell in matrix.get("cells", []):
            validate_cell(cell, f"{matrix['title']} ({cell['g']},{cell['p']})")


if __name__ == "__main__":
    main()
