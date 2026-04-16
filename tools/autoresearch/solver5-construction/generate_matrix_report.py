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


def build_matrix(cells):
    return {(cell["g"], cell["p"]): cell for cell in cells}


def render_table(title, rows, cols, cell_map, value_fn, color_fn=None, aside_fn=None):
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
            style = ""
            if color_fn:
                style = f' style="background:{color_fn(cell)}"'
            class_attr = f" class='{' '.join(classes)}'" if classes else ""
            value = value_fn(cell)
            aside = aside_fn(cell) if aside_fn else None
            cell_html = html.escape(str(value)) if value is not None else "—"
            if aside:
                cell_html += f"<div class='aside'>{html.escape(str(aside))}</div>"
            html_parts.append(f"<td{class_attr}{style}>{cell_html}</td>")
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
        "th,td{border:1px solid #c9ced6;padding:8px 10px;min-width:58px;text-align:center;vertical-align:middle;}"
        "th{background:#f3f5f7;font-weight:600;}"
        "h1,h2{margin:0 0 10px 0;}"
        ".meta{margin:0 0 18px 0;color:#444;}"
        ".aside{font-size:11px;color:#444;margin-top:4px;}"
        ".legend{display:flex;gap:10px;align-items:center;margin:12px 0 18px 0;flex-wrap:wrap;}"
        ".swatch{padding:6px 10px;border:1px solid #bbb;border-radius:6px;font-size:12px;}"
        ".visual-only{border-style:dashed;opacity:0.92;}"
        "</style></head><body>",
        f"<h1>{html.escape(artifact['matrix_name'])}</h1>",
        f"<p class='meta'>version {artifact['matrix_version']} · visual region g={artifact['visual_bounds']['g_min']}..{artifact['visual_bounds']['g_max']}, p={artifact['visual_bounds']['p_min']}..{artifact['visual_bounds']['p_max']} · scored region g={artifact['scored_bounds']['g_min']}..{artifact['scored_bounds']['g_max']}, p={artifact['scored_bounds']['p_min']}..{artifact['scored_bounds']['p_max']}</p>",
        "<div class='legend'>",
        f"<span class='swatch' style='background:{gap_color(0, max_gap)}'>gap = 0</span>",
        f"<span class='swatch' style='background:{gap_color(1, max_gap)}'>gap = 1</span>",
        f"<span class='swatch' style='background:{gap_color(max_gap, max_gap)}'>gap = max ({max_gap})</span>",
        "<span class='swatch' style='border-style:dashed;background:#f7f7f7'>visual-only cell</span>",
        "</div>",
    ]

    page.append(
        render_table(
            "Current W_g,p",
            rows,
            cols,
            cell_map,
            lambda cell: cell["current_display"],
            lambda cell: gap_color(cell["gap_to_target"], max_gap),
            lambda cell: cell["visual_note"]
            if not cell["scored"]
            else f"target {cell['target_display']} · gap {cell['gap_to_target']}",
        )
    )
    page.append(
        render_table(
            "Target TW_g,p",
            rows,
            cols,
            cell_map,
            lambda cell: cell["target_display"],
            None,
            lambda cell: "visual-only" if not cell["scored"] else None,
        )
    )
    page.append(
        render_table(
            "Method M_g,p",
            rows,
            cols,
            cell_map,
            lambda cell: cell["method_abbreviation"] or "—",
            None,
            lambda cell: cell["visual_note"]
            if not cell["scored"]
            else (cell["quality_label"] or "unsolved"),
        )
    )
    page.append("</body></html>")

    Path(args.output).write_text("".join(page))


if __name__ == "__main__":
    main()
