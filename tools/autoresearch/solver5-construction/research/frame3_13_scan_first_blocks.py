from ortools.sat.python import cp_model
import itertools
import json
import sys
import time

limit = float(sys.argv[1]) if len(sys.argv) > 1 else 1.0
out_path = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] != '-' else None
start_index = int(sys.argv[3]) if len(sys.argv) > 3 else 0
max_count = int(sys.argv[4]) if len(sys.argv) > 4 else None

POINTS = [(x, y) for x in range(13) for y in range(3)]
ORDINARY = [p for p in POINTS if p[0] != 0]
UNITS = list(range(1, 13))
LAYER_PERMS = list(itertools.permutations([0, 1, 2]))


def shift(point, t):
    x, y = point
    return ((x + t) % 13, y)


def canonical_pair(a, b):
    reps = []
    for t in range(13):
        aa = shift(a, t)
        bb = shift(b, t)
        reps.append(tuple(sorted((aa, bb))))
    return min(reps)


def canonical_block(block):
    orbit = []
    for u in UNITS:
        scaled = [((u * x) % 13, y) for x, y in block]
        for perm in LAYER_PERMS:
            mp = {0: perm[0], 1: perm[1], 2: perm[2]}
            orbit.append(tuple(sorted((x, mp[y]) for x, y in scaled)))
    return min(orbit)


pair_orbit = {}
for a, b in itertools.combinations(POINTS, 2):
    if a[0] == b[0]:
        continue
    pair_orbit.setdefault(canonical_pair(a, b), len(pair_orbit))

blocks = []
block_index = {}
point_to_blocks = {p: [] for p in ORDINARY}
pair_to_blocks = [[] for _ in range(len(pair_orbit))]
for xs in itertools.combinations(range(1, 13), 4):
    for ys in itertools.product(range(3), repeat=4):
        block = tuple(sorted((x, y) for x, y in zip(xs, ys)))
        orbit_ids = set()
        for a, b in itertools.combinations(block, 2):
            orbit_ids.add(pair_orbit[canonical_pair(a, b)])
        bi = len(blocks)
        blocks.append((block, tuple(sorted(orbit_ids))))
        block_index[block] = bi
        for p in block:
            point_to_blocks[p].append(bi)
        for oid in orbit_ids:
            pair_to_blocks[oid].append(bi)

reps = []
seen = set()
for block, _ in blocks:
    rep = canonical_block(block)
    if rep in seen:
        continue
    seen.add(rep)
    reps.append(rep)
reps.sort()

results = []
for i, rep in enumerate(reps[start_index:], start=start_index):
    if max_count is not None and len(results) >= max_count:
        break
    forced_index = block_index[rep]

    model = cp_model.CpModel()
    X = [model.NewBoolVar(f'x_{j}') for j in range(len(blocks))]
    for p in ORDINARY:
        model.Add(sum(X[j] for j in point_to_blocks[p]) == 1)
    for oid in range(len(pair_to_blocks)):
        model.Add(sum(X[j] for j in pair_to_blocks[oid]) == 1)
    model.Add(X[forced_index] == 1)

    pivot_family = [j for j, (block, _) in enumerate(blocks) if (1, 0) in block]
    for j in pivot_family:
        if j < forced_index:
            model.Add(X[j] == 0)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = limit
    solver.parameters.num_search_workers = 8
    start = time.time()
    res = solver.Solve(model)
    item = {
        'index': i,
        'block': [list(p) for p in rep],
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
