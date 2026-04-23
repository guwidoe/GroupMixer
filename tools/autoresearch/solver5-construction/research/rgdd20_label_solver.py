import itertools
import json
import sys
from collections import defaultdict
from ortools.sat.python import cp_model

# Input JSON format:
# {
#   "starter_weeks": [
#      [[g1,g2,g3,g4], ... 20 blocks ...],
#      [[...], ...]
#   ]
# }
# groups are integers 0..39 where 39 is infinity and 0..38 are Z13 x Z3 in row-major order.

with open(sys.argv[1], 'r', encoding='utf-8') as f:
    data = json.load(f)
starter_weeks = data['starter_weeks']
assert len(starter_weeks) == 2
assert all(len(week) == 20 for week in starter_weeks)

Gs = []
for y in range(3):
    for x in range(13):
        Gs.append((x, y))
Gs.append((0, 3))
idx = {g: i for i, g in enumerate(Gs)}


def shift_group(gid, t):
    x, y = Gs[gid]
    if y == 3:
        return gid
    return idx[((x + t) % 13, y)]


weeks = []
for starter in starter_weeks:
    for t in range(13):
        week = []
        for block in starter:
            shifted = sorted(shift_group(g, t) for g in block)
            week.append(tuple(shifted))
        weeks.append(week)

# validate projected schedule shape
for w, week in enumerate(weeks):
    deg = [0] * 40
    for block in week:
        assert len(block) == 4 and len(set(block)) == 4
        for g in block:
            deg[g] += 1
    assert all(d == 2 for d in deg), (w, deg)

pair_occurrences = defaultdict(list)
for w, week in enumerate(weeks):
    for b, block in enumerate(week):
        for g1, g2 in itertools.combinations(block, 2):
            pair_occurrences[(g1, g2)].append((w, b))
assert all(len(v) == 4 for v in pair_occurrences.values())

# For each group occurrence in a week, choose label 0/1 for the group point used in that block.
# Since each group appears twice per week, require one 0 and one 1.
model = cp_model.CpModel()
use = {}  # (w,b,g) -> bool meaning this block uses label 1 for group g
week_group_occ = defaultdict(list)
for w, week in enumerate(weeks):
    for b, block in enumerate(week):
        for g in block:
            v = model.NewBoolVar(f'use_{w}_{b}_{g}')
            use[(w, b, g)] = v
            week_group_occ[(w, g)].append(v)
for (w, g), occs in week_group_occ.items():
    assert len(occs) == 2
    model.Add(sum(occs) == 1)

for pair, occs in pair_occurrences.items():
    vals = []
    g1, g2 = pair
    for i, (w, b) in enumerate(occs):
        x = use[(w, b, g1)]
        y = use[(w, b, g2)]
        v = model.NewIntVar(0, 3, f'pair_{g1}_{g2}_{i}')
        model.AddAllowedAssignments([x, y, v], [(0, 0, 0), (0, 1, 1), (1, 0, 2), (1, 1, 3)])
        vals.append(v)
    model.AddAllDifferent(vals)

solver = cp_model.CpSolver()
solver.parameters.max_time_in_seconds = float(sys.argv[2]) if len(sys.argv) > 2 else 300.0
solver.parameters.num_search_workers = 8
res = solver.Solve(model)
print('status', solver.StatusName(res), 'wall', round(solver.WallTime(), 3))
if res in (cp_model.OPTIMAL, cp_model.FEASIBLE):
    labelled = []
    for w, week in enumerate(weeks):
        out_week = []
        for b, block in enumerate(week):
            pts = []
            for g in block:
                lbl = solver.Value(use[(w, b, g)])
                pts.append((g, lbl))
            out_week.append(pts)
        labelled.append(out_week)
    print(json.dumps({'weeks': labelled}))
