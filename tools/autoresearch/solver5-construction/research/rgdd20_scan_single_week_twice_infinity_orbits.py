from ortools.sat.python import cp_model
import itertools
import json
import sys
import time

limit = float(sys.argv[1]) if len(sys.argv) > 1 else 15.0
out_path = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] != '-' else None
max_count = int(sys.argv[3]) if len(sys.argv) > 3 else None

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


def build_data():
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
    return blocks, point_to_blocks, pair_to_blocks


def orbit_representatives():
    units = list(range(1, 13))
    perms = list(set(itertools.permutations([0, 1, 2])))
    seen = set()
    reps = []
    for triple in itertools.product(range(13), repeat=3):
        orb = []
        for u in units:
            scaled = tuple((u * x) % 13 for x in triple)
            for perm in perms:
                orb.append((scaled[perm[0]], scaled[perm[1]], scaled[perm[2]]))
        rep = min(orb)
        if rep in seen:
            continue
        seen.update(orb)
        reps.append(rep)
    reps.sort()
    return reps


blocks, point_to_blocks, pair_to_blocks = build_data()
block_index = {combo: i for i, (combo, _) in enumerate(blocks)}
inf_related = [i for i, (combo, _) in enumerate(blocks) if 0 in combo and 39 in combo]

results = []
for n, triple in enumerate(orbit_representatives(), start=1):
    if max_count is not None and n > max_count:
        break
    forced = (triple[0], 13 + triple[1], 26 + triple[2], 39)
    forced_index = block_index[forced]

    model = cp_model.CpModel()
    X = [model.NewBoolVar(f'x_{i}') for i in range(len(blocks))]
    for g in range(40):
        model.Add(sum(X[i] for i in point_to_blocks[g]) == 2)
    for oid in range(60):
        model.Add(sum(X[i] for i in pair_to_blocks[oid]) == 2)

    model.Add(X[forced_index] == 1)
    model.Add(sum(X[i] for i in inf_related) >= 1)
    for i in inf_related:
        if i < forced_index:
            model.Add(X[i] == 0)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = limit
    solver.parameters.num_search_workers = 8
    start = time.time()
    res = solver.Solve(model)
    item = {
        'triple': list(triple),
        'forced_block': list(forced),
        'forced_block_coords': [Gs[g] for g in forced],
        'status': solver.StatusName(res),
        'wall': round(solver.WallTime(), 3),
        'elapsed': round(time.time() - start, 3),
    }
    results.append(item)
    print(json.dumps(item))
    sys.stdout.flush()

if out_path:
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2)
