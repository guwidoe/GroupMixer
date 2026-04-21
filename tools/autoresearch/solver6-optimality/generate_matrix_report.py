#!/usr/bin/env python3
import argparse
import html
import json
import math
from pathlib import Path


LAYER_CONFIG = {
    "linear": {
        "label": "Linear lower-bound attainment",
        "summary_key": "linear_summary",
        "status_key": "linear_status",
        "description": "Dark green = exact zero-repeat, green = lower-bound tight with nonzero repeats, red = miss, gray = unsupported / timeout / error / not-run.",
    },
    "squared": {
        "label": "Squared lower-bound attainment",
        "summary_key": "squared_summary",
        "status_key": "squared_status",
        "description": "Same visual grammar, but success is judged against the perfect balanced squared-repeat lower bound.",
    },
}


def status_class(status: str) -> str:
    return {
        "exact": "week-exact",
        "lower_bound_tight": "week-tight",
        "miss": "week-miss",
        "unsupported": "week-unavailable",
        "timeout": "week-unavailable",
        "error": "week-unavailable",
        "not_run": "week-unavailable",
    }.get(status, "week-unavailable")


def build_cell_map(cells):
    return {(cell["g"], cell["p"]): cell for cell in cells}


def render_week_grid(cell, layer_key, week_cap):
    status_key = LAYER_CONFIG[layer_key]["status_key"]
    rows = max(1, math.ceil(week_cap / 10))
    total_slots = rows * 10
    parts = [f"<div class='mini-grid mini-grid-rows-{rows}'>"]
    for index in range(total_slots):
        if index < len(cell["week_results"]):
            week = cell["week_results"][index]
            status = week[status_key]
            tooltip = f"week {week['week']}: {status.replace('_', ' ')}"
            if week.get("final_metrics"):
                metrics = week["final_metrics"]
                tooltip += (
                    f" | linear gap={metrics['linear_repeat_lower_bound_gap']}"
                    f" | squared gap={metrics['squared_repeat_lower_bound_gap']}"
                )
            parts.append(
                f"<span class='mini-week {status_class(status)}' title='{html.escape(tooltip)}'></span>"
            )
        else:
            parts.append("<span class='mini-week mini-week-empty'></span>")
    parts.append("</div>")
    return "".join(parts)


def render_outer_cell(cell, layer_key, week_cap):
    summary = cell[LAYER_CONFIG[layer_key]["summary_key"]]
    title = (
        f"{cell['g']}-{cell['p']} | frontier={summary['contiguous_frontier']}"
        f" | best_observed={summary['best_observed_hit']}"
        f" | exact_weeks={summary['exact_week_count']}"
        f" | tight_weeks={summary['lower_bound_tight_week_count']}"
    )
    if cell.get("skip_reason"):
        title += f" | {cell['skip_reason']}"
    return (
        f"<button class='outer-cell{' benchmark-skipped' if not cell['benchmark_eligible'] else ''}'"
        f" title='{html.escape(title)}'>"
        f"<div class='outer-cell-headline'>{html.escape(summary['headline_label'])}</div>"
        f"<div class='outer-cell-subtitle'>{cell['g']}-{cell['p']}</div>"
        f"{render_week_grid(cell, layer_key, week_cap)}"
        "</button>"
    )


def render_matrix_view(matrix, layer_key, week_cap):
    bounds = matrix["bounds"]
    cell_map = build_cell_map(matrix["cells"])
    parts = [
        "<section class='matrix-view'>",
        f"<h2>{html.escape(matrix['title'])}</h2>",
        f"<p class='meta'>{html.escape(matrix['subtitle'])}</p>",
        "<table class='outer-matrix'><thead><tr><th>g\\p</th>",
    ]
    for p in range(bounds["p_min"], bounds["p_max"] + 1):
        parts.append(f"<th>{p}</th>")
    parts.append("</tr></thead><tbody>")
    for g in range(bounds["g_min"], bounds["g_max"] + 1):
        parts.append(f"<tr><th>{g}</th>")
        for p in range(bounds["p_min"], bounds["p_max"] + 1):
            cell = cell_map[(g, p)]
            parts.append(f"<td>{render_outer_cell(cell, layer_key, week_cap)}</td>")
        parts.append("</tr>")
    parts.append("</tbody></table></section>")
    return "".join(parts)


def render_layer(artifact, layer_key):
    week_cap = artifact["config"]["week_cap"]
    config = LAYER_CONFIG[layer_key]
    parts = [
        f"<section class='layer-panel' data-layer='{layer_key}'>",
        f"<p class='meta'>{html.escape(config['description'])}</p>",
    ]
    for matrix in artifact["matrices"]:
        parts.append(render_matrix_view(matrix, layer_key, week_cap))
    parts.append("</section>")
    return "".join(parts)


def render_html(artifact):
    config = artifact["config"]
    linear_active = "is-active"
    squared_active = ""
    return f"""<!DOCTYPE html>
<html lang='en'>
<head>
  <meta charset='utf-8'>
  <title>solver6 optimality frontier report</title>
  <style>
    :root {{
      color-scheme: light dark;
      --bg: #0f172a;
      --panel: #111827;
      --panel-2: #1f2937;
      --text: #e5e7eb;
      --muted: #94a3b8;
      --line: #334155;
      --exact: #166534;
      --tight: #22c55e;
      --miss: #ef4444;
      --na: #64748b;
      --na2: #475569;
    }}
    body {{
      margin: 0;
      padding: 24px;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
      background: var(--bg);
      color: var(--text);
    }}
    h1, h2, h3, p {{ margin-top: 0; }}
    .meta {{ color: var(--muted); }}
    .header-card, .legend-card {{
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 16px 18px;
      margin-bottom: 18px;
    }}
    .config-grid {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 10px;
      margin-top: 12px;
    }}
    .config-item {{
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(148,163,184,0.2);
      border-radius: 10px;
      padding: 10px 12px;
    }}
    .config-item .label {{ display:block; color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }}
    .config-item .value {{ font-weight: 600; }}
    .tab-row {{ display:flex; gap:10px; margin: 18px 0; }}
    .tab-button {{
      background: var(--panel-2);
      color: var(--text);
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 8px 14px;
      cursor: pointer;
      font-weight: 600;
    }}
    .tab-button.is-active {{ border-color: #22c55e; box-shadow: 0 0 0 1px rgba(34,197,94,0.35) inset; }}
    .layer-panel {{ display:none; }}
    .layer-panel.is-active {{ display:block; }}
    .legend-chip {{ display:inline-flex; align-items:center; gap:8px; margin-right:16px; margin-bottom:8px; }}
    .legend-swatch {{ width:16px; height:16px; border-radius:4px; display:inline-block; border:1px solid rgba(255,255,255,0.15); }}
    table.outer-matrix {{ border-collapse: collapse; width: 100%; table-layout: fixed; margin-bottom: 28px; }}
    table.outer-matrix th, table.outer-matrix td {{ border: 1px solid var(--line); padding: 6px; text-align: center; vertical-align: top; }}
    table.outer-matrix th {{ color: var(--muted); background: rgba(255,255,255,0.02); font-weight: 600; }}
    .outer-cell {{
      width: 100%;
      min-height: 112px;
      background: var(--panel);
      border: 1px solid rgba(148,163,184,0.22);
      border-radius: 12px;
      color: var(--text);
      padding: 8px;
      cursor: default;
    }}
    .outer-cell-subtitle {{ color: var(--muted); font-size: 12px; margin-bottom: 6px; }}
    .outer-cell-headline {{ font-size: 24px; font-weight: 800; line-height: 1; margin-bottom: 4px; }}
    .benchmark-skipped .outer-cell-headline {{ color: #cbd5e1; }}
    .mini-grid {{
      display: grid;
      grid-template-columns: repeat(10, minmax(0, 1fr));
      gap: 2px;
      margin-top: 6px;
    }}
    .mini-week {{ aspect-ratio: 1 / 1; border-radius: 2px; background: var(--na); }}
    .mini-week-empty {{ background: transparent; }}
    .week-exact {{ background: var(--exact); }}
    .week-tight {{ background: var(--tight); }}
    .week-miss {{ background: var(--miss); }}
    .week-unavailable {{ background: var(--na); }}
  </style>
</head>
<body>
  <section class='header-card'>
    <h1>solver6 optimality frontier report</h1>
    <p class='meta'>Outer cells summarize week-sweep lower-bound attainment. Each cell embeds its own tiny week matrix, keeping the week axis visible instead of collapsing it into a single scalar.</p>
    <div class='config-grid'>
      <div class='config-item'><span class='label'>week cap</span><span class='value'>{config['week_cap']}</span></div>
      <div class='config-item'><span class='label'>max people to run</span><span class='value'>{config['max_people_to_run']}</span></div>
      <div class='config-item'><span class='label'>effective seed</span><span class='value'>{config['effective_seed']}</span></div>
      <div class='config-item'><span class='label'>active penalty model</span><span class='value'>{html.escape(config['active_penalty_model'])}</span></div>
      <div class='config-item'><span class='label'>max iterations</span><span class='value'>{config['max_iterations']}</span></div>
      <div class='config-item'><span class='label'>time limit</span><span class='value'>{config['time_limit_seconds']}s</span></div>
    </div>
  </section>
  <section class='legend-card'>
    <h2>Legend</h2>
    <div>
      <span class='legend-chip'><span class='legend-swatch' style='background:var(--exact)'></span>exact zero-repeat week</span>
      <span class='legend-chip'><span class='legend-swatch' style='background:var(--tight)'></span>lower-bound-tight week</span>
      <span class='legend-chip'><span class='legend-swatch' style='background:var(--miss)'></span>miss</span>
      <span class='legend-chip'><span class='legend-swatch' style='background:var(--na)'></span>unsupported / timeout / error / not-run</span>
    </div>
  </section>
  <div class='tab-row'>
    <button class='tab-button {linear_active}' data-layer-target='linear'>{html.escape(LAYER_CONFIG['linear']['label'])}</button>
    <button class='tab-button {squared_active}' data-layer-target='squared'>{html.escape(LAYER_CONFIG['squared']['label'])}</button>
  </div>
  <div id='report-root'>
    {render_layer(artifact, 'linear')}
    {render_layer(artifact, 'squared')}
  </div>
  <script>
    const tabs = document.querySelectorAll('.tab-button');
    const panels = document.querySelectorAll('.layer-panel');
    function setLayer(layer) {{
      tabs.forEach(btn => btn.classList.toggle('is-active', btn.dataset.layerTarget === layer));
      panels.forEach(panel => panel.classList.toggle('is-active', panel.dataset.layer === layer));
    }}
    tabs.forEach(btn => btn.addEventListener('click', () => setLayer(btn.dataset.layerTarget)));
    setLayer('linear');
  </script>
</body>
</html>
"""


def main():
    parser = argparse.ArgumentParser(description="Render the solver6 frontier matrix HTML report")
    parser.add_argument("artifact_json", type=Path)
    parser.add_argument("output_html", type=Path)
    args = parser.parse_args()

    artifact = json.loads(args.artifact_json.read_text())
    args.output_html.write_text(render_html(artifact))


if __name__ == "__main__":
    main()
