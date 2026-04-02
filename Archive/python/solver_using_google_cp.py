from ortools.sat.python import cp_model
import collections
import time
import random


def solve_group_scheduling():
    """
    Solves the social group scheduling problem using the CP-SAT solver.

    This is an optimized version that uses a more efficient model for the
    objective function and enables parallel execution.
    """
    # ==============================================================================
    # 1. Problem Configuration
    # ==============================================================================
    # --- People and their attributes ---
    people = [f"p{i}" for i in range(30)]
    genders = {p: "male" if i < 15 else "female" for i, p in enumerate(people)}

    # --- Groups and Sessions ---
    num_groups = 5
    group_size = 6
    num_sessions = 10

    # --- Constraints and Objectives Configuration ---
    conflict_pairs = {("p0", "p1"), ("p5", "p6")}
    immovable_assignments = {("p2", 0, 0): True, ("p3", 0, 0): True}
    desired_gender_balance = {"male": 3, "female": 3}
    gender_balance_penalty_weight = 10

    # --- Solver Configuration ---
    solver_time_limit_seconds = 15.0
    # NEW: Set to the number of CPU cores for a significant speedup.
    num_search_workers = 8  # e.g., 8 for an 8-core CPU

    # ==============================================================================
    # 2. Model Creation
    # ==============================================================================
    model = cp_model.CpModel()
    p_indices = {person: i for i, person in enumerate(people)}
    num_people = len(people)

    # --- Core Variables ---
    assignments = {}
    for p_idx in range(num_people):
        for s in range(num_sessions):
            for g in range(num_groups):
                assignments[(p_idx, s, g)] = model.NewBoolVar(
                    f"assign_p{p_idx}_s{s}_g{g}"
                )

    # ==============================================================================
    # 3. Constraint Implementation
    # ==============================================================================
    print("Adding constraints...")
    # --- Basic structural constraints (same as before) ---
    for p_idx in range(num_people):
        for s in range(num_sessions):
            model.AddExactlyOne([assignments[(p_idx, s, g)] for g in range(num_groups)])

    for s in range(num_sessions):
        for g in range(num_groups):
            model.Add(
                sum(assignments[(p_idx, s, g)] for p_idx in range(num_people))
                == group_size
            )

    for (person_id, session, group), is_assigned in immovable_assignments.items():
        if is_assigned:
            model.Add(assignments[(p_indices[person_id], session, group)] == 1)

    for s in range(num_sessions):
        for g in range(num_groups):
            for p1_id, p2_id in conflict_pairs:
                p1_idx, p2_idx = p_indices[p1_id], p_indices[p2_id]
                model.AddAtMostOne(
                    [assignments[(p1_idx, s, g)], assignments[(p2_idx, s, g)]]
                )

    # ==============================================================================
    # 4. Objective Function (OPTIMIZED AND CORRECTED MODEL)
    # ==============================================================================
    print("Building the optimized objective function...")

    met_at_least_once = {}
    for p1_idx in range(num_people):
        for p2_idx in range(p1_idx + 1, num_people):
            # This variable is true if p1 and p2 meet at all.
            pair_met = model.NewBoolVar(f"met_{p1_idx}_{p2_idx}")
            met_at_least_once[(p1_idx, p2_idx)] = pair_met

            # A list of intermediate booleans, one for each time the pair could meet.
            possible_meetings = []
            for s in range(num_sessions):
                for g in range(num_groups):
                    # met_in_slot is true iff both p1 and p2 are in this group and session.
                    met_in_slot = model.NewBoolVar(
                        f"met_in_slot_{p1_idx}_{p2_idx}_s{s}_g{g}"
                    )
                    possible_meetings.append(met_in_slot)

                    p1_in_slot = assignments[(p1_idx, s, g)]
                    p2_in_slot = assignments[(p2_idx, s, g)]

                    # Establish the equivalence: met_in_slot <=> (p1_in_slot AND p2_in_slot)
                    # Implication 1: met_in_slot => (p1_in_slot AND p2_in_slot)
                    model.AddBoolAnd([p1_in_slot, p2_in_slot]).OnlyEnforceIf(
                        met_in_slot
                    )

                    # Implication 2: (p1_in_slot AND p2_in_slot) => met_in_slot
                    # This is expressed using the contrapositive: NOT met_in_slot => NOT(p1 AND p2)
                    # This is the line that fixes the TypeError.
                    model.AddBoolOr([p1_in_slot.Not(), p2_in_slot.Not()]).OnlyEnforceIf(
                        met_in_slot.Not()
                    )

            # Establish the equivalence for the top-level pair meeting variable
            # Equivalence: pair_met <=> OR(possible_meetings)
            # Implication 1: pair_met => OR(possible_meetings)
            model.AddBoolOr(possible_meetings).OnlyEnforceIf(pair_met)

            # Implication 2: OR(possible_meetings) => pair_met
            # This means if any possible_meeting is true, pair_met must be true.
            for met_var in possible_meetings:
                model.AddImplication(met_var, pair_met)

    total_unique_contacts = sum(met_at_least_once.values())

    # --- Penalties (same as before, this model is already efficient) ---
    penalties = []
    for s in range(num_sessions):
        for g in range(num_groups):
            males_in_group = [
                assignments[(p_idx, s, g)]
                for p_idx, p_id in enumerate(people)
                if genders[p_id] == "male"
            ]
            females_in_group = [
                assignments[(p_idx, s, g)]
                for p_idx, p_id in enumerate(people)
                if genders[p_id] == "female"
            ]

            male_dev = model.NewIntVar(-group_size, group_size, f"male_dev_s{s}_g{g}")
            model.Add(male_dev == sum(males_in_group) - desired_gender_balance["male"])
            abs_male_dev = model.NewIntVar(0, group_size, f"abs_male_dev_s{s}_g{g}")
            model.AddAbsEquality(abs_male_dev, male_dev)

            females_dev = model.NewIntVar(
                -group_size, group_size, f"female_dev_s{s}_g{g}"
            )
            model.Add(
                females_dev == sum(females_in_group) - desired_gender_balance["female"]
            )
            abs_females_dev = model.NewIntVar(
                0, group_size, f"abs_females_dev_s{s}_g{g}"
            )
            model.AddAbsEquality(abs_females_dev, females_dev)

            penalties.append(abs_male_dev)
            penalties.append(abs_females_dev)

    total_penalty = sum(penalties)

    # --- Final Objective ---
    model.Maximize(
        total_unique_contacts - gender_balance_penalty_weight * total_penalty
    )

    # ==============================================================================
    # 5. Solve and Display Results
    # ==============================================================================
    print("Solving...")
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = solver_time_limit_seconds
    solver.parameters.log_search_progress = True
    # NEW: Set number of parallel workers.
    solver.parameters.num_search_workers = num_search_workers

    start_time = time.time()
    status = solver.Solve(model)
    end_time = time.time()

    print("-" * 30)
    print(f"Solving finished in {end_time - start_time:.2f} seconds.")

    if status == cp_model.OPTIMAL or status == cp_model.FEASIBLE:
        # We need to manually calculate the final values as the objective is combined
        final_contacts = solver.Value(sum(met_at_least_once.values()))
        final_penalty_score = solver.Value(total_penalty)

        print(f"Objective value (Contacts - Penalty*Weight): {solver.ObjectiveValue()}")
        print(f"Total Unique Contacts: {final_contacts}")
        print(f"Total Penalty Score: {final_penalty_score}")
        print("-" * 30)
        print("Schedule:")

        schedule = collections.defaultdict(lambda: collections.defaultdict(list))
        for s in range(num_sessions):
            for g in range(num_groups):
                for p_idx, p_id in enumerate(people):
                    if solver.Value(assignments[(p_idx, s, g)]) == 1:
                        schedule[s][g].append(p_id)

        for s in sorted(schedule.keys()):
            print(f"\n--- Session {s} ---")
            for g in sorted(schedule[s].keys()):
                group_members = sorted(schedule[s][g], key=lambda x: int(x[1:]))
                print(f"  Group {g}: {group_members}")
    else:
        print("No solution found.")
        print(f"Solver status: {solver.StatusName(status)}")


# --- Run the solver ---
if __name__ == "__main__":
    solve_group_scheduling()
