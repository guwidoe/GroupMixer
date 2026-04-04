use rand::RngExt;
use rand_chacha::ChaCha12Rng;

pub(crate) const DEFAULT_INITIAL_TEMPERATURE: f64 = 2.0;
pub(crate) const DEFAULT_FINAL_TEMPERATURE: f64 = 0.05;

#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) struct AcceptanceInputs {
    pub(crate) iteration: u64,
    pub(crate) max_iterations: u64,
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

impl SimulatedAnnealingAcceptance {
    #[inline]
    pub(crate) fn decide(
        &self,
        inputs: AcceptanceInputs,
        rng: &mut ChaCha12Rng,
    ) -> AcceptanceDecision {
        let temperature = temperature_for_iteration(inputs.iteration, inputs.max_iterations);
        let accepted = inputs.delta_score <= 0.0
            || (temperature > 0.0
                && rng.random::<f64>()
                    < (-inputs.delta_score / temperature).exp().clamp(0.0, 1.0));

        AcceptanceDecision {
            temperature,
            accepted,
            escaped_local_optimum: accepted && inputs.delta_score > 0.0,
        }
    }
}

#[inline]
pub(crate) fn temperature_for_iteration(iteration: u64, max_iterations: u64) -> f64 {
    if max_iterations <= 1 {
        return DEFAULT_FINAL_TEMPERATURE;
    }
    let progress = (iteration as f64 / (max_iterations - 1) as f64).clamp(0.0, 1.0);
    DEFAULT_INITIAL_TEMPERATURE
        * (DEFAULT_FINAL_TEMPERATURE / DEFAULT_INITIAL_TEMPERATURE).powf(progress)
}

#[cfg(test)]
mod tests {
    use rand::SeedableRng;
    use rand_chacha::ChaCha12Rng;

    use super::{AcceptanceInputs, SimulatedAnnealingAcceptance, temperature_for_iteration};

    #[test]
    fn improving_moves_are_always_accepted() {
        let policy = SimulatedAnnealingAcceptance;
        let mut rng = ChaCha12Rng::seed_from_u64(7);
        let decision = policy.decide(
            AcceptanceInputs {
                iteration: 5,
                max_iterations: 100,
                delta_score: -3.0,
            },
            &mut rng,
        );
        assert!(decision.accepted);
        assert!(!decision.escaped_local_optimum);
    }

    #[test]
    fn max_iteration_one_uses_final_temperature() {
        assert_eq!(temperature_for_iteration(0, 1), super::DEFAULT_FINAL_TEMPERATURE);
    }

    #[test]
    fn accepted_uphill_move_is_marked_as_escape() {
        let policy = SimulatedAnnealingAcceptance;
        let mut rng = ChaCha12Rng::seed_from_u64(7);
        let decision = policy.decide(
            AcceptanceInputs {
                iteration: 0,
                max_iterations: 1,
                delta_score: 0.0,
            },
            &mut rng,
        );
        assert!(decision.accepted);
        assert!(!decision.escaped_local_optimum);
    }
}
