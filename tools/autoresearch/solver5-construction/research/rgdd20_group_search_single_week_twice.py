from ortools.sat.python import cp_model
import itertools
import json
import sys
import time

forced = [tuple(sorted(int(x) for x in arg.split(','))) for arg in sys.argv[1].split(';')] if len(sys.argv) > 1 and sys.argv[1] else []
limit = float(sys.argv[2]) if len(sys.argv) > 2 else 120.0

Gs = []
for y in range(3):
    for x in range(13):
        Gs.append((x, y))
Gs.append((0, 3))
idx = {g: i for i, g in enumerate(Gs)}


def shift(g, t):
    x, y = g
    if y == 3:
        return g
    return ((x + t) % 13, y)


pair_orbit = {}
for a, b in itertools.combinations(range(40), 2):
    orb = []
    for t in range(13):
        aa = idx[shift(Gs[a], t)]
        bb = idx[shift(Gs[b], t)]
        if aa > bb:
            aa, bb = bb, aa
        orb.append((aa, bb))
    pair_orbit.setdefault(tuple(sorted(set(orb))), len(pair_orbit))

blocks = []
point_to_blocks = [[] for _ in range(40)]
pair_to_blocks = [[] for _ in range(60)]
for combo in itertools.combinations(range(40), 4):
    oids = []
    for a, b in itertools.combinations(combo, 2):
        orb = []
        for t in range(13):
            aa = idx[shift(Gs[a], t)]
            bb = idx[shift(Gs[b], t)]
            if aa > bb:
                aa, bb = bb, aa
            orb.append((aa, bb))
        oids.append(pair_orbit[tuple(sorted(set(orb)))])
    oids = tuple(sorted(set(oids)))
    bi = len(blocks)
    blocks.append((combo, oids))
    for g in combo:
        point_to_blocks[g].append(bi)
    for oid in oids:
        pair_to_blocks[oid].append(bi)

model = cp_model.CpModel()
X = [model.NewBoolVar(f'x_{i}') for i in range(len(blocks))]
for g in range(40):
    model.Add(sum(X[i] for i in point_to_blocks[g]) == 2)
for oid in range(60):
    model.Add(sum(X[i] for i in pair_to_blocks[oid]) == 2)

forced_indices = []
for combo_wanted in forced:
    found = None
    for i, (combo, _) in enumerate(blocks):
        if combo == combo_wanted:
            found = i
            break
    if found is None:
        raise SystemExit(f'forced block not found: {combo_wanted}')
    forced_indices.append(found)
    model.Add(X[found] == 1)

# Symmetry break: require some selected infinity block containing ordinary group 0,
# and if one is forced, make it lexicographically first among such blocks.
inf_related = [i for i, (combo, _) in enumerate(blocks) if 0 in combo and 39 in combo]
model.Add(sum(X[i] for i in inf_related) >= 1)
if forced_indices:
    pivot = min(forced_indices)
    for i in inf_related:
        if i < pivot:
            model.Add(X[i] == 0)
else:
    model.Add(X[inf_related[0]] == 1)

solver = cp_model.CpSolver()
solver.parameters.max_time_in_seconds = limit
solver.parameters.num_search_workers = 8
start = time.time()
res = solver.Solve(model)
print('forced', forced, [[Gs[x] for x in combo] for combo in forced], 'status', solver.StatusName(res), 'wall', round(solver.WallTime(), 3), 'elapsed', round(time.time()-start, 3))
if res in (cp_model.OPTIMAL, cp_model.FEASIBLE):
    chosen = [combo for i, (combo, _) in enumerate(blocks) if solver.Value(X[i])]
    print('week_count', len(chosen))
    for combo in chosen:
        print(combo)
    print(json.dumps({'starter_weeks': [chosen, chosen]}))
