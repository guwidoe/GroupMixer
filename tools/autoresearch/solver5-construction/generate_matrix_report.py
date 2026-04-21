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
        "code": "MOLS",
        "stands_for": "explicit mutually orthogonal Latin squares with a distinguished resolution square",
        "solves": "catalog-backed non-prime-power transversal constructions where one explicit Latin square indexes the parallel classes and the remaining squares provide symbol groups",
    },
    {
        "code": "MOLSx",
        "stands_for": "direct-product mutually orthogonal Latin squares",
        "solves": "composite transversal constructions built from direct products of smaller prime-power MOLS banks, again using one product square as the parallel-class index",
    },
    {
        "code": "RTD-QDM",
        "stands_for": "resolvable transversal design from a quasi-difference matrix",
        "solves": "catalog-backed non-prime-power RTD constructions built by expanding an explicit quasi-difference matrix into a resolvable orthogonal array and then reading off the parallel classes",
    },
    {
        "code": "MOLR",
        "stands_for": "mutually orthogonal Latin rectangles from an explicit MOLS bank",
        "solves": "Sharma-Das lower-bound constructions that use the first k rows of an explicit MOLS bank to produce g+1 rounds, with optional extra clique rounds when the unused rows support them",
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
        "code": "RBIBD",
        "stands_for": "catalog-backed resolvable balanced incomplete block design",
        "solves": "explicit source-backed resolvable BIBD cases such as the shipped `RBIBD(120,8,1)` route for `15-8-17`",
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


def build_literature_reference_index(artifact):
    references = artifact.get("literature_references", [])
    index = {}
    for idx, ref in enumerate(references, start=1):
        index[ref["key"]] = {**ref, "index": idx}
    return index


def render_reference_sup(reference_keys, reference_index):
    parts = []
    for key in reference_keys or []:
        ref = reference_index.get(key)
        if not ref:
            continue
        parts.append(
            f"<sup class='lit-ref'><a href='#litref-{ref['index']}' title='{html.escape(ref['citation'])}'>{ref['index']}</a></sup>"
        )
    return "".join(parts)


def progress_fill_color(current: int, denominator: int | None, visual_only: bool) -> str:
    if visual_only:
        return "repeating-linear-gradient(135deg,#f8fafc 0,#f8fafc 8px,#e5e7eb 8px,#e5e7eb 16px)"
    if denominator is None or denominator <= 0:
        return "#f8fafc"
    progress = min(1.0, max(0.0, current / denominator))
    if progress >= 1.0:
        hue = 120.0
    else:
        hue = 70.0 * progress
    lightness = 96.0 - (progress * 10.0)
    return f"hsl({hue:.1f} 65% {lightness:.1f}%)"


def border_style(border_kind: str) -> str:
    return {
        "optimal_reached": "border:2px solid #16a34a;",
        "optimal_known_unreached": "border:2px solid #d97706;",
        "optimal_unknown": "border:2px dashed #94a3b8;",
        "visual_only": "border:2px dashed #94a3b8;",
    }.get(border_kind, "border:2px dashed #94a3b8;")


def render_corner(position, text, extra_class=""):
    if not text:
        return ""
    class_attr = f"cell-corner {position} {extra_class}".strip()
    return f"<div class='{class_attr}'>{html.escape(str(text))}</div>"


def render_corner_html(position, inner_html, extra_class=""):
    if not inner_html:
        return ""
    class_attr = f"cell-corner {position} {extra_class}".strip()
    return f"<div class='{class_attr}'>{inner_html}</div>"


def build_cell_title(cell):
    parts = []
    target_weeks = cell.get("target_weeks")
    if target_weeks is not None:
        target_kind = cell.get("target_kind") or "target"
        basis = cell.get("target_basis")
        if basis:
            parts.append(f"T={target_weeks} ({target_kind}): {basis}")
        else:
            parts.append(f"T={target_weeks} ({target_kind})")
    upper_bound_weeks = cell.get("upper_bound_weeks")
    if upper_bound_weeks is not None:
        basis = cell.get("upper_bound_basis")
        if basis:
            parts.append(f"U={upper_bound_weeks}: {basis}")
        else:
            parts.append(f"U={upper_bound_weeks}")
    optimal_weeks = cell.get("proven_optimal_weeks")
    if optimal_weeks is not None:
        parts.append(f"O={optimal_weeks} (known exact optimum)")
    heuristic_target_weeks = cell.get("heuristic_target_weeks")
    if heuristic_target_weeks is not None:
        parts.append(f"best encoded constructive reference={heuristic_target_weeks}")
    optimality_lower_bound_weeks = cell.get("optimality_lower_bound_weeks")
    if optimality_lower_bound_weeks is not None:
        parts.append(f"literature-backed constructive lower bound={optimality_lower_bound_weeks}")
    method = cell.get("method_abbreviation")
    if method:
        parts.append(f"M={method}")
    desired_method = cell.get("desired_method_abbreviation")
    if desired_method and desired_method != method:
        parts.append(f"preferred family={desired_method}")
    preference_reason = cell.get("method_preference_reason")
    preference_reason_code = cell.get("method_preference_reason_code")
    if preference_reason:
        if preference_reason_code:
            parts.append(f"method upgrade [{preference_reason_code}]={preference_reason}")
        else:
            parts.append(f"method upgrade={preference_reason}")
    quality = cell.get("quality_label")
    if quality:
        parts.append(f"quality={quality}")
    visual_note = cell.get("visual_note")
    if visual_note:
        parts.append(visual_note)
    return " • ".join(parts) if parts else None


def render_cell_glyph(cell, reference_index):
    current = cell.get("constructed_weeks") or 0
    title = build_cell_title(cell)
    title_attr = f" title='{html.escape(title)}'" if title else ""
    visual_only = cell.get("visual_only", False)
    top_right_html = None
    if cell.get("glyph_top_right_text"):
        top_right_html = (
            f"{html.escape(cell['glyph_top_right_text'])}"
            f"{render_reference_sup(cell.get('target_reference_keys'), reference_index)}"
        )
    center_classes = ["center-value"]
    if current == 0 or visual_only:
        center_classes.append("faded")
    glyph_parts = [
        f"<div class='matrix-cell{' visual-only-cell' if visual_only else ''}' style='background:{progress_fill_color(current, cell.get('fill_basis_weeks'), visual_only)};{border_style(cell.get('border_kind', 'optimal_unknown'))}'{title_attr}>",
        render_corner("top-left", cell.get("glyph_top_left_text")),
        render_corner_html("top-right", top_right_html) if top_right_html else render_corner("top-right", cell.get("glyph_top_right_text")),
        render_corner("bottom-left", cell.get("glyph_bottom_left_text")),
        f"<div class='{' '.join(center_classes)}'>{html.escape(cell.get('glyph_center_text', '·'))}</div>",
    ]
    if cell.get("glyph_bottom_right_text"):
        method = cell.get("method_abbreviation")
        desired_method = cell.get("desired_method_abbreviation")
        preference_reason = cell.get("method_preference_reason")
        method_chip_classes = ["method-chip"]
        if desired_method is not None:
            if method == desired_method:
                method_chip_classes.append("method-chip-reached")
            elif preference_reason:
                method_chip_classes.append("method-chip-pending")
        glyph_parts.append(
            "<div class='method-cluster'>"
            f"<span class='{' '.join(method_chip_classes)}'>{html.escape(str(cell['glyph_bottom_right_text']))}</span>"
            "</div>"
        )
    glyph_parts.append("</div>")
    return "".join(glyph_parts)


def render_matrix_table(title, rows, cols, cell_map, reference_index, subtitle=None):
    html_parts = ["<section>", f"<h2>{html.escape(title)}</h2>"]
    if subtitle:
        html_parts.append(f"<p class='meta'>{html.escape(subtitle)}</p>")
    html_parts.append("<table><thead><tr><th>g\\p</th>")
    for p in cols:
        html_parts.append(f"<th>{p}</th>")
    html_parts.append("</tr></thead><tbody>")
    for g in rows:
        html_parts.append(f"<tr><th>{g}</th>")
        for p in cols:
            cell = cell_map[(g, p)]
            classes = ["dashboard-grid-cell"]
            if cell.get("visual_only"):
                classes.append("visual-only")
            html_parts.append(
                f"<td class='{' '.join(classes)}'>{render_cell_glyph(cell, reference_index)}</td>"
            )
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


def render_literature_reference_table(references):
    if not references:
        return ""
    rows = [
        "<section><h2>Literature references</h2><table><thead><tr><th>#</th><th>Citation</th><th>Notes</th></tr></thead><tbody>"
    ]
    for idx, ref in enumerate(references, start=1):
        rows.append(
            "<tr>"
            f"<td id='litref-{idx}'><code>[{idx}]</code></td>"
            f"<td><a href='{html.escape(ref['url'])}' target='_blank' rel='noopener noreferrer'>{html.escape(ref['citation'])}</a></td>"
            f"<td>{html.escape(ref['notes'])}</td>"
            "</tr>"
        )
    rows.append("</tbody></table></section>")
    return "".join(rows)


def render_benchmark_regions(regions):
    if not regions:
        return ""
    parts = []
    for region in regions:
        parts.append(
            f"{html.escape(region['title'])} g={region['bounds']['g_min']}..{region['bounds']['g_max']}, p={region['bounds']['p_min']}..{region['bounds']['p_max']}"
        )
    return " · ".join(parts)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("artifact")
    parser.add_argument("output")
    args = parser.parse_args()

    artifact = json.loads(Path(args.artifact).read_text())
    matrices = artifact["matrices"]
    literature_references = artifact.get("literature_references", [])
    literature_reference_index = build_literature_reference_index(artifact)
    benchmark_regions = artifact.get("benchmark_regions", [])

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
        ".method-chip-reached{background:rgba(187,247,208,0.95);border-color:rgba(22,163,74,0.45);color:#14532d;}"
        ".method-chip-pending{background:rgba(254,215,170,0.95);border-color:rgba(217,119,6,0.45);color:#7c2d12;}"
        ".lit-ref{font-size:9px;line-height:1;vertical-align:super;margin-left:1px;}"
        ".lit-ref a{color:#1d4ed8;text-decoration:none;}"
        ".lit-ref a:hover{text-decoration:underline;}"
        "code{background:#f1f5f9;border-radius:6px;padding:1px 5px;font-size:11px;}"
        "</style></head><body>",
        f"<h1>{html.escape(artifact['matrix_name'])}</h1>",
        f"<p class='meta'>version {artifact['matrix_version']} · {len(matrices)} matrix views over one global cell universe · benchmark regions {html.escape(render_benchmark_regions(benchmark_regions))}</p>",
        "<div class='legend-block'>",
        "<div class='legend-row'><span class='legend-key'>Universal glyph grammar</span><span><code>W</code> center = current achieved weeks</span><span><code>O</code> top-left = exact optimum when known</span><span><code>T</code> top-right = primary target</span><span><code>U</code> bottom-left = upper bound</span><span><code>M</code> bottom-right = current method; when a desired family differs, show <code>M→D</code></span></div>",
        "<div class='legend-row'><span class='legend-key'>Target sources</span><span>Canonical matrix uses roadmap <code>T</code> values and may also encode a desired roadmap family in the method slot.</span><span>Supplementary matrices use curated literature <code>T</code> values when available.</span><span><code>U</code> always means the counting upper bound.</span></div>",
        "<div class='legend-row'><span class='legend-key'>Fill</span>",
        render_scale_swatch("far from basis", progress_fill_color(0, 10, False)),
        render_scale_swatch("close to basis", progress_fill_color(8, 10, False)),
        render_scale_swatch("basis reached", progress_fill_color(10, 10, False)),
        render_scale_swatch("visual-only", progress_fill_color(0, None, True)),
        "</div>",
        "<div class='legend-row'><span class='legend-key'>Border</span>",
        render_border_swatch("exact optimum reached", border_style("optimal_reached")),
        render_border_swatch("exact optimum known, not reached", border_style("optimal_known_unreached")),
        render_border_swatch("exact optimum unknown", border_style("optimal_unknown")),
        "</div>",
        "<div class='legend-row legend-corners'><span class='legend-key'>References</span><span>Tiny blue superscripts on <code>T</code> labels link into the literature reference table below when a source is attached.</span></div>",
        "<div class='sample-grid'>",
        render_sample(
            "Roadmap cell below frontier",
            render_cell_glyph(
                {
                    "constructed_weeks": 8,
                    "fill_basis_weeks": 10,
                    "border_kind": "optimal_known_unreached",
                    "visual_only": False,
                    "glyph_center_text": "8",
                    "glyph_top_left_text": "O11",
                    "glyph_top_right_text": "T10",
                    "glyph_bottom_left_text": "U13",
                    "glyph_bottom_right_text": "RTD→P4",
                    "target_reference_keys": [],
                },
                literature_reference_index,
            ),
            "same slots and same meanings everywhere, including desired-family upgrades",
        ),
        render_sample(
            "Solved exact cell",
            render_cell_glyph(
                {
                    "constructed_weeks": 19,
                    "fill_basis_weeks": 19,
                    "border_kind": "optimal_reached",
                    "visual_only": False,
                    "glyph_center_text": "19",
                    "glyph_top_left_text": "O19",
                    "glyph_top_right_text": "T19",
                    "glyph_bottom_left_text": "U19",
                    "glyph_bottom_right_text": "RR",
                    "target_reference_keys": [],
                },
                literature_reference_index,
            ),
            "coherent even when values coincide; no smart hiding",
        ),
        render_sample(
            "Supplementary literature cell",
            render_cell_glyph(
                {
                    "constructed_weeks": 5,
                    "fill_basis_weeks": 13,
                    "border_kind": "optimal_unknown",
                    "visual_only": False,
                    "glyph_center_text": "5",
                    "glyph_top_left_text": None,
                    "glyph_top_right_text": "T13",
                    "glyph_bottom_left_text": "U16",
                    "glyph_bottom_right_text": "ownSG",
                    "target_reference_keys": ["mva2026"],
                },
                {"mva2026": {"index": 1, "citation": "example"}},
            ),
            "same glyph grammar; only the data source behind T differs",
        ),
        render_sample(
            "No construction yet",
            render_cell_glyph(
                {
                    "constructed_weeks": 0,
                    "fill_basis_weeks": 7,
                    "border_kind": "optimal_unknown",
                    "visual_only": False,
                    "glyph_center_text": "·",
                    "glyph_top_left_text": None,
                    "glyph_top_right_text": "T7",
                    "glyph_bottom_left_text": "U9",
                    "glyph_bottom_right_text": None,
                    "target_reference_keys": [],
                },
                literature_reference_index,
            ),
            "still uses the same slots; no alternative grammar",
        ),
        "</div></div>",
    ]

    for matrix in matrices:
        bounds = matrix["bounds"]
        page.append(
            render_matrix_table(
                matrix["title"],
                range(bounds["g_min"], bounds["g_max"] + 1),
                range(bounds["p_min"], bounds["p_max"] + 1),
                build_matrix(matrix["cells"]),
                literature_reference_index,
                subtitle=matrix.get("subtitle"),
            )
        )
    page.append(render_method_reference_table())
    page.append(render_literature_reference_table(literature_references))
    page.append("</body></html>")

    Path(args.output).write_text("".join(page))


if __name__ == "__main__":
    main()
