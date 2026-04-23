from ortools.sat.python import cp_model
import itertools
import json
import sys
import time

forced = [tuple(sorted(tuple(int(v) for v in token.split(':')) for token in arg.split(','))) for arg in sys.argv[1].split(';')] if len(sys.argv) > 1 and sys.argv[1] else []
limit = float(sys.argv[2]) if len(sys.argv) > 2 else 120.0

POINTS = [(x, y) for x in range(13) for y in range(3)]
POINT_INDEX = {p: i for i, p in enumerate(POINTS)}
ORDINARY = [p for p in POINTS if p[0] != 0]


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


pair_orbit = {}
for a, b in itertools.combinations(POINTS, 2):
    if a[0] == b[0]:
        continue
    pair_orbit.setdefault(canonical_pair(a, b), len(pair_orbit))

blocks = []
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
        for p in block:
            point_to_blocks[p].append(bi)
        for oid in orbit_ids:
            pair_to_blocks[oid].append(bi)

model = cp_model.CpModel()
X = [model.NewBoolVar(f'x_{i}') for i in range(len(blocks))]

for p in ORDINARY:
    model.Add(sum(X[i] for i in point_to_blocks[p]) == 1)
for oid in range(len(pair_to_blocks)):
    model.Add(sum(X[i] for i in pair_to_blocks[oid]) == 1)

forced_indices = []
for wanted in forced:
    found = None
    for i, (block, _) in enumerate(blocks):
        if block == wanted:
            found = i
            break
    if found is None:
        raise SystemExit(f'forced block not found: {wanted}')
    forced_indices.append(found)
    model.Add(X[found] == 1)

# Minimal symmetry break: when a block containing (1,0) is forced, make it the
# lexicographically first selected such block. Without a forced block, do not pin
# a specific pattern here; that was too aggressive and can prune valid solutions.
pivot_family = [i for i, (block, _) in enumerate(blocks) if (1, 0) in block]
if forced_indices:
    pivot = min(forced_indices)
    if any((1, 0) in blocks[i][0] for i in forced_indices):
        for i in pivot_family:
            if i < pivot:
                model.Add(X[i] == 0)

solver = cp_model.CpSolver()
solver.parameters.max_time_in_seconds = limit
solver.parameters.num_search_workers = 8
print('starting', {'forced': forced, 'limit': limit, 'pair_orbits': len(pair_orbit), 'blocks': len(blocks)})
sys.stdout.flush()
start = time.time()
res = solver.Solve(model)
print('status', solver.StatusName(res), 'wall', round(solver.WallTime(), 3), 'elapsed', round(time.time() - start, 3), 'pair_orbits', len(pair_orbit), 'blocks', len(blocks))
if res in (cp_model.OPTIMAL, cp_model.FEASIBLE):
    chosen = [block for i, (block, _) in enumerate(blocks) if solver.Value(X[i])]
    print('starter_block_count', len(chosen))
    for block in chosen:
        print(block)
    print(json.dumps({'starter_blocks': chosen}))
