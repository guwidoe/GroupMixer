#!/usr/bin/env python3
import argparse
import html
import json
from pathlib import Path


def gap_color(gap: int, max_gap: int) -> str:
    if gap <= 0:
        hue = 120.0
    elif max_gap <= 1:
        hue = 60.0
    else:
        normalized = min(1.0, max(0.0, (gap - 1) / (max_gap - 1)))
        hue = 60.0 * (1.0 - normalized)
    return f"hsl({hue:.1f} 78% 78%)"


def semantic_badge_style(cell, max_gap):
    background = gap_color(cell["gap_to_target"], max_gap)
    return f"background:{background};color:#1f2937;"


def quality_badge_style(cell, max_gap):
    quality = cell.get("quality_label") or ""
    if quality == "exact_frontier":
        background = gap_color(0, max_gap)
    elif quality == "near_frontier":
        background = gap_color(1, max_gap)
    elif quality == "lower_bound":
        background = gap_color(max_gap if max_gap > 0 else 2, max_gap if max_gap > 0 else 2)
    else:
        background = "#e5e7eb"
    return f"background:{background};color:#1f2937;"


def build_matrix(cells):
    return {(cell["g"], cell["p"]): cell for cell in cells}


def quality_label_text(cell):
    quality = cell.get("quality_label") or ""
    return {
        "exact_frontier": "exact_frontier",
        "near_frontier": "near_frontier",
        "lower_bound": "lower_bound",
        "visual_only": "visual_only",
    }.get(quality, quality or "unsolved")


def render_badge(text, badge_class="", inline_style=""):
    class_attr = f" {badge_class}" if badge_class else ""
    style_attr = f" style='{inline_style}'" if inline_style else ""
    return f"<span class='badge{class_attr}'{style_attr}>{html.escape(str(text))}</span>"


def render_legend_item(badge_html, description):
    return f"<span class='legend-item'>{badge_html}<span>{html.escape(description)}</span></span>"


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


def render_combined_table(title, rows, cols, cell_map, max_gap):
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
            style = f' style="background:{gap_color(cell["gap_to_target"], max_gap)}"'
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
            if cell["scored"] and cell.get("method_abbreviation"):
                badges.append(
                    render_badge(
                        cell["method_abbreviation"],
                        inline_style=semantic_badge_style(cell, max_gap),
                    )
                )
            if cell["scored"] and cell.get("quality_label"):
                badges.append(
                    render_badge(
                        quality_label_text(cell),
                        inline_style=quality_badge_style(cell, max_gap),
                    )
                )
            if not cell["scored"]:
                badges.append(render_badge("visual_only", inline_style=semantic_badge_style(cell, max_gap)))
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
        f"<span class='swatch' style='background:{gap_color(0, max_gap)}'>gap = 0</span>",
        f"<span class='swatch' style='background:{gap_color(1, max_gap)}'>gap = 1</span>",
        f"<span class='swatch' style='background:{gap_color(max_gap, max_gap)}'>gap = max ({max_gap})</span>",
        "<span class='swatch' style='border-style:dashed;background:#f7f7f7'>visual-only cell</span>",
        "</div>",
        "<div class='legend-block'>",
        "<div class='legend-title'>How to read the dashboard</div>",
        "<p class='legend-copy'><strong>Cell background</strong> shows target gap severity: green means the target is reached, yellow means a small remaining gap, and orange/red means the cell is further from target.</p>",
        "<p class='legend-copy'><strong>Method badge text</strong> tells you which construction route currently achieves the cell. <strong>Method badge color</strong> follows the same green/yellow/red gap scheme as the cell background, so the badge color means progress, not family identity.</p>",
        "<p class='legend-copy'><strong>Quality badge</strong> shows the current constructive strength class: exact frontier, near frontier, or lower bound.</p>",
        "<div class='legend-title'>Method badges</div>",
        "<div class='legend-grid'>",
        render_legend_item(render_badge("RR", inline_style="background:hsl(120 78% 78%);color:#1f2937;"), "round robin / 1-factorization"),
        render_legend_item(render_badge("K6", inline_style="background:hsl(120 78% 78%);color:#1f2937;"), "Kirkman 6t+1 family"),
        render_legend_item(render_badge("TD", inline_style="background:hsl(60 78% 78%);color:#1f2937;"), "transversal design family"),
        render_legend_item(render_badge("AP", inline_style="background:hsl(120 78% 78%);color:#1f2937;"), "affine plane family"),
        render_legend_item(render_badge("TD+G", inline_style="background:hsl(90 78% 78%);color:#1f2937;"), "transversal design plus the recursive +G(t)-style lift/composition operator"),
        render_legend_item(render_badge("visual_only", inline_style="background:hsl(120 78% 78%);color:#1f2937;"), "shown for matrix completeness; excluded from the scored objective"),
        "</div>",
        "<div class='legend-title'>Quality badges</div>",
        "<div class='legend-grid'>",
        render_legend_item(render_badge("exact_frontier", inline_style=quality_badge_style({"quality_label": "exact_frontier"}, max_gap)), "target already reached / strongest current quality class"),
        render_legend_item(render_badge("near_frontier", inline_style=quality_badge_style({"quality_label": "near_frontier"}, max_gap)), "close to frontier"),
        render_legend_item(render_badge("lower_bound", inline_style=quality_badge_style({"quality_label": "lower_bound"}, max_gap)), "still below target / weaker constructive status"),
        "</div></div>",
    ]

    page.append(render_combined_table("Coverage dashboard", rows, cols, cell_map, max_gap))
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
            else (cell["quality_label"] or "unsolved"),
        )
    )
    page.append("</body></html>")

    Path(args.output).write_text("".join(page))


if __name__ == "__main__":
    main()
