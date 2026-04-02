use crate::state::State;
use indicatif::ProgressBar;
use std::time::Instant;

// pub fn run_random_hillclimbing_algorithm(mut state: State, num_iterations: u32) {
//     println!("Total number of contacts in initial state for hill climbing:");
//     state.print_total_num_of_contacts();
//     state.print_num_of_contacts_per_person();
//     let bar = ProgressBar::new(num_iterations as u64);
//     for _ in 0..num_iterations {
//         state.try_random_m_swap_and_proceed_if_contact_delta_pos();
//         state.try_random_f_swap_and_proceed_if_contact_delta_pos();
//         bar.inc(1);
//     }
//     bar.finish();
//     println!(
//         "Total number of contacts after {} steps of some random state:",
//         num_iterations
//     );
//     state.print_total_num_of_contacts();
//     state.print_num_of_contacts_per_person();
// }

// pub fn run_simulated_annealing_contacts_algorithm(mut state: State, num_iterations: u32) {
//     println!("Total number of contacts in initial state for simulated annealing (contacts optimizing version):");
//     state.print_total_num_of_contacts();
//     state.print_num_of_contacts_per_person();
//     state.print_total_penalty();
//     state.print_penalty_per_person();
//     let t_start: f64 = 1000.0;
//     let t_end: f64 = 0.001;
//     let mut temp = t_start;

//     let lambda = (t_start / t_end).powf(1.0 / num_iterations as f64);

//     println!("Starting temperature: {}", temp);
//     println!("Temperature reduction factor lambda: {}", lambda);
//     let bar = ProgressBar::new(num_iterations as u64);
//     for _ in 0..num_iterations {
//         state.perform_simulated_annealing_step(temp);
//         temp /= lambda;
//         bar.inc(1);
//     }
//     bar.finish();
//     println!(
//         "Total number of contacts after {} steps of simulated annealing (contacts optimizing version):",
//         num_iterations
//     );
//     state.print_total_num_of_contacts();
//     state.print_num_of_contacts_per_person();
//     state.print_total_penalty();
//     state.print_penalty_per_person();
//     println!("End temperature: {}", temp);
// }

// pub fn run_simulated_annealing_penalty_algorithm(mut state: State, num_iterations: u32) {
//     println!(
//         "Total number of contacts in initial state for simulated annealing (penalty version):"
//     );
//     state.print_total_num_of_contacts();
//     state.print_num_of_contacts_per_person();
//     state.print_total_penalty();
//     state.print_penalty_per_person();
//     let t_start: f64 = 10000.0;
//     let t_end: f64 = 0.01;
//     let mut temp = t_start;

//     let lambda = (t_start / t_end).powf(1.0 / num_iterations as f64);

//     println!("Starting temperature: {}", temp);
//     println!("Temperature reduction factor lambda: {}", lambda);
//     let bar = ProgressBar::new(num_iterations as u64);
//     for _ in 0..num_iterations {
//         state.perform_simulated_annealing_penalty_version_step(temp);
//         temp /= lambda;
//         bar.inc(1);
//     }
//     bar.finish();
//     println!(
//         "Total number of contacts after {} steps of simulated annealing (penalty version):",
//         num_iterations
//     );
//     state.print_total_num_of_contacts();
//     state.print_num_of_contacts_per_person();
//     state.print_total_penalty();
//     state.print_penalty_per_person();
//     println!("End temperature: {}", temp);
// }

// pub fn run_combined_algorithm(mut state: State, num_iterations: u32) {
//     println!(
//         "Total number of contacts in initial state for simulated annealing (combined version):"
//     );
//     state.print_total_num_of_contacts();
//     state.print_num_of_contacts_per_person();
//     state.print_total_penalty();
//     state.print_penalty_per_person();
//     let t_start: f64 = 1000.0;
//     let t_end: f64 = 0.001;
//     let mut temp = t_start;

//     let lambda = (t_start / t_end).powf(1.0 / num_iterations as f64);

//     println!("Starting temperature: {}", temp);
//     println!("Temperature reduction factor lambda: {}", lambda);

//     let bar = ProgressBar::new(num_iterations as u64);
//     for _ in 0..10 {
//         temp *= 5.0;
//         for _ in 0..num_iterations / 10 {
//             state.perform_simulated_annealing_penalty_version_step(temp);
//             temp /= lambda;
//             bar.inc(1);
//         }
//         temp /= 5.0;
//         for _ in 0..num_iterations / 10 {
//             state.perform_simulated_annealing_step(temp);
//             temp /= lambda;
//             bar.inc(1);
//         }
//     }
//     bar.finish();

//     println!(
//         "Total number of contacts after {} steps of simulated annealing (combined version):",
//         num_iterations
//     );
//     state.print_total_num_of_contacts();
//     state.print_num_of_contacts_per_person();
//     state.print_total_penalty();
//     state.print_penalty_per_person();
//     println!("End temperature: {}", temp);
//     state.print_state();
//     state.write_state_to_csv();
// }

pub fn run_simulated_annealing(
    mut state: State,
    num_iterations: u32,
    temp_start: f64,
    temp_end: f64,
    w_contacts: f64,
    w_repetition: f64,
    w_gender: f64,
) -> State {
    println!("\nInitial state:");
    state.print_total_num_of_contacts();
    state.print_total_penalty();

    let mut temp = temp_start;
    let lambda = (temp_start / temp_end).powf(1.0 / num_iterations as f64);

    let bar = ProgressBar::new(num_iterations as u64);
    for _ in 0..num_iterations {
        state.perform_simulated_annealing_step(temp, w_contacts, w_repetition, w_gender);
        temp /= lambda;
        bar.inc(1);
    }
    bar.finish();

    println!("\nFinal state:");
    state.print_total_num_of_contacts();
    state.print_total_penalty();
    state.print_state();
    state
}

pub fn run_algorithms() {
    let state = State::new(2, 4, 4, 2);
    run_simulated_annealing(state, 1000, 100.0, 1.0, 1.0, 1.0, 1.0);
}

pub fn run_final_algorithm() {
    let num_iterations = 1000000;
    let num_groups = 5;
    let num_males = 15;
    let num_females = 15;
    let num_days = 10;

    println!(
        "Finding a good starting state by running {} random initializations...",
        1000
    );
    let bar = ProgressBar::new(1000);
    let mut best_start = State::new(num_groups, num_males, num_females, num_days);
    for _ in 0..1000 {
        let s = State::new(num_groups, num_males, num_females, num_days);
        if s.curr_num_contacts > best_start.curr_num_contacts {
            best_start = s;
        }
        bar.inc(1);
    }
    bar.finish();
    println!("Best initial contacts: {}", best_start.curr_num_contacts);

    let time_point = Instant::now();

    run_simulated_annealing(
        best_start,
        num_iterations,
        1000.0,
        0.001,
        1.0, // w_contacts
        0.2, // w_repetition
        0.5, // w_gender
    );

    println!(
        "\nSimulated annealing algorithm took {} seconds.",
        time_point.elapsed().as_secs_f32()
    );
}

// pub fn debug() {
//     let mut s = State::new(6, 6, 6, 6);
//     s.print_state();
//     println!("state is valid: {}", s.is_valid());
//     let num_of_immovable_ms_per_group = vec![1, 1, 1, 1, 1, 1];
//     let num_of_immovable_fs_per_group = vec![1, 1, 0, 0, 0, 0];
//     s.set_num_of_immovable_ms_per_group(num_of_immovable_ms_per_group);
//     s.set_num_of_immovable_fs_per_group(num_of_immovable_fs_per_group);
//     println!(
//         "state is valid after adding num immovable people: {}",
//         s.is_valid()
//     );
//     println!("false = {}", false);
//     println!("true = {}", true);
//     s.print_state();
// }

// #[test]
// fn test_run_random_hillclimbing_algorithm() {
//     let state = State::new(2, 2, 2, 2);
//     let _initial_contacts = state.curr_num_contacts;
//     run_random_hillclimbing_algorithm(state, 100);
//     // We can't be sure it will be greater, but it should run without errors.
//     // A more complex test could check if the final contacts are >= initial_contacts.
// }

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn run_subroutine_test() {
        let state = State::new(2, 4, 4, 2);
        let _final_state = run_simulated_annealing(state, 100, 100.0, 1.0, 1.0, 1.0, 1.0);
        // Basic check to ensure it runs without panicking
    }
}
