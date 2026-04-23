from ortools.sat.python import cp_model
import itertools
import sys

forced = tuple(int(x) for x in sys.argv[1].split(','))
forced = tuple(sorted(forced))
limit = float(sys.argv[2]) if len(sys.argv) > 2 else 45.0

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

forced_index = None
for i, (combo, _) in enumerate(blocks):
    if combo == forced:
        forced_index = i
        break
if forced_index is None:
    print('forced block not found', forced)
    sys.exit(2)

model = cp_model.CpModel()
X = [[model.NewBoolVar(f'x_{w}_{i}') for i in range(len(blocks))] for w in range(2)]
for w in range(2):
    for g in range(40):
        model.Add(sum(X[w][i] for i in point_to_blocks[g]) == 2)
for oid in range(60):
    model.Add(sum(X[w][i] for w in range(2) for i in pair_to_blocks[oid]) == 4)
model.Add(X[0][forced_index] == 1)

# Strengthen the same week-0 infinity symmetry break used in the unparameterized search.
# We force the chosen starter to be the lexicographically first selected block among
# those containing both infinity and the canonical ordinary group 0.
if 0 in forced and 39 in forced:
    inf_related = [i for i, (combo, _) in enumerate(blocks) if 0 in combo and 39 in combo]
    for i in inf_related:
        if i < forced_index:
            model.Add(X[0][i] == 0)

solver = cp_model.CpSolver()
solver.parameters.max_time_in_seconds = limit
solver.parameters.num_search_workers = 8
res = solver.Solve(model)
print('forced', forced, [Gs[x] for x in forced], 'status', solver.StatusName(res), 'wall', round(solver.WallTime(), 3))
if res in (cp_model.OPTIMAL, cp_model.FEASIBLE):
    for w in range(2):
        chosen = [combo for i, (combo, _) in enumerate(blocks) if solver.Value(X[w][i])]
        print('week', w, 'count', len(chosen))
        for combo in chosen:
            print(combo)
