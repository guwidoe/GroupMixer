const DEFAULT_RUNTIME_TARGET_MAX_ITERATIONS_PER_SECOND: u64 = 1_000_000;
const MIN_RUNTIME_TARGET_MAX_ITERATIONS: u64 = 100_000;

pub(crate) fn runtime_target_iteration_cap(desired_runtime_seconds: u64) -> u64 {
    desired_runtime_seconds
        .max(1)
        .saturating_mul(DEFAULT_RUNTIME_TARGET_MAX_ITERATIONS_PER_SECOND)
        .max(MIN_RUNTIME_TARGET_MAX_ITERATIONS)
}

pub(crate) fn estimated_total_iterations(
    completed_iterations: u64,
    configured_max_iterations: u64,
    elapsed_seconds: f64,
    time_limit_seconds: Option<u64>,
) -> u64 {
    if configured_max_iterations == 0 {
        return 0;
    }

    let completed_iterations = completed_iterations.max(1);
    let Some(time_limit_seconds) = time_limit_seconds.filter(|limit| *limit > 0) else {
        return configured_max_iterations;
    };

    if elapsed_seconds <= 0.0 {
        return configured_max_iterations.max(completed_iterations);
    }

    let observed_iterations_per_second = completed_iterations as f64 / elapsed_seconds;
    let observed_total = (observed_iterations_per_second * time_limit_seconds as f64).ceil() as u64;

    observed_total
        .max(completed_iterations)
        .min(configured_max_iterations.max(completed_iterations))
}

#[cfg(test)]
mod tests {
    use super::{estimated_total_iterations, runtime_target_iteration_cap};

    #[test]
    fn runtime_target_iteration_cap_scales_with_requested_seconds() {
        assert_eq!(runtime_target_iteration_cap(0), 1_000_000);
        assert_eq!(runtime_target_iteration_cap(3), 3_000_000);
    }

    #[test]
    fn estimated_total_iterations_uses_observed_throughput_when_time_budget_exists() {
        let estimate = estimated_total_iterations(500, 3_000_000, 0.5, Some(3));
        assert_eq!(estimate, 3_000);
    }

    #[test]
    fn estimated_total_iterations_never_drops_below_completed_iterations() {
        let estimate = estimated_total_iterations(10_000, 3_000_000, 30.0, Some(3));
        assert_eq!(estimate, 10_000);
    }

}
