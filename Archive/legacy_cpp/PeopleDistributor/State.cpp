#include "State.h"

std::vector<unsigned int> State::create_m_nums_vec() {
  return create_m_nums_vec(num_of_groups * num_ms_per_group);
}

std::vector<unsigned int> State::create_m_nums_vec(unsigned int total_ms) {
  std::vector<unsigned int> ms(total_ms, 0);
  for (unsigned int i = 0; i < total_ms; ++i) {
    ms[i] = i;
  }
  return ms;
}

std::vector<unsigned int> State::create_f_nums_vec() {
  return create_f_nums_vec(num_of_groups * num_fs_per_group,
                           num_of_groups * num_ms_per_group);
}

std::vector<unsigned int> State::create_f_nums_vec(unsigned int total_fs,
  unsigned int total_ms) {
  std::vector<unsigned int> fs(total_fs, 0);
  for (unsigned int i = 0; i < total_fs; ++i) {
    fs[i] = total_ms + i;
  }
  return fs;
}

float State::average_contacts_per_person() {
  return (static_cast<float>(curr_num_contacts) * 2.0f) / (num_of_groups *
    (num_ms_per_group + num_fs_per_group));
}

float State::average_penalty_per_person() {
  return (static_cast<float>(curr_penalty) * 2.0f) / (num_of_groups *
    (num_ms_per_group + num_fs_per_group));
}



int State::contact_delta_of_swap_m(unsigned int day, unsigned int m_gr1,
  unsigned int m1, unsigned int m_gr2,
  unsigned int m2) {
  if (m_gr1 == m_gr2) {
    return 0;
  }
  int contact_delta = 0;

  // Else: calculate how the contact matrix would change if the two were changed.
  // Calculate losses of contacts of m1
  unsigned int m1_num = m_day_group_person[day][m_gr1][m1];
  for (unsigned int m_in_gr1 = 0; m_in_gr1 < num_ms_per_group; ++m_in_gr1) {
    if (curr_contacts[m_day_group_person[day][m_gr1][m_in_gr1]]
      [m1_num] == 0) {
      throw std::runtime_error("curr_contacts[m_day_group_person[day][m_gr1]"
        "[m_in_gr1]][m1_num] == 0 "
        "ASSUMPTION FALSE, THIS SHOULDN't BE POSSIBLE!");
    }
    if (curr_contacts[m_day_group_person[day][m_gr1][m_in_gr1]][m1_num] == 1) {
      contact_delta--;
    }
  }
  // Calculate losses of contacts of m2
  unsigned int m2_num = m_day_group_person[day][m_gr2][m2];
  for (unsigned int m_in_gr2 = 0; m_in_gr2 < num_ms_per_group; ++m_in_gr2) {
    if (curr_contacts[m_day_group_person[day][m_gr2][m_in_gr2]][m2_num] == 0) {
      throw std::runtime_error("curr_contacts[m_day_group_person[day][m_gr2]"
        "[m_in_gr2]][m2_num] == 0 "
        "ASSUMPTION FALSE, THIS SHOULDN't BE POSSIBLE!");
    }
    if (curr_contacts[m_day_group_person[day][m_gr2][m_in_gr2]][m2_num] == 1) {
      contact_delta--;
    }
  }

  // Calculate newly gained contacts of m1
  for (unsigned int m_in_gr2 = 0; m_in_gr2 < num_ms_per_group; ++m_in_gr2) {
    if (curr_contacts[m_day_group_person[day][m_gr2][m_in_gr2]][m1_num] == 0) {
      // The following if is necessary because the person who just left the 
      // group is not going to be met
      if (m_in_gr2 != m2) {
        contact_delta++;
      }
    }
  }
  // Calculate newly gained contacts of m2
  for (unsigned int m_in_gr1 = 0; m_in_gr1 < num_ms_per_group; ++m_in_gr1) {
    if (curr_contacts[m_day_group_person[day][m_gr1][m_in_gr1]][m2_num] == 0) {
      // The following if is necessary because the person who just left the 
      // group is not going to be met
      if (m_in_gr1 != m1) {
        contact_delta++;
      }
    }
  }

  return contact_delta;
}

int State::penalty_delta_of_swap_m(unsigned int day, unsigned int m_gr1,
  unsigned int m1, unsigned int m_gr2,
  unsigned int m2) {
  if (m_gr1 == m_gr2) {
    return 0;
  }
  int penalty_delta = 0;

  // Else: calculate how the contact matrix would change if the two were changed.
  // Calculate losses of contacts of m1
  unsigned int m1_num = m_day_group_person[day][m_gr1][m1];
  for (unsigned int m_in_gr1 = 0; m_in_gr1 < num_ms_per_group; ++m_in_gr1) {
    if (curr_contacts[m_day_group_person[day][m_gr1][m_in_gr1]]
      [m1_num] == 0) {
      throw std::runtime_error("curr_contacts[m_day_group_person[day][m_gr1]"
        "[m_in_gr1]][m1_num] == 0 "
        "ASSUMPTION FALSE, THIS SHOULDN't BE POSSIBLE!");
    }
    if (curr_contacts[m_day_group_person[day][m_gr1][m_in_gr1]][m1_num] > 1) {
      if (m_day_group_person[day][m_gr1][m_in_gr1] != m1_num) {
        penalty_delta -= pow(curr_contacts[m_day_group_person[day][m_gr1]
          [m_in_gr1]][m1_num] - 1, 2);
      }
    }
    //if (curr_contacts[m_day_group_person[day][m_gr1][m_in_gr1]][m1_num] == 1) {
    //  penalty_delta--;
    //}
  }
  // Calculate losses of contacts of m2
  unsigned int m2_num = m_day_group_person[day][m_gr2][m2];
  for (unsigned int m_in_gr2 = 0; m_in_gr2 < num_ms_per_group; ++m_in_gr2) {
    if (curr_contacts[m_day_group_person[day][m_gr2][m_in_gr2]][m2_num] == 0) {
      throw std::runtime_error("curr_contacts[m_day_group_person[day][m_gr2]"
        "[m_in_gr2]][m2_num] == 0 "
        "ASSUMPTION FALSE, THIS SHOULDN't BE POSSIBLE!");
    }
    if (curr_contacts[m_day_group_person[day][m_gr2][m_in_gr2]][m2_num] > 1) {
      if (m_day_group_person[day][m_gr2][m_in_gr2] != m2_num) {
        penalty_delta -= pow(curr_contacts[m_day_group_person[day][m_gr2]
          [m_in_gr2]][m2_num] - 1, 2);
      }
    }
    //if (curr_contacts[m_day_group_person[day][m_gr2][m_in_gr2]][m2_num] == 1) {
    //  penalty_delta--;
    //}
  }

  // Calculate newly gained contacts of m1
  for (unsigned int m_in_gr2 = 0; m_in_gr2 < num_ms_per_group; ++m_in_gr2) {
    //if (curr_contacts[m_day_group_person[day][m_gr2][m_in_gr2]][m1_num] == 0) {
      // The following if is necessary because the person who just left the 
      // group is not going to be met
      if (m_in_gr2 != m2) {
        penalty_delta += pow(curr_contacts[m_day_group_person[day][m_gr2]
                              [m_in_gr2]][m1_num], 2);
      }
    //}
  }
  // Calculate newly gained contacts of m2
  for (unsigned int m_in_gr1 = 0; m_in_gr1 < num_ms_per_group; ++m_in_gr1) {
    //if (curr_contacts[m_day_group_person[day][m_gr1][m_in_gr1]][m2_num] == 0) {
      // The following if is necessary because the person who just left the 
      // group is not going to be met
      if (m_in_gr1 != m1) {
        penalty_delta += pow(curr_contacts[m_day_group_person[day][m_gr1]
                              [m_in_gr1]][m2_num], 2);
      }
    //}
  }

  return penalty_delta;
}

int State::penalty_delta_of_swap_f(unsigned int day, unsigned int f_gr1,
  unsigned int f1, unsigned int f_gr2,
  unsigned int f2) {
  if (f_gr1 == f_gr2) {
    return 0;
  }
  int penalty_delta = 0;

  // Else: calculate how the contact matrix would change if the two were changed
  // Calculate losses of contacts of f1
  unsigned int f1_num = f_day_group_person[day][f_gr1][f1];
  for (unsigned int f_in_gr1 = 0; f_in_gr1 < num_fs_per_group; ++f_in_gr1) {
    if (curr_contacts[f_day_group_person[day][f_gr1][f_in_gr1]]
                     [f1_num] == 0) {
    	throw std::runtime_error("curr_contacts[f_day_group_person[day]"
                               "[f_gr1][f_in_gr1]][f1_num] == 0 "
                             "ASSUMPTION FALSE, THIS SHOULDN't BE POSSIBLE!");
    }
    if (curr_contacts[f_day_group_person[day][f_gr1][f_in_gr1]][f1_num] > 1) {
      if (f_day_group_person[day][f_gr1][f_in_gr1] != f1_num) {
        penalty_delta -= pow(curr_contacts[f_day_group_person[day][f_gr1][f_in_gr1]][f1_num] - 1, 2);
      }
    }
  }
  // Calculate losses of contacts of f2
  unsigned int f2_num = f_day_group_person[day][f_gr2][f2];
  for (unsigned int f_in_gr2 = 0; f_in_gr2 < num_fs_per_group; ++f_in_gr2) {
    if (curr_contacts[f_day_group_person[day][f_gr2][f_in_gr2]]
                     [f2_num] == 0) {
    	throw std::runtime_error("curr_contacts[f_day_group_person[day]"
                               "[f_gr2][f_in_gr2]][f2_num] == 0 "
                             "ASSUMPTION FALSE, THIS SHOULDN't BE POSSIBLE!");
    }
    if (curr_contacts[f_day_group_person[day][f_gr2][f_in_gr2]][f2_num] > 1) {
      if (f_day_group_person[day][f_gr2][f_in_gr2] != f2_num) {
        penalty_delta -= pow(curr_contacts[f_day_group_person[day][f_gr2][f_in_gr2]][f2_num] - 1, 2);
      }
    }
  }

  // Calculate newly gained contacts of f1
  for (unsigned int f_in_gr2 = 0; f_in_gr2 < num_fs_per_group; ++f_in_gr2) {
    //if (curr_contacts[f_day_group_person[day][f_gr2][f_in_gr2]][f1_num] == 0) {
      // The following if is necessary because the person who just left 
      // the group is not going to be met
      if (f_in_gr2 != f2) {
        penalty_delta += pow(curr_contacts[f_day_group_person[day][f_gr2][f_in_gr2]][f1_num], 2);
      }
    //}
  }
  // Calculate newly gained contacts of f2
  for (unsigned int f_in_gr1 = 0; f_in_gr1 < num_fs_per_group; ++f_in_gr1) {
    //if (curr_contacts[f_day_group_person[day][f_gr1][f_in_gr1]][f2_num] == 0) {
      // The following if is necessary because the person who just left 
      // the group is not going to be met
      if (f_in_gr1 != f1) {
        penalty_delta += pow(curr_contacts[f_day_group_person[day][f_gr1][f_in_gr1]][f2_num], 2);
      }
    //}
  }
  return penalty_delta;
}

int State::contact_delta_of_swap_f(unsigned int day, unsigned int f_gr1,
  unsigned int f1, unsigned int f_gr2,
  unsigned int f2) {
  if (f_gr1 == f_gr2) {
    return 0;
  }
  int contact_delta = 0;

  // Else: calculate how the contact matrix would change if the two were changed
  // Calculate losses of contacts of f1
  unsigned int f1_num = f_day_group_person[day][f_gr1][f1];
  for (unsigned int f_in_gr1 = 0; f_in_gr1 < num_fs_per_group; ++f_in_gr1) {
    //if (curr_contacts[f_day_group_person[day][f_gr1][f_in_gr1]]
    //                 [f1_num] == 0) {
    //	throw std::runtime_error("curr_contacts[f_day_group_person[day]"
    //                           "[f_gr1][f_in_gr1]][f1_num] == 0 "
    //                         "ASSUMPTION FALSE, THIS SHOULDN't BE POSSIBLE!");
    //}
    if (curr_contacts[f_day_group_person[day][f_gr1][f_in_gr1]][f1_num] == 1) {
      contact_delta--;
    }
  }
  // Calculate losses of contacts of f2
  unsigned int f2_num = f_day_group_person[day][f_gr2][f2];
  for (unsigned int f_in_gr2 = 0; f_in_gr2 < num_fs_per_group; ++f_in_gr2) {
    //if (curr_contacts[f_day_group_person[day][f_gr2][f_in_gr2]]
    //                 [f2_num] == 0) {
    //	throw std::runtime_error("curr_contacts[f_day_group_person[day]"
    //                           "[f_gr2][f_in_gr2]][f2_num] == 0 "
    //                         "ASSUMPTION FALSE, THIS SHOULDN't BE POSSIBLE!");
    //}
    if (curr_contacts[f_day_group_person[day][f_gr2][f_in_gr2]][f2_num] == 1) {
      contact_delta--;
    }
  }

  // Calculate newly gained contacts of f1
  for (unsigned int f_in_gr2 = 0; f_in_gr2 < num_fs_per_group; ++f_in_gr2) {
    if (curr_contacts[f_day_group_person[day][f_gr2][f_in_gr2]][f1_num] == 0) {
      // The following if is necessary because the person who just left 
      // the group is not going to be met
      if (f_in_gr2 != f2) {
        contact_delta++;
      }
    }
  }
  // Calculate newly gained contacts of f2
  for (unsigned int f_in_gr1 = 0; f_in_gr1 < num_fs_per_group; ++f_in_gr1) {
    if (curr_contacts[f_day_group_person[day][f_gr1][f_in_gr1]][f2_num] == 0) {
      // The following if is necessary because the person who just left 
      // the group is not going to be met
      if (f_in_gr1 != f1) {
        contact_delta++;
      }
    }
  }

  return contact_delta;
}

void State::swap_m(unsigned int day, unsigned int m_gr1, unsigned int m1,
  unsigned int m_gr2, unsigned int m2) {
  unsigned int m1_num = m_day_group_person[day][m_gr1][m1];
  unsigned int m2_num = m_day_group_person[day][m_gr2][m2];

  // Swap the two nums in the state
  m_day_group_person[day][m_gr2][m2] = m1_num;
  m_day_group_person[day][m_gr1][m1] = m2_num;

  // In this case nothing about the contacts changes
  if (m_gr1 == m_gr2) {
    return;
  }

  // Else: calculate how the contact matrix changes if the two change.
  // Consider losses of contacts of m1
  for (unsigned int m_in_gr1 = 0; m_in_gr1 < num_ms_per_group; ++m_in_gr1) {
    if (m_in_gr1 != m1) {
      if (curr_contacts[m_day_group_person[day][m_gr1][m_in_gr1]][m1_num] == 0) {
        throw std::runtime_error("curr_contacts[m_day_group_person[day]"
          "[m_gr1][m_in_gr1]][m1_num] == 0 "
          "ASSUMPTION FALSE, THIS SHOULDN't BE POSSIBLE!");
      }
      if (curr_contacts[m_day_group_person[day][m_gr1][m_in_gr1]][m1_num] == 1) {
        curr_num_contacts--;
      }
      curr_contacts[m_day_group_person[day][m_gr1][m_in_gr1]][m1_num]--;
      curr_contacts[m1_num][m_day_group_person[day][m_gr1][m_in_gr1]]--;
      curr_penalty -=
        pow(curr_contacts[m_day_group_person[day][m_gr1][m_in_gr1]][m1_num], 2);
    }

  }
  // Consider losses of contacts of m2
  for (unsigned int m_in_gr2 = 0; m_in_gr2 < num_ms_per_group; ++m_in_gr2) {
    if (m_in_gr2 != m2) {
      if (curr_contacts[m_day_group_person[day][m_gr2][m_in_gr2]][m2_num] == 0) {
        throw std::runtime_error("curr_contacts[m_day_group_person[day][m_gr2]"
          "[m_in_gr2]][m2_num] == 0 ASSUMPTION FALSE, "
          "THIS SHOULDN't BE POSSIBLE!");
      }
      if (curr_contacts[m_day_group_person[day][m_gr2][m_in_gr2]][m2_num] == 1) {
        curr_num_contacts--;
      }
      curr_contacts[m_day_group_person[day][m_gr2][m_in_gr2]][m2_num]--;
      curr_contacts[m2_num][m_day_group_person[day][m_gr2][m_in_gr2]]--;
      curr_penalty -=
        pow(curr_contacts[m_day_group_person[day][m_gr2][m_in_gr2]][m2_num], 2);
    }
  }

  // Calculate newly gained contacts of m1
  for (unsigned int m_in_gr2 = 0; m_in_gr2 < num_ms_per_group; ++m_in_gr2) {
    if (curr_contacts[m_day_group_person[day][m_gr2][m_in_gr2]][m1_num] == 0) {
      // The following if is necessary because the person who just 
      // left the group is not going to be met
      if (m_in_gr2 != m2) {
        curr_num_contacts++;
      }
    }
    if (m_in_gr2 != m2) {
      curr_penalty +=
        pow(curr_contacts[m_day_group_person[day][m_gr2][m_in_gr2]][m1_num], 2);
      curr_contacts[m_day_group_person[day][m_gr2][m_in_gr2]][m1_num]++;
      curr_contacts[m1_num][m_day_group_person[day][m_gr2][m_in_gr2]]++;
    }
  }
  // Calculate newly gained contacts of m2
  for (unsigned int m_in_gr1 = 0; m_in_gr1 < num_ms_per_group; ++m_in_gr1) {
    if (curr_contacts[m_day_group_person[day][m_gr1][m_in_gr1]][m2_num] == 0) {
      // The following if is necessary because the person who just 
      // left the group is not going to be met
      if (m_in_gr1 != m1) {
        curr_num_contacts++;
      }
    }
    if (m_in_gr1 != m1) {
      curr_penalty +=
        pow(curr_contacts[m_day_group_person[day][m_gr1][m_in_gr1]][m2_num], 2);
      curr_contacts[m_day_group_person[day][m_gr1][m_in_gr1]][m2_num]++;
      curr_contacts[m2_num][m_day_group_person[day][m_gr1][m_in_gr1]]++;
    }
  }
}

void State::swap_f(unsigned int day, unsigned int f_gr1, unsigned int f1,
  unsigned int f_gr2, unsigned int f2) {
  unsigned int f1_num = f_day_group_person[day][f_gr1][f1];
  unsigned int f2_num = f_day_group_person[day][f_gr2][f2];

  // Swap the two nums in the state
  f_day_group_person[day][f_gr2][f2] = f1_num;
  f_day_group_person[day][f_gr1][f1] = f2_num;

  // In this case nothing about the contacts changes
  if (f_gr1 == f_gr2) {
    return;
  }

  // Else: calculate how the contact matrix changes if the two change.
  // Consider losses of contacts of f1
  for (unsigned int f_in_gr1 = 0; f_in_gr1 < num_fs_per_group; ++f_in_gr1) {
    if (f_in_gr1 != f1) {
      if (curr_contacts[f_day_group_person[day][f_gr1][f_in_gr1]][f1_num] == 0) {
        throw std::runtime_error("curr_contacts[f_day_group_person[day][f_gr1]"
          "[f_in_gr1]][f1_num] == 0 ASSUMPTION FALSE, "
          "THIS SHOULDN't BE POSSIBLE!");
      }
      if (curr_contacts[f_day_group_person[day][f_gr1][f_in_gr1]][f1_num] == 1) {
        curr_num_contacts--;
      }
      curr_contacts[f_day_group_person[day][f_gr1][f_in_gr1]][f1_num]--;
      curr_contacts[f1_num][f_day_group_person[day][f_gr1][f_in_gr1]]--;
      curr_penalty -=
        pow(curr_contacts[f_day_group_person[day][f_gr1][f_in_gr1]][f1_num], 2);
    }

  }
  // Consider losses of contacts of f2
  for (unsigned int f_in_gr2 = 0; f_in_gr2 < num_fs_per_group; ++f_in_gr2) {
    if (f_in_gr2 != f2) {
      if (curr_contacts[f_day_group_person[day][f_gr2][f_in_gr2]][f2_num] == 0) {
        throw std::runtime_error("curr_contacts[f_day_group_person[day][f_gr2]"
          "[f_in_gr2]][f2_num] == 0 ASSUMPTION FALSE, "
          "THIS SHOULDN't BE POSSIBLE!");
      }
      if (curr_contacts[f_day_group_person[day][f_gr2][f_in_gr2]][f2_num] == 1) {
        curr_num_contacts--;
      }
      curr_contacts[f_day_group_person[day][f_gr2][f_in_gr2]][f2_num]--;
      curr_contacts[f2_num][f_day_group_person[day][f_gr2][f_in_gr2]]--;
      curr_penalty -=
        pow(curr_contacts[f_day_group_person[day][f_gr2][f_in_gr2]][f2_num], 2);
    }
  }

  // Calculate newly gained contacts of f1
  for (unsigned int f_in_gr2 = 0; f_in_gr2 < num_fs_per_group; ++f_in_gr2) {
    if (curr_contacts[f_day_group_person[day][f_gr2][f_in_gr2]][f1_num] == 0) {
      // The following if is necessary because the person who just 
      // left the group is not going to be met
      if (f_in_gr2 != f2) {
        curr_num_contacts++;
      }
    }
    if (f_in_gr2 != f2) {
      curr_penalty +=
        pow(curr_contacts[f_day_group_person[day][f_gr2][f_in_gr2]][f1_num], 2);
      curr_contacts[f_day_group_person[day][f_gr2][f_in_gr2]][f1_num]++;
      curr_contacts[f1_num][f_day_group_person[day][f_gr2][f_in_gr2]]++;
    }
  }
  // Calculate newly gained contacts of f2
  for (unsigned int f_in_gr1 = 0; f_in_gr1 < num_fs_per_group; ++f_in_gr1) {
    if (curr_contacts[f_day_group_person[day][f_gr1][f_in_gr1]][f2_num] == 0) {
      // The following if is necessary because the person who just 
      // left the group is not going to be met
      if (f_in_gr1 != f1) {
        curr_num_contacts++;
      }
    }
    if (f_in_gr1 != f1) {
      curr_penalty +=
        pow(curr_contacts[f_day_group_person[day][f_gr1][f_in_gr1]][f2_num], 2);
      curr_contacts[f_day_group_person[day][f_gr1][f_in_gr1]][f2_num]++;
      curr_contacts[f2_num][f_day_group_person[day][f_gr1][f_in_gr1]]++;
    }
  }
}

void State::set_num_of_immovable_ms_per_group(
  std::vector<unsigned int> num_of_immovable_ms_per_group) {
  m_num_of_immovable_people_per_group = num_of_immovable_ms_per_group;

  if (num_of_immovable_ms_per_group.size() != num_of_groups) {
    throw std::runtime_error("input for set_num_immovable_persons must"
      "have dimension equal to number of groups");
  }
  bool found = false;
  bool can_move = false;
  unsigned int nth_pers_in_group = 0;
  for (unsigned int i = 0; i < num_ms_per_group * num_of_groups; ++i) {
    if (i % num_of_groups == 0) ++nth_pers_in_group;
    can_move = (not (nth_pers_in_group <=
      m_num_of_immovable_people_per_group[i % num_of_groups]));
    if (not can_move) {
      for (unsigned int day = 1; day < num_of_days; ++day) {
        for (unsigned int group = 0; group < num_of_groups; ++group) {
          for (unsigned int pers = 0; pers < num_ms_per_group; ++pers) {
            if (m_day_group_person[day][group][pers] == i) {
              swap_m(day, group, pers, i % num_of_groups, i - (i % num_of_groups));
              //m_day_group_person[day][group][pers] =
              //  m_day_group_person[day][i % num_of_groups]
              //  [i - (i % num_of_groups)];
              //m_day_group_person[day][i % num_of_groups]
              //  [i - (i % num_of_groups)] = i;

              //swap_m(day, group, pers, i - (i % num_ms_per_group), i % num_ms_per_group);
              //m_day_group_person[day][group][pers] = m_day_group_person[day]
              //  [i - (i % num_ms_per_group)][i % num_ms_per_group];
              //m_day_group_person[day][i - (i % num_ms_per_group)]
              //  [i % num_ms_per_group] = i;
              found = true;
              break;
            }
          }
          if (found) { break; }
        }
        found = false;
      }
    }
  }

  //nth_pers_in_group = 0;
  //for (unsigned int i = 0; i < num_ms_per_group * num_of_groups; ++i) {
  //  if (i % num_of_groups == 0) ++nth_pers_in_group;
  //  if (nth_pers_in_group <= num_of_immovable_ms_per_group[i % num_of_groups]) {
  //    person_can_move[i] = false;
  //  } else {
  //    person_can_move[i] = true;
  //  }
  //}
}

void State::set_num_of_immovable_fs_per_group(
  std::vector<unsigned int> num_of_immovable_fs_per_group) {
  f_num_of_immovable_people_per_group = num_of_immovable_fs_per_group;

  if (num_of_immovable_fs_per_group.size() != num_of_groups) {
    throw std::runtime_error("input for set_num_immovable_persons must"
      "have dimension equal to number of groups");
  }
  bool found = false;
  bool can_move = false;
  unsigned int nth_pers_in_group = 0;
  for (unsigned int i = num_ms_per_group * num_of_groups;
    i < (num_ms_per_group * num_of_groups) + num_fs_per_group *
    num_of_groups; ++i) {
    if (i % num_of_groups == 0) ++nth_pers_in_group;
    can_move = (not (nth_pers_in_group <=
      f_num_of_immovable_people_per_group[i % num_of_groups]));
    if (not can_move) {
      for (unsigned int day = 1; day < num_of_days; ++day) {
        for (unsigned int group = 0; group < num_of_groups; ++group) {
          for (unsigned int pers = 0; pers < num_fs_per_group; ++pers) {
            if (f_day_group_person[day][group][pers] == i) {
              swap_f(day, group, pers, i % num_of_groups, i -
                (i % num_of_groups) - (num_ms_per_group * num_of_groups));
              //f_day_group_person[day][group][pers] =
              //  f_day_group_person[day][i % num_of_groups][i -
              //  (i % num_of_groups) - (num_ms_per_group * num_of_groups)];
              //f_day_group_person[day][i % num_of_groups][i -
              //  (i % num_of_groups) - (num_ms_per_group * num_of_groups)] = i;

              //swap_f(day, group, pers, i - (i % num_fs_per_group) - (num_ms_per_group *
              //  num_of_groups), i % num_fs_per_group);
              //f_day_group_person[day][group][pers] = f_day_group_person[day]
              //  [i - (i % num_fs_per_group) - (num_ms_per_group *
              //    num_of_groups)][i % num_fs_per_group];
              //f_day_group_person[day][i - (i % num_fs_per_group) -
              //  (num_ms_per_group * num_of_groups)]
              //  [i % num_fs_per_group] = i;
              found = true;
              break;
            }
          }
          if (found) { break; }
        }
        found = false;
      }
    }
  }

  //nth_pers_in_group = 0;
  //for (unsigned int i = 0; i < num_fs_per_group * num_of_groups; ++i) {
  //  if (i % num_of_groups == 0) ++nth_pers_in_group;
  //  if (nth_pers_in_group <= num_of_immovable_fs_per_group[i % num_of_groups]) {
  //    person_can_move[i + num_ms_per_group * num_of_groups] = false;
  //  } else {
  //    person_can_move[i + num_ms_per_group * num_of_groups] = true;
  //  }
  //}
}


void State::try_random_m_swap_and_proceed_if_contact_delta_pos() {
  // Required random nums and their range: day:			(1 - num_of_days-1)
  //											m_gr1:	(0 - num_of_groups-1)
  //											m1:			(0 - num_ms_per_group)
  //											m_gr2:	(0 - num_of_groups-1)
  //											m2:			(0 - num_ms_per_group)
  unsigned int day = (xorshift128p(&rnd_state) % (num_of_days - 1)) + 1;
  unsigned int m_gr1 = xorshift128p(&rnd_state) % num_of_groups;
  unsigned int m_gr2 = xorshift128p(&rnd_state) % num_of_groups;
  unsigned int m1 = xorshift128p(&rnd_state) %
    (num_ms_per_group - m_num_of_immovable_people_per_group[m_gr1])
    + m_num_of_immovable_people_per_group[m_gr1];
  unsigned int m2 = xorshift128p(&rnd_state) %
    (num_ms_per_group - m_num_of_immovable_people_per_group[m_gr2])
    + m_num_of_immovable_people_per_group[m_gr2];

  if (contact_delta_of_swap_m(day, m_gr1, m1, m_gr2, m2) >= 0) {
    swap_m(day, m_gr1, m1, m_gr2, m2);
  }
}

void State::try_random_f_swap_and_proceed_if_contact_delta_pos() {
  // Required random nums and their range: day:			(1 - num_of_days-1)
  //											f_gr1:	(0 - num_of_groups-1)
  //											f1:			(0 - num_fs_per_group)
  //											f_gr2:	(0 - num_of_groups-1)
  //											f2:			(0 - num_fs_per_group)
  unsigned int day = (xorshift128p(&rnd_state) % (num_of_days - 1)) + 1;
  unsigned int f_gr1 = xorshift128p(&rnd_state) % num_of_groups;
  unsigned int f_gr2 = xorshift128p(&rnd_state) % num_of_groups;
  unsigned int f1 = xorshift128p(&rnd_state) %
    (num_fs_per_group - f_num_of_immovable_people_per_group[f_gr1])
    + f_num_of_immovable_people_per_group[f_gr1];
  unsigned int f2 = xorshift128p(&rnd_state) %
    (num_fs_per_group - f_num_of_immovable_people_per_group[f_gr2])
    + f_num_of_immovable_people_per_group[f_gr2];

  if (contact_delta_of_swap_f(day, f_gr1, f1, f_gr2, f2) >= 0) {
    swap_f(day, f_gr1, f1, f_gr2, f2);
  }
}

void State::perform_simulated_annealing_step(double temp) {
  unsigned int day = (xorshift128p(&rnd_state) % (num_of_days - 1)) + 1;
  unsigned int m_gr1 = xorshift128p(&rnd_state) % num_of_groups;
  unsigned int m_gr2 = xorshift128p(&rnd_state) % num_of_groups;
  unsigned int m1 = xorshift128p(&rnd_state) %
    (num_ms_per_group - m_num_of_immovable_people_per_group[m_gr1])
    + m_num_of_immovable_people_per_group[m_gr1];
  unsigned int m2 = xorshift128p(&rnd_state) %
    (num_ms_per_group - m_num_of_immovable_people_per_group[m_gr2])
    + m_num_of_immovable_people_per_group[m_gr2];

  int delta_m = contact_delta_of_swap_m(day, m_gr1, m1, m_gr2, m2);

  if (delta_m >= 0) {
    swap_m(day, m_gr1, m1, m_gr2, m2);
  } else if ((static_cast<double>(xorshift128p(&rnd_state))
    / static_cast<double>(UINT64_MAX)) <
    exp(static_cast<double>(delta_m) / temp)) {
    swap_m(day, m_gr1, m1, m_gr2, m2);
  }

  unsigned int f_gr1 = xorshift128p(&rnd_state) % num_of_groups;
  unsigned int f_gr2 = xorshift128p(&rnd_state) % num_of_groups;
  unsigned int f1 = xorshift128p(&rnd_state) %
    (num_fs_per_group - f_num_of_immovable_people_per_group[f_gr1])
    + f_num_of_immovable_people_per_group[f_gr1];
  unsigned int f2 = xorshift128p(&rnd_state) %
    (num_fs_per_group - f_num_of_immovable_people_per_group[f_gr2])
    + f_num_of_immovable_people_per_group[f_gr2];

  int delta_f = contact_delta_of_swap_f(day, f_gr1, f1, f_gr2, f2);
  if (delta_f >= 0) {
    swap_f(day, f_gr1, f1, f_gr2, f2);
  } else if ((static_cast<double>(xorshift128p(&rnd_state))
    / static_cast<double>(UINT64_MAX)) <
    exp(static_cast<double>(delta_f) / temp)) {
    swap_f(day, f_gr1, f1, f_gr2, f2);
  }
}


void State::perform_simulated_annealing_penalty_version_step(double temp) {
  unsigned int day = (xorshift128p(&rnd_state) % (num_of_days - 1)) + 1;
  unsigned int m_gr1 = xorshift128p(&rnd_state) % num_of_groups;
  unsigned int m_gr2 = xorshift128p(&rnd_state) % num_of_groups;
  unsigned int m1 = xorshift128p(&rnd_state) %
    (num_ms_per_group - m_num_of_immovable_people_per_group[m_gr1])
    + m_num_of_immovable_people_per_group[m_gr1];
  unsigned int m2 = xorshift128p(&rnd_state) %
    (num_ms_per_group - m_num_of_immovable_people_per_group[m_gr2])
    + m_num_of_immovable_people_per_group[m_gr2];

  int delta_m = -penalty_delta_of_swap_m(day, m_gr1, m1, m_gr2, m2);

  if (delta_m >= 0) {
    swap_m(day, m_gr1, m1, m_gr2, m2);
  } else if ((static_cast<double>(xorshift128p(&rnd_state))
    / static_cast<double>(UINT64_MAX)) <
    exp(static_cast<double>(delta_m) / temp)) {
    swap_m(day, m_gr1, m1, m_gr2, m2);
  }

  unsigned int f_gr1 = xorshift128p(&rnd_state) % num_of_groups;
  unsigned int f_gr2 = xorshift128p(&rnd_state) % num_of_groups;
  unsigned int f1 = xorshift128p(&rnd_state) %
    (num_fs_per_group - f_num_of_immovable_people_per_group[f_gr1])
    + f_num_of_immovable_people_per_group[f_gr1];
  unsigned int f2 = xorshift128p(&rnd_state) %
    (num_fs_per_group - f_num_of_immovable_people_per_group[f_gr2])
    + f_num_of_immovable_people_per_group[f_gr2];

  int delta_f = -penalty_delta_of_swap_f(day, f_gr1, f1, f_gr2, f2);
  if (delta_f >= 0) {
    swap_f(day, f_gr1, f1, f_gr2, f2);
  } else if ((static_cast<double>(xorshift128p(&rnd_state))
    / static_cast<double>(UINT64_MAX)) <
    exp(static_cast<double>(delta_f) / temp)) {
    swap_f(day, f_gr1, f1, f_gr2, f2);
  }
}


State::State() {
  //rnd_state = new xorshift128p_state();
  rnd_state.a = std::time(0);
  rnd_state.b = 1234124124;
}

State::State(unsigned int in_num_of_groups, unsigned int in_num_ms_per_group,
  unsigned int in_num_fs_per_group, unsigned int in_num_of_days) {
  rnd_state.a = std::time(0);
  rnd_state.b = 1234124124;
  initialize(in_num_of_groups, in_num_ms_per_group,
    in_num_fs_per_group, in_num_of_days);
}

State::~State() {
}

void State::initialize(unsigned int in_num_of_groups,
  unsigned int in_num_ms_per_group,
  unsigned int in_num_fs_per_group,
  unsigned int in_num_of_days) {
  num_of_groups = in_num_of_groups;
  num_ms_per_group = in_num_ms_per_group;
  num_fs_per_group = in_num_fs_per_group;
  num_of_days = in_num_of_days;

  unsigned int total_people = num_of_groups
    * (num_ms_per_group + num_fs_per_group);
  unsigned int total_ms = num_of_groups * num_ms_per_group;
  unsigned int total_fs = num_of_groups * num_fs_per_group;

  std::vector<unsigned int> m_num_of_immovable_people_per_group(num_of_groups,
    0);
  std::vector<unsigned int> f_num_of_immovable_people_per_group(num_of_groups,
    0);
  std::vector<std::vector<unsigned int>>
    vec_curr_c(total_people, std::vector<unsigned int>(total_people, 0));
  curr_contacts = vec_curr_c;

  std::vector<std::vector<std::vector<unsigned int>>>
    vec_m(num_of_days, std::vector<std::vector<unsigned int>>
      (num_of_groups, std::vector<unsigned int>
        (num_ms_per_group, 0)));

  m_day_group_person = vec_m;

  std::vector<std::vector<std::vector<unsigned int>>>
    vec_f(num_of_days, std::vector<std::vector<unsigned int>>
      (num_of_groups, std::vector<unsigned int>
        (num_fs_per_group, 0)));

  f_day_group_person = vec_f;

  // Create an initial state:

  // To create an initial state the 3-dimensional vectors m_day_group_person 
  // and f_day_group_person must be completely filled with values. In every 
  // 'layer' every number from 0 - total_ms - 1 (for m_day_group_person) or 
  // total_ms - total_people - 1 (for f_day_group_person respectively) must 
  // appear exactly once.
  // In the first layer, they are going to appear in order, in the other 
  // layers they will be mixed randomly.

  // Starting with m_day_group_person:
  // ms will be represented by the integers 0 - total_ms - 1.
  std::vector<unsigned int> ms;
  ms = create_m_nums_vec(total_ms);

  // On the first day the people are always ordered
  // for each column:
  for (unsigned int person = 0; person < num_ms_per_group; ++person) {
    // for each row:
    for (unsigned int group = 0; group < num_of_groups; ++group) {
      //if (ms[0] != num_ms_per_group * group + person) {
      //	throw std::runtime_error("ms[0] != num_ms_per_group "
      //                           "* group + person ASSUMPTION FALSE!");
      //}

    //num_of_groups * group + person:
      m_day_group_person[0][group][person] = ms[0];
      ms.erase(ms.begin());
    }
  }
  // On the remaining days they get shuffled.
  // for each layer:
  for (unsigned int day = 1; day < num_of_days; ++day) {
    ms = create_m_nums_vec(total_ms);
    // shuffle the vector randomly
    std::random_device random_dev;
    std::mt19937       generator(random_dev());
    std::shuffle(ms.begin(), ms.end(), generator);
    // for each column:
    for (unsigned int person = 0; person < num_ms_per_group; ++person) {
      // for each row:
      for (unsigned int group = 0; group < num_of_groups; ++group) {
        //num_of_groups * group + person:
        m_day_group_person[day][group][person] = ms[0];
        ms.erase(ms.begin());
      }
    }
  }

  // f_day_group_person:
  // fs will be represented by the integers total_ms - total_people - 1.
  std::vector<unsigned int> fs;
  fs = create_f_nums_vec(total_fs, total_ms);

  // for each column:
  for (unsigned int person = 0; person < num_fs_per_group; ++person) {
    // for each row:
    for (unsigned int group = 0; group < num_of_groups; ++group) {
      //if (fs[0] != total_ms + num_fs_per_group * group + person) {
      //	throw std::runtime_error("fs[0] != total_ms + num_fs_per_group * group"
      //                           " + person ASSUMPTION FALSE!");
      //}

      //num_of_groups * group + person:
      f_day_group_person[0][group][person] = fs[0];
      fs.erase(fs.begin());
    }
  }
  // On the remaining days they get shuffled.
  // for each layer:
  for (unsigned int day = 1; day < num_of_days; ++day) {
    fs = create_f_nums_vec(total_fs, total_ms);
    // shuffle the vector randomly
    std::random_device random_dev;
    std::mt19937       generator(random_dev());
    std::shuffle(fs.begin(), fs.end(), generator);
    // for each column:
    for (unsigned int person = 0; person < num_fs_per_group; ++person) {
      // for each row:
      for (unsigned int group = 0; group < num_of_groups; ++group) {

        //num_of_groups * group + person:
        f_day_group_person[day][group][person] = fs[0];
        fs.erase(fs.begin());
      }
    }
  }

  // Now the state is randomly initialized and only 
  // the contacts matrix must be still updated.
  // This can easily be done in a loop:
  curr_num_contacts = 0;
  curr_penalty = 0;

  for (unsigned int day = 0; day < num_of_days; ++day) {
    for (unsigned int group = 0; group < num_of_groups; ++group) {
      for (unsigned int m1 = 0; m1 < num_ms_per_group; ++m1) {
        // All the ms that see each other
        for (unsigned int m2 = 0; m2 < num_ms_per_group; ++m2) {
          if (m1 != m2) {
            curr_penalty += pow(curr_contacts[m_day_group_person[day][group][m1]]
              [m_day_group_person[day][group][m2]], 2);
          }
          if (curr_contacts[m_day_group_person[day][group][m1]]
            [m_day_group_person[day][group][m2]] == 0) {
            if (m_day_group_person[day][group][m1]
              < m_day_group_person[day][group][m2]) {
              curr_num_contacts++;
            }
          }
          curr_contacts[m_day_group_person[day][group][m1]]
            [m_day_group_person[day][group][m2]]++;
        }
        // All the fs the ms see
        for (unsigned int f2 = 0; f2 < num_fs_per_group; ++f2) {
          curr_penalty += pow(curr_contacts[m_day_group_person[day][group][m1]]
            [f_day_group_person[day][group][f2]], 2);
          if (curr_contacts[m_day_group_person[day][group][m1]]
            [f_day_group_person[day][group][f2]] == 0) {
            curr_num_contacts++;
          }
          curr_contacts[m_day_group_person[day][group][m1]]
            [f_day_group_person[day][group][f2]]++;
          // To make the matrix properly symmetrical 
          // (necessary so the swap functions work correctly):
          curr_contacts[f_day_group_person[day][group][f2]]
            [m_day_group_person[day][group][m1]]++;
        }
      }
      for (unsigned int f1 = 0; f1 < num_fs_per_group; ++f1) {
        // All the fs that see each other
        for (unsigned int f2 = 0; f2 < num_fs_per_group; ++f2) {
          if (f1 != f2) {
            curr_penalty += pow(curr_contacts[f_day_group_person[day][group][f1]]
              [f_day_group_person[day][group][f2]], 2);
          }
          if (curr_contacts[f_day_group_person[day][group][f1]]
            [f_day_group_person[day][group][f2]] == 0) {
            if (f_day_group_person[day][group][f1]
              < f_day_group_person[day][group][f2]) {
              curr_num_contacts++;
            }
          }
          curr_contacts[f_day_group_person[day][group][f1]]
            [f_day_group_person[day][group][f2]]++;
        }
      }
    }
  }
}

void State::print_num_of_contacts_per_person() {
  std::cout << "Average contacts per person in the current state: "
    << average_contacts_per_person() << std::endl;
}

void State::print_total_num_of_contacts() {
  std::cout << "Total contacts in the current state: "
    << curr_num_contacts << std::endl;
}

void State::print_penalty_per_person() {
  std::cout << "Average penalty per person in the current state: "
    << average_penalty_per_person() << std::endl;
}

void State::print_total_penalty() {
  std::cout << "Total penalty in the current state: "
    << curr_penalty << std::endl;
}

void State::print_random_number() {
  std::cout << "Random number: "
    << (xorshift128p(&rnd_state) % 6) + 1 << std::endl;
}

void State::print_state() {
  for (unsigned int day = 0; day < num_of_days; ++day) {
    for (unsigned int m = 0; m < num_ms_per_group; ++m) {
      for (unsigned int group = 0; group < num_of_groups; ++group) {
        std::cout << m_day_group_person[day][group][m] << "	";
      }
      std::cout << "\n";
    }
    for (unsigned int f = 0; f < num_fs_per_group; ++f) {
      for (unsigned int group = 0; group < num_of_groups; ++group) {
        std::cout << f_day_group_person[day][group][f] << "	";
      }
      std::cout << "\n";
    }
    std::cout << "\n";
  }
}

void State::write_state_to_csv() {
  std::ofstream ocsv;
  ocsv.open("Data.csv");
  for (unsigned int day = 0; day < num_of_days; ++day) {
    for (unsigned int m = 0; m < num_ms_per_group; ++m) {
      for (unsigned int group = 0; group < num_of_groups; ++group) {
        ocsv << m_day_group_person[day][group][m] << ",";
      }
      ocsv << "\n";
    }
    for (unsigned int f = 0; f < num_fs_per_group; ++f) {
      for (unsigned int group = 0; group < num_of_groups; ++group) {
        ocsv << f_day_group_person[day][group][f] << ",";
      }
      ocsv << "\n";
    }
    ocsv << "\n";
  }
  ocsv.close();
}

double State::random() {
  return static_cast<double>(xorshift128p(&rnd_state))
    / static_cast<double>(UINT64_MAX);
}

bool State::is_valid() {
  std::vector<unsigned int>ms = create_m_nums_vec();
  std::vector<bool> was_found(num_of_groups * num_ms_per_group, false);
  for (unsigned int day = 0; day < num_of_days; ++day) {
    for (unsigned int i = 0; i < num_of_groups * num_ms_per_group; ++i) {
      was_found[i] = false;
    }
    for (unsigned int group = 0; group < num_of_groups; ++group) {
      for (unsigned int p = 0; p < num_ms_per_group; ++p) {
        if (not was_found[m_day_group_person[day][group][p]]) {
          was_found[m_day_group_person[day][group][p]] = true;
        } else{
          return false;
        } 
      }
    }
  }
  for (unsigned int i = 0; i < num_of_groups * num_ms_per_group; ++i) {
    if (not was_found[i]) {
      return false;
    }
  }

  std::vector<unsigned int>fs = create_f_nums_vec();
  std::vector<bool> was_found_f(num_of_groups * num_fs_per_group, false);
  for (unsigned int day = 0; day < num_of_days; ++day) {
    for (unsigned int i = 0; i < num_of_groups * num_fs_per_group; ++i) {
      was_found_f[i] = false;
    }
    for (unsigned int group = 0; group < num_of_groups; ++group) {
      for (unsigned int p = 0; p < num_fs_per_group; ++p) {
        if (not was_found_f[f_day_group_person[day][group][p]-
            (num_of_groups * num_ms_per_group)]) {
          was_found_f[f_day_group_person[day][group][p]-
            (num_of_groups * num_ms_per_group)] = true;
        } else {
          return false;
        }
      }
    }
  }
  for (unsigned int i = 0; i < num_of_groups * num_fs_per_group; ++i) {
    if (not was_found_f[i]) {
      return false;
    }
  }
  // TODO: should also check if curr_contacts and curr_num_contacts are true

  return true;
}