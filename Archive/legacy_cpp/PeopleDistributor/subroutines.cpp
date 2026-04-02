#include <iostream>
#include <unordered_set>
#include <chrono>
#include <ctime>

#include "State.h"
#include "subroutines.h"



void run_random_hillclimbing_algorithm(State state, 
                                       unsigned int num_iterations) {
  std::cout << "Total number of contacts in initial state for hill climbing:\n";
  state.print_total_num_of_contacts();
  state.print_num_of_contacts_per_person();
  for (unsigned long int i = 0; i < num_iterations; ++i) {
    state.try_random_m_swap_and_proceed_if_contact_delta_pos();
    state.try_random_f_swap_and_proceed_if_contact_delta_pos();
  }
  std::cout << "Total number of contacts after " << num_iterations 
            << " steps of some random state:\n";
  state.print_total_num_of_contacts();
  state.print_num_of_contacts_per_person();
}

void run_simulated_annealing_contacts_algorithm(State state, 
                                       unsigned int num_iterations) {
  std::cout << "Total number of contacts in initial state "
            << "for simulated annealing (contacts optimizing version):\n";
  state.print_total_num_of_contacts();
  state.print_num_of_contacts_per_person();
  state.print_total_penalty();
  state.print_penalty_per_person();
  double t_start = 1000.0;
  double t_end = 0.001;
  double temp = t_start;

  double lambda = pow(t_start / t_end, 
                      1.0 / static_cast<double>(num_iterations));

  std::cout << "Starting temperature: " << temp << std::endl;
  std::cout << "Temperature reduction factor lambda: " << lambda << std::endl;
  for (unsigned long int i = 0; i < num_iterations; ++i) {
    state.perform_simulated_annealing_step(temp);
    temp = temp / lambda;
  }
  std::cout << "Total number of contacts after " << num_iterations 
            << " steps of simulated annealing (contacts optimizing version):\n";
  state.print_total_num_of_contacts();
  state.print_num_of_contacts_per_person();
  state.print_total_penalty();
  state.print_penalty_per_person();
  std::cout << "End temperature: " << temp << std::endl << std::endl;
  //std::cout << "Simulated annealing result: \n";
  //state.print_state();
  //state.write_state_to_csv();
}

void run_simulated_annealing_penalty_algorithm(State state,
  unsigned int num_iterations) {
  std::cout << "Total number of contacts in initial state "
    << "for simulated annealing (penalty version):\n";
  state.print_total_num_of_contacts();
  state.print_num_of_contacts_per_person();
  state.print_total_penalty();
  state.print_penalty_per_person();
  double t_start = 10000.0;
  double t_end = 0.01;
  double temp = t_start;

  double lambda = pow(t_start / t_end,
    1.0 / static_cast<double>(num_iterations));

  std::cout << "Starting temperature: " << temp << std::endl;
  std::cout << "Temperature reduction factor lambda: " << lambda << std::endl;
  for (unsigned long int i = 0; i < num_iterations; ++i) {
    state.perform_simulated_annealing_penalty_version_step(temp);
    temp = temp / lambda;
  }
  std::cout << "Total number of contacts after " << num_iterations
    << " steps of simulated annealing (penalty version):\n";
  state.print_total_num_of_contacts();
  state.print_num_of_contacts_per_person();
  state.print_total_penalty();
  state.print_penalty_per_person();
  std::cout << "End temperature: " << temp << std::endl << std::endl;
}

void run_combined_algorithm(State state,
  unsigned int num_iterations) {
  std::cout << "Total number of contacts in initial state "
    << "for simulated annealing (combined version):\n";
  state.print_total_num_of_contacts();
  state.print_num_of_contacts_per_person();
  state.print_total_penalty();
  state.print_penalty_per_person();
  double t_start = 1000.0;
  double t_end = 0.001;
  double temp = t_start;

  double lambda = pow(t_start / t_end,
    1.0 / static_cast<double>(num_iterations));

  std::cout << "Starting temperature: " << temp << std::endl;
  std::cout << "Temperature reduction factor lambda: " << lambda << std::endl;

  for (unsigned long int i = 0; i < 10; ++i) {
    temp = temp * 5;
    for (unsigned long int i = 0; i < num_iterations / 10; ++i) {
      state.perform_simulated_annealing_penalty_version_step(temp);
      temp = temp / lambda;
    }
    temp = temp / 5;
    for (unsigned long int i = 0; i < num_iterations / 10; ++i) {
      state.perform_simulated_annealing_step(temp);
      temp = temp / lambda;
    }
  }

  std::cout << "Total number of contacts after " << num_iterations
    << " steps of simulated annealing (combined version):\n";
  state.print_total_num_of_contacts();
  state.print_num_of_contacts_per_person();
  state.print_total_penalty();
  state.print_penalty_per_person();
  std::cout << "End temperature: " << temp << std::endl << std::endl;
  //std::cout << "Simulated annealing result: \n";
  state.print_state();
  state.write_state_to_csv();
}


void run_algorithms() {
  long long time_span;
  unsigned int num_iterations = 500000;

  std::cout << "Starting program...\n";

  State s;
  s.initialize(6, 6, 6, 6);
  std::vector<unsigned int> num_of_immovable_ms_per_group{ 1,0,1,1,1,1 };
  std::vector<unsigned int> num_of_immovable_fs_per_group{ 0,1,0,0,0,0 };

  s.set_num_of_immovable_ms_per_group(num_of_immovable_ms_per_group);
  s.set_num_of_immovable_fs_per_group(num_of_immovable_fs_per_group);

  s.print_state();

  std::chrono::high_resolution_clock::time_point time_point =
    std::chrono::high_resolution_clock::now();

  //run_random_hillclimbing_algorithm(s, num_iterations);

  //time_span = std::chrono::duration_cast<std::chrono::microseconds>
  //  (std::chrono::high_resolution_clock::now() - time_point).count();
  //std::cout << "Hillclimbing algorithm took " << static_cast<float>
  //  (time_span) / 1000000.0 << " seconds." << std::endl << std::endl;

  time_point = std::chrono::high_resolution_clock::now();

  run_simulated_annealing_contacts_algorithm(s, num_iterations);

  time_span = std::chrono::duration_cast<std::chrono::microseconds>
    (std::chrono::high_resolution_clock::now() - time_point).count();
  std::cout << "Simulated annealing algorithm took " << static_cast<float>
    (time_span) / 1000000.0 << " seconds." << std::endl;

  time_point = std::chrono::high_resolution_clock::now();

  run_simulated_annealing_penalty_algorithm(s, num_iterations);

  time_span = std::chrono::duration_cast<std::chrono::microseconds>
    (std::chrono::high_resolution_clock::now() - time_point).count();
  std::cout << "Simulated annealing algorithm took " << static_cast<float>
    (time_span) / 1000000.0 << " seconds." << std::endl;

  time_point = std::chrono::high_resolution_clock::now();

  run_combined_algorithm(s, num_iterations);

  time_span = std::chrono::duration_cast<std::chrono::microseconds>
    (std::chrono::high_resolution_clock::now() - time_point).count();
  std::cout << "Simulated annealing algorithm took " << static_cast<float>
    (time_span) / 1000000.0 << " seconds." << std::endl;
}

void run_final_algorithm() {
  long long time_span;
  unsigned int num_iterations = 1000000;
  
  State best_start;

  for (unsigned int i = 0; i < 10000; ++i) {
    State s;
    s.initialize(5, 3, 3, 10);
    std::vector<unsigned int> num_of_immovable_ms_per_group{ 0, 0, 0, 0, 0 };
    std::vector<unsigned int> num_of_immovable_fs_per_group{ 0, 0, 0, 0, 0 };
    s.set_num_of_immovable_ms_per_group(num_of_immovable_ms_per_group);
    s.set_num_of_immovable_fs_per_group(num_of_immovable_fs_per_group);
    if (s.curr_num_contacts > best_start.curr_num_contacts) {
      best_start = s;
    }
  }
  std::cout << best_start.curr_num_contacts;

  std::chrono::high_resolution_clock::time_point time_point = 
    std::chrono::high_resolution_clock::now();

  run_combined_algorithm(best_start, num_iterations);

  time_span = std::chrono::duration_cast<std::chrono::microseconds>
    (std::chrono::high_resolution_clock::now() - time_point).count();
  std::cout << "Simulated annealing algorithm took " << static_cast<float>
    (time_span) / 1000000.0 << " seconds." << std::endl;

}

void debug() {
  State s;
  s.initialize(6, 6, 6, 6);
  s.print_state();
  std::cout << "state is valid: " << s.is_valid() << std::endl;
  std::vector<unsigned int> num_of_immovable_ms_per_group{ 1, 1, 1, 1, 1, 1 };
  std::vector<unsigned int> num_of_immovable_fs_per_group{ 1, 1, 0, 0, 0, 0 };
  s.set_num_of_immovable_ms_per_group(num_of_immovable_ms_per_group);
  s.set_num_of_immovable_fs_per_group(num_of_immovable_fs_per_group);
  std::cout << "state is valid after adding num immovable people: " << s.is_valid() << std::endl;
  std::cout << "false = " << false << std::endl;
  std::cout << "true = " << true << std::endl;
  s.print_state();
}