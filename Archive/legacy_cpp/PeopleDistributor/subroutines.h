#pragma once

#include <iostream>

void run_random_hillclimbing_algorithm(State hill_climbing, 
                                       unsigned int num_iterations);

void run_simulated_annealing_contacts_algorithm(State simulated_annealing, 
                                       unsigned int num_iterations);

void run_simulated_annealing_penalty_algorithm(State simulated_annealing,
  unsigned int num_iterations);

void run_combined_algorithm(State state,
  unsigned int num_iterations);

void run_final_algorithm();

void run_algorithms();

void debug();

