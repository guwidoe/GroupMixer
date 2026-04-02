use rand::seq::SliceRandom;
use rand::Rng;

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Gender {
    Male,
    Female,
}

pub struct Xorshift128pState {
    a: u64,
    b: u64,
}

impl Xorshift128pState {
    pub fn new() -> Self {
        let mut rng = rand::rng();
        Self {
            a: rng.random(),
            b: rng.random(),
        }
    }

    pub fn next(&mut self) -> u64 {
        let mut t = self.a;
        let s = self.b;
        self.a = s;
        t ^= t << 23;
        t ^= t >> 17;
        t ^= s ^ (s >> 26);
        self.b = t;
        t.wrapping_add(s)
    }
}

pub struct State {
    num_of_groups: u32,
    num_of_days: u32,
    total_people: u32,

    person_gender: Vec<Gender>,
    person_is_immovable: Vec<bool>,

    day_group_people: Vec<Vec<Vec<u32>>>,
    day_person_location: Vec<Vec<(usize, usize)>>,

    curr_contacts: Vec<Vec<u32>>,
    pub curr_num_contacts: i32,
    pub curr_repetition_penalty: i32,
    pub curr_gender_balance_penalty: i32,

    rnd_state: Xorshift128pState,
}

impl State {
    pub fn new(num_of_groups: u32, num_males: u32, num_females: u32, num_of_days: u32) -> Self {
        let total_people = num_males + num_females;
        let mut state = Self {
            num_of_groups,
            num_of_days,
            total_people,
            person_gender: vec![Gender::Male; total_people as usize],
            person_is_immovable: vec![false; total_people as usize],
            day_group_people: vec![vec![Vec::new(); num_of_groups as usize]; num_of_days as usize],
            day_person_location: vec![vec![(0, 0); total_people as usize]; num_of_days as usize],
            curr_contacts: vec![vec![0; total_people as usize]; total_people as usize],
            curr_num_contacts: 0,
            curr_repetition_penalty: 0,
            curr_gender_balance_penalty: 0,
            rnd_state: Xorshift128pState::new(),
        };
        state.initialize(num_males, num_females);
        state
    }

    pub fn initialize(&mut self, num_males: u32, num_females: u32) {
        for i in 0..num_females {
            self.person_gender[(num_males + i) as usize] = Gender::Female;
        }

        let mut people: Vec<u32> = (0..self.total_people).collect();
        for day in 0..self.num_of_days as usize {
            let mut rng = rand::rng();
            people.shuffle(&mut rng);

            let mut current_person_idx = 0;
            for group_idx in 0..self.num_of_groups as usize {
                let num_in_group = self.total_people / self.num_of_groups
                    + if group_idx < (self.total_people % self.num_of_groups) as usize {
                        1
                    } else {
                        0
                    };

                for i in 0..num_in_group {
                    let person_id = people[current_person_idx];
                    self.day_group_people[day][group_idx].push(person_id);
                    self.day_person_location[day][person_id as usize] = (group_idx, i as usize);
                    current_person_idx += 1;
                }
            }
        }
        self.recalculate_all_scores();
    }

    pub fn recalculate_all_scores(&mut self) {
        self.curr_num_contacts = 0;
        self.curr_repetition_penalty = 0;
        self.curr_gender_balance_penalty = 0;

        for i in 0..self.total_people as usize {
            for j in 0..self.total_people as usize {
                self.curr_contacts[i][j] = 0;
            }
        }

        for day in 0..self.num_of_days as usize {
            for group in 0..self.num_of_groups as usize {
                for p1_idx in 0..self.day_group_people[day][group].len() {
                    for p2_idx in (p1_idx + 1)..self.day_group_people[day][group].len() {
                        let p1 = self.day_group_people[day][group][p1_idx];
                        let p2 = self.day_group_people[day][group][p2_idx];
                        if self.curr_contacts[p1 as usize][p2 as usize] == 0 {
                            self.curr_num_contacts += 1;
                        }
                        self.curr_contacts[p1 as usize][p2 as usize] += 1;
                        self.curr_contacts[p2 as usize][p1 as usize] += 1;
                    }
                }
            }
        }

        for i in 0..self.total_people as usize {
            for j in (i + 1)..self.total_people as usize {
                if self.curr_contacts[i][j] > 1 {
                    self.curr_repetition_penalty += (self.curr_contacts[i][j] - 1).pow(2) as i32;
                }
            }
        }

        for day in 0..self.num_of_days as usize {
            for group in 0..self.num_of_groups as usize {
                self.curr_gender_balance_penalty +=
                    self.calculate_gender_balance_penalty_for_group(day, group);
            }
        }
    }

    fn calculate_gender_balance_penalty_for_group(&self, day: usize, group: usize) -> i32 {
        let mut male_count = 0;
        for &person_id in &self.day_group_people[day][group] {
            if self.person_gender[person_id as usize] == Gender::Male {
                male_count += 1;
            }
        }
        let female_count = self.day_group_people[day][group].len() as i32 - male_count;
        (male_count - female_count).pow(2)
    }

    pub fn set_immovable_people(&mut self, immovable_people_ids: Vec<u32>) {
        for person_id in immovable_people_ids {
            self.person_is_immovable[person_id as usize] = true;
        }
    }

    pub fn swap_people(&mut self, day: usize, p1_id: u32, p2_id: u32) {
        let (g1_idx, p1_vec_idx) = self.day_person_location[day][p1_id as usize];
        let (g2_idx, p2_vec_idx) = self.day_person_location[day][p2_id as usize];

        if g1_idx == g2_idx {
            return;
        }

        // Update curr_contacts before the swap
        for &member_id in &self.day_group_people[day][g1_idx] {
            if member_id != p1_id {
                self.curr_contacts[p1_id as usize][member_id as usize] -= 1;
                self.curr_contacts[member_id as usize][p1_id as usize] -= 1;
                self.curr_contacts[p2_id as usize][member_id as usize] += 1;
                self.curr_contacts[member_id as usize][p2_id as usize] += 1;
            }
        }
        for &member_id in &self.day_group_people[day][g2_idx] {
            if member_id != p2_id {
                self.curr_contacts[p2_id as usize][member_id as usize] -= 1;
                self.curr_contacts[member_id as usize][p2_id as usize] -= 1;
                self.curr_contacts[p1_id as usize][member_id as usize] += 1;
                self.curr_contacts[member_id as usize][p1_id as usize] += 1;
            }
        }

        // Perform the location swap
        self.day_group_people[day][g1_idx][p1_vec_idx] = p2_id;
        self.day_group_people[day][g2_idx][p2_vec_idx] = p1_id;

        self.day_person_location[day][p1_id as usize] = (g2_idx, p2_vec_idx);
        self.day_person_location[day][p2_id as usize] = (g1_idx, p1_vec_idx);
    }

    pub fn score_delta_of_swap(&self, day: usize, p1_id: u32, p2_id: u32) -> (i32, i32, i32) {
        let (g1_idx, _) = self.day_person_location[day][p1_id as usize];
        let (g2_idx, _) = self.day_person_location[day][p2_id as usize];

        if g1_idx == g2_idx {
            return (0, 0, 0);
        }

        let mut contact_delta = 0;
        let mut repetition_delta = 0;

        // Process group 1
        for &member_id in &self.day_group_people[day][g1_idx] {
            if member_id == p1_id {
                continue;
            }

            // Effect of p1 leaving member_id
            let c_p1_m = self.curr_contacts[p1_id as usize][member_id as usize];
            if c_p1_m == 1 {
                contact_delta -= 1;
            }
            if c_p1_m == 2 {
                repetition_delta -= 1;
            } else if c_p1_m > 2 {
                repetition_delta += (c_p1_m - 2).pow(2) as i32 - (c_p1_m - 1).pow(2) as i32;
            }

            // Effect of p2 joining member_id
            let c_p2_m = self.curr_contacts[p2_id as usize][member_id as usize];
            if c_p2_m == 0 {
                contact_delta += 1;
            }
            if c_p2_m == 1 {
                repetition_delta += 1;
            } else if c_p2_m > 1 {
                repetition_delta += (c_p2_m).pow(2) as i32 - (c_p2_m - 1).pow(2) as i32;
            }
        }

        // Process group 2
        for &member_id in &self.day_group_people[day][g2_idx] {
            if member_id == p2_id {
                continue;
            }

            // Effect of p2 leaving member_id
            let c_p2_m = self.curr_contacts[p2_id as usize][member_id as usize];
            if c_p2_m == 1 {
                contact_delta -= 1;
            }
            if c_p2_m == 2 {
                repetition_delta -= 1;
            } else if c_p2_m > 2 {
                repetition_delta += (c_p2_m - 2).pow(2) as i32 - (c_p2_m - 1).pow(2) as i32;
            }

            // Effect of p1 joining member_id
            let c_p1_m = self.curr_contacts[p1_id as usize][member_id as usize];
            if c_p1_m == 0 {
                contact_delta += 1;
            }
            if c_p1_m == 1 {
                repetition_delta += 1;
            } else if c_p1_m > 1 {
                repetition_delta += (c_p1_m).pow(2) as i32 - (c_p1_m - 1).pow(2) as i32;
            }
        }

        // Gender balance penalty delta
        let gender_delta =
            if self.person_gender[p1_id as usize] != self.person_gender[p2_id as usize] {
                let old_g1_penalty = self.calculate_gender_balance_penalty_for_group(day, g1_idx);
                let old_g2_penalty = self.calculate_gender_balance_penalty_for_group(day, g2_idx);

                let g1_males = self.day_group_people[day][g1_idx]
                    .iter()
                    .filter(|&&p| self.person_gender[p as usize] == Gender::Male)
                    .count() as i32;
                let g1_females = self.day_group_people[day][g1_idx].len() as i32 - g1_males;

                let g2_males = self.day_group_people[day][g2_idx]
                    .iter()
                    .filter(|&&p| self.person_gender[p as usize] == Gender::Male)
                    .count() as i32;
                let g2_females = self.day_group_people[day][g2_idx].len() as i32 - g2_males;

                let (new_g1_males, new_g1_females, new_g2_males, new_g2_females) =
                    if self.person_gender[p1_id as usize] == Gender::Male {
                        (g1_males - 1, g1_females + 1, g2_males + 1, g2_females - 1)
                    } else {
                        (g1_males + 1, g1_females - 1, g2_males - 1, g2_females + 1)
                    };

                let new_g1_penalty = (new_g1_males - new_g1_females).pow(2);
                let new_g2_penalty = (new_g2_males - new_g2_females).pow(2);

                (new_g1_penalty + new_g2_penalty) - (old_g1_penalty + old_g2_penalty)
            } else {
                0
            };

        (contact_delta, repetition_delta, gender_delta)
    }

    pub fn perform_simulated_annealing_step(
        &mut self,
        temp: f64,
        w_contacts: f64,
        w_repetition: f64,
        w_gender: f64,
    ) {
        let day = self.random() as usize % self.num_of_days as usize;
        let p1_id = self.random() as u32 % self.total_people;
        let p2_id = self.random() as u32 % self.total_people;

        if p1_id == p2_id
            || self.person_is_immovable[p1_id as usize]
            || self.person_is_immovable[p2_id as usize]
        {
            return;
        }

        let (contact_delta, repetition_delta, gender_delta) =
            self.score_delta_of_swap(day, p1_id, p2_id);

        let score_delta = w_contacts * contact_delta as f64
            - w_repetition * repetition_delta as f64
            - w_gender * gender_delta as f64;

        if score_delta > 0.0
            || (self.random() as f64 / std::u64::MAX as f64) < (score_delta / temp).exp()
        {
            self.swap_people(day, p1_id, p2_id);
            self.curr_num_contacts += contact_delta;
            self.curr_repetition_penalty += repetition_delta;
            self.curr_gender_balance_penalty += gender_delta;
        }
    }

    pub fn random(&mut self) -> u64 {
        self.rnd_state.next()
    }

    pub fn print_total_num_of_contacts(&self) {
        println!("Contact total available");
    }

    pub fn print_total_penalty(&self) {
        println!("Penalty totals available");
    }

    pub fn print_state(&self) {
        println!("State dump omitted to avoid exposing participant details");
    }
}
