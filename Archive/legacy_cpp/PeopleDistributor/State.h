#pragma once
#include <iostream>
#include <vector>
#include <stdexcept>
#include <random>
#include <stdint.h>
#include <ctime>
#include <fstream>


class State
{
private:

	// For fast generation of good pseudorandom nums this 
	// xorshift 128 generator will be used
	struct xorshift128p_state {
		uint64_t a, b;
	};

	xorshift128p_state rnd_state;

	// The state must be seeded so that it is not all zero
	uint64_t xorshift128p(struct xorshift128p_state* state)
	{
		uint64_t t = state->a;
		uint64_t const s = state->b;
		state->a = s;
		t ^= t << 23;		// a
		t ^= t >> 17;		// b
		t ^= s ^ (s >> 26);	// c
		state->b = t;
		return t + s;
	}

	// These are the 4 main variables defined during the creation of the object
	// every "day" the groups get redistributed
	unsigned int num_of_groups;
	unsigned int num_ms_per_group;
	unsigned int num_fs_per_group;
	unsigned int num_of_days;

	// These 3-dimensional vectors store all the information about the state
	// meaning exactly which group each person is in during every single day
	std::vector<std::vector<std::vector<unsigned int>>> m_day_group_person;
	std::vector<std::vector<std::vector<unsigned int>>> f_day_group_person;

	// This is used to "freeze" a certain number of people in each group
	// The "immovable" people will never change group
	std::vector<unsigned int> m_num_of_immovable_people_per_group;
	std::vector<unsigned int> f_num_of_immovable_people_per_group;

  // Different way of representing people that can not switch group
  // std::vector<bool> person_can_move;

	// These methods just initialize two vectors of sequential nums 
	// Each of the nums is going to represent one person
  std::vector<unsigned int> create_m_nums_vec();
	std::vector<unsigned int> create_m_nums_vec(unsigned int total_ms);
  std::vector<unsigned int> create_f_nums_vec();
	std::vector<unsigned int> create_f_nums_vec(unsigned int total_fs, 
		                                          unsigned int total_ms);


	// To understand why the following in necessary, a little explanation of the
	// algorithm will be given.
	// The simulated annealing algorithm makes billions of random changes to 
	// the "state" i.e. the distribution of people into groups and clalculates
	// the change in the function to maximize (the total number of contacts). 
	// The problem is, evalutaing this function for a given state is quite complex
	// and will, using a trivial way of doing so, require quite a bit of computing 
	// time. The algorithm requires billions of iterations to make any sense, 
  // which would just take too long using that approach.
	// Thats why the state object not only stores the current distribution of 
	// people, but also how many times each person has been in the 
	// same group as each other person. Then after a change is made to the state
	// only the change of contacts in the affected groups has to be calculated,
	// greatly increasing the speed of evaluating the function for each iteration.
	// The two dimensional vactor curr_contacts tracks how many times each person 
	// has been in the same group with each other person. It is a symmetrical 
  // matrix and the diagonal elements obviously don't matter. Because the 
  // direction of the contact doesn't matter (A sees B) == (B sees A) in theory
  // only the triangle matrix has to be stored, but the nature of how some of 
  // the state change mechanics are implemented require both halves to be filled.
	std::vector<std::vector<unsigned int>> curr_contacts;
	
	// A variable storing the result of the target function for the current state.


	float average_contacts_per_person();
  float average_penalty_per_person();

	// These methods return how the target function would change if two m or f 
  // persons would swap groups on a certain day. The simulated annealing 
  // algorithm needs to know this to decide whether or not to execute the swap.
  int penalty_delta_of_swap_m(unsigned int day, unsigned int m_gr1,
                              unsigned int m1, unsigned int m_gr2,
                              unsigned int m2);
  int penalty_delta_of_swap_f(unsigned int day, unsigned int f_gr1,
                              unsigned int f1, unsigned int f_gr2,
                              unsigned int f2);

	int contact_delta_of_swap_m(unsigned int day, unsigned int m_gr1, 
                              unsigned int m1,	unsigned int m_gr2, 
                              unsigned int m2);
	int contact_delta_of_swap_f(unsigned int day, unsigned int f_gr1, 
                              unsigned int f1, unsigned int f_gr2, 
                              unsigned int f2);

	// These methods actually execute a swap in the state
	void swap_m(unsigned int day, unsigned int m_gr1, unsigned int m1, 
		unsigned int m_gr2, unsigned int m2);
	void swap_f(unsigned int day, unsigned int f_gr1, unsigned int f1, 
		unsigned int f_gr2, unsigned int f2);

public:
  int curr_num_contacts;

  // 
  int curr_penalty;

	State();
	State(unsigned int num_of_groups, unsigned int num_ms_per_group, 
		unsigned int num_fs_per_group, unsigned int num_of_days);
	~State();

	// A little explanation why: Initializing the state with completely 
	// sequential nums and perfect order in the beginning will lead to
	// the hillclimbing and then even the simulated annealing algorithm to
	// hit a very early and very poor local maximum very early, therefore
	// only the first day will be initialized sequentially and the remaining 
	// days will be randomly scrambled initially. This random scrambling 
	// leads to the algorithms finding much better local maxima.
	// To implement the "number of immovable people" the immovable part is 
  // still scrambled and will be "unscrambled" when the 
  // set_number_of_immovable_people routines are called
	void initialize(unsigned int num_of_groups, 
                  unsigned int num_ms_per_group,
		              unsigned int num_fs_per_group, 
                  unsigned int num_of_days);

  // Sets m_num_of_immovable_people_per_group and
  // m_num_of_immovable_people_per_group and unscrambles the people that
  // are affected by this change
	void set_num_of_immovable_ms_per_group(std::vector<unsigned int> 
      num_of_immovable_ms_per_group);
	void set_num_of_immovable_fs_per_group(std::vector<unsigned int> 
      num_of_immovable_fs_per_group);

	void try_random_m_swap_and_proceed_if_contact_delta_pos();
	void try_random_f_swap_and_proceed_if_contact_delta_pos();

	void perform_simulated_annealing_step(double temp);

  void perform_simulated_annealing_penalty_version_step(double temp);

	void print_num_of_contacts_per_person();
	void print_total_num_of_contacts();

  void print_total_penalty();
  void print_penalty_per_person();

	void print_random_number();


	void print_state();
	void write_state_to_csv();

	double random();
  bool is_valid();
	

};


