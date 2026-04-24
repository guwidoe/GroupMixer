#!/usr/bin/env python3
import argparse
import html
import json
import math
from pathlib import Path


LAYER_CONFIG = {
    "overview": {
        "label": "Dual objective overview",
        "summary_key": "linear_summary",
        "status_key": "linear_status",
        "description": "Each tiny square is split diagonally: upper-left is the linear-objective run, lower-right is the selected squared-objective result. The center glyph shows schedule relationship (= same/tight, → squared run improved, ! linear cost/failure).",
    },
    "linear": {
        "label": "Linear lower-bound attainment",
        "summary_key": "linear_summary",
        "status_key": "linear_status",
        "description": "Dark green = exact zero-repeat, green = lower-bound tight with nonzero repeats, red = miss, gray = unsupported / timeout / error / not-run.",
    },
    "squared": {
        "label": "Squared instance lower-bound attainment",
        "summary_key": "squared_summary",
        "status_key": "squared_status",
        "description": "Same visual grammar, but success is judged against the instance-level squared-repeat lower bound. Conditional repeat-concentration gaps remain visible in details.",
    },
    "agreement": {
        "label": "Linear = squared schedule agreement",
        "summary_key": "objective_agreement_summary",
        "status_key": "objective_agreement_status",
        "description": "Highlights weeks where the canonical linear-objective schedule is also the selected squared-objective schedule and both objective lower bounds are tight.",
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
        "same_schedule_both_tight": "week-tight",
        "same_schedule": "week-same",
        "different_schedule_same_scores": "week-same",
        "squared_improves_with_no_linear_loss": "week-improve",
        "squared_improves_with_linear_loss": "week-tradeoff",
        "squared_run_did_not_improve": "week-miss",
        "squared_run_failed": "week-unavailable",
    }.get(status, "week-unavailable")


def status_color(status: str) -> str:
    return {
        "exact": "var(--exact)",
        "lower_bound_tight": "var(--tight)",
        "miss": "var(--miss)",
        "unsupported": "var(--na)",
        "timeout": "var(--na)",
        "error": "var(--na)",
        "not_run": "var(--na)",
    }.get(status, "var(--na)")


def agreement_glyph(status: str) -> str:
    return {
        "same_schedule_both_tight": "=",
        "same_schedule": "=",
        "different_schedule_same_scores": "≈",
        "squared_improves_with_no_linear_loss": "→",
        "squared_improves_with_linear_loss": "!",
        "squared_run_did_not_improve": "·",
        "squared_run_failed": "!",
        "not_run": "",
    }.get(status, "·")


def build_cell_map(cells):
    return {(cell["g"], cell["p"]): cell for cell in cells}


def empty_summary():
    return {
        "contiguous_frontier": 0,
        "best_observed_hit": 0,
        "exact_week_count": 0,
        "lower_bound_tight_week_count": 0,
        "first_miss_week": None,
        "headline_label": "—",
    }


def render_week_grid(cell, layer_key, week_cap):
    if layer_key == "overview":
        return render_dual_objective_week_grid(cell, week_cap)
    status_key = LAYER_CONFIG[layer_key]["status_key"]
    rows = max(1, math.ceil(week_cap / 10))
    total_slots = rows * 10
    parts = [f"<div class='mini-grid mini-grid-rows-{rows}'>"]
    for index in range(total_slots):
        if index < len(cell["week_results"]):
            week = cell["week_results"][index]
            status = week.get(status_key, "not_run")
            tooltip = f"week {week['week']}: {status.replace('_', ' ')}"
            metrics = week.get("final_metrics")
            if layer_key == "squared" and week.get("selected_squared_result"):
                metrics = week["selected_squared_result"]["final_metrics"]
                tooltip += f" | source={week['selected_squared_result']['source']}"
            if layer_key == "agreement" and week.get("objective_relationship"):
                rel = week["objective_relationship"]
                tooltip += f" | same_schedule={rel['same_schedule']}"
                if rel.get("squared_run_improved_squared_gap_by") is not None:
                    tooltip += f" | Δsquared={rel['squared_run_improved_squared_gap_by']}"
                if rel.get("squared_run_linear_gap_delta") is not None:
                    tooltip += f" | Δlinear={rel['squared_run_linear_gap_delta']}"
            if metrics:
                tooltip += (
                    f" | linear gap={metrics['linear_repeat_lower_bound_gap']}"
                    f" | squared instance gap={metrics.get('squared_instance_lower_bound_gap', metrics['squared_repeat_lower_bound_gap'])}"
                    f" | squared concentration gap={metrics.get('squared_concentration_lower_bound_gap', metrics['squared_repeat_lower_bound_gap'])}"
                )
            parts.append(
                f"<span class='mini-week {status_class(status)}' title='{html.escape(tooltip)}'></span>"
            )
        else:
            parts.append("<span class='mini-week mini-week-empty'></span>")
    parts.append("</div>")
    return "".join(parts)


def render_dual_objective_week_grid(cell, week_cap):
    rows = max(1, math.ceil(week_cap / 10))
    total_slots = rows * 10
    parts = [f"<div class='mini-grid mini-grid-rows-{rows} dual-mini-grid'>"]
    for index in range(total_slots):
        if index < len(cell["week_results"]):
            week = cell["week_results"][index]
            linear_status = week.get("linear_status", "not_run")
            squared_status = week.get("squared_status", "not_run")
            agreement = week.get("objective_agreement_status", "not_run")
            tooltip = (
                f"week {week['week']}: linear={linear_status.replace('_', ' ')}"
                f" | squared={squared_status.replace('_', ' ')}"
                f" | relation={agreement.replace('_', ' ')}"
            )
            if week.get("objective_relationship"):
                rel = week["objective_relationship"]
                tooltip += f" | same_schedule={rel['same_schedule']}"
                if rel.get("squared_run_improved_squared_gap_by") is not None:
                    tooltip += f" | Δsquared={rel['squared_run_improved_squared_gap_by']}"
                if rel.get("squared_run_linear_gap_delta") is not None:
                    tooltip += f" | Δlinear={rel['squared_run_linear_gap_delta']}"
            selected = week.get("selected_squared_result") or {}
            metrics = selected.get("final_metrics") or week.get("final_metrics")
            if metrics:
                tooltip += (
                    f" | linear gap={metrics['linear_repeat_lower_bound_gap']}"
                    f" | squared instance gap={metrics.get('squared_instance_lower_bound_gap', metrics['squared_repeat_lower_bound_gap'])}"
                )
            parts.append(
                "<span class='dual-mini-week' "
                f"style='--linear-color:{status_color(linear_status)};--squared-color:{status_color(squared_status)}' "
                f"title='{html.escape(tooltip)}'><span class='dual-glyph'>{html.escape(agreement_glyph(agreement))}</span></span>"
            )
        else:
            parts.append("<span class='mini-week mini-week-empty'></span>")
    parts.append("</div>")
    return "".join(parts)


def render_outer_cell(cell, layer_key, week_cap, matrix_index, dense=False):
    summary = cell.get(LAYER_CONFIG[layer_key]["summary_key"], empty_summary())
    if layer_key == "overview":
        linear_summary = cell.get("linear_summary", empty_summary())
        squared_summary = cell.get("squared_summary", empty_summary())
        agreement_summary = cell.get("objective_agreement_summary", empty_summary())
        headline = (
            f"L{linear_summary['headline_label']} "
            f"S{squared_summary['headline_label']} "
            f"≡{agreement_summary['headline_label']}"
        )
        title = (
            f"{cell['g']}-{cell['p']} | linear={linear_summary['headline_label']}"
            f" | squared={squared_summary['headline_label']}"
            f" | same_schedule={agreement_summary['headline_label']}"
        )
    else:
        headline = summary["headline_label"]
        title = (
            f"{cell['g']}-{cell['p']} | frontier={summary['contiguous_frontier']}"
            f" | best_observed={summary['best_observed_hit']}"
            f" | exact_weeks={summary['exact_week_count']}"
            f" | tight_weeks={summary['lower_bound_tight_week_count']}"
        )
    if cell.get("skip_reason"):
        title += f" | {cell['skip_reason']}"
    return (
        f"<button class='outer-cell{' outer-cell-dense' if dense else ''}{' benchmark-skipped' if not cell['benchmark_eligible'] else ''}'"
        f" title='{html.escape(title)}'"
        f" data-matrix-index='{matrix_index}' data-g='{cell['g']}' data-p='{cell['p']}'>"
        f"<div class='outer-cell-headline{' outer-cell-headline-overview' if layer_key == 'overview' else ''}'>{html.escape(headline)}</div>"
        f"<div class='outer-cell-subtitle'>{cell['g']}-{cell['p']}</div>"
        f"{render_week_grid(cell, layer_key, week_cap)}"
        "</button>"
    )


def render_matrix_view(matrix, layer_key, week_cap, matrix_index):
    bounds = matrix["bounds"]
    width = bounds["p_max"] - bounds["p_min"] + 1
    dense = width > 14
    cell_map = build_cell_map(matrix["cells"])
    parts = [
        f"<section class='matrix-view{' matrix-view-dense' if dense else ''}'>",
        f"<h2>{html.escape(matrix['title'])}</h2>",
        f"<p class='meta'>{html.escape(matrix['subtitle'])}</p>",
        "<div class='matrix-scroll'>",
        f"<table class='outer-matrix{' outer-matrix-dense' if dense else ''}'><thead><tr><th>g\\p</th>",
    ]
    for p in range(bounds["p_min"], bounds["p_max"] + 1):
        parts.append(f"<th>{p}</th>")
    parts.append("</tr></thead><tbody>")
    for g in range(bounds["g_min"], bounds["g_max"] + 1):
        parts.append(f"<tr><th>{g}</th>")
        for p in range(bounds["p_min"], bounds["p_max"] + 1):
            cell = cell_map[(g, p)]
            parts.append(f"<td>{render_outer_cell(cell, layer_key, week_cap, matrix_index, dense)}</td>")
        parts.append("</tr>")
    parts.append("</tbody></table></div></section>")
    return "".join(parts)


def render_layer(artifact, layer_key):
    week_cap = artifact["config"]["week_cap"]
    config = LAYER_CONFIG[layer_key]
    parts = [
        f"<section class='layer-panel' data-layer='{layer_key}'>",
        f"<p class='meta'>{html.escape(config['description'])}</p>",
    ]
    for idx, matrix in enumerate(artifact["matrices"]):
        parts.append(render_matrix_view(matrix, layer_key, week_cap, idx))
    parts.append("</section>")
    return "".join(parts)


def render_html(artifact):
    config = artifact["config"]
    embedded_json = json.dumps(artifact)
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
      --panel-3: #0b1220;
      --text: #e5e7eb;
      --muted: #94a3b8;
      --line: #334155;
      --exact: #166534;
      --tight: #22c55e;
      --miss: #ef4444;
      --tradeoff: #eab308;
      --improve: #38bdf8;
      --same: #a3e635;
      --na: #64748b;
      --na2: #475569;
      --accent: #38bdf8;
    }}
    * {{ box-sizing: border-box; }}
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
    .config-grid, .summary-grid {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 10px;
      margin-top: 12px;
    }}
    .config-item, .summary-card {{
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(148,163,184,0.2);
      border-radius: 10px;
      padding: 10px 12px;
    }}
    .config-item .label, .summary-card .label {{ display:block; color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }}
    .config-item .value, .summary-card .value {{ font-weight: 600; }}
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
    .matrix-scroll {{ width: 100%; overflow: auto; overscroll-behavior: contain; contain: layout paint; }}
    table.outer-matrix {{ border-collapse: collapse; width: 100%; table-layout: fixed; margin-bottom: 28px; }}
    table.outer-matrix th, table.outer-matrix td {{ border: 1px solid var(--line); padding: 6px; text-align: center; vertical-align: top; }}
    table.outer-matrix-dense {{ min-width: 1320px; }}
    table.outer-matrix-dense th, table.outer-matrix-dense td {{ padding: 3px; }}
    table.outer-matrix th {{ color: var(--muted); background: rgba(255,255,255,0.02); font-weight: 600; }}
    .outer-cell {{
      width: 100%;
      min-height: 112px;
      background: var(--panel);
      border: 1px solid rgba(148,163,184,0.22);
      border-radius: 12px;
      color: var(--text);
      padding: 8px;
      cursor: pointer;
      transition: transform .08s ease, border-color .08s ease;
      overflow: hidden;
    }}
    .outer-cell-dense {{ min-height: 76px; padding: 4px; border-radius: 9px; }}
    .outer-cell:hover {{ border-color: rgba(56,189,248,0.65); transform: translateY(-1px); }}
    .outer-cell-subtitle {{ color: var(--muted); font-size: 12px; margin-bottom: 6px; }}
    .outer-cell-dense .outer-cell-subtitle {{ font-size: 10px; margin-bottom: 3px; }}
    .outer-cell-headline {{ font-size: 24px; font-weight: 800; line-height: 1; margin-bottom: 4px; white-space: nowrap; }}
    .outer-cell-headline-overview {{ font-size: 12px; line-height: 1.1; white-space: nowrap; letter-spacing: -0.04em; }}
    .outer-cell-dense .outer-cell-headline {{ font-size: 16px; margin-bottom: 2px; }}
    .outer-cell-dense .outer-cell-headline-overview {{ font-size: 9px; }}
    .benchmark-skipped .outer-cell-headline {{ color: #cbd5e1; }}
    .mini-grid, .large-grid {{
      display: grid;
      grid-template-columns: repeat(10, minmax(0, 1fr));
      gap: 2px;
      margin-top: 6px;
    }}
    .outer-cell-dense .mini-grid {{ gap: 1px; margin-top: 3px; }}
    .mini-week {{ aspect-ratio: 1 / 1; border-radius: 2px; background: var(--na); }}
    .mini-week-empty {{ background: transparent; }}
    .week-exact {{ background: var(--exact); }}
    .week-tight {{ background: var(--tight); }}
    .week-miss {{ background: var(--miss); }}
    .week-tradeoff {{ background: var(--tradeoff); }}
    .week-improve {{ background: var(--improve); }}
    .week-same {{ background: var(--same); }}
    .week-unavailable {{ background: var(--na); }}
    .dual-mini-week, .dual-large-week {{
      aspect-ratio: 1 / 1;
      border-radius: 3px;
      position: relative;
      display: block;
      background: linear-gradient(135deg, var(--linear-color) 0 48%, rgba(15,23,42,0.9) 48% 52%, var(--squared-color) 52% 100%);
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.16);
      overflow: hidden;
    }}
    .dual-large-week {{ border-radius: 6px; }}
    .dual-glyph {{
      position: absolute;
      inset: 50% auto auto 50%;
      transform: translate(-50%, -50%);
      min-width: 11px;
      height: 11px;
      border-radius: 999px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: rgba(2,6,23,0.78);
      color: white;
      font-size: 8px;
      font-weight: 900;
      line-height: 1;
      text-shadow: 0 1px 2px rgba(0,0,0,0.6);
    }}
    .outer-cell-dense .dual-glyph {{ min-width: 9px; height: 9px; font-size: 7px; }}
    .dual-large-week .dual-glyph {{ min-width: 20px; height: 20px; font-size: 13px; }}
    .modal-backdrop {{
      position: fixed;
      inset: 0;
      background: rgba(2,6,23,0.78);
      display: none;
      align-items: center;
      justify-content: center;
      padding: 24px;
      z-index: 1000;
    }}
    .modal-backdrop.is-open {{ display: flex; }}
    .detail-modal {{
      width: min(1400px, 100%);
      max-height: 92vh;
      overflow: auto;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 18px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.45);
    }}
    .detail-header {{ display:flex; justify-content:space-between; gap:12px; align-items:flex-start; margin-bottom: 14px; }}
    .close-button {{
      border: 1px solid var(--line);
      background: var(--panel-2);
      color: var(--text);
      border-radius: 10px;
      padding: 8px 12px;
      cursor: pointer;
    }}
    .detail-layout {{ display:grid; grid-template-columns: minmax(280px, 360px) minmax(0, 1fr); gap: 18px; }}
    .detail-card {{ background: var(--panel-3); border: 1px solid var(--line); border-radius: 14px; padding: 14px; margin-bottom: 14px; }}
    .large-week {{ aspect-ratio: 1 / 1; border-radius: 6px; position: relative; min-width: 0; }}
    .large-week-label {{ position:absolute; inset:auto 4px 4px auto; font-size: 10px; color: rgba(255,255,255,0.85); font-weight: 700; }}
    .large-week.empty .large-week-label {{ display:none; }}
    .detail-table-wrap {{ overflow: auto; max-height: 62vh; }}
    table.detail-table {{ border-collapse: collapse; width: 100%; min-width: 980px; }}
    table.detail-table th, table.detail-table td {{ border: 1px solid var(--line); padding: 8px 10px; text-align: left; vertical-align: top; }}
    table.detail-table th {{ background: rgba(255,255,255,0.03); position: sticky; top: 0; }}
    .pill {{ display:inline-block; padding: 2px 8px; border-radius: 999px; font-size: 12px; border: 1px solid rgba(148,163,184,0.25); }}
    .pill-exact {{ background: rgba(22,101,52,0.35); }}
    .pill-tight {{ background: rgba(34,197,94,0.22); }}
    .pill-miss {{ background: rgba(239,68,68,0.18); }}
    .pill-na {{ background: rgba(100,116,139,0.25); }}
    .mono {{ font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }}
    .contribution-note {{ color: var(--muted); font-size: 12px; line-height: 1.4; }}
    @media (max-width: 980px) {{
      .detail-layout {{ grid-template-columns: 1fr; }}
    }}
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
    <button class='tab-button is-active' data-layer-target='overview'>{html.escape(LAYER_CONFIG['overview']['label'])}</button>
    <button class='tab-button' data-layer-target='linear'>{html.escape(LAYER_CONFIG['linear']['label'])}</button>
    <button class='tab-button' data-layer-target='squared'>{html.escape(LAYER_CONFIG['squared']['label'])}</button>
    <button class='tab-button' data-layer-target='agreement'>{html.escape(LAYER_CONFIG['agreement']['label'])}</button>
  </div>
  <div id='report-root'>
    {render_layer(artifact, 'overview')}
    {render_layer(artifact, 'linear')}
    {render_layer(artifact, 'squared')}
    {render_layer(artifact, 'agreement')}
  </div>
  <div class='modal-backdrop' id='detail-backdrop'>
    <div class='detail-modal'>
      <div class='detail-header'>
        <div>
          <h2 id='detail-title'>cell detail</h2>
          <p class='meta' id='detail-subtitle'></p>
        </div>
        <button class='close-button' id='detail-close'>Close</button>
      </div>
      <div id='detail-body'></div>
    </div>
  </div>
  <script>
    const ARTIFACT = {embedded_json};
    const LAYER_CONFIG = {json.dumps(LAYER_CONFIG)};
    const tabs = document.querySelectorAll('.tab-button');
    const panels = document.querySelectorAll('.layer-panel');
    const backdrop = document.getElementById('detail-backdrop');
    const detailTitle = document.getElementById('detail-title');
    const detailSubtitle = document.getElementById('detail-subtitle');
    const detailBody = document.getElementById('detail-body');
    let currentLayer = 'overview';

    function setLayer(layer) {{
      currentLayer = layer;
      tabs.forEach(btn => btn.classList.toggle('is-active', btn.dataset.layerTarget === layer));
      panels.forEach(panel => panel.classList.toggle('is-active', panel.dataset.layer === layer));
    }}

    function statusClass(status) {{
      return {{
        exact: 'week-exact',
        lower_bound_tight: 'week-tight',
        miss: 'week-miss',
        unsupported: 'week-unavailable',
        timeout: 'week-unavailable',
        error: 'week-unavailable',
        not_run: 'week-unavailable',
        same_schedule_both_tight: 'week-tight',
        same_schedule: 'week-same',
        different_schedule_same_scores: 'week-same',
        squared_improves_with_no_linear_loss: 'week-improve',
        squared_improves_with_linear_loss: 'week-tradeoff',
        squared_run_did_not_improve: 'week-miss',
        squared_run_failed: 'week-unavailable',
      }}[status] || 'week-unavailable';
    }}

    function statusColor(status) {{
      return {{
        exact: 'var(--exact)',
        lower_bound_tight: 'var(--tight)',
        miss: 'var(--miss)',
        unsupported: 'var(--na)',
        timeout: 'var(--na)',
        error: 'var(--na)',
        not_run: 'var(--na)',
      }}[status] || 'var(--na)';
    }}

    function agreementGlyph(status) {{
      return {{
        same_schedule_both_tight: '=',
        same_schedule: '=',
        different_schedule_same_scores: '≈',
        squared_improves_with_no_linear_loss: '→',
        squared_improves_with_linear_loss: '!',
        squared_run_did_not_improve: '·',
        squared_run_failed: '!',
        not_run: '',
      }}[status] || '·';
    }}

    function statusPill(status) {{
      const label = status.replace(/_/g, ' ');
      const cls = status === 'exact'
        ? 'pill pill-exact'
        : status === 'lower_bound_tight'
        ? 'pill pill-tight'
        : status === 'miss'
        ? 'pill pill-miss'
        : status === 'same_schedule_both_tight'
        ? 'pill pill-tight'
        : status === 'squared_improves_with_no_linear_loss'
        ? 'pill pill-exact'
        : 'pill pill-na';
      return `<span class="${{cls}}">${{label}}</span>`;
    }}

    function contributionNarrative(week) {{
      if (!week.seed_metrics || !week.final_metrics) {{
        return week.error_message || 'no benchmark data';
      }}
      const seedLinearGap = week.seed_metrics.linear_repeat_lower_bound_gap;
      const finalLinearGap = week.final_metrics.linear_repeat_lower_bound_gap;
      const seedSquaredGap = week.seed_metrics.squared_instance_lower_bound_gap ?? week.seed_metrics.squared_repeat_lower_bound_gap;
      const finalSquaredGap = week.final_metrics.squared_instance_lower_bound_gap ?? week.final_metrics.squared_repeat_lower_bound_gap;
      if (seedLinearGap === 0 && finalLinearGap === 0 && seedSquaredGap === 0 && finalSquaredGap === 0) {{
        return 'seed already tight; search only needed to confirm / preserve the optimum';
      }}
      if (seedLinearGap === 0 && finalLinearGap === 0) {{
        return 'seed already hit the linear bound before local search';
      }}
      if (finalLinearGap === 0 && seedLinearGap > 0) {{
        return 'local search closed the remaining linear lower-bound gap';
      }}
      if (finalLinearGap < seedLinearGap || finalSquaredGap < seedSquaredGap) {{
        return 'local search improved the seed but did not close every gap';
      }}
      if (finalLinearGap === seedLinearGap && finalSquaredGap === seedSquaredGap) {{
        return 'search failed to improve the seed materially';
      }}
      return 'search changed the incumbent, but the final result is not better on every tracked gap';
    }}

    function emptySummary() {{
      return {{ contiguous_frontier: 0, best_observed_hit: 0, exact_week_count: 0, lower_bound_tight_week_count: 0, first_miss_week: null, headline_label: '—' }};
    }}

    function renderLargeGrid(cell, layer) {{
      const statusKey = LAYER_CONFIG[layer].status_key;
      const weekCap = ARTIFACT.config.week_cap;
      const rows = Math.max(1, Math.ceil(weekCap / 10));
      const totalSlots = rows * 10;
      let html = `<div class="large-grid">`;
      for (let index = 0; index < totalSlots; index += 1) {{
        if (index < cell.week_results.length) {{
          const week = cell.week_results[index];
          if (layer === 'overview') {{
            const linearStatus = week.linear_status || 'not_run';
            const squaredStatus = week.squared_status || 'not_run';
            const agreement = week.objective_agreement_status || 'not_run';
            html += `<div class="dual-large-week" style="--linear-color:${'{'}statusColor(linearStatus){'}'};--squared-color:${'{'}statusColor(squaredStatus){'}'}" title="week ${'{'}week.week{'}'}: linear=${'{'}linearStatus.replace(/_/g, ' '){'}'} | squared=${'{'}squaredStatus.replace(/_/g, ' '){'}'} | relation=${'{'}agreement.replace(/_/g, ' '){'}'}"><span class="dual-glyph">${'{'}agreementGlyph(agreement){'}'}</span><span class="large-week-label">${'{'}week.week{'}'}</span></div>`;
          }} else {{
            const status = week[statusKey] || 'not_run';
            html += `<div class="large-week ${'{'}statusClass(status){'}'}" title="week ${'{'}week.week{'}'}: ${'{'}status.replace(/_/g, ' '){'}'}"><span class="large-week-label">${'{'}week.week{'}'}</span></div>`;
          }}
        }} else {{
          html += `<div class="large-week empty week-unavailable"></div>`;
        }}
      }}
      html += `</div>`;
      return html;
    }}

    function metricText(value) {{
      return value == null ? '—' : String(value);
    }}

    function renderWeekRows(cell, layer) {{
      const statusKey = LAYER_CONFIG[layer].status_key;
      return cell.week_results.map(week => {{
        const rowStatus = week[statusKey] || 'not_run';
        const seed = week.seed_metrics;
        const finalMetrics = week.final_metrics;
        const linearRun = week.linear_run;
        const squaredRun = week.squared_run;
        const selectedSquared = week.selected_squared_result;
        const relation = week.objective_relationship;
        const squaredRunMetrics = squaredRun ? squaredRun.final_metrics : null;
        const selectedSquaredMetrics = selectedSquared ? selectedSquared.final_metrics : null;
        const candidates = (week.mixed_seed_candidates || []).map(candidate =>
          `${'{'}candidate.family{'}'}:${'{'}candidate.linear_repeat_lower_bound_gap{'}'}`
        ).join(', ');
        const search = week.search_telemetry
          ? (() => {{
              const scans = week.search_telemetry.neighborhood_scans;
              const avgScanMs = scans === 0 ? 0 : (week.search_telemetry.total_scan_micros / 1000) / scans;
              const maxScanMs = week.search_telemetry.max_scan_micros / 1000;
              return `it=${'{'}week.search_telemetry.iterations_completed{'}'}, best@${'{'}week.search_telemetry.best_iteration{'}'}, scans=${'{'}scans{'}'}, cand=${'{'}week.search_telemetry.candidates_evaluated{'}'}, avg_scan_ms=${'{'}avgScanMs.toFixed(2){'}'}, max_scan_ms=${'{'}maxScanMs.toFixed(2){'}'}`;
            }})()
          : '—';
        return `<tr>
          <td class="mono">${'{'}week.week{'}'}</td>
          <td>${'{'}statusPill(rowStatus){'}'}</td>
          <td>${'{'}week.seed_family || '—'{'}'}</td>
          <td class="mono">${'{'}seed ? seed.linear_repeat_lower_bound_gap : '—'{'}'}</td>
          <td class="mono">${'{'}finalMetrics ? finalMetrics.linear_repeat_lower_bound_gap : '—'{'}'}</td>
          <td class="mono">${'{'}seed ? (seed.squared_instance_lower_bound_gap ?? seed.squared_repeat_lower_bound_gap) : '—'{'}'}</td>
          <td class="mono">${'{'}finalMetrics ? (finalMetrics.squared_instance_lower_bound_gap ?? finalMetrics.squared_repeat_lower_bound_gap) : '—'{'}'}</td>
          <td class="mono">${'{'}seed ? (seed.squared_concentration_lower_bound_gap ?? seed.squared_repeat_lower_bound_gap) : '—'{'}'}</td>
          <td class="mono">${'{'}finalMetrics ? (finalMetrics.squared_concentration_lower_bound_gap ?? finalMetrics.squared_repeat_lower_bound_gap) : '—'{'}'}</td>
          <td class="mono">${'{'}selectedSquaredMetrics ? selectedSquaredMetrics.squared_instance_lower_bound_gap : '—'{'}'}</td>
          <td class="mono">${'{'}squaredRunMetrics ? squaredRunMetrics.squared_instance_lower_bound_gap : '—'{'}'}</td>
          <td class="mono">${'{'}squaredRunMetrics ? squaredRunMetrics.linear_repeat_lower_bound_gap : '—'{'}'}</td>
          <td>${'{'}selectedSquared ? selectedSquared.source.replace(/_/g, ' ') : '—'{'}'}</td>
          <td>${'{'}relation ? relation.agreement_status.replace(/_/g, ' ') : '—'{'}'}</td>
          <td class="mono">${'{'}relation && relation.squared_run_improved_squared_gap_by != null ? relation.squared_run_improved_squared_gap_by : '—'{'}'}</td>
          <td class="mono">${'{'}relation && relation.squared_run_linear_gap_delta != null ? relation.squared_run_linear_gap_delta : '—'{'}'}</td>
          <td class="mono">${'{'}week.runtime_seconds == null ? '—' : week.runtime_seconds.toFixed(3){'}'}</td>
          <td class="mono">${'{'}squaredRun && squaredRun.runtime_seconds != null ? squaredRun.runtime_seconds.toFixed(3) : '—'{'}'}</td>
          <td class="mono">${'{'}week.stop_reason || '—'{'}'}</td>
          <td class="contribution-note">${'{'}contributionNarrative(week){'}'}</td>
          <td class="contribution-note">${'{'}candidates || '—'{'}'}</td>
          <td class="contribution-note">${'{'}search{'}'}</td>
        </tr>`;
      }}).join('');
    }}

    function showDetail(matrixIndex, g, p) {{
      const matrix = ARTIFACT.matrices[Number(matrixIndex)];
      const cell = matrix.cells.find(candidate => candidate.g === Number(g) && candidate.p === Number(p));
      if (!cell) return;
      const summary = cell[LAYER_CONFIG[currentLayer].summary_key] || emptySummary();
      detailTitle.textContent = `${'{'}cell.g{'}'}-${'{'}cell.p{'}'} · ${'{'}LAYER_CONFIG[currentLayer].label{'}'}`;
      detailSubtitle.textContent = `people=${'{'}cell.num_people{'}'} · frontier=${'{'}summary.contiguous_frontier{'}'} · best observed=${'{'}summary.best_observed_hit{'}'} · first miss=${'{'}summary.first_miss_week ?? '—'{'}'}`;
      detailBody.innerHTML = `
        <div class="detail-layout">
          <div>
            <div class="detail-card">
              <h3>Week grid</h3>
              <p class="meta">Larger view of the inner week matrix for this outer cell.</p>
              ${'{'}renderLargeGrid(cell, currentLayer){'}'}
            </div>
            <div class="detail-card">
              <h3>Summary</h3>
              <div class="summary-grid">
                <div class="summary-card"><span class="label">frontier</span><span class="value">${'{'}summary.contiguous_frontier{'}'}</span></div>
                <div class="summary-card"><span class="label">best observed</span><span class="value">${'{'}summary.best_observed_hit{'}'}</span></div>
                <div class="summary-card"><span class="label">exact weeks</span><span class="value">${'{'}summary.exact_week_count{'}'}</span></div>
                <div class="summary-card"><span class="label">tight weeks</span><span class="value">${'{'}summary.lower_bound_tight_week_count{'}'}</span></div>
              </div>
            </div>
          </div>
          <div>
            <div class="detail-card">
              <h3>Per-week analytics</h3>
              <p class="meta">The table keeps seed-vs-search contributions explicit: whether the seed was already tight, whether local search closed the gap, and when it failed to move the frontier.</p>
              <div class="detail-table-wrap">
                <table class="detail-table">
                  <thead>
                    <tr>
                      <th>week</th>
                      <th>status</th>
                      <th>seed family</th>
                      <th>seed linear gap</th>
                      <th>final linear gap</th>
                      <th>seed squared instance gap</th>
                      <th>final squared instance gap</th>
                      <th>seed squared concentration gap</th>
                      <th>linear-run squared concentration gap</th>
                      <th>selected squared instance gap</th>
                      <th>squared-run squared instance gap</th>
                      <th>squared-run linear gap</th>
                      <th>squared source</th>
                      <th>relationship</th>
                      <th>Δ squared gap</th>
                      <th>Δ linear gap</th>
                      <th>linear runtime (s)</th>
                      <th>squared runtime (s)</th>
                      <th>stop reason</th>
                      <th>seed vs search</th>
                      <th>mixed candidates</th>
                      <th>search summary</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${'{'}renderWeekRows(cell, currentLayer){'}'}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>`;
      backdrop.classList.add('is-open');
    }}

    tabs.forEach(btn => btn.addEventListener('click', () => setLayer(btn.dataset.layerTarget)));
    document.querySelectorAll('.outer-cell').forEach(btn => {{
      btn.addEventListener('click', () => showDetail(btn.dataset.matrixIndex, btn.dataset.g, btn.dataset.p));
    }});
    document.getElementById('detail-close').addEventListener('click', () => backdrop.classList.remove('is-open'));
    backdrop.addEventListener('click', (event) => {{
      if (event.target === backdrop) backdrop.classList.remove('is-open');
    }});
    window.addEventListener('keydown', event => {{
      if (event.key === 'Escape') backdrop.classList.remove('is-open');
    }});
    setLayer('overview');
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
