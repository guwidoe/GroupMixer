use crate::models::StopReason;

// Runtime-target runs should stop on wall-clock time, not on an optimistic
// iteration ceiling. Keep this safety cap generously above realistic browser
// throughput so both telemetry and cooling stay time-driven in practice.
const DEFAULT_RUNTIME_TARGET_MAX_ITERATIONS_PER_SECOND: u64 = 50_000_000;
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

pub(crate) fn displayed_total_iterations(
    completed_iterations: u64,
    configured_max_iterations: u64,
    elapsed_seconds: f64,
    time_limit_seconds: Option<u64>,
    stop_reason: Option<StopReason>,
) -> u64 {
    if matches!(stop_reason, Some(StopReason::TimeLimitReached)) {
        return completed_iterations.max(1);
    }

    estimated_total_iterations(
        completed_iterations,
        configured_max_iterations,
        elapsed_seconds,
        time_limit_seconds,
    )
}

#[cfg(test)]
mod tests {
    use super::{
        displayed_total_iterations, estimated_total_iterations, runtime_target_iteration_cap,
    };
    use crate::models::StopReason;

    #[test]
    fn runtime_target_iteration_cap_scales_with_requested_seconds() {
        assert_eq!(runtime_target_iteration_cap(0), 50_000_000);
        assert_eq!(runtime_target_iteration_cap(3), 150_000_000);
    }

    #[test]
    fn estimated_total_iterations_uses_observed_throughput_when_time_budget_exists() {
        let estimate = estimated_total_iterations(500, 150_000_000, 0.5, Some(3));
        assert_eq!(estimate, 3_000);
    }

    #[test]
    fn estimated_total_iterations_never_drops_below_completed_iterations() {
        let estimate = estimated_total_iterations(10_000, 150_000_000, 30.0, Some(3));
        assert_eq!(estimate, 10_000);
    }

    #[test]
    fn displayed_total_iterations_matches_completed_iterations_after_time_stop() {
        let displayed = displayed_total_iterations(
            8_765,
            150_000_000,
            3.01,
            Some(3),
            Some(StopReason::TimeLimitReached),
        );
        assert_eq!(displayed, 8_765);
    }
}
