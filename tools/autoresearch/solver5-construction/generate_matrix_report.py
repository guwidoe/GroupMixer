#!/usr/bin/env python3
import argparse
import html
import json
from pathlib import Path


METHOD_REFERENCE = [
    {
        "code": "RR",
        "stands_for": "round robin / 1-factorization",
        "solves": "implemented `p=2` route across the scored matrix",
    },
    {
        "code": "KTS(6t+3)",
        "stands_for": "Kirkman triple system on `6t+3` players",
        "solves": "implemented `p=3` family on `v = 6t+3` players via the shipped Kirkman constructor",
    },
    {
        "code": "KTS",
        "stands_for": "Kirkman triple system",
        "solves": "literature/reference `p=3` targets where a Kirkman triple-system route is the intended benchmark",
    },
    {
        "code": "NKTS",
        "stands_for": "nearly Kirkman triple system",
        "solves": "literature/reference `p=3` composite-row targets that need nearly-Kirkman constructions",
    },
    {
        "code": "ownSG",
        "stands_for": "starter-block own-social-golfer construction",
        "solves": "catalog-backed Appendix A starter-block development family; currently covers large `10-p` rows such as `10-6-7`, `10-7-7`, `10-8-5`, and `10-9-5`",
    },
    {
        "code": "RITD",
        "stands_for": "resolvable incomplete transversal design",
        "solves": "catalog-backed incomplete-transversal route where deleting one source group yields complete parallel classes, optionally followed by an intra-group filler week such as the shipped `10-5-9` construction",
    },
    {
        "code": "MOLR+G",
        "stands_for": "MOLR / MOLS lower-bound route with group fill",
        "solves": "catalog-backed non-prime-power square-order route that extends a compatible 3-round `10-10` base with one latent-group filler week, matching the shipped `10-10-4` lower bound",
    },
    {
        "code": "PSB",
        "stands_for": "published schedule bank",
        "solves": "explicit source-backed lower-bound schedules that are honest patch-bank constructions rather than general theorem families",
    },
    {
        "code": "RTD",
        "stands_for": "resolvable transversal design",
        "solves": "implemented prime-power `g-p-w` cells with `3 <= p <= g`, excluding the diagonal affine-plane preference",
    },
    {
        "code": "AP",
        "stands_for": "affine-plane diagonal route",
        "solves": "implemented diagonal prime-power cells `g-g-(g+1)` where affine planes are the preferred exact family",
    },
    {
        "code": "P4",
        "stands_for": "dedicated `p = 4` route",
        "solves": "literature/reference `p=4` targets, including RGDD-style branches and dedicated exceptions",
    },
    {
        "code": "RTD+G",
        "stands_for": "resolvable transversal design with recursive group-fill lift",
        "solves": "implemented lifted cells where an RTD scaffold is filled from a smaller already-constructible instance",
    },
    {
        "code": "VIS",
        "stands_for": "visual-only marker",
        "solves": "not a solver family; used only for cells outside the scored objective",
    },
    {
        "code": "?",
        "stands_for": "unknown / uncatalogued",
        "solves": "fallback when a construction result is present but no explicit abbreviation is mapped",
    },
]


def build_matrix(cells):
    return {(cell["g"], cell["p"]): cell for cell in cells}


def progress_fill_color(current: int, target: int | None, scored: bool) -> str:
    if not scored:
        return "repeating-linear-gradient(135deg,#f8fafc 0,#f8fafc 8px,#e5e7eb 8px,#e5e7eb 16px)"
    if not target or target <= 0:
        return "#f8fafc"
    progress = min(1.0, max(0.0, current / target))
    hue = 120.0 * progress
    lightness = 96.0 - (progress * 10.0)
    return f"hsl({hue:.1f} 65% {lightness:.1f}%)"


def border_style(cell) -> str:
    if not cell.get("scored"):
        return "border:2px dashed #94a3b8;"
    proven_optimal = cell.get("proven_optimal_weeks")
    current = cell.get("constructed_weeks") or 0
    if proven_optimal is None:
        return "border:2px dashed #94a3b8;"
    if current >= proven_optimal:
        return "border:2px solid #16a34a;"
    return "border:2px solid #d97706;"


def literature_constructive_value(cell):
    candidates = [
        value
        for value in [
            cell.get("optimality_lower_bound_weeks"),
            cell.get("heuristic_target_weeks"),
        ]
        if value is not None
    ]
    return max(candidates) if candidates else None


def exact_redundant_cell(cell) -> bool:
    if not cell.get("scored"):
        return False
    current = cell.get("constructed_weeks") or 0
    target = cell.get("target_weeks")
    literature = literature_constructive_value(cell)
    optimum = cell.get("proven_optimal_weeks")
    return (
        current > 0
        and target is not None
        and literature is not None
        and optimum is not None
        and current == target == literature == optimum
    )


def trivial_unsolved_cell(cell) -> bool:
    if not cell.get("scored"):
        return False
    current = cell.get("constructed_weeks") or 0
    target = cell.get("target_weeks")
    literature = literature_constructive_value(cell)
    optimum = cell.get("proven_optimal_weeks")
    return current == 0 and target == 1 and literature == 1 and optimum == 1


def top_left_label(cell):
    if not cell.get("scored"):
        return "v"
    if trivial_unsolved_cell(cell):
        return None
    if exact_redundant_cell(cell):
        return "✓"
    optimum = cell.get("proven_optimal_weeks")
    current = cell.get("constructed_weeks") or 0
    if optimum is not None and current < optimum:
        return f"O{optimum}"
    return None


def top_right_label(cell):
    if not cell.get("scored") or trivial_unsolved_cell(cell):
        return None
    current = cell.get("constructed_weeks") or 0
    target = cell.get("target_weeks")
    optimum = cell.get("proven_optimal_weeks")
    if target is not None and current < target and not (optimum is not None and optimum == target):
        return f"T{target}"
    return None


def bottom_left_label(cell):
    if not cell.get("scored") or trivial_unsolved_cell(cell):
        return None
    current = cell.get("constructed_weeks") or 0
    target = cell.get("target_weeks")
    literature = literature_constructive_value(cell)
    if literature is not None and literature > current and literature != target:
        return f"L{literature}"
    return None


def method_chip_text(cell):
    if not cell.get("scored") or trivial_unsolved_cell(cell):
        return None, None
    current_method = cell.get("method_abbreviation")
    if not current_method:
        return None, None
    reference_method = cell.get("target_method_abbreviation")
    if reference_method and reference_method != current_method:
        return current_method, reference_method
    return current_method, None


def center_text(cell):
    if not cell.get("scored"):
        return cell["current_display"]
    current = cell.get("constructed_weeks") or 0
    return "·" if current == 0 else str(current)


def center_classes(cell):
    classes = ["center-value"]
    if not cell.get("scored") or (cell.get("constructed_weeks") or 0) == 0:
        classes.append("faded")
    return " ".join(classes)


def render_corner(position, text, extra_class=""):
    if not text:
        return ""
    class_attr = f"cell-corner {position} {extra_class}".strip()
    return f"<div class='{class_attr}'>{html.escape(str(text))}</div>"


def render_static_cell(
    *,
    center,
    background,
    border,
    top_left=None,
    top_right=None,
    bottom_left=None,
    method=None,
    reference_method=None,
    faded=False,
    visual_only=False,
):
    cell_classes = ["matrix-cell"]
    if visual_only:
        cell_classes.append("visual-only-cell")
    center_class = "center-value faded" if faded else "center-value"
    html_parts = [
        f"<div class='{' '.join(cell_classes)}' style='background:{background};{border}'>",
        render_corner("top-left", top_left, "success-marker" if top_left == "✓" else "muted-marker" if top_left == "v" else ""),
        render_corner("top-right", top_right),
        render_corner("bottom-left", bottom_left),
        f"<div class='{center_class}'>{html.escape(str(center))}</div>",
    ]
    if method:
        chip_html = ["<div class='method-cluster'>", f"<span class='method-chip'>{html.escape(str(method))}</span>"]
        if reference_method:
            chip_html.append("<span class='method-arrow'>→</span>")
            chip_html.append(f"<span class='method-chip reference-chip'>{html.escape(str(reference_method))}</span>")
        chip_html.append("</div>")
        html_parts.append("".join(chip_html))
    html_parts.append("</div>")
    return "".join(html_parts)


def render_cell_glyph(cell):
    current = cell.get("constructed_weeks") or 0
    target = cell.get("target_weeks")
    method, reference_method = method_chip_text(cell)
    return render_static_cell(
        center=center_text(cell),
        background=progress_fill_color(current, target, cell.get("scored", False)),
        border=border_style(cell),
        top_left=top_left_label(cell),
        top_right=top_right_label(cell),
        bottom_left=bottom_left_label(cell),
        method=method,
        reference_method=reference_method,
        faded=(not cell.get("scored")) or current == 0,
        visual_only=not cell.get("scored"),
    )


def render_combined_table(title, rows, cols, cell_map):
    html_parts = [f"<section><h2>{html.escape(title)}</h2><table><thead><tr><th>g\\p</th>"]
    for p in cols:
        html_parts.append(f"<th>{p}</th>")
    html_parts.append("</tr></thead><tbody>")
    for g in rows:
        html_parts.append(f"<tr><th>{g}</th>")
        for p in cols:
            cell = cell_map[(g, p)]
            classes = ["dashboard-grid-cell"]
            if not cell["scored"]:
                classes.append("visual-only")
            html_parts.append(f"<td class='{' '.join(classes)}'>{render_cell_glyph(cell)}</td>")
        html_parts.append("</tr>")
    html_parts.append("</tbody></table></section>")
    return "".join(html_parts)


def render_scale_swatch(label, color):
    return f"<span class='legend-chip'><span class='legend-swatch' style='background:{color}'></span>{html.escape(label)}</span>"


def render_border_swatch(label, border):
    return f"<span class='legend-chip'><span class='legend-border-box' style='{border}'></span>{html.escape(label)}</span>"


def render_sample(title, glyph_html, caption):
    return (
        "<div class='sample-card'>"
        f"<div class='sample-title'>{html.escape(title)}</div>"
        f"{glyph_html}"
        f"<div class='sample-caption'>{html.escape(caption)}</div>"
        "</div>"
    )


def render_method_reference_table():
    rows = [
        "<section><h2>Method abbreviations</h2><table><thead><tr><th>Code</th><th>Stands for</th><th>Families / cells it can solve</th></tr></thead><tbody>"
    ]
    for entry in METHOD_REFERENCE:
        rows.append(
            "<tr>"
            f"<td><code>{html.escape(entry['code'])}</code></td>"
            f"<td>{html.escape(entry['stands_for'])}</td>"
            f"<td>{html.escape(entry['solves'])}</td>"
            "</tr>"
        )
    rows.append("</tbody></table></section>")
    return "".join(rows)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("artifact")
    parser.add_argument("output")
    args = parser.parse_args()

    artifact = json.loads(Path(args.artifact).read_text())
    cells = artifact["cells"]
    rows = range(artifact["visual_bounds"]["g_min"], artifact["visual_bounds"]["g_max"] + 1)
    cols = range(artifact["visual_bounds"]["p_min"], artifact["visual_bounds"]["p_max"] + 1)
    cell_map = build_matrix(cells)

    page = [
        "<!doctype html><html><head><meta charset='utf-8'>",
        "<title>Solver5 Matrix Report</title>",
        "<style>",
        "body{font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:24px;color:#0f172a;}"
        "table{border-collapse:collapse;margin:12px 0 24px 0;}"
        "th,td{border:1px solid #d7dee7;padding:4px;text-align:center;vertical-align:middle;}"
        "th{background:#f8fafc;font-weight:700;color:#334155;min-width:32px;}"
        "h1,h2{margin:0 0 10px 0;}"
        ".meta{margin:0 0 18px 0;color:#475569;}"
        ".legend-block{margin:10px 0 18px 0;padding:12px 14px;background:#f8fafc;border:1px solid #d7dee7;border-radius:12px;}"
        ".legend-row{display:flex;gap:10px 18px;align-items:center;flex-wrap:wrap;margin:8px 0;font-size:12px;color:#334155;}"
        ".legend-key{font-weight:700;color:#0f172a;}"
        ".legend-chip{display:inline-flex;align-items:center;gap:8px;}"
        ".legend-swatch{display:inline-block;width:20px;height:14px;border-radius:999px;border:1px solid rgba(15,23,42,0.12);}"
        ".legend-border-box{display:inline-block;width:18px;height:14px;border-radius:6px;background:#fff;}"
        ".legend-corners code{background:#e2e8f0;border-radius:6px;padding:1px 5px;font-size:11px;}"
        ".sample-grid{display:flex;gap:12px;flex-wrap:wrap;margin-top:12px;}"
        ".sample-card{display:flex;flex-direction:column;align-items:center;gap:6px;width:188px;}"
        ".sample-title{font-size:11.5px;font-weight:700;color:#0f172a;text-align:center;white-space:nowrap;}"
        ".sample-caption{font-size:11px;line-height:1.35;color:#475569;text-align:center;}"
        ".dashboard-grid-cell{width:92px;min-width:92px;padding:1px;background:#fff;}"
        ".matrix-cell{position:relative;width:92px;height:84px;border-radius:10px;box-sizing:border-box;overflow:hidden;}"
        ".visual-only-cell{color:#64748b;}"
        ".cell-corner{position:absolute;font-size:11px;line-height:1;font-weight:700;color:#334155;letter-spacing:0.01em;}"
        ".top-left{top:7px;left:8px;}"
        ".top-right{top:7px;right:8px;text-align:right;}"
        ".bottom-left{bottom:7px;left:8px;}"
        ".center-value{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:28px;line-height:1;font-weight:700;color:#0f172a;}"
        ".center-value.faded{color:#94a3b8;font-weight:600;}"
        ".method-cluster{position:absolute;right:6px;bottom:6px;display:flex;align-items:center;justify-content:flex-end;gap:2px;}"
        ".method-chip{padding:1px 4px;border-radius:999px;font-size:8px;line-height:1.0;font-weight:700;color:#0f172a;background:rgba(255,255,255,0.82);border:1px solid rgba(15,23,42,0.12);white-space:nowrap;}"
        ".reference-chip{background:rgba(248,250,252,0.92);}"
        ".method-arrow{font-size:10px;font-weight:700;color:#475569;flex:0 0 auto;}"
        ".success-marker{color:#15803d;}"
        ".muted-marker{color:#64748b;}"
        "code{background:#f1f5f9;border-radius:6px;padding:1px 5px;font-size:11px;}"
        "</style></head><body>",
        f"<h1>{html.escape(artifact['matrix_name'])}</h1>",
        f"<p class='meta'>version {artifact['matrix_version']} · visual region g={artifact['visual_bounds']['g_min']}..{artifact['visual_bounds']['g_max']}, p={artifact['visual_bounds']['p_min']}..{artifact['visual_bounds']['p_max']} · scored region g={artifact['scored_bounds']['g_min']}..{artifact['scored_bounds']['g_max']}, p={artifact['scored_bounds']['p_min']}..{artifact['scored_bounds']['p_max']}</p>",
        "<div class='legend-block'>",
        "<div class='legend-row'><span class='legend-key'>Fill</span>",
        render_scale_swatch("far from target", progress_fill_color(0, 10, True)),
        render_scale_swatch("close to target", progress_fill_color(8, 10, True)),
        render_scale_swatch("target reached", progress_fill_color(10, 10, True)),
        render_scale_swatch("visual-only", progress_fill_color(0, None, False)),
        "</div>",
        "<div class='legend-row'><span class='legend-key'>Border</span>",
        render_border_swatch("optimum reached", "border:2px solid #16a34a;"),
        render_border_swatch("optimum known, not reached", "border:2px solid #d97706;"),
        render_border_swatch("optimum unknown", "border:2px dashed #94a3b8;"),
        "</div>",
        "<div class='legend-row legend-corners'><span class='legend-key'>Corners</span> <span><code>O</code> top-left optimum</span> <span><code>T</code> top-right roadmap target</span> <span><code>L</code> bottom-left literature lower bound</span> <span>bottom-right method badges show current and reference separately when both matter</span></div>",
        "<div class='legend-row legend-corners'><span class='legend-key'>Method badges</span> <span><code>RR</code> round robin</span> <span><code>NKTS</code> nearly Kirkman triple system</span> <span><code>ownSG</code> starter-block own-social-golfer construction</span> <span><code>RITD</code> resolvable incomplete transversal design</span> <span><code>PSB</code> published schedule bank</span></div>",
        "<div class='sample-grid'>",
        render_sample(
            "Solved and optimal",
            render_static_cell(
                center="19",
                background=progress_fill_color(19, 19, True),
                border="border:2px solid #16a34a;",
                top_left="✓",
                method="RR",
            ),
            "only the big current value plus method chip remain",
        ),
        render_sample(
            "Below target",
            render_static_cell(
                center="8",
                background=progress_fill_color(8, 10, True),
                border="border:2px dashed #94a3b8;",
                top_right="T10",
                method="RTD",
            ),
            "target shown only when current is still below it",
        ),
        render_sample(
            "Literature and optimum ahead",
            render_static_cell(
                center="8",
                background=progress_fill_color(8, 10, True),
                border="border:2px solid #d97706;",
                top_left="O11",
                top_right="T10",
                bottom_left="L11",
                method="RTD",
                reference_method="P4",
            ),
            "corner numerals appear only when they add non-redundant information",
        ),
        render_sample(
            "No implementation yet",
            render_static_cell(
                center="·",
                background=progress_fill_color(0, 1, True),
                border="border:2px solid #d97706;",
                faded=True,
            ),
            "empty-looking cells stay quiet; the fill already tells the story",
        ),
        "</div></div>",
    ]

    page.append(render_combined_table("Coverage dashboard", rows, cols, cell_map))
    page.append(render_method_reference_table())
    page.append("</body></html>")

    Path(args.output).write_text("".join(page))


if __name__ == "__main__":
    main()
