from ortools.sat.python import cp_model
import itertools
import sys
import time

Gs = []
for y in range(3):
    for x in range(13):
        Gs.append((x, y))
Gs.append((0, 3))  # infinity group
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
block_pairs = []
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
    blocks.append(combo)
    block_pairs.append(oids)
    for g in combo:
        point_to_blocks[g].append(bi)
    for oid in oids:
        pair_to_blocks[oid].append(bi)

print(f"pair orbits={len(pair_orbit)} blocks={len(blocks)}")

forced = None
if len(sys.argv) > 1:
    forced = tuple(sorted(int(x) for x in sys.argv[1].split(',')))

model = cp_model.CpModel()
X = [[model.NewBoolVar(f"x_{w}_{i}") for i in range(len(blocks))] for w in range(2)]

for w in range(2):
    for g in range(40):
        model.Add(sum(X[w][i] for i in point_to_blocks[g]) == 2)

for oid in range(60):
    model.Add(sum(X[w][i] for w in range(2) for i in pair_to_blocks[oid]) == 4)

# weak symmetry breaks
# force week 0 to use some block containing infinity and the first ordinary group
inf_related = [i for i, b in enumerate(blocks) if 39 in b and 0 in b]
model.Add(sum(X[0][i] for i in inf_related) >= 1)
if forced is None:
    # break week swap symmetry by preferring week 0 to use the lexicographically first
    # infinity block if any selected among tied candidates
    model.Add(X[0][inf_related[0]] == 1)
else:
    forced_index = None
    for i, combo in enumerate(blocks):
        if combo == forced:
            forced_index = i
            break
    if forced_index is None:
        raise SystemExit(f"forced block not found: {forced}")
    model.Add(X[0][forced_index] == 1)
    if 0 in forced and 39 in forced:
        for i in inf_related:
            if i < forced_index:
                model.Add(X[0][i] == 0)

solver = cp_model.CpSolver()
solver.parameters.max_time_in_seconds = float(sys.argv[2]) if len(sys.argv) > 2 else 1200
solver.parameters.num_search_workers = 8
solver.parameters.log_search_progress = True

start = time.time()
result = solver.Solve(model)
print(f"status={solver.StatusName(result)} wall={solver.WallTime():.3f} elapsed={time.time()-start:.3f}")

if result in (cp_model.OPTIMAL, cp_model.FEASIBLE):
    for w in range(2):
        chosen = [blocks[i] for i in range(len(blocks)) if solver.Value(X[w][i])]
        print(f"week{w}_count={len(chosen)}")
        for block in chosen:
            print(w, block)
