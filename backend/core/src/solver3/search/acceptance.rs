use rand::RngExt;
use rand_chacha::ChaCha12Rng;

pub(crate) const DEFAULT_INITIAL_TEMPERATURE: f64 = 2.0;
pub(crate) const DEFAULT_FINAL_TEMPERATURE: f64 = 0.05;
pub(crate) const DEFAULT_RECORD_TO_RECORD_INITIAL_THRESHOLD: f64 = 2.0;

/// Inputs for the SA acceptance decision.
///
/// Progress is computed as the *maximum* of iteration-fraction and time-fraction
/// so that whichever stop condition will actually bind drives the cooling schedule.
/// When only one limit is active the other naturally contributes 0.0 and is ignored.
#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) struct AcceptanceInputs {
    /// Current iteration (0-based).
    pub(crate) iteration: u64,
    /// Maximum iterations stop-condition (0 = no limit for progress purposes).
    pub(crate) max_iterations: u64,
    /// Elapsed wall-clock seconds since the search started.
    pub(crate) elapsed_seconds: f64,
    /// Time-limit stop-condition in seconds (None = no time limit).
    pub(crate) time_limit_seconds: Option<u64>,
    pub(crate) delta_score: f64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) struct AcceptanceDecision {
    pub(crate) temperature: f64,
    pub(crate) accepted: bool,
    pub(crate) escaped_local_optimum: bool,
}

#[derive(Debug, Default, Clone, Copy)]
pub(crate) struct SimulatedAnnealingAcceptance;

#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) struct RecordToRecordInputs {
    pub(crate) current_score: f64,
    pub(crate) best_score: f64,
    pub(crate) candidate_score: f64,
    pub(crate) progress: f64,
}

#[derive(Debug, Default, Clone, Copy)]
pub(crate) struct RecordToRecordAcceptance;

impl SimulatedAnnealingAcceptance {
    #[inline]
    pub(crate) fn decide(
        &self,
        inputs: AcceptanceInputs,
        rng: &mut ChaCha12Rng,
    ) -> AcceptanceDecision {
        let progress = cooling_progress(
            inputs.iteration,
            inputs.max_iterations,
            inputs.elapsed_seconds,
            inputs.time_limit_seconds,
        );
        let temperature = temperature_for_progress(progress);
        let accepted = inputs.delta_score <= 0.0
            || (temperature > 0.0
                && rng.random::<f64>() < (-inputs.delta_score / temperature).exp().clamp(0.0, 1.0));

        AcceptanceDecision {
            temperature,
            accepted,
            escaped_local_optimum: accepted && inputs.delta_score > 0.0,
        }
    }
}

impl RecordToRecordAcceptance {
    #[inline]
    pub(crate) fn decide(&self, inputs: RecordToRecordInputs) -> AcceptanceDecision {
        let threshold = record_to_record_threshold_for_progress(inputs.progress);
        let accepted = inputs.candidate_score <= inputs.current_score
            || inputs.candidate_score <= inputs.best_score + threshold;

        AcceptanceDecision {
            temperature: threshold,
            accepted,
            escaped_local_optimum: accepted && inputs.candidate_score > inputs.current_score,
        }
    }
}

/// Compute SA cooling progress ∈ [0, 1] as the maximum of the iteration-fraction
/// and the time-fraction.  Taking the maximum means whichever stop-condition will
/// actually bind drives the cooling schedule, so the temperature always reaches
/// `DEFAULT_FINAL_TEMPERATURE` before the run ends regardless of which limit fires.
#[inline]
pub(crate) fn cooling_progress(
    iteration: u64,
    max_iterations: u64,
    elapsed_seconds: f64,
    time_limit_seconds: Option<u64>,
) -> f64 {
    let iter_progress = if max_iterations <= 1 {
        1.0_f64
    } else {
        (iteration as f64 / (max_iterations - 1) as f64).clamp(0.0, 1.0)
    };

    let time_progress = match time_limit_seconds {
        Some(limit) if limit > 0 => (elapsed_seconds / limit as f64).clamp(0.0, 1.0),
        _ => 0.0,
    };

    iter_progress.max(time_progress)
}

/// Geometric (exponential) cooling from `DEFAULT_INITIAL_TEMPERATURE` to
/// `DEFAULT_FINAL_TEMPERATURE` over progress ∈ [0, 1].
#[inline]
pub(crate) fn temperature_for_progress(progress: f64) -> f64 {
    DEFAULT_INITIAL_TEMPERATURE
        * (DEFAULT_FINAL_TEMPERATURE / DEFAULT_INITIAL_TEMPERATURE).powf(progress)
}

#[inline]
pub(crate) fn record_to_record_threshold_for_progress(progress: f64) -> f64 {
    DEFAULT_RECORD_TO_RECORD_INITIAL_THRESHOLD * (1.0 - progress.clamp(0.0, 1.0))
}

/// Legacy helper retained for tests; delegates to `cooling_progress` + `temperature_for_progress`.
#[cfg(test)]
#[inline]
pub(crate) fn temperature_for_iteration(iteration: u64, max_iterations: u64) -> f64 {
    let progress = cooling_progress(iteration, max_iterations, 0.0, None);
    temperature_for_progress(progress)
}

#[cfg(test)]
mod tests {
    use rand::SeedableRng;
    use rand_chacha::ChaCha12Rng;

    use super::{
        record_to_record_threshold_for_progress, temperature_for_iteration, AcceptanceInputs,
        RecordToRecordAcceptance, RecordToRecordInputs, SimulatedAnnealingAcceptance,
    };

    #[test]
    fn improving_moves_are_always_accepted() {
        let policy = SimulatedAnnealingAcceptance;
        let mut rng = ChaCha12Rng::seed_from_u64(7);
        let decision = policy.decide(
            AcceptanceInputs {
                iteration: 5,
                max_iterations: 100,
                elapsed_seconds: 0.0,
                time_limit_seconds: None,
                delta_score: -3.0,
            },
            &mut rng,
        );
        assert!(decision.accepted);
        assert!(!decision.escaped_local_optimum);
    }

    #[test]
    fn max_iteration_one_uses_final_temperature() {
        assert_eq!(
            temperature_for_iteration(0, 1),
            super::DEFAULT_FINAL_TEMPERATURE
        );
    }

    #[test]
    fn accepted_uphill_move_is_marked_as_escape() {
        let policy = SimulatedAnnealingAcceptance;
        let mut rng = ChaCha12Rng::seed_from_u64(7);
        let decision = policy.decide(
            AcceptanceInputs {
                iteration: 0,
                max_iterations: 1,
                elapsed_seconds: 0.0,
                time_limit_seconds: None,
                delta_score: 0.0,
            },
            &mut rng,
        );
        assert!(decision.accepted);
        assert!(!decision.escaped_local_optimum);
    }

    #[test]
    fn time_progress_dominates_when_further_along() {
        // iter_progress = 0/99 = 0.0, time_progress = 0.9 → progress = 0.9
        let p = super::cooling_progress(0, 100, 9.0, Some(10));
        assert!((p - 0.9).abs() < 1e-9, "expected 0.9, got {p}");
    }

    #[test]
    fn iter_progress_dominates_when_further_along() {
        // iter_progress = 99/99 = 1.0, time_progress = 0.1 → progress = 1.0
        let p = super::cooling_progress(99, 100, 1.0, Some(10));
        assert!((p - 1.0).abs() < 1e-9, "expected 1.0, got {p}");
    }

    #[test]
    fn no_time_limit_uses_iter_progress_only() {
        let p = super::cooling_progress(50, 100, 999.0, None);
        let expected = 50.0 / 99.0;
        assert!((p - expected).abs() < 1e-9);
    }

    #[test]
    fn record_to_record_shrinks_threshold_to_zero() {
        assert_eq!(record_to_record_threshold_for_progress(0.0), 2.0);
        assert_eq!(record_to_record_threshold_for_progress(1.0), 0.0);
    }

    #[test]
    fn record_to_record_accepts_uphill_move_within_best_band() {
        let policy = RecordToRecordAcceptance;
        let decision = policy.decide(RecordToRecordInputs {
            current_score: 10.0,
            best_score: 9.0,
            candidate_score: 10.5,
            progress: 0.0,
        });
        assert!(decision.accepted);
        assert!(decision.escaped_local_optimum);
    }

    #[test]
    fn record_to_record_rejects_move_outside_best_band() {
        let policy = RecordToRecordAcceptance;
        let decision = policy.decide(RecordToRecordInputs {
            current_score: 10.0,
            best_score: 9.0,
            candidate_score: 11.5,
            progress: 0.5,
        });
        assert!(!decision.accepted);
    }
}
