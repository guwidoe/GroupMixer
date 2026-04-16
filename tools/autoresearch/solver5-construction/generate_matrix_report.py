#!/usr/bin/env python3
import argparse
import html
import json
from pathlib import Path


def cell_gap_color(gap: int, target_weeks: int | None) -> str:
    if gap <= 0:
        hue = 120.0
    else:
        effective_target = max(target_weeks or 1, 1)
        normalized = min(1.0, max(0.0, gap / effective_target))
        hue = 120.0 * (1.0 - normalized)
    return f"hsl({hue:.1f} 78% 78%)"


def target_alignment_color(gap: int, max_gap: int) -> str:
    if gap <= 0:
        hue = 120.0
    elif max_gap <= 1:
        hue = 28.0
    else:
        normalized = min(1.0, max(0.0, gap / max_gap))
        hue = 28.0 * (1.0 - normalized)
    return f"hsl({hue:.1f} 78% 78%)"


def build_matrix(cells):
    return {(cell["g"], cell["p"]): cell for cell in cells}


def render_badge(text, inline_style=""):
    style_attr = f" style='{inline_style}'" if inline_style else ""
    return f"<span class='badge'{style_attr}>{html.escape(str(text))}</span>"


def render_legend_item(badge_html, description):
    return f"<span class='legend-item'>{badge_html}<span>{html.escape(description)}</span></span>"


def neutral_badge_style():
    return "background:#f8fafc;color:#334155;"


def method_badge_style(cell, max_method_gap):
    if not cell.get("scored"):
        return cell_gap_color(0, 1)
    current_method = cell.get("method_abbreviation")
    target_method = cell.get("target_method_abbreviation")
    if cell.get("proven_optimal_gap") == 0 and cell.get("gap_to_target", 0) == 0:
        return target_alignment_color(0, max_method_gap)
    method_mismatch = bool(current_method and target_method and current_method != target_method)
    gap = cell.get("heuristic_gap_to_target")
    if gap is None:
        gap = 0
    if method_mismatch:
        gap = max(gap, cell.get("gap_to_target", 0), 1)
    if gap <= 0:
        return target_alignment_color(0, max_method_gap)
    return target_alignment_color(gap, max(max_method_gap, gap))


def optimality_badge_style(cell, max_opt_gap):
    gap = cell.get("proven_optimal_gap")
    if gap is None:
        return "#e5e7eb"
    if gap == 0 and cell.get("gap_to_target", 0) > 0:
        return ""
    return target_alignment_color(gap, max_opt_gap)


def method_badge_text(cell):
    current_method = cell.get("method_abbreviation") or "—"
    target_method = cell.get("target_method_abbreviation")
    if cell.get("proven_optimal_gap") == 0 and cell.get("gap_to_target", 0) == 0:
        return current_method
    if target_method and target_method != current_method:
        return f"{current_method} ({target_method})"
    return current_method


def optimality_badge_text(cell):
    gap = cell.get("proven_optimal_gap")
    lower_bound = cell.get("optimality_lower_bound_weeks")
    if gap is None:
        if lower_bound is not None:
            return f"opt ≥ {lower_bound}"
        return None
    if gap == 0:
        if cell.get("gap_to_target", 0) > 0:
            exact_optimum = cell.get("proven_optimal_weeks") or cell.get("target_weeks")
            if exact_optimum is not None:
                return f"opt = {exact_optimum}"
            return "opt exact"
        return "proven optimal"
    return f"opt gap {gap}"


def optimality_badge_inline_style(cell, max_opt_gap):
    gap = cell.get("proven_optimal_gap")
    if gap is None:
        return "background:#e2e8f0;color:#1f2937;"
    if gap == 0 and cell.get("gap_to_target", 0) > 0:
        return "background:#e2e8f0;color:#1f2937;"
    return f"background:{optimality_badge_style(cell, max_opt_gap)};color:#1f2937;"


def render_simple_table(title, rows, cols, cell_map, value_fn, aside_fn=None):
    html_parts = [f"<section><h2>{html.escape(title)}</h2><table><thead><tr><th>g\\p</th>"]
    for p in cols:
        html_parts.append(f"<th>{p}</th>")
    html_parts.append("</tr></thead><tbody>")
    for g in rows:
        html_parts.append(f"<tr><th>{g}</th>")
        for p in cols:
            cell = cell_map[(g, p)]
            classes = []
            if not cell["scored"]:
                classes.append("visual-only")
            class_attr = f" class='{' '.join(classes)}'" if classes else ""
            cell_html = html.escape(str(value_fn(cell)))
            aside = aside_fn(cell) if aside_fn else None
            if aside:
                cell_html += f"<div class='aside'>{html.escape(str(aside))}</div>"
            html_parts.append(f"<td{class_attr}>{cell_html}</td>")
        html_parts.append("</tr>")
    html_parts.append("</tbody></table></section>")
    return "".join(html_parts)


def render_combined_table(title, rows, cols, cell_map, max_gap, max_method_gap, max_opt_gap):
    html_parts = [f"<section><h2>{html.escape(title)}</h2><table><thead><tr><th>g\\p</th>"]
    for p in cols:
        html_parts.append(f"<th>{p}</th>")
    html_parts.append("</tr></thead><tbody>")
    for g in rows:
        html_parts.append(f"<tr><th>{g}</th>")
        for p in cols:
            cell = cell_map[(g, p)]
            classes = ["dashboard-cell"]
            if not cell["scored"]:
                classes.append("visual-only")
            style = f' style="background:{cell_gap_color(cell["gap_to_target"], cell.get("target_weeks"))}"'
            html_parts.append(f"<td class='{' '.join(classes)}'{style}>")
            html_parts.append(
                f"<div class='cell-main'>{html.escape(str(cell['current_display']))}</div>"
            )
            if cell["scored"]:
                html_parts.append(
                    f"<div class='cell-sub'>target {html.escape(str(cell['target_display']))} · gap {cell['gap_to_target']}</div>"
                )
            else:
                html_parts.append("<div class='cell-sub cell-sub-compact'></div>")

            badges = []
            if cell["scored"]:
                if cell.get("method_abbreviation"):
                    badges.append(
                        render_badge(
                            method_badge_text(cell),
                            inline_style=f"background:{method_badge_style(cell, max_method_gap)};color:#1f2937;",
                        )
                    )
                opt_text = optimality_badge_text(cell)
                if opt_text:
                    badges.append(
                        render_badge(
                            opt_text,
                            inline_style=optimality_badge_inline_style(cell, max_opt_gap),
                        )
                    )
            if not cell["scored"]:
                badges.append(render_badge("visual_only", inline_style=f"background:{cell_gap_color(0, 1)};color:#1f2937;"))
            if badges:
                html_parts.append(f"<div class='badge-row'>{''.join(badges)}</div>")

            html_parts.append("</td>")
        html_parts.append("</tr>")
    html_parts.append("</tbody></table></section>")
    return "".join(html_parts)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("artifact")
    parser.add_argument("output")
    args = parser.parse_args()

    artifact = json.loads(Path(args.artifact).read_text())
    cells = artifact["cells"]
    rows = range(artifact["visual_bounds"]["g_min"], artifact["visual_bounds"]["g_max"] + 1)
    cols = range(artifact["visual_bounds"]["p_min"], artifact["visual_bounds"]["p_max"] + 1)
    scored_cells = [cell for cell in cells if cell["scored"]]
    max_gap = max((cell["gap_to_target"] for cell in scored_cells), default=0)
    max_method_gap = max(
        (cell["heuristic_gap_to_target"] for cell in scored_cells if cell.get("heuristic_gap_to_target") is not None),
        default=0,
    )
    max_opt_gap = max(
        (cell["proven_optimal_gap"] for cell in scored_cells if cell.get("proven_optimal_gap") is not None),
        default=0,
    )
    cell_map = build_matrix(cells)

    page = [
        "<!doctype html><html><head><meta charset='utf-8'>",
        "<title>Solver5 Matrix Report</title>",
        "<style>",
        "body{font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:24px;color:#111;}"
        "table{border-collapse:collapse;margin:12px 0 24px 0;}"
        "th,td{border:1px solid #c9ced6;padding:6px 7px;min-width:72px;text-align:center;vertical-align:middle;}"
        "th{background:#f3f5f7;font-weight:600;}"
        "h1,h2{margin:0 0 10px 0;}"
        ".meta{margin:0 0 18px 0;color:#444;}"
        ".aside{font-size:10px;color:#444;margin-top:4px;}"
        ".legend{display:flex;gap:10px;align-items:center;margin:12px 0 18px 0;flex-wrap:wrap;}"
        ".legend-block{margin:10px 0 16px 0;padding:12px 14px;background:#f8fafc;border:1px solid #d7dee7;border-radius:12px;}"
        ".legend-title{font-size:12px;font-weight:700;letter-spacing:0.03em;text-transform:uppercase;color:#334155;margin-bottom:8px;}"
        ".legend-copy{font-size:12px;line-height:1.45;color:#475569;margin:0 0 10px 0;}"
        ".legend-grid{display:flex;gap:8px 14px;flex-wrap:wrap;}"
        ".legend-item{display:inline-flex;align-items:center;gap:8px;font-size:12px;color:#334155;}"
        ".swatch{padding:6px 10px;border:1px solid #bbb;border-radius:999px;font-size:12px;}"
        ".dashboard-cell{min-width:88px;padding:8px 6px;}"
        ".visual-only{border-style:dashed;opacity:0.95;}"
        ".cell-main{font-size:24px;line-height:1;font-weight:600;margin-bottom:5px;}"
        ".cell-sub{font-size:12px;line-height:1.15;color:#32414f;margin-bottom:5px;}"
        ".cell-sub-compact{min-height:4px;margin-bottom:4px;}"
        ".badge-row{display:flex;gap:4px;justify-content:center;align-items:center;flex-wrap:wrap;}"
        ".badge{display:inline-block;padding:2px 7px;border-radius:999px;font-size:10px;line-height:1.05;font-weight:600;border:1px solid rgba(0,0,0,0.08);box-shadow:inset 0 1px 0 rgba(255,255,255,0.45);}"
        "</style></head><body>",
        f"<h1>{html.escape(artifact['matrix_name'])}</h1>",
        f"<p class='meta'>version {artifact['matrix_version']} · visual region g={artifact['visual_bounds']['g_min']}..{artifact['visual_bounds']['g_max']}, p={artifact['visual_bounds']['p_min']}..{artifact['visual_bounds']['p_max']} · scored region g={artifact['scored_bounds']['g_min']}..{artifact['scored_bounds']['g_max']}, p={artifact['scored_bounds']['p_min']}..{artifact['scored_bounds']['p_max']}</p>",
        "<div class='legend'>",
        f"<span class='swatch' style='background:{cell_gap_color(0, 10)}'>gap = 0</span>",
        f"<span class='swatch' style='background:{cell_gap_color(5, 10)}'>gap = target/2</span>",
        f"<span class='swatch' style='background:{cell_gap_color(10, 10)}'>gap = target</span>",
        "<span class='swatch' style='border-style:dashed;background:#f7f7f7'>visual-only cell</span>",
        "</div>",
        "<div class='legend-block'>",
        "<div class='legend-title'>How to read the dashboard</div>",
        "<p class='legend-copy'><strong>Cell background</strong> is scaled per cell, not globally: <code>gap = 0</code> is green, <code>gap = target</code> is fully red, and intermediate gaps interpolate between them relative to that cell's own target.</p>",
        "<p class='legend-copy'><strong>Method badge text</strong> shows the current achieving method. If the best-known heuristic method differs and the cell is still unresolved, it appears in brackets: <code>CURRENT (HEURISTIC)</code>. Proven-optimal settled cells collapse to a single method label with no bracketed aspiration.</p>",
        "<p class='legend-copy'><strong>Method badge color</strong> is only green when the current achieving method already matches the best-known heuristic method and that heuristic target is matched. If the badge text contains brackets or the target still trails the best-known heuristic benchmark, the badge shifts orange/red.</p>",
        "<p class='legend-copy'><strong>Optimality badge</strong> shows proof status for the target: <code>proven optimal</code> when the reached target is known optimal, <code>opt = X</code> when an exact optimum is known but the current cell has not yet reached it, <code>opt gap N</code> when the target still sits below a known proven optimum, and <code>opt ≥ L</code> when only a literature-backed constructive lower bound is currently encoded.</p>",
        "<div class='legend-title'>Method badge strings</div>",
        "<div class='legend-grid'>",
        render_legend_item(render_badge("RR", inline_style=neutral_badge_style()), "round robin / 1-factorization"),
        render_legend_item(render_badge("K6", inline_style=neutral_badge_style()), "Kirkman 6t+1 family"),
        render_legend_item(render_badge("KTS", inline_style=neutral_badge_style()), "Kirkman triple system target family"),
        render_legend_item(render_badge("NKTS", inline_style=neutral_badge_style()), "nearly Kirkman triple system target family"),
        render_legend_item(render_badge("TD", inline_style=neutral_badge_style()), "transversal design family"),
        render_legend_item(render_badge("AP", inline_style=neutral_badge_style()), "affine plane family"),
        render_legend_item(render_badge("P4", inline_style=neutral_badge_style()), "dedicated p=4 router target family"),
        render_legend_item(render_badge("TD+G", inline_style=neutral_badge_style()), "transversal design plus the recursive +G(t)-style lift/composition operator"),
        render_legend_item(render_badge("visual_only", inline_style=neutral_badge_style()), "shown for matrix completeness; excluded from the scored objective"),
        "</div>",
        "<div class='legend-title'>Badge colors</div>",
        "<div class='legend-grid'>",
        render_legend_item(render_badge("green", inline_style=f"background:{target_alignment_color(0, max_method_gap)};color:#1f2937;"), "current method already matches the target method and the target benchmark is matched"),
        render_legend_item(render_badge("orange", inline_style=f"background:{target_alignment_color(1 if max_method_gap > 0 else 1, max_method_gap if max_method_gap > 0 else 1)};color:#1f2937;"), "current method differs from target or there is a small remaining gap to the benchmark"),
        render_legend_item(render_badge("red", inline_style=f"background:{target_alignment_color(max_method_gap if max_method_gap > 0 else 2, max_method_gap if max_method_gap > 0 else 2)};color:#1f2937;"), "larger remaining gap to the benchmark"),
        render_legend_item(render_badge("proven optimal", inline_style=f"background:{target_alignment_color(0, max_opt_gap)};color:#1f2937;"), "target already matches a known proven optimum"),
        render_legend_item(render_badge("opt = 10", inline_style=f"background:{target_alignment_color(0, max_opt_gap)};color:#1f2937;"), "an exact optimum is known for the cell, but the current result has not yet reached that exact target"),
        render_legend_item(render_badge("opt gap 2", inline_style=f"background:{target_alignment_color(2 if max_opt_gap > 1 else 1, max_opt_gap if max_opt_gap > 0 else 2)};color:#1f2937;"), "target remains below a known proven optimum by the shown amount"),
        render_legend_item(render_badge("opt ≥ 10", inline_style="background:#e2e8f0;color:#1f2937;"), "no proof of optimality is encoded, but literature gives a constructive lower bound of at least the shown value"),
        "</div></div>",
    ]

    page.append(render_combined_table("Coverage dashboard", rows, cols, cell_map, max_gap, max_method_gap, max_opt_gap))
    page.append(
        render_simple_table(
            "Target TW_g,p",
            rows,
            cols,
            cell_map,
            lambda cell: cell["target_display"],
            lambda cell: "visual-only" if not cell["scored"] else None,
        )
    )
    page.append(
        render_simple_table(
            "Method M_g,p",
            rows,
            cols,
            cell_map,
            lambda cell: cell["method_abbreviation"] or "—",
            lambda cell: cell["visual_note"]
            if not cell["scored"]
            else ((method_badge_text(cell)) if cell.get("method_abbreviation") else "unsolved"),
        )
    )
    page.append("</body></html>")

    Path(args.output).write_text("".join(page))


if __name__ == "__main__":
    main()
