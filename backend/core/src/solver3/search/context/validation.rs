use crate::models::{Solver3MultiRootBalancedSessionInheritanceParams, Solver3SearchDriverMode};
use crate::solver_support::SolverError;

pub(crate) fn validate_multi_root_balanced_session_inheritance(
    config: &Solver3MultiRootBalancedSessionInheritanceParams,
) -> Result<(), SolverError> {
    if config.root_count < 2 {
        return Err(SolverError::ValidationError(
            "solver3 search_driver.multi_root_balanced_session_inheritance.root_count must be >= 2"
                .into(),
        ));
    }

    if config.archive_size_per_root == 0 {
        return Err(SolverError::ValidationError(
            "solver3 search_driver.multi_root_balanced_session_inheritance.archive_size_per_root must be >= 1"
                .into(),
        ));
    }

    if config.recombination_no_improvement_window == 0 {
        return Err(SolverError::ValidationError(
            "solver3 search_driver.multi_root_balanced_session_inheritance.recombination_no_improvement_window must be >= 1"
                .into(),
        ));
    }

    if config.recombination_cooldown_window == 0 {
        return Err(SolverError::ValidationError(
            "solver3 search_driver.multi_root_balanced_session_inheritance.recombination_cooldown_window must be >= 1"
                .into(),
        ));
    }

    if config.max_recombination_events_per_run == Some(0) {
        return Err(SolverError::ValidationError(
            "solver3 search_driver.multi_root_balanced_session_inheritance.max_recombination_events_per_run must be >= 1"
                .into(),
        ));
    }

    if !config.max_parent_score_delta_from_best.is_finite()
        || config.max_parent_score_delta_from_best < 0.0
    {
        return Err(SolverError::ValidationError(
            "solver3 search_driver.multi_root_balanced_session_inheritance.max_parent_score_delta_from_best must be finite and >= 0.0"
                .into(),
        ));
    }

    if config.min_cross_root_session_disagreement == 0 {
        return Err(SolverError::ValidationError(
            "solver3 search_driver.multi_root_balanced_session_inheritance.min_cross_root_session_disagreement must be >= 1"
                .into(),
        ));
    }

    if !config.parent_a_differing_session_share.is_finite()
        || (config.parent_a_differing_session_share - 0.5).abs() > f64::EPSILON
    {
        return Err(SolverError::ValidationError(
            "solver3 search_driver.multi_root_balanced_session_inheritance.parent_a_differing_session_share must currently be exactly 0.5"
                .into(),
        ));
    }

    if !config.adaptive_raw_child_retention.keep_ratio.is_finite()
        || !(0.0..=1.0).contains(&config.adaptive_raw_child_retention.keep_ratio)
        || config.adaptive_raw_child_retention.keep_ratio == 0.0
    {
        return Err(SolverError::ValidationError(
            "solver3 search_driver.multi_root_balanced_session_inheritance.adaptive_raw_child_retention.keep_ratio must be finite and within (0.0, 1.0]"
                .into(),
        ));
    }

    if config.adaptive_raw_child_retention.warmup_samples == 0 {
        return Err(SolverError::ValidationError(
            "solver3 search_driver.multi_root_balanced_session_inheritance.adaptive_raw_child_retention.warmup_samples must be >= 1"
                .into(),
        ));
    }

    if config.adaptive_raw_child_retention.history_limit == 0 {
        return Err(SolverError::ValidationError(
            "solver3 search_driver.multi_root_balanced_session_inheritance.adaptive_raw_child_retention.history_limit must be >= 1"
                .into(),
        ));
    }

    if config.adaptive_raw_child_retention.history_limit
        < config.adaptive_raw_child_retention.warmup_samples
    {
        return Err(SolverError::ValidationError(
            "solver3 search_driver.multi_root_balanced_session_inheritance.adaptive_raw_child_retention.history_limit must be >= warmup_samples"
                .into(),
        ));
    }

    if config.child_polish_iterations_per_stagnation_window == 0 {
        return Err(SolverError::ValidationError(
            "solver3 search_driver.multi_root_balanced_session_inheritance.child_polish_iterations_per_stagnation_window must be >= 1"
                .into(),
        ));
    }

    if config.child_polish_no_improvement_iterations_per_stagnation_window == 0 {
        return Err(SolverError::ValidationError(
            "solver3 search_driver.multi_root_balanced_session_inheritance.child_polish_no_improvement_iterations_per_stagnation_window must be >= 1"
                .into(),
        ));
    }

    if config.child_polish_no_improvement_iterations_per_stagnation_window
        > config.child_polish_iterations_per_stagnation_window
    {
        return Err(SolverError::ValidationError(
            "solver3 search_driver.multi_root_balanced_session_inheritance.child_polish_no_improvement_iterations_per_stagnation_window must be <= child_polish_iterations_per_stagnation_window"
                .into(),
        ));
    }

    if config.child_polish_max_stagnation_windows == 0 {
        return Err(SolverError::ValidationError(
            "solver3 search_driver.multi_root_balanced_session_inheritance.child_polish_max_stagnation_windows must be >= 1"
                .into(),
        ));
    }

    Ok(())
}

pub(crate) fn ensure_search_driver_feature_available(
    search_driver_mode: Solver3SearchDriverMode,
) -> Result<(), SolverError> {
    match search_driver_mode {
        Solver3SearchDriverMode::SingleState => Ok(()),
        Solver3SearchDriverMode::SteadyStateMemetic => {
            #[cfg(not(feature = "solver3-experimental-memetic"))]
            {
                return Err(SolverError::ValidationError(
                    "solver3 search_driver.mode=steady_state_memetic requires compiling gm-core with feature `solver3-experimental-memetic`"
                        .into(),
                ));
            }
            #[cfg(feature = "solver3-experimental-memetic")]
            {
                Ok(())
            }
        }
        Solver3SearchDriverMode::DonorSessionTransplant
        | Solver3SearchDriverMode::SessionAlignedPathRelinking
        | Solver3SearchDriverMode::MultiRootBalancedSessionInheritance => {
            #[cfg(not(feature = "solver3-experimental-recombination"))]
            {
                let mode_name = match search_driver_mode {
                    Solver3SearchDriverMode::DonorSessionTransplant => "donor_session_transplant",
                    Solver3SearchDriverMode::SessionAlignedPathRelinking => {
                        "session_aligned_path_relinking"
                    }
                    Solver3SearchDriverMode::MultiRootBalancedSessionInheritance => {
                        "multi_root_balanced_session_inheritance"
                    }
                    Solver3SearchDriverMode::SingleState
                    | Solver3SearchDriverMode::SteadyStateMemetic => unreachable!(),
                };
                return Err(SolverError::ValidationError(format!(
                    "solver3 search_driver.mode={mode_name} requires compiling gm-core with feature `solver3-experimental-recombination`"
                )));
            }
            #[cfg(feature = "solver3-experimental-recombination")]
            {
                Ok(())
            }
        }
    }
}

pub(crate) fn ensure_repeat_guidance_feature_available(_enabled: bool) -> Result<(), SolverError> {
    #[cfg(not(feature = "solver3-experimental-repeat-guidance"))]
    if _enabled {
        return Err(SolverError::ValidationError(
            "solver3 hotspot_guidance.repeat_guided_swaps requires compiling gm-core with feature `solver3-experimental-repeat-guidance`"
                .into(),
        ));
    }

    Ok(())
}

pub(crate) fn ensure_conflict_restricted_sampler_feature_available(
    _enabled: bool,
) -> Result<(), SolverError> {
    #[cfg(not(feature = "solver3-experimental-conflict-restricted-sampling"))]
    if _enabled {
        return Err(SolverError::ValidationError(
            "solver3 local_improver.sgp_week_pair_tabu.conflict_restricted_swap_sampling_enabled requires compiling gm-core with feature `solver3-experimental-conflict-restricted-sampling`"
                .into(),
        ));
    }

    Ok(())
}
