# Construction heuristics research

Notes from the April 2026 literature review on pure Social Golfer / zero-repeat design-theoretic constructions.

## Scope

This note summarizes what we established about:
- harder pure Social Golfer instances beyond `8-4-10`
- which larger instances are solved by search heuristics vs. construction/design methods
- which parameter families admit arbitrarily large constructed solutions
- which construction families are *knife-edge* (i.e. exactly on the feasibility frontier)
- rough implementation difficulty of those construction families

## Instance notation

We use the standard Social Golfer triplet:
- `g-p-w`
- `g` = groups per week
- `p` = players per group
- `w` = weeks

Total players is `v = g * p`.

The basic counting upper bound is:

```text
w <= floor((gp - 1) / (p - 1))
```

A family is **knife-edge** if its construction reaches that upper bound, so one more week is impossible by counting alone.

---

## 1. Harder instances than `8-4-10`

### On the original `8-4-w` line
- `8-4-10` is the endpoint.
- `8-4-11` is impossible by the simple partner-counting argument.
- So there is no harder feasible instance on the exact original `8-4-w` line.

### In the broader pure-SGP literature
There are larger and harder pure-SGP families than `8-4-10`.

Most relevant larger `p=4` families from the standard results tables:
- `9-4-w` with upper bound `12`; best listed search-heuristic solutions reach `9`
- `10-4-w` with upper bound `13`; best listed search-heuristic solutions reach `10`

So the natural harder `p=4` targets are:
- `9-4-10..12`
- `10-4-11..13`

As of the online curated results we checked, those higher targets are **not listed as solved**.

---

## 2. Hardest triplets solved by search heuristics

From the online curated `results.pl` table on Markus Triska's SGP site:

### Best concise answer
- **Largest solved by search heuristics (raw size):** `10-10-3`
- **Most relevant hard benchmark-style `p=4` result solved by search heuristics:** `10-4-10`

### Why `10-4-10` is the more meaningful benchmark answer
It is the natural larger analogue of `8-4-10`:
- `8-4-10` solved by GRASP
- `9-4-9` solved by GRASP / memetic
- `10-4-10` solved by GRASP / memetic

But plain local search only reaches `10-4-9` in that curated table.

### Other notable search-heuristic results from the same source
Examples listed as solved by GRASP and/or memetic methods include:
- `9-3-12`
- `10-3-13`
- `9-4-9`
- `10-4-10`
- `10-5-8`
- `10-6-7`
- `10-8-5`
- `10-9-4`
- `10-10-3`

The same results file explicitly marks some instances as hard for GRASP, notably:
- `10-6-7`
- `9-3-12`
- `6-5-6`

---

## 3. Infinite construction families (arbitrarily large solvable families)

We found several standard design-theoretic families that yield arbitrarily large SGP solutions.

### 3.1 Pairings / round robin
Family:

```text
g-2-(2g-1)
```

Interpretation:
- `2g` players
- `g` groups of size `2`
- `2g-1` weeks
- every pair meets exactly once

This is the 1-factorization / round-robin family.

### 3.2 Triples via KTS / NKTS
Using Kirkman triple systems and nearly Kirkman triple systems:

```text
g-3-floor((3g-1)/2)
```

Examples:
- `5-3-7`
- `6-3-8`
- `7-3-10`
- `8-3-11`
- `9-3-13`

For odd `g`, this is the classical KTS line. For even `g`, nearly-KTS constructions provide the analogous near-complete line.

### 3.3 Square / affine-plane / complete-MOLS family
Using affine planes / complete sets of MOLS:

```text
n-n-(n+1)
```

This is available when the required affine plane / complete MOLS exist, notably for prime-power `n`.

Examples:
- `4-4-5`
- `5-5-6`
- `7-7-8`
- `8-8-9`
- `9-9-10`

### 3.4 More generally: any resolvable `BIBD(v,p,1)`
If there is a resolvable `2-(v,p,1)` design with `v = gp`, then we obtain:

```text
g-p-(v-1)/(p-1)
```

This is the broad general mechanism behind many exact frontier constructions.

### 3.5 Transversal-design family
Using resolvable transversal designs `RTD(k,n)`, one gets patterns of the form:

```text
n-k-n
```

These produce arbitrarily large families, but usually not knife-edge ones.

Examples seen in the recent combinatorial-construction literature include:
- `20-5-20`
- `30-5-30`
- `25-6-25`
- `19-7-19`
- `17-8-17`
- `19-9-19`
- `11-10-11`

### 3.6 Modern recursive mixed families
The 2025 combinatorial paper uses a broad toolbox of:
- KTS
- NKTS
- RBIBD
- RTD
- RGDD
- URD
- RITD
- MOLRs
- bespoke recursive constructions (`ownSG`)

Conclusion: there is no single universal construction for all SGP instances, but there are many infinite families covering large parameter regions.

---

## 4. Which construction families are knife-edge?

These are the families that hit the counting upper bound and are therefore on the same kind of frontier as `8-4-10`.

### Knife-edge families

#### 4.1 Pairings / round robin

```text
g-2-(2g-1)
```

Exact for all `g`.

#### 4.2 Triples

```text
g-3-floor((3g-1)/2)
```

Exact for all feasible `g` covered by KTS / NKTS.

#### 4.3 Square / affine-plane family

```text
n-n-(n+1)
```

Exact when the affine plane / complete MOLS exist.

#### 4.4 Any resolvable `RBIBD(v,p,1)`

```text
g-p-(v-1)/(p-1)
```

Again exact because every pair is used exactly once.

### Not typically knife-edge
Families based on:
- RTD
- RGDD
- URD
- RITD
- partial MOLS / MOLRs
- recursive patching / `ownSG`

These are often scalable and very useful, but usually they are not right on the impossibility frontier.

### Important example: `20-5-20`
`20-5-20` is **not** knife-edge.

For `20-5-w`:

```text
upper bound = floor((100 - 1) / (5 - 1)) = floor(99 / 4) = 24
```

So:
- `20-5-21` is definitely **not** ruled out by counting
- in fact, the modern combinatorial tables report larger constructions on that line
- the knife-edge target on that line would be `20-5-24`

---

## 5. Implementation difficulty of the main construction families

### Easy: `g-2-(2g-1)` round robin
- very straightforward
- deterministic formula / 1-factorization
- lowest engineering effort

### Moderate: triples via KTS / NKTS
- manageable if only a few standard infinite constructions are needed
- harder if broad coverage of all feasible parameter cases is desired

### Moderate to moderate-hard: affine planes / complete MOLS
- systematic for prime powers
- requires finite-field / algebra machinery for robust support
- elegant but more involved than round robin

### Hard: general `RBIBD(v,p,1)`
- not one single algorithm
- really a family of many constructions, recursions, and parameter-specific existence results
- broad coverage turns into a design-theory subsystem rather than one heuristic

### Practical implementation recommendation
Best ROI if adding explicit construction families to a codebase:
1. round robin (`p=2`)
2. affine-plane / complete-MOLS family
3. KTS / NKTS family
4. only then consider general RBIBD support

---

## 6. Specific takeaway for `p=4`

There are arbitrarily large constructed `p=4` families, but not via one single simple all-`g` pattern.

The main exact frontier mechanism for `p=4` is through resolvable BIBDs and related design families. Typical knife-edge examples include:
- `4-4-5`
- `7-4-9`
- `10-4-13`
- `13-4-17`
- etc. where the required resolvable design exists

So:
- `8-4-10` is famous because it is the hard endpoint on its specific line
- but construction theory does provide arbitrarily large exact `p=4` families in other congruence classes

---

## 7. Sources consulted

Primary online sources used in this research:
- Markus Triska SGP page: `https://www.metalevel.at/sgp/`
- curated results table: `https://www.metalevel.at/sgp/results.pl`
- Markus Triska master's thesis (`mst.pdf` / `TriskaThesis.pdf`)
- 2025/2026 combinatorial-construction paper: *Combinatorial solutions to the Social Golfer Problem and Social Golfer Problem with Adjacent Group Sizes*
- 2026 SAT paper noting larger benchmark progress (e.g. `6-3-8`)

---

## 8. Bottom-line conclusions

1. `8-4-10` is maximal only on the original `8-4-w` line; larger/harder pure-SGP instances exist in the literature.
2. The most relevant larger search-heuristic result in the same spirit is `10-4-10`; the largest by raw size in the curated search-heuristic table is `10-10-3`.
3. Construction methods support several infinite families, especially:
   - `g-2-(2g-1)`
   - `g-3-floor((3g-1)/2)`
   - `n-n-(n+1)`
   - broader exact families from resolvable `BIBD(v,p,1)`
4. Knife-edge families are exactly those that hit the counting bound; RTD/RGDD-style constructions are often scalable lower-bound constructions instead.
5. Among the main construction families, round robin is easy to implement, KTS/NKTS and affine-plane/MOLS are moderate, and general RBIBD support is hard.
