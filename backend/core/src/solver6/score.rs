use crate::models::Solver6PairRepeatPenaltyModel;
use crate::solver_support::SolverError;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PairUniverse {
    num_people: usize,
    total_distinct_pairs: usize,
}

impl PairUniverse {
    pub fn new(num_people: usize) -> Result<Self, SolverError> {
        if num_people < 2 {
            return Err(SolverError::ValidationError(
                "solver6 pair universe requires at least two people".into(),
            ));
        }

        Ok(Self {
            num_people,
            total_distinct_pairs: num_people * (num_people - 1) / 2,
        })
    }

    pub fn num_people(&self) -> usize {
        self.num_people
    }

    pub fn total_distinct_pairs(&self) -> usize {
        self.total_distinct_pairs
    }

    pub fn pair_index(&self, left: usize, right: usize) -> Result<usize, SolverError> {
        if left >= self.num_people || right >= self.num_people {
            return Err(SolverError::ValidationError(format!(
                "solver6 pair index out of bounds: ({left}, {right}) for {} people",
                self.num_people
            )));
        }
        if left == right {
            return Err(SolverError::ValidationError(format!(
                "solver6 pair index requires two distinct people, got ({left}, {right})"
            )));
        }

        let (left, right) = if left < right {
            (left, right)
        } else {
            (right, left)
        };
        let row_offset = left * (2 * self.num_people - left - 1) / 2;
        Ok(row_offset + (right - left - 1))
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PairMultiplicityHistogram {
    counts_by_frequency: Vec<usize>,
}

impl PairMultiplicityHistogram {
    fn new(counts_by_frequency: Vec<usize>) -> Self {
        Self {
            counts_by_frequency,
        }
    }

    pub fn count_at_frequency(&self, frequency: usize) -> usize {
        self.counts_by_frequency.get(frequency).copied().unwrap_or(0)
    }

    pub fn max_frequency(&self) -> usize {
        self.counts_by_frequency
            .iter()
            .rposition(|count| *count > 0)
            .unwrap_or(0)
    }

    pub fn counts_by_frequency(&self) -> &[usize] {
        &self.counts_by_frequency
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PairFrequencySummary {
    universe: PairUniverse,
    pair_counts: Vec<u16>,
    total_pair_incidences: usize,
    distinct_pairs_covered: usize,
    max_pair_frequency: u16,
    multiplicity_histogram: PairMultiplicityHistogram,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PairFrequencyState {
    universe: PairUniverse,
    pair_counts: Vec<u16>,
    total_pair_incidences: usize,
    distinct_pairs_covered: usize,
    max_pair_frequency: u16,
    multiplicity_histogram: Vec<usize>,
    linear_repeat_excess: u64,
    triangular_repeat_excess: u64,
    squared_repeat_excess: u64,
}

impl PairFrequencyState {
    pub fn from_raw_schedule(
        num_people: usize,
        schedule: &[Vec<Vec<usize>>],
    ) -> Result<Self, SolverError> {
        let summary = PairFrequencySummary::from_raw_schedule(num_people, schedule)?;
        Ok(Self::from_summary(summary))
    }

    pub fn from_summary(summary: PairFrequencySummary) -> Self {
        let linear_repeat_excess = summary.linear_repeat_excess();
        let triangular_repeat_excess = summary.triangular_repeat_excess();
        let squared_repeat_excess = summary.squared_repeat_excess();
        Self {
            universe: summary.universe,
            pair_counts: summary.pair_counts,
            total_pair_incidences: summary.total_pair_incidences,
            distinct_pairs_covered: summary.distinct_pairs_covered,
            max_pair_frequency: summary.max_pair_frequency,
            multiplicity_histogram: summary.multiplicity_histogram.counts_by_frequency,
            linear_repeat_excess,
            triangular_repeat_excess,
            squared_repeat_excess,
        }
    }

    pub fn to_summary(&self) -> PairFrequencySummary {
        PairFrequencySummary {
            universe: self.universe.clone(),
            pair_counts: self.pair_counts.clone(),
            total_pair_incidences: self.total_pair_incidences,
            distinct_pairs_covered: self.distinct_pairs_covered,
            max_pair_frequency: self.max_pair_frequency,
            multiplicity_histogram: PairMultiplicityHistogram::new(
                self.multiplicity_histogram.clone(),
            ),
        }
    }

    pub fn universe(&self) -> &PairUniverse {
        &self.universe
    }

    pub fn pair_count_by_index(&self, pair_idx: usize) -> Result<u16, SolverError> {
        self.pair_counts.get(pair_idx).copied().ok_or_else(|| {
            SolverError::ValidationError(format!(
                "solver6 pair state index {pair_idx} out of bounds for {} pairs",
                self.pair_counts.len()
            ))
        })
    }

    pub fn total_pair_incidences(&self) -> usize {
        self.total_pair_incidences
    }

    pub fn distinct_pairs_covered(&self) -> usize {
        self.distinct_pairs_covered
    }

    pub fn max_pair_frequency(&self) -> usize {
        self.max_pair_frequency as usize
    }

    pub fn multiplicity_histogram(&self) -> &[usize] {
        &self.multiplicity_histogram
    }

    pub fn linear_repeat_excess(&self) -> u64 {
        self.linear_repeat_excess
    }

    pub fn triangular_repeat_excess(&self) -> u64 {
        self.triangular_repeat_excess
    }

    pub fn squared_repeat_excess(&self) -> u64 {
        self.squared_repeat_excess
    }

    pub fn score_for_model(&self, model: Solver6PairRepeatPenaltyModel) -> u64 {
        match model {
            Solver6PairRepeatPenaltyModel::LinearRepeatExcess => self.linear_repeat_excess,
            Solver6PairRepeatPenaltyModel::TriangularRepeatExcess => {
                self.triangular_repeat_excess
            }
            Solver6PairRepeatPenaltyModel::SquaredRepeatExcess => self.squared_repeat_excess,
        }
    }

    pub fn linear_repeat_excess_lower_bound(&self) -> u64 {
        self.total_pair_incidences
            .saturating_sub(self.universe.total_distinct_pairs()) as u64
    }

    pub fn linear_repeat_excess_lower_bound_gap(&self) -> u64 {
        self.linear_repeat_excess
            .saturating_sub(self.linear_repeat_excess_lower_bound())
    }

    pub fn score_delta_for_pair_change(
        &self,
        pair_idx: usize,
        delta: i8,
        model: Solver6PairRepeatPenaltyModel,
    ) -> Result<i64, SolverError> {
        let old_count = self.pair_count_by_index(pair_idx)?;
        let new_count = adjusted_pair_count(old_count, delta)?;
        Ok(pair_penalty_for_model(model, new_count) as i64 - pair_penalty_for_model(model, old_count) as i64)
    }

    pub fn apply_pair_count_delta(&mut self, pair_idx: usize, delta: i8) -> Result<(), SolverError> {
        let old_count = self.pair_count_by_index(pair_idx)?;
        let new_count = adjusted_pair_count(old_count, delta)?;

        if new_count as usize >= self.multiplicity_histogram.len() {
            self.multiplicity_histogram.resize(new_count as usize + 1, 0);
        }

        self.multiplicity_histogram[old_count as usize] = self.multiplicity_histogram[old_count as usize]
            .checked_sub(1)
            .ok_or_else(|| {
                SolverError::ValidationError(format!(
                    "solver6 pair state histogram underflow at frequency {old_count}"
                ))
            })?;
        self.multiplicity_histogram[new_count as usize] += 1;

        if old_count == 0 && new_count > 0 {
            self.distinct_pairs_covered += 1;
        }
        if old_count > 0 && new_count == 0 {
            self.distinct_pairs_covered = self
                .distinct_pairs_covered
                .checked_sub(1)
                .ok_or_else(|| {
                    SolverError::ValidationError(
                        "solver6 pair state distinct-pair count underflowed".into(),
                    )
                })?;
        }

        self.total_pair_incidences = adjusted_total_pair_incidences(self.total_pair_incidences, delta)?;
        self.linear_repeat_excess = adjusted_total_penalty(self.linear_repeat_excess, old_count, new_count, linear_repeat_penalty)?;
        self.triangular_repeat_excess = adjusted_total_penalty(self.triangular_repeat_excess, old_count, new_count, triangular_repeat_penalty)?;
        self.squared_repeat_excess = adjusted_total_penalty(self.squared_repeat_excess, old_count, new_count, squared_repeat_penalty)?;

        self.pair_counts[pair_idx] = new_count;
        if new_count > self.max_pair_frequency {
            self.max_pair_frequency = new_count;
        }
        while self.max_pair_frequency > 0
            && self.multiplicity_histogram[self.max_pair_frequency as usize] == 0
        {
            self.max_pair_frequency -= 1;
        }
        self.multiplicity_histogram
            .truncate(self.max_pair_frequency as usize + 1);
        if self.multiplicity_histogram.is_empty() {
            self.multiplicity_histogram.push(0);
        }

        Ok(())
    }
}

fn adjusted_pair_count(old_count: u16, delta: i8) -> Result<u16, SolverError> {
    let new_count = i32::from(old_count) + i32::from(delta);
    if new_count < 0 || new_count > i32::from(u16::MAX) {
        return Err(SolverError::ValidationError(format!(
            "solver6 pair state count update overflow: {old_count} + ({delta})"
        )));
    }
    Ok(new_count as u16)
}

fn adjusted_total_pair_incidences(total: usize, delta: i8) -> Result<usize, SolverError> {
    if delta >= 0 {
        Ok(total + delta as usize)
    } else {
        total.checked_sub(delta.unsigned_abs() as usize).ok_or_else(|| {
            SolverError::ValidationError(
                "solver6 pair state total pair incidences underflowed".into(),
            )
        })
    }
}

fn adjusted_total_penalty(
    total: u64,
    old_count: u16,
    new_count: u16,
    penalty: fn(u16) -> u64,
) -> Result<u64, SolverError> {
    total
        .checked_sub(penalty(old_count))
        .and_then(|without_old| without_old.checked_add(penalty(new_count)))
        .ok_or_else(|| SolverError::ValidationError("solver6 pair state penalty total overflowed".into()))
}

fn pair_penalty_for_model(model: Solver6PairRepeatPenaltyModel, count: u16) -> u64 {
    match model {
        Solver6PairRepeatPenaltyModel::LinearRepeatExcess => linear_repeat_penalty(count),
        Solver6PairRepeatPenaltyModel::TriangularRepeatExcess => triangular_repeat_penalty(count),
        Solver6PairRepeatPenaltyModel::SquaredRepeatExcess => squared_repeat_penalty(count),
    }
}

fn linear_repeat_penalty(count: u16) -> u64 {
    u64::from(count.saturating_sub(1))
}

fn triangular_repeat_penalty(count: u16) -> u64 {
    let repeat_excess = u64::from(count.saturating_sub(1));
    repeat_excess * (repeat_excess + 1) / 2
}

fn squared_repeat_penalty(count: u16) -> u64 {
    let repeat_excess = u64::from(count.saturating_sub(1));
    repeat_excess * repeat_excess
}

impl PairFrequencySummary {
    pub fn from_raw_schedule(
        num_people: usize,
        schedule: &[Vec<Vec<usize>>],
    ) -> Result<Self, SolverError> {
        let universe = PairUniverse::new(num_people)?;
        let mut pair_counts = vec![0u16; universe.total_distinct_pairs()];
        let mut total_pair_incidences = 0usize;

        for (week_idx, week) in schedule.iter().enumerate() {
            let mut seen_this_week = vec![false; num_people];
            for (block_idx, block) in week.iter().enumerate() {
                for &person in block {
                    if person >= num_people {
                        return Err(SolverError::ValidationError(format!(
                            "solver6 schedule person index {person} out of bounds in week {week_idx}, block {block_idx}"
                        )));
                    }
                    if seen_this_week[person] {
                        return Err(SolverError::ValidationError(format!(
                            "solver6 schedule repeats person {person} within week {week_idx}"
                        )));
                    }
                    seen_this_week[person] = true;
                }

                for left_idx in 0..block.len() {
                    for right_idx in (left_idx + 1)..block.len() {
                        let pair_idx = universe.pair_index(block[left_idx], block[right_idx])?;
                        pair_counts[pair_idx] = pair_counts[pair_idx].saturating_add(1);
                        total_pair_incidences += 1;
                    }
                }
            }
        }

        let distinct_pairs_covered = pair_counts.iter().filter(|count| **count > 0).count();
        let max_pair_frequency = pair_counts.iter().copied().max().unwrap_or(0);
        let mut histogram = vec![0usize; max_pair_frequency as usize + 1];
        for count in &pair_counts {
            histogram[*count as usize] += 1;
        }

        Ok(Self {
            universe,
            pair_counts,
            total_pair_incidences,
            distinct_pairs_covered,
            max_pair_frequency,
            multiplicity_histogram: PairMultiplicityHistogram::new(histogram),
        })
    }

    pub fn universe(&self) -> &PairUniverse {
        &self.universe
    }

    pub fn pair_count(&self, left: usize, right: usize) -> Result<u16, SolverError> {
        let idx = self.universe.pair_index(left, right)?;
        Ok(self.pair_counts[idx])
    }

    pub fn pair_counts(&self) -> &[u16] {
        &self.pair_counts
    }

    pub fn total_pair_incidences(&self) -> usize {
        self.total_pair_incidences
    }

    pub fn distinct_pairs_covered(&self) -> usize {
        self.distinct_pairs_covered
    }

    pub fn max_pair_frequency(&self) -> usize {
        self.max_pair_frequency as usize
    }

    pub fn multiplicity_histogram(&self) -> &PairMultiplicityHistogram {
        &self.multiplicity_histogram
    }

    pub fn linear_repeat_excess(&self) -> u64 {
        self.pair_counts
            .iter()
            .map(|count| u64::from(count.saturating_sub(1)))
            .sum()
    }

    pub fn triangular_repeat_excess(&self) -> u64 {
        self.pair_counts
            .iter()
            .map(|count| {
                let repeat_excess = u64::from(count.saturating_sub(1));
                repeat_excess * (repeat_excess + 1) / 2
            })
            .sum()
    }

    pub fn squared_repeat_excess(&self) -> u64 {
        self.pair_counts
            .iter()
            .map(|count| {
                let repeat_excess = u64::from(count.saturating_sub(1));
                repeat_excess * repeat_excess
            })
            .sum()
    }

    pub fn score_for_model(&self, model: Solver6PairRepeatPenaltyModel) -> u64 {
        match model {
            Solver6PairRepeatPenaltyModel::LinearRepeatExcess => self.linear_repeat_excess(),
            Solver6PairRepeatPenaltyModel::TriangularRepeatExcess => {
                self.triangular_repeat_excess()
            }
            Solver6PairRepeatPenaltyModel::SquaredRepeatExcess => self.squared_repeat_excess(),
        }
    }

    pub fn linear_repeat_excess_lower_bound(&self) -> u64 {
        self.total_pair_incidences
            .saturating_sub(self.universe.total_distinct_pairs()) as u64
    }

    pub fn linear_repeat_excess_lower_bound_gap(&self) -> u64 {
        self.linear_repeat_excess()
            .saturating_sub(self.linear_repeat_excess_lower_bound())
    }
}

#[cfg(test)]
mod tests {
    use super::{PairFrequencyState, PairFrequencySummary, PairUniverse};
    use crate::models::Solver6PairRepeatPenaltyModel;

    fn exact_2_2_3() -> Vec<Vec<Vec<usize>>> {
        vec![
            vec![vec![0, 1], vec![2, 3]],
            vec![vec![0, 2], vec![1, 3]],
            vec![vec![0, 3], vec![1, 2]],
        ]
    }

    #[test]
    fn pair_universe_indexes_all_pairs_once() {
        let universe = PairUniverse::new(4).unwrap();
        let mut indices = vec![
            universe.pair_index(0, 1).unwrap(),
            universe.pair_index(0, 2).unwrap(),
            universe.pair_index(0, 3).unwrap(),
            universe.pair_index(1, 2).unwrap(),
            universe.pair_index(1, 3).unwrap(),
            universe.pair_index(2, 3).unwrap(),
        ];
        indices.sort_unstable();
        assert_eq!(indices, vec![0, 1, 2, 3, 4, 5]);
    }

    #[test]
    fn exact_schedule_scores_zero_under_all_models() {
        let summary = PairFrequencySummary::from_raw_schedule(4, &exact_2_2_3()).unwrap();
        assert_eq!(summary.distinct_pairs_covered(), 6);
        assert_eq!(summary.max_pair_frequency(), 1);
        assert_eq!(summary.linear_repeat_excess(), 0);
        assert_eq!(summary.triangular_repeat_excess(), 0);
        assert_eq!(summary.squared_repeat_excess(), 0);
        assert_eq!(summary.multiplicity_histogram().count_at_frequency(1), 6);
        assert_eq!(summary.linear_repeat_excess_lower_bound(), 0);
        assert_eq!(summary.linear_repeat_excess_lower_bound_gap(), 0);
    }

    #[test]
    fn duplicated_exact_block_hits_linear_lower_bound() {
        let mut duplicated = exact_2_2_3();
        duplicated.extend(exact_2_2_3());
        let summary = PairFrequencySummary::from_raw_schedule(4, &duplicated).unwrap();
        assert_eq!(summary.max_pair_frequency(), 2);
        assert_eq!(summary.linear_repeat_excess(), 6);
        assert_eq!(summary.triangular_repeat_excess(), 6);
        assert_eq!(summary.squared_repeat_excess(), 6);
        assert_eq!(summary.linear_repeat_excess_lower_bound(), 6);
        assert_eq!(summary.linear_repeat_excess_lower_bound_gap(), 0);
        assert_eq!(summary.multiplicity_histogram().count_at_frequency(2), 6);
    }

    #[test]
    fn concentrated_repeats_are_penalized_harder_by_convex_models() {
        let repeated_week = vec![vec![vec![0, 1], vec![2, 3]]; 3];
        let summary = PairFrequencySummary::from_raw_schedule(4, &repeated_week).unwrap();
        assert_eq!(summary.linear_repeat_excess(), 4);
        assert_eq!(summary.triangular_repeat_excess(), 6);
        assert_eq!(summary.squared_repeat_excess(), 8);
        assert_eq!(
            summary.score_for_model(Solver6PairRepeatPenaltyModel::LinearRepeatExcess),
            4
        );
        assert_eq!(
            summary.score_for_model(Solver6PairRepeatPenaltyModel::TriangularRepeatExcess),
            6
        );
        assert_eq!(
            summary.score_for_model(Solver6PairRepeatPenaltyModel::SquaredRepeatExcess),
            8
        );
    }

    #[test]
    fn schedule_rejects_duplicate_people_within_one_week() {
        let invalid = vec![vec![vec![0, 1], vec![1, 2]]];
        let err = PairFrequencySummary::from_raw_schedule(4, &invalid).unwrap_err();
        assert!(err.to_string().contains("repeats person 1 within week 0"));
    }

    #[test]
    fn pair_frequency_state_matches_summary_and_incremental_updates() {
        let mut state = PairFrequencyState::from_raw_schedule(4, &exact_2_2_3()).unwrap();
        let universe = state.universe().clone();

        state
            .apply_pair_count_delta(universe.pair_index(0, 1).unwrap(), -1)
            .unwrap();
        state
            .apply_pair_count_delta(universe.pair_index(2, 3).unwrap(), -1)
            .unwrap();
        state
            .apply_pair_count_delta(universe.pair_index(0, 2).unwrap(), 1)
            .unwrap();
        state
            .apply_pair_count_delta(universe.pair_index(1, 3).unwrap(), 1)
            .unwrap();

        let recomputed = PairFrequencySummary::from_raw_schedule(
            4,
            &[
                vec![vec![0, 2], vec![1, 3]],
                vec![vec![0, 2], vec![1, 3]],
                vec![vec![0, 3], vec![1, 2]],
            ],
        )
        .unwrap();
        assert_eq!(state.to_summary(), recomputed);
        assert_eq!(state.linear_repeat_excess(), 2);
        assert_eq!(state.linear_repeat_excess_lower_bound_gap(), 2);
    }
}
