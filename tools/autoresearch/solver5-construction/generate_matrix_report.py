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


def build_matrix(cells, key):
    matrix = {}
    for cell in cells:
        matrix[(cell["g"], cell["p"])] = cell.get(key)
    return matrix


def render_table(title, rows, cols, value_fn, color_fn=None, aside_fn=None):
    html_parts = [f"<section><h2>{html.escape(title)}</h2><table><thead><tr><th>g\\p</th>"]
    for p in cols:
        html_parts.append(f"<th>{p}</th>")
    html_parts.append("</tr></thead><tbody>")
    for g in rows:
        html_parts.append(f"<tr><th>{g}</th>")
        for p in cols:
            value = value_fn(g, p)
            aside = aside_fn(g, p) if aside_fn else None
            style = ""
            if color_fn:
                style = f' style="background:{color_fn(g, p)}"'
            cell_html = html.escape(str(value)) if value is not None else "—"
            if aside:
                cell_html += f"<div class='aside'>{html.escape(str(aside))}</div>"
            html_parts.append(f"<td{style}>{cell_html}</td>")
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
    rows = range(artifact["scored_bounds"]["g_min"], artifact["scored_bounds"]["g_max"] + 1)
    cols = range(artifact["scored_bounds"]["p_min"], artifact["scored_bounds"]["p_max"] + 1)
    max_gap = max(cell["gap_to_target"] for cell in cells) if cells else 0

    current = build_matrix(cells, "constructed_weeks")
    target = build_matrix(cells, "target_weeks")
    method = build_matrix(cells, "method_abbreviation")
    gap = build_matrix(cells, "gap_to_target")
    quality = build_matrix(cells, "quality_label")

    page = [
        "<!doctype html><html><head><meta charset='utf-8'>",
        "<title>Solver5 Matrix Report</title>",
        "<style>",
        "body{font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:24px;color:#111;}"
        "table{border-collapse:collapse;margin:12px 0 24px 0;}"
        "th,td{border:1px solid #c9ced6;padding:8px 10px;min-width:58px;text-align:center;vertical-align:middle;}"
        "th{background:#f3f5f7;font-weight:600;}"
        "h1,h2{margin:0 0 10px 0;}"
        ".meta{margin:0 0 18px 0;color:#444;}"
        ".aside{font-size:11px;color:#444;margin-top:4px;}"
        ".legend{display:flex;gap:10px;align-items:center;margin:12px 0 18px 0;flex-wrap:wrap;}"
        ".swatch{padding:6px 10px;border:1px solid #bbb;border-radius:6px;font-size:12px;}"
        "</style></head><body>",
        f"<h1>{html.escape(artifact['matrix_name'])}</h1>",
        f"<p class='meta'>version {artifact['matrix_version']} · scored region g={artifact['scored_bounds']['g_min']}..{artifact['scored_bounds']['g_max']}, p={artifact['scored_bounds']['p_min']}..{artifact['scored_bounds']['p_max']}</p>",
        "<div class='legend'>",
        f"<span class='swatch' style='background:{gap_color(0, max_gap)}'>gap = 0</span>",
        f"<span class='swatch' style='background:{gap_color(1, max_gap)}'>gap = 1</span>",
        f"<span class='swatch' style='background:{gap_color(max_gap, max_gap)}'>gap = max ({max_gap})</span>",
        "</div>",
    ]

    page.append(
        render_table(
            "Current W_g,p",
            rows,
            cols,
            lambda g, p: current[(g, p)],
            lambda g, p: gap_color(gap[(g, p)], max_gap),
            lambda g, p: f"target {target[(g, p)]} · gap {gap[(g, p)]}",
        )
    )
    page.append(render_table("Target TW_g,p", rows, cols, lambda g, p: target[(g, p)]))
    page.append(
        render_table(
            "Method M_g,p",
            rows,
            cols,
            lambda g, p: method[(g, p)] or "—",
            None,
            lambda g, p: quality[(g, p)] or "unsolved",
        )
    )
    page.append("</body></html>")

    Path(args.output).write_text("".join(page))


if __name__ == "__main__":
    main()
