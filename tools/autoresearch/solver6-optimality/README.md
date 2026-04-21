# solver6 optimality frontier tooling

This directory contains the current end-to-end benchmark/report pipeline for the
solver6 optimality-frontier matrix.

## Files

- `autoresearch.sh`
  - runs the benchmark artifact generator and then renders the HTML report
- `generate_matrix_report.py`
  - converts the JSON artifact into the nested frontier matrix HTML

## Usage

```bash
./tools/autoresearch/solver6-optimality/autoresearch.sh \
  --week-cap 100 \
  --max-people 36 \
  --time-limit 1
```

## Artifacts

The wrapper writes:

- `autoresearch.last_run_metrics.json`
- `autoresearch.last_run_report.html`

## Notes

- the report defaults to linear lower-bound attainment as the primary layer
- a parallel squared-lower-bound layer is rendered beside it
- over-budget cells remain explicit gray `not-run` cells rather than silently disappearing
- clicking a rendered outer cell opens the per-week detail analytics view
