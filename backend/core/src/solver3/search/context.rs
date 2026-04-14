use std::collections::VecDeque;

use crate::models::{
    BestScoreTimelinePoint, DonorSessionTransplantBenchmarkTelemetry, MemeticBenchmarkTelemetry,
    MoveFamily, MoveFamilyBenchmarkTelemetry, MoveFamilyBenchmarkTelemetrySummary, MovePolicy,
    MultiRootBalancedSessionInheritanceBenchmarkTelemetry, ProgressUpdate,
    RepeatGuidedSwapBenchmarkTelemetry, SessionAlignedPathRelinkingBenchmarkTelemetry,
    SgpWeekPairTabuBenchmarkTelemetry, Solver3LocalImproverMode,
    Solver3MultiRootBalancedSessionInheritanceParams, Solver3PathRelinkingOperatorVariant,
    Solver3SearchDriverMode, SolverBenchmarkTelemetry, SolverConfiguration, StopReason,
};
use crate::runtime_target::displayed_total_iterations;
use crate::solver_support::SolverError;

use super::super::runtime_state::RuntimeState;
use super::path_relinking::MAX_EXACT_ALIGNMENT_SESSIONS;
use super::tabu::SgpWeekPairTabuConfig;

const DEFAULT_MAX_ITERATIONS: u64 = 10_000;
const RECENT_WINDOW: usize = 100;

#[derive(Debug, Clone)]
pub(crate) struct SearchRunContext {
    pub(crate) effective_seed: u64,
    pub(crate) move_policy: MovePolicy,
    pub(crate) search_driver_mode: Solver3SearchDriverMode,
    pub(crate) local_improver_mode: Solver3LocalImproverMode,
    pub(crate) max_iterations: u64,
    pub(crate) no_improvement_limit: Option<u64>,
    pub(crate) time_limit_seconds: Option<u64>,
    pub(crate) stop_on_optimal_score: bool,
    pub(crate) allowed_sessions: Vec<usize>,
    pub(crate) correctness_lane_enabled: bool,
    pub(crate) correctness_sample_every_accepted_moves: u64,
    pub(crate) repeat_guided_swaps_enabled: bool,
    pub(crate) repeat_guided_swap_probability: f64,
    pub(crate) repeat_guided_swap_candidate_preview_budget: usize,
    pub(crate) sgp_week_pair_tabu: Option<SgpWeekPairTabuConfig>,
    pub(crate) steady_state_memetic: Option<SteadyStateMemeticConfig>,
    pub(crate) donor_session_transplant: Option<DonorSessionTransplantConfig>,
    pub(crate) session_aligned_path_relinking: Option<SessionAlignedPathRelinkingConfig>,
    pub(crate) multi_root_balanced_session_inheritance:
        Option<MultiRootBalancedSessionInheritanceConfig>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct SteadyStateMemeticConfig {
    pub(crate) population_size: usize,
    pub(crate) parent_tournament_size: usize,
    pub(crate) mutation_swaps_min: usize,
    pub(crate) mutation_swaps_max: usize,
    pub(crate) child_polish_max_iterations: u64,
    pub(crate) child_polish_no_improvement_iterations: u64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) struct AdaptiveRawChildRetentionConfig {
    pub(crate) keep_ratio: f64,
    pub(crate) warmup_samples: usize,
    pub(crate) history_limit: usize,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) struct DonorSessionTransplantConfig {
    pub(crate) archive_size: usize,
    pub(crate) recombination_no_improvement_window: u64,
    pub(crate) recombination_cooldown_window: u64,
    pub(crate) max_recombination_events_per_run: Option<u64>,
    pub(crate) adaptive_raw_child_retention: AdaptiveRawChildRetentionConfig,
    pub(crate) swap_local_optimum_certification_enabled: bool,
    pub(crate) child_polish_iterations_per_stagnation_window: u64,
    pub(crate) child_polish_no_improvement_iterations_per_stagnation_window: u64,
    pub(crate) child_polish_max_stagnation_windows: u64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) struct SessionAlignedPathRelinkingConfig {
    pub(crate) operator_variant: Solver3PathRelinkingOperatorVariant,
    pub(crate) archive_size: usize,
    pub(crate) recombination_no_improvement_window: u64,
    pub(crate) recombination_cooldown_window: u64,
    pub(crate) max_path_events_per_run: Option<u64>,
    pub(crate) max_session_imports_per_event: usize,
    pub(crate) path_step_no_improvement_limit: usize,
    pub(crate) min_aligned_session_distance_for_relinking: u32,
    pub(crate) adaptive_raw_child_retention: AdaptiveRawChildRetentionConfig,
    pub(crate) swap_local_optimum_certification_enabled: bool,
    pub(crate) child_polish_iterations_per_stagnation_window: u64,
    pub(crate) child_polish_no_improvement_iterations_per_stagnation_window: u64,
    pub(crate) child_polish_max_stagnation_windows: u64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) struct MultiRootBalancedSessionInheritanceConfig {
    pub(crate) root_count: usize,
    pub(crate) archive_size_per_root: usize,
    pub(crate) recombination_no_improvement_window: u64,
    pub(crate) recombination_cooldown_window: u64,
    pub(crate) max_recombination_events_per_run: Option<u64>,
    pub(crate) max_parent_score_delta_from_best: f64,
    pub(crate) min_cross_root_session_disagreement: usize,
    pub(crate) parent_a_differing_session_share: f64,
    pub(crate) adaptive_raw_child_retention: AdaptiveRawChildRetentionConfig,
    pub(crate) swap_local_optimum_certification_enabled: bool,
    pub(crate) child_polish_iterations_per_stagnation_window: u64,
    pub(crate) child_polish_no_improvement_iterations_per_stagnation_window: u64,
    pub(crate) child_polish_max_stagnation_windows: u64,
}

fn validate_multi_root_balanced_session_inheritance(
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

fn ensure_search_driver_feature_available(
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

fn ensure_repeat_guidance_feature_available(_enabled: bool) -> Result<(), SolverError> {
    #[cfg(not(feature = "solver3-experimental-repeat-guidance"))]
    if _enabled {
        return Err(SolverError::ValidationError(
            "solver3 hotspot_guidance.repeat_guided_swaps requires compiling gm-core with feature `solver3-experimental-repeat-guidance`"
                .into(),
        ));
    }

    Ok(())
}

fn ensure_conflict_restricted_sampler_feature_available(_enabled: bool) -> Result<(), SolverError> {
    #[cfg(not(feature = "solver3-experimental-conflict-restricted-sampling"))]
    if _enabled {
        return Err(SolverError::ValidationError(
            "solver3 local_improver.sgp_week_pair_tabu.conflict_restricted_swap_sampling_enabled requires compiling gm-core with feature `solver3-experimental-conflict-restricted-sampling`"
                .into(),
        ));
    }

    Ok(())
}

impl SearchRunContext {
    pub(crate) fn from_solver(
        configuration: &SolverConfiguration,
        state: &RuntimeState,
        effective_seed: u64,
    ) -> Result<Self, SolverError> {
        let move_policy = configuration
            .move_policy
            .clone()
            .unwrap_or_default()
            .normalized()
            .map_err(SolverError::ValidationError)?;
        let solver3_params = configuration
            .solver_params
            .solver3_params()
            .ok_or_else(|| {
                SolverError::ValidationError(
                    "solver3 search received non-solver3 parameters in configuration".into(),
                )
            })?;
        let correctness_lane_enabled = solver3_params.correctness_lane.enabled;
        let search_driver_mode = solver3_params.search_driver.mode;
        let local_improver_mode = solver3_params.local_improver.mode;
        let sgp_week_pair_tabu = &solver3_params.local_improver.sgp_week_pair_tabu;
        let steady_state_memetic = &solver3_params.search_driver.steady_state_memetic;
        let donor_session_transplant = &solver3_params.search_driver.donor_session_transplant;
        let session_aligned_path_relinking =
            &solver3_params.search_driver.session_aligned_path_relinking;
        let multi_root_balanced_session_inheritance = &solver3_params
            .search_driver
            .multi_root_balanced_session_inheritance;
        let correctness_sample_every_accepted_moves =
            solver3_params.correctness_lane.sample_every_accepted_moves;
        let configured_repeat_guided_swap_probability = solver3_params
            .hotspot_guidance
            .repeat_guided_swaps
            .guided_proposal_probability;
        let configured_repeat_guided_swap_candidate_preview_budget = solver3_params
            .hotspot_guidance
            .repeat_guided_swaps
            .candidate_preview_budget;
        let repeat_guided_swaps_enabled = solver3_params.hotspot_guidance.repeat_guided_swaps.enabled
            && state.compiled.repeat_encounter.is_some();
        let repeat_guided_swap_probability = if repeat_guided_swaps_enabled {
            configured_repeat_guided_swap_probability
        } else {
            0.0
        };
        let repeat_guided_swap_candidate_preview_budget = if repeat_guided_swaps_enabled {
            configured_repeat_guided_swap_candidate_preview_budget
        } else {
            0
        };

        ensure_search_driver_feature_available(search_driver_mode)?;
        ensure_repeat_guidance_feature_available(
            solver3_params.hotspot_guidance.repeat_guided_swaps.enabled,
        )?;
        ensure_conflict_restricted_sampler_feature_available(
            solver3_params
                .local_improver
                .sgp_week_pair_tabu
                .conflict_restricted_swap_sampling_enabled,
        )?;

        if correctness_sample_every_accepted_moves == 0 {
            return Err(SolverError::ValidationError(
                "solver3 correctness_lane.sample_every_accepted_moves must be >= 1".into(),
            ));
        }

        if !(0.0..=1.0).contains(&configured_repeat_guided_swap_probability) {
            return Err(SolverError::ValidationError(
                "solver3 hotspot_guidance.repeat_guided_swaps.guided_proposal_probability must be within [0.0, 1.0]".into(),
            ));
        }

        if solver3_params.hotspot_guidance.repeat_guided_swaps.enabled
            && configured_repeat_guided_swap_candidate_preview_budget == 0
        {
            return Err(SolverError::ValidationError(
                "solver3 hotspot_guidance.repeat_guided_swaps.candidate_preview_budget must be >= 1 when enabled".into(),
            ));
        }

        if sgp_week_pair_tabu.tenure_min == 0 {
            return Err(SolverError::ValidationError(
                "solver3 local_improver.sgp_week_pair_tabu.tenure_min must be >= 1".into(),
            ));
        }

        if sgp_week_pair_tabu.tenure_max < sgp_week_pair_tabu.tenure_min {
            return Err(SolverError::ValidationError(
                "solver3 local_improver.sgp_week_pair_tabu.tenure_max must be >= tenure_min".into(),
            ));
        }

        if sgp_week_pair_tabu.retry_cap == 0 {
            return Err(SolverError::ValidationError(
                "solver3 local_improver.sgp_week_pair_tabu.retry_cap must be >= 1".into(),
            ));
        }

        if sgp_week_pair_tabu.session_scale_reference_participants == 0 {
            return Err(SolverError::ValidationError(
                "solver3 local_improver.sgp_week_pair_tabu.session_scale_reference_participants must be >= 1"
                    .into(),
            ));
        }

        if sgp_week_pair_tabu.reactive_no_improvement_window == 0 {
            return Err(SolverError::ValidationError(
                "solver3 local_improver.sgp_week_pair_tabu.reactive_no_improvement_window must be >= 1"
                    .into(),
            ));
        }

        if sgp_week_pair_tabu.reactive_max_multiplier == 0 {
            return Err(SolverError::ValidationError(
                "solver3 local_improver.sgp_week_pair_tabu.reactive_max_multiplier must be >= 1"
                    .into(),
            ));
        }

        if steady_state_memetic.population_size < 2 {
            return Err(SolverError::ValidationError(
                "solver3 search_driver.steady_state_memetic.population_size must be >= 2".into(),
            ));
        }

        if steady_state_memetic.parent_tournament_size == 0 {
            return Err(SolverError::ValidationError(
                "solver3 search_driver.steady_state_memetic.parent_tournament_size must be >= 1"
                    .into(),
            ));
        }

        if steady_state_memetic.parent_tournament_size > steady_state_memetic.population_size {
            return Err(SolverError::ValidationError(
                "solver3 search_driver.steady_state_memetic.parent_tournament_size must be <= population_size"
                    .into(),
            ));
        }

        if steady_state_memetic.mutation_swaps_min == 0 {
            return Err(SolverError::ValidationError(
                "solver3 search_driver.steady_state_memetic.mutation_swaps_min must be >= 1".into(),
            ));
        }

        if steady_state_memetic.mutation_swaps_max < steady_state_memetic.mutation_swaps_min {
            return Err(SolverError::ValidationError(
                "solver3 search_driver.steady_state_memetic.mutation_swaps_max must be >= mutation_swaps_min"
                    .into(),
            ));
        }

        if steady_state_memetic.child_polish_max_iterations == 0 {
            return Err(SolverError::ValidationError(
                "solver3 search_driver.steady_state_memetic.child_polish_max_iterations must be >= 1"
                    .into(),
            ));
        }

        if steady_state_memetic.child_polish_no_improvement_iterations == 0 {
            return Err(SolverError::ValidationError(
                "solver3 search_driver.steady_state_memetic.child_polish_no_improvement_iterations must be >= 1"
                    .into(),
            ));
        }

        if steady_state_memetic.child_polish_no_improvement_iterations
            > steady_state_memetic.child_polish_max_iterations
        {
            return Err(SolverError::ValidationError(
                "solver3 search_driver.steady_state_memetic.child_polish_no_improvement_iterations must be <= child_polish_max_iterations"
                    .into(),
            ));
        }

        if donor_session_transplant.archive_size == 0 {
            return Err(SolverError::ValidationError(
                "solver3 search_driver.donor_session_transplant.archive_size must be >= 1".into(),
            ));
        }

        if donor_session_transplant.recombination_no_improvement_window == 0 {
            return Err(SolverError::ValidationError(
                "solver3 search_driver.donor_session_transplant.recombination_no_improvement_window must be >= 1"
                    .into(),
            ));
        }

        if donor_session_transplant.recombination_cooldown_window == 0 {
            return Err(SolverError::ValidationError(
                "solver3 search_driver.donor_session_transplant.recombination_cooldown_window must be >= 1"
                    .into(),
            ));
        }

        if donor_session_transplant.max_recombination_events_per_run == Some(0) {
            return Err(SolverError::ValidationError(
                "solver3 search_driver.donor_session_transplant.max_recombination_events_per_run must be >= 1"
                    .into(),
            ));
        }

        if !donor_session_transplant
            .adaptive_raw_child_retention
            .keep_ratio
            .is_finite()
            || !(0.0..=1.0).contains(
                &donor_session_transplant
                    .adaptive_raw_child_retention
                    .keep_ratio,
            )
            || donor_session_transplant
                .adaptive_raw_child_retention
                .keep_ratio
                == 0.0
        {
            return Err(SolverError::ValidationError(
                "solver3 search_driver.donor_session_transplant.adaptive_raw_child_retention.keep_ratio must be finite and within (0.0, 1.0]"
                    .into(),
            ));
        }

        if donor_session_transplant
            .adaptive_raw_child_retention
            .warmup_samples
            == 0
        {
            return Err(SolverError::ValidationError(
                "solver3 search_driver.donor_session_transplant.adaptive_raw_child_retention.warmup_samples must be >= 1"
                    .into(),
            ));
        }

        if donor_session_transplant
            .adaptive_raw_child_retention
            .history_limit
            == 0
        {
            return Err(SolverError::ValidationError(
                "solver3 search_driver.donor_session_transplant.adaptive_raw_child_retention.history_limit must be >= 1"
                    .into(),
            ));
        }

        if donor_session_transplant
            .adaptive_raw_child_retention
            .history_limit
            < donor_session_transplant
                .adaptive_raw_child_retention
                .warmup_samples
        {
            return Err(SolverError::ValidationError(
                "solver3 search_driver.donor_session_transplant.adaptive_raw_child_retention.history_limit must be >= warmup_samples"
                    .into(),
            ));
        }

        if donor_session_transplant.child_polish_iterations_per_stagnation_window == 0 {
            return Err(SolverError::ValidationError(
                "solver3 search_driver.donor_session_transplant.child_polish_iterations_per_stagnation_window must be >= 1"
                    .into(),
            ));
        }

        if donor_session_transplant.child_polish_no_improvement_iterations_per_stagnation_window
            == 0
        {
            return Err(SolverError::ValidationError(
                "solver3 search_driver.donor_session_transplant.child_polish_no_improvement_iterations_per_stagnation_window must be >= 1"
                    .into(),
            ));
        }

        if donor_session_transplant.child_polish_no_improvement_iterations_per_stagnation_window
            > donor_session_transplant.child_polish_iterations_per_stagnation_window
        {
            return Err(SolverError::ValidationError(
                "solver3 search_driver.donor_session_transplant.child_polish_no_improvement_iterations_per_stagnation_window must be <= child_polish_iterations_per_stagnation_window"
                    .into(),
            ));
        }

        if donor_session_transplant.child_polish_max_stagnation_windows == 0 {
            return Err(SolverError::ValidationError(
                "solver3 search_driver.donor_session_transplant.child_polish_max_stagnation_windows must be >= 1"
                    .into(),
            ));
        }

        if session_aligned_path_relinking.archive_size == 0 {
            return Err(SolverError::ValidationError(
                "solver3 search_driver.session_aligned_path_relinking.archive_size must be >= 1"
                    .into(),
            ));
        }

        if session_aligned_path_relinking.recombination_no_improvement_window == 0 {
            return Err(SolverError::ValidationError(
                "solver3 search_driver.session_aligned_path_relinking.recombination_no_improvement_window must be >= 1"
                    .into(),
            ));
        }

        if session_aligned_path_relinking.recombination_cooldown_window == 0 {
            return Err(SolverError::ValidationError(
                "solver3 search_driver.session_aligned_path_relinking.recombination_cooldown_window must be >= 1"
                    .into(),
            ));
        }

        if session_aligned_path_relinking.max_path_events_per_run == Some(0) {
            return Err(SolverError::ValidationError(
                "solver3 search_driver.session_aligned_path_relinking.max_path_events_per_run must be >= 1"
                    .into(),
            ));
        }

        if session_aligned_path_relinking.max_session_imports_per_event == 0 {
            return Err(SolverError::ValidationError(
                "solver3 search_driver.session_aligned_path_relinking.max_session_imports_per_event must be >= 1"
                    .into(),
            ));
        }

        if session_aligned_path_relinking.path_step_no_improvement_limit == 0 {
            return Err(SolverError::ValidationError(
                "solver3 search_driver.session_aligned_path_relinking.path_step_no_improvement_limit must be >= 1"
                    .into(),
            ));
        }

        if session_aligned_path_relinking.min_aligned_session_distance_for_relinking == 0 {
            return Err(SolverError::ValidationError(
                "solver3 search_driver.session_aligned_path_relinking.min_aligned_session_distance_for_relinking must be >= 1"
                    .into(),
            ));
        }

        if !session_aligned_path_relinking
            .adaptive_raw_child_retention
            .keep_ratio
            .is_finite()
            || !(0.0..=1.0).contains(
                &session_aligned_path_relinking
                    .adaptive_raw_child_retention
                    .keep_ratio,
            )
            || session_aligned_path_relinking
                .adaptive_raw_child_retention
                .keep_ratio
                == 0.0
        {
            return Err(SolverError::ValidationError(
                "solver3 search_driver.session_aligned_path_relinking.adaptive_raw_child_retention.keep_ratio must be finite and within (0.0, 1.0]"
                    .into(),
            ));
        }

        if session_aligned_path_relinking
            .adaptive_raw_child_retention
            .warmup_samples
            == 0
        {
            return Err(SolverError::ValidationError(
                "solver3 search_driver.session_aligned_path_relinking.adaptive_raw_child_retention.warmup_samples must be >= 1"
                    .into(),
            ));
        }

        if session_aligned_path_relinking
            .adaptive_raw_child_retention
            .history_limit
            == 0
        {
            return Err(SolverError::ValidationError(
                "solver3 search_driver.session_aligned_path_relinking.adaptive_raw_child_retention.history_limit must be >= 1"
                    .into(),
            ));
        }

        if session_aligned_path_relinking
            .adaptive_raw_child_retention
            .history_limit
            < session_aligned_path_relinking
                .adaptive_raw_child_retention
                .warmup_samples
        {
            return Err(SolverError::ValidationError(
                "solver3 search_driver.session_aligned_path_relinking.adaptive_raw_child_retention.history_limit must be >= warmup_samples"
                    .into(),
            ));
        }

        if session_aligned_path_relinking.child_polish_iterations_per_stagnation_window == 0 {
            return Err(SolverError::ValidationError(
                "solver3 search_driver.session_aligned_path_relinking.child_polish_iterations_per_stagnation_window must be >= 1"
                    .into(),
            ));
        }

        if session_aligned_path_relinking
            .child_polish_no_improvement_iterations_per_stagnation_window
            == 0
        {
            return Err(SolverError::ValidationError(
                "solver3 search_driver.session_aligned_path_relinking.child_polish_no_improvement_iterations_per_stagnation_window must be >= 1"
                    .into(),
            ));
        }

        if session_aligned_path_relinking
            .child_polish_no_improvement_iterations_per_stagnation_window
            > session_aligned_path_relinking.child_polish_iterations_per_stagnation_window
        {
            return Err(SolverError::ValidationError(
                "solver3 search_driver.session_aligned_path_relinking.child_polish_no_improvement_iterations_per_stagnation_window must be <= child_polish_iterations_per_stagnation_window"
                    .into(),
            ));
        }

        if session_aligned_path_relinking.child_polish_max_stagnation_windows == 0 {
            return Err(SolverError::ValidationError(
                "solver3 search_driver.session_aligned_path_relinking.child_polish_max_stagnation_windows must be >= 1"
                    .into(),
            ));
        }

        validate_multi_root_balanced_session_inheritance(multi_root_balanced_session_inheritance)?;

        #[cfg(not(feature = "solver3-oracle-checks"))]
        if correctness_lane_enabled {
            return Err(SolverError::ValidationError(
                "solver3 correctness lane requires compiling gm-core with feature `solver3-oracle-checks`"
                    .into(),
            ));
        }

        let allows_swap_family = move_policy.allowed_families().contains(&MoveFamily::Swap);

        if local_improver_mode == Solver3LocalImproverMode::SgpWeekPairTabu
            && state.compiled.repeat_encounter.is_none()
        {
            return Err(SolverError::ValidationError(
                "solver3 local_improver.mode=sgp_week_pair_tabu requires a repeat_encounter constraint"
                    .into(),
            ));
        }

        if local_improver_mode == Solver3LocalImproverMode::SgpWeekPairTabu && !allows_swap_family {
            return Err(SolverError::ValidationError(
                "solver3 local_improver.mode=sgp_week_pair_tabu requires move_policy to allow swap moves"
                    .into(),
            ));
        }

        if search_driver_mode == Solver3SearchDriverMode::SteadyStateMemetic && !allows_swap_family
        {
            return Err(SolverError::ValidationError(
                "solver3 search_driver.mode=steady_state_memetic requires move_policy to allow swap moves"
                    .into(),
            ));
        }

        if search_driver_mode == Solver3SearchDriverMode::SteadyStateMemetic
            && !state.compiled.cliques.is_empty()
        {
            return Err(SolverError::ValidationError(
                "solver3 search_driver.mode=steady_state_memetic does not yet support active cliques / must_stay_together constraints"
                    .into(),
            ));
        }

        if search_driver_mode == Solver3SearchDriverMode::DonorSessionTransplant
            && !allows_swap_family
        {
            return Err(SolverError::ValidationError(
                "solver3 search_driver.mode=donor_session_transplant requires move_policy to allow swap moves"
                    .into(),
            ));
        }

        if search_driver_mode == Solver3SearchDriverMode::DonorSessionTransplant
            && !state.compiled.cliques.is_empty()
        {
            return Err(SolverError::ValidationError(
                "solver3 search_driver.mode=donor_session_transplant does not yet support active cliques / must_stay_together constraints"
                    .into(),
            ));
        }

        if search_driver_mode == Solver3SearchDriverMode::SessionAlignedPathRelinking
            && !allows_swap_family
        {
            return Err(SolverError::ValidationError(
                "solver3 search_driver.mode=session_aligned_path_relinking requires move_policy to allow swap moves"
                    .into(),
            ));
        }

        if search_driver_mode == Solver3SearchDriverMode::SessionAlignedPathRelinking
            && !state.compiled.cliques.is_empty()
        {
            return Err(SolverError::ValidationError(
                "solver3 search_driver.mode=session_aligned_path_relinking does not yet support active cliques / must_stay_together constraints"
                    .into(),
            ));
        }

        if search_driver_mode == Solver3SearchDriverMode::SessionAlignedPathRelinking
            && state.compiled.num_sessions > MAX_EXACT_ALIGNMENT_SESSIONS
        {
            return Err(SolverError::ValidationError(format!(
                "solver3 search_driver.mode=session_aligned_path_relinking currently supports at most {MAX_EXACT_ALIGNMENT_SESSIONS} sessions for exact alignment"
            )));
        }

        if search_driver_mode == Solver3SearchDriverMode::MultiRootBalancedSessionInheritance
            && !allows_swap_family
        {
            return Err(SolverError::ValidationError(
                "solver3 search_driver.mode=multi_root_balanced_session_inheritance requires move_policy to allow swap moves"
                    .into(),
            ));
        }

        if search_driver_mode == Solver3SearchDriverMode::MultiRootBalancedSessionInheritance
            && !state.compiled.cliques.is_empty()
        {
            return Err(SolverError::ValidationError(
                "solver3 search_driver.mode=multi_root_balanced_session_inheritance does not yet support active cliques / must_stay_together constraints"
                    .into(),
            ));
        }

        if search_driver_mode == Solver3SearchDriverMode::MultiRootBalancedSessionInheritance
            && state.compiled.repeat_encounter.is_none()
        {
            return Err(SolverError::ValidationError(
                "solver3 search_driver.mode=multi_root_balanced_session_inheritance requires a repeat_encounter constraint"
                    .into(),
            ));
        }

        if search_driver_mode == Solver3SearchDriverMode::MultiRootBalancedSessionInheritance
            && state.compiled.num_sessions > MAX_EXACT_ALIGNMENT_SESSIONS
        {
            return Err(SolverError::ValidationError(format!(
                "solver3 search_driver.mode=multi_root_balanced_session_inheritance currently supports at most {MAX_EXACT_ALIGNMENT_SESSIONS} sessions for exact alignment"
            )));
        }

        match (search_driver_mode, local_improver_mode) {
            (Solver3SearchDriverMode::SingleState, Solver3LocalImproverMode::RecordToRecord)
            | (Solver3SearchDriverMode::SingleState, Solver3LocalImproverMode::SgpWeekPairTabu) => {
            }
            (
                Solver3SearchDriverMode::SteadyStateMemetic,
                Solver3LocalImproverMode::RecordToRecord,
            )
            | (
                Solver3SearchDriverMode::SteadyStateMemetic,
                Solver3LocalImproverMode::SgpWeekPairTabu,
            )
            | (
                Solver3SearchDriverMode::DonorSessionTransplant,
                Solver3LocalImproverMode::RecordToRecord,
            )
            | (
                Solver3SearchDriverMode::DonorSessionTransplant,
                Solver3LocalImproverMode::SgpWeekPairTabu,
            )
            | (
                Solver3SearchDriverMode::SessionAlignedPathRelinking,
                Solver3LocalImproverMode::RecordToRecord,
            )
            | (
                Solver3SearchDriverMode::SessionAlignedPathRelinking,
                Solver3LocalImproverMode::SgpWeekPairTabu,
            )
            | (
                Solver3SearchDriverMode::MultiRootBalancedSessionInheritance,
                Solver3LocalImproverMode::RecordToRecord,
            )
            | (
                Solver3SearchDriverMode::MultiRootBalancedSessionInheritance,
                Solver3LocalImproverMode::SgpWeekPairTabu,
            ) => {}
        }

        Ok(Self {
            effective_seed,
            move_policy,
            search_driver_mode,
            local_improver_mode,
            max_iterations: configuration
                .stop_conditions
                .max_iterations
                .unwrap_or(DEFAULT_MAX_ITERATIONS),
            no_improvement_limit: configuration.stop_conditions.no_improvement_iterations,
            time_limit_seconds: configuration.stop_conditions.time_limit_seconds,
            stop_on_optimal_score: configuration.stop_conditions.stop_on_optimal_score,
            allowed_sessions: state
                .compiled
                .allowed_sessions
                .clone()
                .unwrap_or_else(|| (0..state.compiled.num_sessions).collect()),
            correctness_lane_enabled,
            correctness_sample_every_accepted_moves,
            repeat_guided_swaps_enabled,
            repeat_guided_swap_probability,
            repeat_guided_swap_candidate_preview_budget: repeat_guided_swap_candidate_preview_budget
                as usize,
            sgp_week_pair_tabu: Some(SgpWeekPairTabuConfig {
                tenure_mode: sgp_week_pair_tabu.tenure_mode,
                tenure_min: sgp_week_pair_tabu.tenure_min as u64,
                tenure_max: sgp_week_pair_tabu.tenure_max as u64,
                retry_cap: sgp_week_pair_tabu.retry_cap as usize,
                aspiration_enabled: sgp_week_pair_tabu.aspiration_enabled,
                session_scale_reference_participants: sgp_week_pair_tabu
                    .session_scale_reference_participants
                    as u64,
                reactive_no_improvement_window: sgp_week_pair_tabu.reactive_no_improvement_window
                    as u64,
                reactive_max_multiplier: sgp_week_pair_tabu.reactive_max_multiplier as u64,
                conflict_restricted_swap_sampling_enabled: sgp_week_pair_tabu
                    .conflict_restricted_swap_sampling_enabled,
            }),
            steady_state_memetic: Some(SteadyStateMemeticConfig {
                population_size: steady_state_memetic.population_size as usize,
                parent_tournament_size: steady_state_memetic.parent_tournament_size as usize,
                mutation_swaps_min: steady_state_memetic.mutation_swaps_min as usize,
                mutation_swaps_max: steady_state_memetic.mutation_swaps_max as usize,
                child_polish_max_iterations: steady_state_memetic.child_polish_max_iterations
                    as u64,
                child_polish_no_improvement_iterations: steady_state_memetic
                    .child_polish_no_improvement_iterations
                    as u64,
            }),
            donor_session_transplant: Some(DonorSessionTransplantConfig {
                archive_size: donor_session_transplant.archive_size as usize,
                recombination_no_improvement_window: donor_session_transplant
                    .recombination_no_improvement_window
                    as u64,
                recombination_cooldown_window: donor_session_transplant
                    .recombination_cooldown_window
                    as u64,
                max_recombination_events_per_run: donor_session_transplant
                    .max_recombination_events_per_run
                    .map(u64::from),
                adaptive_raw_child_retention: AdaptiveRawChildRetentionConfig {
                    keep_ratio: donor_session_transplant
                        .adaptive_raw_child_retention
                        .keep_ratio,
                    warmup_samples: donor_session_transplant
                        .adaptive_raw_child_retention
                        .warmup_samples as usize,
                    history_limit: donor_session_transplant
                        .adaptive_raw_child_retention
                        .history_limit as usize,
                },
                swap_local_optimum_certification_enabled: donor_session_transplant
                    .swap_local_optimum_certification_enabled,
                child_polish_iterations_per_stagnation_window: donor_session_transplant
                    .child_polish_iterations_per_stagnation_window
                    as u64,
                child_polish_no_improvement_iterations_per_stagnation_window:
                    donor_session_transplant
                        .child_polish_no_improvement_iterations_per_stagnation_window
                        as u64,
                child_polish_max_stagnation_windows: donor_session_transplant
                    .child_polish_max_stagnation_windows
                    as u64,
            }),
            session_aligned_path_relinking: Some(SessionAlignedPathRelinkingConfig {
                operator_variant: session_aligned_path_relinking.operator_variant,
                archive_size: session_aligned_path_relinking.archive_size as usize,
                recombination_no_improvement_window: session_aligned_path_relinking
                    .recombination_no_improvement_window
                    as u64,
                recombination_cooldown_window: session_aligned_path_relinking
                    .recombination_cooldown_window
                    as u64,
                max_path_events_per_run: session_aligned_path_relinking
                    .max_path_events_per_run
                    .map(u64::from),
                max_session_imports_per_event: session_aligned_path_relinking
                    .max_session_imports_per_event
                    as usize,
                path_step_no_improvement_limit: session_aligned_path_relinking
                    .path_step_no_improvement_limit
                    as usize,
                min_aligned_session_distance_for_relinking: session_aligned_path_relinking
                    .min_aligned_session_distance_for_relinking,
                adaptive_raw_child_retention: AdaptiveRawChildRetentionConfig {
                    keep_ratio: session_aligned_path_relinking
                        .adaptive_raw_child_retention
                        .keep_ratio,
                    warmup_samples: session_aligned_path_relinking
                        .adaptive_raw_child_retention
                        .warmup_samples as usize,
                    history_limit: session_aligned_path_relinking
                        .adaptive_raw_child_retention
                        .history_limit as usize,
                },
                swap_local_optimum_certification_enabled: session_aligned_path_relinking
                    .swap_local_optimum_certification_enabled,
                child_polish_iterations_per_stagnation_window: session_aligned_path_relinking
                    .child_polish_iterations_per_stagnation_window
                    as u64,
                child_polish_no_improvement_iterations_per_stagnation_window:
                    session_aligned_path_relinking
                        .child_polish_no_improvement_iterations_per_stagnation_window
                        as u64,
                child_polish_max_stagnation_windows: session_aligned_path_relinking
                    .child_polish_max_stagnation_windows
                    as u64,
            }),
            multi_root_balanced_session_inheritance: Some(
                MultiRootBalancedSessionInheritanceConfig {
                    root_count: multi_root_balanced_session_inheritance.root_count as usize,
                    archive_size_per_root: multi_root_balanced_session_inheritance
                        .archive_size_per_root as usize,
                    recombination_no_improvement_window: multi_root_balanced_session_inheritance
                        .recombination_no_improvement_window
                        as u64,
                    recombination_cooldown_window: multi_root_balanced_session_inheritance
                        .recombination_cooldown_window
                        as u64,
                    max_recombination_events_per_run: multi_root_balanced_session_inheritance
                        .max_recombination_events_per_run
                        .map(u64::from),
                    max_parent_score_delta_from_best: multi_root_balanced_session_inheritance
                        .max_parent_score_delta_from_best,
                    min_cross_root_session_disagreement: multi_root_balanced_session_inheritance
                        .min_cross_root_session_disagreement
                        as usize,
                    parent_a_differing_session_share: multi_root_balanced_session_inheritance
                        .parent_a_differing_session_share,
                    adaptive_raw_child_retention: AdaptiveRawChildRetentionConfig {
                        keep_ratio: multi_root_balanced_session_inheritance
                            .adaptive_raw_child_retention
                            .keep_ratio,
                        warmup_samples: multi_root_balanced_session_inheritance
                            .adaptive_raw_child_retention
                            .warmup_samples as usize,
                        history_limit: multi_root_balanced_session_inheritance
                            .adaptive_raw_child_retention
                            .history_limit as usize,
                    },
                    swap_local_optimum_certification_enabled:
                        multi_root_balanced_session_inheritance
                            .swap_local_optimum_certification_enabled,
                    child_polish_iterations_per_stagnation_window:
                        multi_root_balanced_session_inheritance
                            .child_polish_iterations_per_stagnation_window
                            as u64,
                    child_polish_no_improvement_iterations_per_stagnation_window:
                        multi_root_balanced_session_inheritance
                            .child_polish_no_improvement_iterations_per_stagnation_window
                            as u64,
                    child_polish_max_stagnation_windows: multi_root_balanced_session_inheritance
                        .child_polish_max_stagnation_windows
                        as u64,
                },
            ),
        })
    }
}

#[derive(Debug, Clone, Default, PartialEq)]
#[allow(dead_code)]
pub(crate) struct SearchPolicyMemory {
    pub(crate) tabu: Option<TabuPolicyMemory>,
    pub(crate) threshold: Option<ThresholdAcceptanceMemory>,
    pub(crate) late_acceptance: Option<LateAcceptanceMemory>,
    pub(crate) ils: Option<IteratedLocalSearchMemory>,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct TabuPolicyMemory {
    pub(crate) tenure_hint: usize,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct ThresholdAcceptanceMemory {
    pub(crate) threshold_score: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct LateAcceptanceMemory {
    pub(crate) window_len: usize,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct IteratedLocalSearchMemory {
    pub(crate) perturbation_round: u64,
}

#[derive(Debug, Clone)]
pub(crate) struct SearchProgressState {
    pub(crate) current_state: RuntimeState,
    pub(crate) best_state: RuntimeState,
    pub(crate) initial_score: f64,
    pub(crate) best_score: f64,
    pub(crate) no_improvement_count: u64,
    pub(crate) max_no_improvement_streak: u64,
    pub(crate) iterations_completed: u64,
    pub(crate) local_optima_escapes: u64,
    pub(crate) accepted_uphill_moves: u64,
    pub(crate) accepted_downhill_moves: u64,
    pub(crate) accepted_neutral_moves: u64,
    pub(crate) attempted_delta_sum: f64,
    pub(crate) accepted_delta_sum: f64,
    pub(crate) biggest_attempted_increase: f64,
    pub(crate) biggest_accepted_increase: f64,
    pub(crate) recent_acceptance: VecDeque<bool>,
    pub(crate) best_score_timeline: Vec<BestScoreTimelinePoint>,
    pub(crate) repeat_guided_swap_telemetry: RepeatGuidedSwapBenchmarkTelemetry,
    pub(crate) sgp_week_pair_tabu_telemetry: Option<SgpWeekPairTabuBenchmarkTelemetry>,
    pub(crate) memetic_telemetry: Option<MemeticBenchmarkTelemetry>,
    pub(crate) donor_session_transplant_telemetry: Option<DonorSessionTransplantBenchmarkTelemetry>,
    pub(crate) session_aligned_path_relinking_telemetry:
        Option<SessionAlignedPathRelinkingBenchmarkTelemetry>,
    pub(crate) multi_root_balanced_session_inheritance_telemetry:
        Option<MultiRootBalancedSessionInheritanceBenchmarkTelemetry>,
    pub(crate) move_metrics: MoveFamilyBenchmarkTelemetrySummary,
    #[allow(dead_code)]
    pub(crate) policy_memory: SearchPolicyMemory,
}

impl SearchProgressState {
    pub(crate) fn new(initial_state: RuntimeState) -> Self {
        let initial_score = initial_state.total_score;
        Self {
            current_state: initial_state.clone(),
            best_state: initial_state,
            initial_score,
            best_score: initial_score,
            no_improvement_count: 0,
            max_no_improvement_streak: 0,
            iterations_completed: 0,
            local_optima_escapes: 0,
            accepted_uphill_moves: 0,
            accepted_downhill_moves: 0,
            accepted_neutral_moves: 0,
            attempted_delta_sum: 0.0,
            accepted_delta_sum: 0.0,
            biggest_attempted_increase: 0.0,
            biggest_accepted_increase: 0.0,
            recent_acceptance: VecDeque::with_capacity(RECENT_WINDOW),
            best_score_timeline: vec![BestScoreTimelinePoint {
                iteration: 0,
                elapsed_seconds: 0.0,
                best_score: initial_score,
            }],
            repeat_guided_swap_telemetry: RepeatGuidedSwapBenchmarkTelemetry::default(),
            sgp_week_pair_tabu_telemetry: None,
            memetic_telemetry: None,
            donor_session_transplant_telemetry: None,
            session_aligned_path_relinking_telemetry: None,
            multi_root_balanced_session_inheritance_telemetry: None,
            move_metrics: MoveFamilyBenchmarkTelemetrySummary::default(),
            policy_memory: SearchPolicyMemory::default(),
        }
    }

    pub(crate) fn record_repeat_guided_swap_sampling(
        &mut self,
        guided_attempts: u64,
        guided_successes: u64,
        guided_fallback_to_random: u64,
        guided_previewed_candidates: u64,
    ) {
        self.repeat_guided_swap_telemetry.guided_attempts += guided_attempts;
        self.repeat_guided_swap_telemetry.guided_successes += guided_successes;
        self.repeat_guided_swap_telemetry.guided_fallback_to_random += guided_fallback_to_random;
        self.repeat_guided_swap_telemetry
            .guided_previewed_candidates += guided_previewed_candidates;
    }

    pub(crate) fn record_tabu_sampling(
        &mut self,
        raw_tabu_hits: u64,
        prefilter_skips: u64,
        retry_exhaustions: u64,
        hard_blocks: u64,
        aspiration_preview_surfaces: u64,
    ) {
        if raw_tabu_hits == 0
            && prefilter_skips == 0
            && retry_exhaustions == 0
            && hard_blocks == 0
            && aspiration_preview_surfaces == 0
        {
            return;
        }
        let telemetry = self
            .sgp_week_pair_tabu_telemetry
            .get_or_insert_with(SgpWeekPairTabuBenchmarkTelemetry::default);
        telemetry.raw_tabu_hits += raw_tabu_hits;
        telemetry.prefilter_skips += prefilter_skips;
        telemetry.retry_exhaustions += retry_exhaustions;
        telemetry.hard_blocks += hard_blocks;
        telemetry.aspiration_preview_surfaces += aspiration_preview_surfaces;
    }

    pub(crate) fn record_tabu_aspiration_override(&mut self) {
        let telemetry = self
            .sgp_week_pair_tabu_telemetry
            .get_or_insert_with(SgpWeekPairTabuBenchmarkTelemetry::default);
        telemetry.aspiration_overrides += 1;
    }

    pub(crate) fn record_tabu_realized_tenure(&mut self, tenure: u64) {
        let telemetry = self
            .sgp_week_pair_tabu_telemetry
            .get_or_insert_with(SgpWeekPairTabuBenchmarkTelemetry::default);
        telemetry.recorded_swaps += 1;
        telemetry.realized_tenure_sum += tenure;
        telemetry.realized_tenure_min = Some(
            telemetry
                .realized_tenure_min
                .map_or(tenure, |current| current.min(tenure)),
        );
        telemetry.realized_tenure_max = Some(
            telemetry
                .realized_tenure_max
                .map_or(tenure, |current| current.max(tenure)),
        );
    }

    pub(crate) fn record_preview_attempt(
        &mut self,
        family: MoveFamily,
        preview_seconds: f64,
        delta_score: f64,
    ) {
        let metrics = family_metrics_mut(&mut self.move_metrics, family);
        metrics.attempts += 1;
        metrics.preview_seconds += preview_seconds;
        self.attempted_delta_sum += delta_score;
        self.biggest_attempted_increase = self.biggest_attempted_increase.max(delta_score.max(0.0));
    }

    pub(crate) fn record_accepted_move(
        &mut self,
        family: MoveFamily,
        apply_seconds: f64,
        delta_score: f64,
        escaped_local_optimum: bool,
    ) {
        let metrics = family_metrics_mut(&mut self.move_metrics, family);
        metrics.accepted += 1;
        if delta_score < 0.0 {
            metrics.improving_accepts += 1;
            self.accepted_downhill_moves += 1;
        } else if delta_score > 0.0 {
            self.accepted_uphill_moves += 1;
        } else {
            self.accepted_neutral_moves += 1;
        }
        metrics.apply_seconds += apply_seconds;
        self.accepted_delta_sum += delta_score;
        if escaped_local_optimum {
            self.local_optima_escapes += 1;
            self.biggest_accepted_increase = self.biggest_accepted_increase.max(delta_score);
        }
    }

    pub(crate) fn record_rejected_move(&mut self, family: MoveFamily) {
        family_metrics_mut(&mut self.move_metrics, family).rejected += 1;
        self.record_no_improvement_step();
        self.push_recent_acceptance(false);
    }

    pub(crate) fn record_no_candidate(&mut self) {
        self.record_no_improvement_step();
        self.push_recent_acceptance(false);
    }

    pub(crate) fn refresh_best_from_current(
        &mut self,
        iteration: u64,
        elapsed_seconds: f64,
    ) -> bool {
        if self.current_state.total_score < self.best_score {
            self.best_score = self.current_state.total_score;
            self.best_state = self.current_state.clone();
            self.no_improvement_count = 0;
            self.best_score_timeline.push(BestScoreTimelinePoint {
                iteration: iteration + 1,
                elapsed_seconds,
                best_score: self.best_score,
            });
            true
        } else {
            self.record_no_improvement_step();
            false
        }
    }

    pub(crate) fn record_acceptance_result(&mut self, accepted: bool) {
        self.push_recent_acceptance(accepted);
    }

    pub(crate) fn total_accepted_moves(&self) -> u64 {
        self.move_metrics.swap.accepted
            + self.move_metrics.transfer.accepted
            + self.move_metrics.clique_swap.accepted
    }

    pub(crate) fn finish_iteration(&mut self, iteration: u64) {
        self.iterations_completed = iteration + 1;
    }

    #[allow(clippy::too_many_arguments)]
    pub(crate) fn to_progress_update(
        &self,
        run_context: &SearchRunContext,
        iteration: u64,
        temperature: f64,
        elapsed_seconds: f64,
        stop_reason: Option<StopReason>,
    ) -> ProgressUpdate {
        let completed_iterations = if self.iterations_completed == 0
            && matches!(stop_reason, Some(StopReason::OptimalScoreReached))
        {
            0
        } else {
            self.iterations_completed.max(iteration.saturating_add(1))
        };
        let total_attempts = self.move_metrics.swap.attempts
            + self.move_metrics.transfer.attempts
            + self.move_metrics.clique_swap.attempts;
        let total_accepted = self.move_metrics.swap.accepted
            + self.move_metrics.transfer.accepted
            + self.move_metrics.clique_swap.accepted;
        let overall_acceptance_rate = ratio(total_accepted, total_attempts);
        let recent_acceptance_rate = if self.recent_acceptance.is_empty() {
            0.0
        } else {
            self.recent_acceptance
                .iter()
                .filter(|accepted| **accepted)
                .count() as f64
                / self.recent_acceptance.len() as f64
        };

        ProgressUpdate {
            iteration: completed_iterations,
            max_iterations: displayed_total_iterations(
                completed_iterations,
                run_context.max_iterations,
                elapsed_seconds,
                run_context.time_limit_seconds,
                stop_reason,
            ),
            temperature,
            current_score: self.current_state.total_score,
            best_score: self.best_state.total_score,
            current_contacts: self.current_state.unique_contacts as i32,
            best_contacts: self.best_state.unique_contacts as i32,
            repetition_penalty: self.current_state.repetition_penalty_raw,
            elapsed_seconds,
            no_improvement_count: self.no_improvement_count,
            clique_swaps_tried: self.move_metrics.clique_swap.attempts,
            clique_swaps_accepted: self.move_metrics.clique_swap.accepted,
            clique_swaps_rejected: self.move_metrics.clique_swap.rejected,
            transfers_tried: self.move_metrics.transfer.attempts,
            transfers_accepted: self.move_metrics.transfer.accepted,
            transfers_rejected: self.move_metrics.transfer.rejected,
            swaps_tried: self.move_metrics.swap.attempts,
            swaps_accepted: self.move_metrics.swap.accepted,
            swaps_rejected: self.move_metrics.swap.rejected,
            overall_acceptance_rate,
            recent_acceptance_rate,
            avg_attempted_move_delta: average_delta(self.attempted_delta_sum, total_attempts),
            avg_accepted_move_delta: average_delta(self.accepted_delta_sum, total_accepted),
            biggest_accepted_increase: self.biggest_accepted_increase,
            biggest_attempted_increase: self.biggest_attempted_increase,
            current_repetition_penalty: self.current_state.weighted_repetition_penalty,
            current_balance_penalty: self.current_state.attribute_balance_penalty,
            current_constraint_penalty: self.current_state.constraint_penalty_weighted,
            best_repetition_penalty: self.best_state.weighted_repetition_penalty,
            best_balance_penalty: self.best_state.attribute_balance_penalty,
            best_constraint_penalty: self.best_state.constraint_penalty_weighted,
            reheats_performed: 0,
            iterations_since_last_reheat: completed_iterations,
            local_optima_escapes: self.local_optima_escapes,
            avg_time_per_iteration_ms: if completed_iterations == 0 {
                0.0
            } else {
                elapsed_seconds * 1000.0 / completed_iterations as f64
            },
            cooling_progress: super::acceptance::cooling_progress(
                iteration,
                run_context.max_iterations,
                elapsed_seconds,
                run_context.time_limit_seconds,
            ),
            clique_swap_success_rate: ratio(
                self.move_metrics.clique_swap.accepted,
                self.move_metrics.clique_swap.attempts,
            ),
            transfer_success_rate: ratio(
                self.move_metrics.transfer.accepted,
                self.move_metrics.transfer.attempts,
            ),
            swap_success_rate: ratio(
                self.move_metrics.swap.accepted,
                self.move_metrics.swap.attempts,
            ),
            score_variance: 0.0,
            search_efficiency: if elapsed_seconds > 0.0 {
                (self.best_state.total_score - self.current_state.total_score).abs()
                    / elapsed_seconds
            } else {
                0.0
            },
            best_schedule: None,
            effective_seed: Some(run_context.effective_seed),
            move_policy: Some(run_context.move_policy.clone()),
            stop_reason,
        }
    }

    pub(crate) fn to_benchmark_telemetry(
        &self,
        run_context: &SearchRunContext,
        stop_reason: StopReason,
        search_seconds: f64,
    ) -> SolverBenchmarkTelemetry {
        SolverBenchmarkTelemetry {
            effective_seed: run_context.effective_seed,
            move_policy: run_context.move_policy.clone(),
            stop_reason,
            iterations_completed: self.iterations_completed,
            no_improvement_count: self.no_improvement_count,
            max_no_improvement_streak: self.max_no_improvement_streak,
            reheats_performed: 0,
            accepted_uphill_moves: self.accepted_uphill_moves,
            accepted_downhill_moves: self.accepted_downhill_moves,
            accepted_neutral_moves: self.accepted_neutral_moves,
            restart_count: None,
            perturbation_count: self
                .policy_memory
                .ils
                .as_ref()
                .map(|memory| memory.perturbation_round),
            initial_score: self.initial_score,
            best_score: self.best_state.total_score,
            final_score: self.best_state.total_score,
            initialization_seconds: 0.0,
            search_seconds,
            finalization_seconds: 0.0,
            total_seconds: search_seconds,
            iterations_per_second: if search_seconds > 0.0 {
                self.iterations_completed as f64 / search_seconds
            } else {
                0.0
            },
            best_score_timeline: self.best_score_timeline.clone(),
            repeat_guided_swaps: self.repeat_guided_swap_telemetry.clone(),
            sgp_week_pair_tabu: self.sgp_week_pair_tabu_telemetry.clone(),
            memetic: self.memetic_telemetry.clone(),
            donor_session_transplant: self.donor_session_transplant_telemetry.clone(),
            session_aligned_path_relinking: self.session_aligned_path_relinking_telemetry.clone(),
            multi_root_balanced_session_inheritance: self
                .multi_root_balanced_session_inheritance_telemetry
                .clone(),
            moves: self.move_metrics.clone(),
        }
    }

    fn record_no_improvement_step(&mut self) {
        self.no_improvement_count += 1;
        self.max_no_improvement_streak = self
            .max_no_improvement_streak
            .max(self.no_improvement_count);
    }

    fn push_recent_acceptance(&mut self, accepted: bool) {
        if self.recent_acceptance.len() == RECENT_WINDOW {
            self.recent_acceptance.pop_front();
        }
        self.recent_acceptance.push_back(accepted);
    }
}

fn family_metrics_mut(
    summary: &mut MoveFamilyBenchmarkTelemetrySummary,
    family: MoveFamily,
) -> &mut MoveFamilyBenchmarkTelemetry {
    match family {
        MoveFamily::Swap => &mut summary.swap,
        MoveFamily::Transfer => &mut summary.transfer,
        MoveFamily::CliqueSwap => &mut summary.clique_swap,
    }
}

fn average_delta(sum: f64, count: u64) -> f64 {
    if count == 0 {
        0.0
    } else {
        sum / count as f64
    }
}

fn ratio(numerator: u64, denominator: u64) -> f64 {
    if denominator == 0 {
        0.0
    } else {
        numerator as f64 / denominator as f64
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use crate::models::{
        ApiInput, Constraint, Group, Objective, Person, ProblemDefinition, RepeatEncounterParams,
        Solver3CorrectnessLaneParams, Solver3DonorSessionTransplantParams,
        Solver3HotspotGuidanceParams, Solver3LocalImproverMode, Solver3LocalImproverParams,
        Solver3MultiRootBalancedSessionInheritanceParams, Solver3Params,
        Solver3PathRelinkingOperatorVariant, Solver3RepeatGuidedSwapParams,
        Solver3SearchDriverMode, Solver3SearchDriverParams,
        Solver3SessionAlignedPathRelinkingParams, Solver3SgpWeekPairTabuParams,
        Solver3SgpWeekPairTabuTenureMode, SolverConfiguration, SolverParams, StopConditions,
    };

    use super::{SearchProgressState, SearchRunContext};
    use crate::solver3::runtime_state::RuntimeState;

    fn solver3_config() -> SolverConfiguration {
        SolverConfiguration {
            solver_type: "solver3".to_string(),
            stop_conditions: StopConditions {
                max_iterations: Some(123),
                time_limit_seconds: Some(9),
                no_improvement_iterations: Some(17),
                stop_on_optimal_score: true,
            },
            solver_params: SolverParams::Solver3(Solver3Params::default()),
            logging: Default::default(),
            telemetry: Default::default(),
            seed: Some(7),
            move_policy: None,
            allowed_sessions: None,
        }
    }

    fn simple_state() -> RuntimeState {
        let input = ApiInput {
            problem: ProblemDefinition {
                people: (0..4)
                    .map(|i| Person {
                        id: format!("p{}", i),
                        attributes: HashMap::new(),
                        sessions: None,
                    })
                    .collect(),
                groups: vec![
                    Group {
                        id: "g0".into(),
                        size: 2,
                        session_sizes: None,
                    },
                    Group {
                        id: "g1".into(),
                        size: 2,
                        session_sizes: None,
                    },
                ],
                num_sessions: 2,
            },
            initial_schedule: None,
            construction_seed_schedule: None,
            objectives: vec![Objective {
                r#type: "maximize_unique_contacts".into(),
                weight: 1.0,
            }],
            constraints: vec![],
            solver: solver3_config(),
        };
        RuntimeState::from_input(&input).unwrap()
    }

    fn repeat_state() -> RuntimeState {
        let mut input = ApiInput {
            problem: ProblemDefinition {
                people: (0..4)
                    .map(|i| Person {
                        id: format!("p{}", i),
                        attributes: HashMap::new(),
                        sessions: None,
                    })
                    .collect(),
                groups: vec![
                    Group {
                        id: "g0".into(),
                        size: 2,
                        session_sizes: None,
                    },
                    Group {
                        id: "g1".into(),
                        size: 2,
                        session_sizes: None,
                    },
                ],
                num_sessions: 2,
            },
            initial_schedule: None,
            construction_seed_schedule: None,
            objectives: vec![Objective {
                r#type: "maximize_unique_contacts".into(),
                weight: 1.0,
            }],
            constraints: vec![],
            solver: solver3_config(),
        };
        input.constraints = vec![Constraint::RepeatEncounter(RepeatEncounterParams {
            max_allowed_encounters: 1,
            penalty_function: "linear".into(),
            penalty_weight: 100.0,
        })];
        RuntimeState::from_input(&input).unwrap()
    }

    #[test]
    fn run_context_captures_search_limits_and_allowed_sessions() {
        let state = simple_state();
        let context = SearchRunContext::from_solver(&solver3_config(), &state, 7).unwrap();
        assert_eq!(context.effective_seed, 7);
        assert_eq!(
            context.search_driver_mode,
            Solver3SearchDriverMode::SingleState
        );
        assert_eq!(
            context.local_improver_mode,
            Solver3LocalImproverMode::RecordToRecord
        );
        assert_eq!(context.max_iterations, 123);
        assert_eq!(context.no_improvement_limit, Some(17));
        assert_eq!(context.time_limit_seconds, Some(9));
        assert_eq!(context.allowed_sessions, vec![0, 1]);
        assert!(!context.correctness_lane_enabled);
        assert_eq!(context.correctness_sample_every_accepted_moves, 16);
        assert!(!context.repeat_guided_swaps_enabled);
        assert_eq!(context.repeat_guided_swap_probability, 0.0);
        assert_eq!(context.repeat_guided_swap_candidate_preview_budget, 0);
        assert_eq!(context.sgp_week_pair_tabu.as_ref().unwrap().tenure_min, 8);
        assert_eq!(context.sgp_week_pair_tabu.as_ref().unwrap().tenure_max, 32);
        assert_eq!(context.sgp_week_pair_tabu.as_ref().unwrap().retry_cap, 16);
        assert_eq!(
            context.sgp_week_pair_tabu.as_ref().unwrap().tenure_mode,
            Solver3SgpWeekPairTabuTenureMode::FixedInterval
        );
        assert_eq!(
            context
                .sgp_week_pair_tabu
                .as_ref()
                .unwrap()
                .session_scale_reference_participants,
            32
        );
        assert_eq!(
            context
                .sgp_week_pair_tabu
                .as_ref()
                .unwrap()
                .reactive_no_improvement_window,
            100_000
        );
        assert_eq!(
            context
                .sgp_week_pair_tabu
                .as_ref()
                .unwrap()
                .reactive_max_multiplier,
            4
        );
        assert_eq!(
            context
                .steady_state_memetic
                .as_ref()
                .unwrap()
                .population_size,
            6
        );
        assert_eq!(
            context
                .steady_state_memetic
                .as_ref()
                .unwrap()
                .child_polish_max_iterations,
            64
        );
        assert_eq!(
            context
                .donor_session_transplant
                .as_ref()
                .unwrap()
                .archive_size,
            4
        );
        assert_eq!(
            context
                .donor_session_transplant
                .as_ref()
                .unwrap()
                .recombination_no_improvement_window,
            200_000
        );
        assert_eq!(
            context
                .donor_session_transplant
                .as_ref()
                .unwrap()
                .recombination_cooldown_window,
            100_000
        );
        assert!(
            context
                .sgp_week_pair_tabu
                .as_ref()
                .unwrap()
                .aspiration_enabled
        );
    }

    #[test]
    fn run_context_rejects_zero_correctness_sample_interval() {
        let state = simple_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            correctness_lane: Solver3CorrectnessLaneParams {
                enabled: false,
                sample_every_accepted_moves: 0,
            },
            ..Default::default()
        });

        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string()
                .contains("correctness_lane.sample_every_accepted_moves"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn run_context_rejects_zero_tabu_tenure_min() {
        let state = simple_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            local_improver: Solver3LocalImproverParams {
                sgp_week_pair_tabu: Solver3SgpWeekPairTabuParams {
                    tenure_min: 0,
                    ..Default::default()
                },
                ..Default::default()
            },
            ..Default::default()
        });

        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string().contains("sgp_week_pair_tabu.tenure_min"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn run_context_rejects_tabu_tenure_max_below_min() {
        let state = simple_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            local_improver: Solver3LocalImproverParams {
                sgp_week_pair_tabu: Solver3SgpWeekPairTabuParams {
                    tenure_min: 9,
                    tenure_max: 8,
                    ..Default::default()
                },
                ..Default::default()
            },
            ..Default::default()
        });

        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string().contains("sgp_week_pair_tabu.tenure_max"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn run_context_rejects_zero_tabu_retry_cap() {
        let state = simple_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            local_improver: Solver3LocalImproverParams {
                sgp_week_pair_tabu: Solver3SgpWeekPairTabuParams {
                    retry_cap: 0,
                    ..Default::default()
                },
                ..Default::default()
            },
            ..Default::default()
        });

        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string().contains("sgp_week_pair_tabu.retry_cap"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn run_context_rejects_zero_session_scale_reference_participants() {
        let state = simple_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            local_improver: Solver3LocalImproverParams {
                sgp_week_pair_tabu: Solver3SgpWeekPairTabuParams {
                    session_scale_reference_participants: 0,
                    ..Default::default()
                },
                ..Default::default()
            },
            ..Default::default()
        });

        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string()
                .contains("sgp_week_pair_tabu.session_scale_reference_participants"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn run_context_rejects_zero_reactive_tabu_window() {
        let state = simple_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            local_improver: Solver3LocalImproverParams {
                sgp_week_pair_tabu: Solver3SgpWeekPairTabuParams {
                    reactive_no_improvement_window: 0,
                    ..Default::default()
                },
                ..Default::default()
            },
            ..Default::default()
        });

        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string()
                .contains("sgp_week_pair_tabu.reactive_no_improvement_window"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn run_context_rejects_zero_reactive_tabu_max_multiplier() {
        let state = simple_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            local_improver: Solver3LocalImproverParams {
                sgp_week_pair_tabu: Solver3SgpWeekPairTabuParams {
                    reactive_max_multiplier: 0,
                    ..Default::default()
                },
                ..Default::default()
            },
            ..Default::default()
        });

        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string()
                .contains("sgp_week_pair_tabu.reactive_max_multiplier"),
            "unexpected error: {err}"
        );
    }

    #[cfg(feature = "solver3-experimental-memetic")]
    #[test]
    fn run_context_accepts_memetic_driver_with_record_to_record() {
        let state = simple_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            search_driver: Solver3SearchDriverParams {
                mode: Solver3SearchDriverMode::SteadyStateMemetic,
                ..Default::default()
            },
            ..Default::default()
        });

        let context = SearchRunContext::from_solver(&config, &state, 7).unwrap();
        assert_eq!(
            context.search_driver_mode,
            Solver3SearchDriverMode::SteadyStateMemetic
        );
    }

    #[cfg(feature = "solver3-experimental-recombination")]
    #[test]
    fn run_context_accepts_donor_session_transplant_driver_with_record_to_record() {
        let state = simple_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            search_driver: Solver3SearchDriverParams {
                mode: Solver3SearchDriverMode::DonorSessionTransplant,
                ..Default::default()
            },
            ..Default::default()
        });

        let context = SearchRunContext::from_solver(&config, &state, 7).unwrap();
        assert_eq!(
            context.search_driver_mode,
            Solver3SearchDriverMode::DonorSessionTransplant
        );
        assert_eq!(context.donor_session_transplant.unwrap().archive_size, 4);
    }

    #[cfg(feature = "solver3-experimental-recombination")]
    #[test]
    fn run_context_accepts_session_aligned_path_relinking_driver_with_record_to_record() {
        let state = simple_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            search_driver: Solver3SearchDriverParams {
                mode: Solver3SearchDriverMode::SessionAlignedPathRelinking,
                ..Default::default()
            },
            ..Default::default()
        });

        let context = SearchRunContext::from_solver(&config, &state, 7).unwrap();
        assert_eq!(
            context.search_driver_mode,
            Solver3SearchDriverMode::SessionAlignedPathRelinking
        );
        let config = context.session_aligned_path_relinking.unwrap();
        assert_eq!(
            config.operator_variant,
            Solver3PathRelinkingOperatorVariant::SessionAlignedPathRelinking
        );
        assert_eq!(config.archive_size, 4);
        assert_eq!(config.max_session_imports_per_event, 3);
        assert_eq!(config.path_step_no_improvement_limit, 2);
        assert_eq!(config.min_aligned_session_distance_for_relinking, 1);
    }

    #[cfg(feature = "solver3-experimental-recombination")]
    #[test]
    fn run_context_accepts_multi_root_balanced_session_inheritance_driver() {
        let state = repeat_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            search_driver: Solver3SearchDriverParams {
                mode: Solver3SearchDriverMode::MultiRootBalancedSessionInheritance,
                ..Default::default()
            },
            ..Default::default()
        });

        let context = SearchRunContext::from_solver(&config, &state, 7).unwrap();
        assert_eq!(
            context.search_driver_mode,
            Solver3SearchDriverMode::MultiRootBalancedSessionInheritance
        );
        let config = context.multi_root_balanced_session_inheritance.unwrap();
        assert_eq!(config.root_count, 4);
        assert_eq!(config.archive_size_per_root, 2);
        assert_eq!(config.min_cross_root_session_disagreement, 1);
        assert_eq!(config.parent_a_differing_session_share, 0.5);
    }

    #[test]
    fn run_context_accepts_sgp_week_pair_tabu_local_improver_mode() {
        let state = repeat_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            local_improver: Solver3LocalImproverParams {
                mode: Solver3LocalImproverMode::SgpWeekPairTabu,
                ..Default::default()
            },
            ..Default::default()
        });

        let context = SearchRunContext::from_solver(&config, &state, 7).unwrap();
        assert_eq!(
            context.local_improver_mode,
            Solver3LocalImproverMode::SgpWeekPairTabu
        );
        assert!(context.sgp_week_pair_tabu.is_some());
        assert!(
            !context
                .sgp_week_pair_tabu
                .unwrap()
                .conflict_restricted_swap_sampling_enabled
        );
    }

    #[cfg(feature = "solver3-experimental-conflict-restricted-sampling")]
    #[test]
    fn run_context_captures_conflict_restricted_tabu_sampling_flag() {
        let state = repeat_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            local_improver: Solver3LocalImproverParams {
                mode: Solver3LocalImproverMode::SgpWeekPairTabu,
                sgp_week_pair_tabu: Solver3SgpWeekPairTabuParams {
                    conflict_restricted_swap_sampling_enabled: true,
                    ..Default::default()
                },
            },
            ..Default::default()
        });

        let context = SearchRunContext::from_solver(&config, &state, 7).unwrap();
        assert!(
            context
                .sgp_week_pair_tabu
                .unwrap()
                .conflict_restricted_swap_sampling_enabled
        );
    }

    #[cfg(not(feature = "solver3-experimental-conflict-restricted-sampling"))]
    #[test]
    fn run_context_rejects_conflict_restricted_tabu_sampling_without_feature() {
        let state = repeat_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            local_improver: Solver3LocalImproverParams {
                mode: Solver3LocalImproverMode::SgpWeekPairTabu,
                sgp_week_pair_tabu: Solver3SgpWeekPairTabuParams {
                    conflict_restricted_swap_sampling_enabled: true,
                    ..Default::default()
                },
            },
            ..Default::default()
        });

        let error = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(error.to_string().contains(
            "solver3-experimental-conflict-restricted-sampling"
        ));
    }

    #[test]
    fn run_context_captures_scaled_tenure_mode() {
        let state = repeat_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            local_improver: Solver3LocalImproverParams {
                mode: Solver3LocalImproverMode::SgpWeekPairTabu,
                sgp_week_pair_tabu: Solver3SgpWeekPairTabuParams {
                    tenure_mode: Solver3SgpWeekPairTabuTenureMode::SessionParticipantScaled,
                    session_scale_reference_participants: 24,
                    ..Default::default()
                },
            },
            ..Default::default()
        });

        let context = SearchRunContext::from_solver(&config, &state, 7).unwrap();
        assert_eq!(
            context.sgp_week_pair_tabu.unwrap().tenure_mode,
            Solver3SgpWeekPairTabuTenureMode::SessionParticipantScaled
        );
    }

    #[test]
    fn run_context_captures_reactive_tenure_mode() {
        let state = repeat_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            local_improver: Solver3LocalImproverParams {
                mode: Solver3LocalImproverMode::SgpWeekPairTabu,
                sgp_week_pair_tabu: Solver3SgpWeekPairTabuParams {
                    tenure_mode: Solver3SgpWeekPairTabuTenureMode::ReactiveNoImprovementScaled,
                    reactive_no_improvement_window: 50_000,
                    reactive_max_multiplier: 5,
                    ..Default::default()
                },
            },
            ..Default::default()
        });

        let context = SearchRunContext::from_solver(&config, &state, 7).unwrap();
        let tabu = context.sgp_week_pair_tabu.unwrap();
        assert_eq!(
            tabu.tenure_mode,
            Solver3SgpWeekPairTabuTenureMode::ReactiveNoImprovementScaled
        );
        assert_eq!(tabu.reactive_no_improvement_window, 50_000);
        assert_eq!(tabu.reactive_max_multiplier, 5);
    }

    #[test]
    fn run_context_rejects_tabu_local_improver_without_repeat_constraint() {
        let state = simple_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            local_improver: Solver3LocalImproverParams {
                mode: Solver3LocalImproverMode::SgpWeekPairTabu,
                ..Default::default()
            },
            ..Default::default()
        });

        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string()
                .contains("requires a repeat_encounter constraint"),
            "unexpected error: {err}"
        );
    }

    #[cfg(feature = "solver3-experimental-memetic")]
    #[test]
    fn run_context_rejects_memetic_driver_when_move_policy_disallows_swap() {
        let state = simple_state();
        let mut config = solver3_config();
        config.move_policy = Some(crate::models::MovePolicy {
            allowed_families: Some(vec![crate::models::MoveFamily::Transfer]),
            ..Default::default()
        });
        config.solver_params = SolverParams::Solver3(Solver3Params {
            search_driver: Solver3SearchDriverParams {
                mode: Solver3SearchDriverMode::SteadyStateMemetic,
                ..Default::default()
            },
            ..Default::default()
        });

        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string()
                .contains("steady_state_memetic requires move_policy to allow swap"),
            "unexpected error: {err}"
        );
    }

    #[cfg(feature = "solver3-experimental-recombination")]
    #[test]
    fn run_context_rejects_zero_donor_archive_size() {
        let state = simple_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            search_driver: Solver3SearchDriverParams {
                donor_session_transplant: Solver3DonorSessionTransplantParams {
                    archive_size: 0,
                    ..Default::default()
                },
                ..Default::default()
            },
            ..Default::default()
        });

        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string()
                .contains("donor_session_transplant.archive_size"),
            "unexpected error: {err}"
        );
    }

    #[cfg(feature = "solver3-experimental-recombination")]
    #[test]
    fn run_context_rejects_nonpositive_donor_recombination_windows() {
        let state = simple_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            search_driver: Solver3SearchDriverParams {
                donor_session_transplant: Solver3DonorSessionTransplantParams {
                    recombination_no_improvement_window: 0,
                    ..Default::default()
                },
                ..Default::default()
            },
            ..Default::default()
        });

        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string()
                .contains("donor_session_transplant.recombination_no_improvement_window"),
            "unexpected error: {err}"
        );

        config.solver_params = SolverParams::Solver3(Solver3Params {
            search_driver: Solver3SearchDriverParams {
                donor_session_transplant: Solver3DonorSessionTransplantParams {
                    recombination_cooldown_window: 0,
                    ..Default::default()
                },
                ..Default::default()
            },
            ..Default::default()
        });
        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string()
                .contains("donor_session_transplant.recombination_cooldown_window"),
            "unexpected error: {err}"
        );
    }

    #[cfg(feature = "solver3-experimental-recombination")]
    #[test]
    fn run_context_rejects_invalid_donor_recombination_budgets() {
        let state = simple_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            search_driver: Solver3SearchDriverParams {
                donor_session_transplant: Solver3DonorSessionTransplantParams {
                    max_recombination_events_per_run: Some(0),
                    ..Default::default()
                },
                ..Default::default()
            },
            ..Default::default()
        });
        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string()
                .contains("donor_session_transplant.max_recombination_events_per_run"),
            "unexpected error: {err}"
        );

        config.solver_params = SolverParams::Solver3(Solver3Params {
            search_driver: Solver3SearchDriverParams {
                donor_session_transplant: Solver3DonorSessionTransplantParams {
                    adaptive_raw_child_retention:
                        crate::models::Solver3AdaptiveRawChildRetentionParams {
                            keep_ratio: 0.0,
                            ..Default::default()
                        },
                    ..Default::default()
                },
                ..Default::default()
            },
            ..Default::default()
        });
        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string()
                .contains("donor_session_transplant.adaptive_raw_child_retention.keep_ratio"),
            "unexpected error: {err}"
        );

        config.solver_params = SolverParams::Solver3(Solver3Params {
            search_driver: Solver3SearchDriverParams {
                donor_session_transplant: Solver3DonorSessionTransplantParams {
                    adaptive_raw_child_retention:
                        crate::models::Solver3AdaptiveRawChildRetentionParams {
                            warmup_samples: 0,
                            ..Default::default()
                        },
                    ..Default::default()
                },
                ..Default::default()
            },
            ..Default::default()
        });
        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string()
                .contains("donor_session_transplant.adaptive_raw_child_retention.warmup_samples"),
            "unexpected error: {err}"
        );

        config.solver_params = SolverParams::Solver3(Solver3Params {
            search_driver: Solver3SearchDriverParams {
                donor_session_transplant: Solver3DonorSessionTransplantParams {
                    adaptive_raw_child_retention:
                        crate::models::Solver3AdaptiveRawChildRetentionParams {
                            warmup_samples: 4,
                            history_limit: 3,
                            ..Default::default()
                        },
                    ..Default::default()
                },
                ..Default::default()
            },
            ..Default::default()
        });
        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string()
                .contains("donor_session_transplant.adaptive_raw_child_retention.history_limit"),
            "unexpected error: {err}"
        );

        config.solver_params = SolverParams::Solver3(Solver3Params {
            search_driver: Solver3SearchDriverParams {
                donor_session_transplant: Solver3DonorSessionTransplantParams {
                    child_polish_iterations_per_stagnation_window: 0,
                    ..Default::default()
                },
                ..Default::default()
            },
            ..Default::default()
        });
        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string()
                .contains("donor_session_transplant.child_polish_iterations_per_stagnation_window"),
            "unexpected error: {err}"
        );

        config.solver_params = SolverParams::Solver3(Solver3Params {
            search_driver: Solver3SearchDriverParams {
                donor_session_transplant: Solver3DonorSessionTransplantParams {
                    child_polish_iterations_per_stagnation_window: 4,
                    child_polish_no_improvement_iterations_per_stagnation_window: 5,
                    ..Default::default()
                },
                ..Default::default()
            },
            ..Default::default()
        });
        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string().contains(
                "donor_session_transplant.child_polish_no_improvement_iterations_per_stagnation_window"
            ),
            "unexpected error: {err}"
        );

        config.solver_params = SolverParams::Solver3(Solver3Params {
            search_driver: Solver3SearchDriverParams {
                donor_session_transplant: Solver3DonorSessionTransplantParams {
                    child_polish_max_stagnation_windows: 0,
                    ..Default::default()
                },
                ..Default::default()
            },
            ..Default::default()
        });
        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string()
                .contains("donor_session_transplant.child_polish_max_stagnation_windows"),
            "unexpected error: {err}"
        );
    }

    #[cfg(feature = "solver3-experimental-recombination")]
    #[test]
    fn run_context_rejects_donor_driver_when_move_policy_disallows_swap() {
        let state = simple_state();
        let mut config = solver3_config();
        config.move_policy = Some(crate::models::MovePolicy {
            allowed_families: Some(vec![crate::models::MoveFamily::Transfer]),
            ..Default::default()
        });
        config.solver_params = SolverParams::Solver3(Solver3Params {
            search_driver: Solver3SearchDriverParams {
                mode: Solver3SearchDriverMode::DonorSessionTransplant,
                ..Default::default()
            },
            ..Default::default()
        });

        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string()
                .contains("donor_session_transplant requires move_policy to allow swap"),
            "unexpected error: {err}"
        );
    }

    #[cfg(feature = "solver3-experimental-recombination")]
    #[test]
    fn run_context_rejects_invalid_session_aligned_path_relinking_config() {
        let state = simple_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            search_driver: Solver3SearchDriverParams {
                session_aligned_path_relinking: Solver3SessionAlignedPathRelinkingParams {
                    max_session_imports_per_event: 0,
                    ..Default::default()
                },
                ..Default::default()
            },
            ..Default::default()
        });
        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string()
                .contains("session_aligned_path_relinking.max_session_imports_per_event"),
            "unexpected error: {err}"
        );

        config.solver_params = SolverParams::Solver3(Solver3Params {
            search_driver: Solver3SearchDriverParams {
                session_aligned_path_relinking: Solver3SessionAlignedPathRelinkingParams {
                    adaptive_raw_child_retention:
                        crate::models::Solver3AdaptiveRawChildRetentionParams {
                            keep_ratio: 0.0,
                            ..Default::default()
                        },
                    ..Default::default()
                },
                ..Default::default()
            },
            ..Default::default()
        });
        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string()
                .contains("session_aligned_path_relinking.adaptive_raw_child_retention.keep_ratio"),
            "unexpected error: {err}"
        );
    }

    #[cfg(feature = "solver3-experimental-recombination")]
    #[test]
    fn run_context_rejects_session_aligned_path_relinking_when_move_policy_disallows_swap() {
        let state = simple_state();
        let mut config = solver3_config();
        config.move_policy = Some(crate::models::MovePolicy {
            allowed_families: Some(vec![crate::models::MoveFamily::Transfer]),
            ..Default::default()
        });
        config.solver_params = SolverParams::Solver3(Solver3Params {
            search_driver: Solver3SearchDriverParams {
                mode: Solver3SearchDriverMode::SessionAlignedPathRelinking,
                ..Default::default()
            },
            ..Default::default()
        });

        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string()
                .contains("session_aligned_path_relinking requires move_policy to allow swap"),
            "unexpected error: {err}"
        );
    }

    #[cfg(feature = "solver3-experimental-recombination")]
    #[test]
    fn run_context_rejects_invalid_multi_root_balanced_session_inheritance_config() {
        let state = repeat_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            search_driver: Solver3SearchDriverParams {
                multi_root_balanced_session_inheritance:
                    Solver3MultiRootBalancedSessionInheritanceParams {
                        root_count: 1,
                        ..Default::default()
                    },
                ..Default::default()
            },
            ..Default::default()
        });
        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string()
                .contains("multi_root_balanced_session_inheritance.root_count"),
            "unexpected error: {err}"
        );

        config.solver_params = SolverParams::Solver3(Solver3Params {
            search_driver: Solver3SearchDriverParams {
                multi_root_balanced_session_inheritance:
                    Solver3MultiRootBalancedSessionInheritanceParams {
                        parent_a_differing_session_share: 0.4,
                        ..Default::default()
                    },
                ..Default::default()
            },
            ..Default::default()
        });
        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string().contains(
                "multi_root_balanced_session_inheritance.parent_a_differing_session_share"
            ),
            "unexpected error: {err}"
        );
    }

    #[cfg(feature = "solver3-experimental-recombination")]
    #[test]
    fn run_context_rejects_multi_root_balanced_session_inheritance_without_repeat_constraint() {
        let state = simple_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            search_driver: Solver3SearchDriverParams {
                mode: Solver3SearchDriverMode::MultiRootBalancedSessionInheritance,
                ..Default::default()
            },
            ..Default::default()
        });

        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string().contains(
                "multi_root_balanced_session_inheritance requires a repeat_encounter constraint"
            ),
            "unexpected error: {err}"
        );
    }

    #[cfg(not(feature = "solver3-oracle-checks"))]
    #[test]
    fn run_context_rejects_correctness_lane_when_feature_is_disabled() {
        let state = simple_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            correctness_lane: Solver3CorrectnessLaneParams {
                enabled: true,
                sample_every_accepted_moves: 2,
            },
            ..Default::default()
        });

        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string().contains("solver3-oracle-checks"),
            "unexpected error: {err}"
        );
    }

    #[cfg(feature = "solver3-oracle-checks")]
    #[test]
    fn run_context_accepts_correctness_lane_when_feature_is_enabled() {
        let state = simple_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            correctness_lane: Solver3CorrectnessLaneParams {
                enabled: true,
                sample_every_accepted_moves: 3,
            },
            ..Default::default()
        });

        let context = SearchRunContext::from_solver(&config, &state, 7).unwrap();
        assert!(context.correctness_lane_enabled);
        assert_eq!(context.correctness_sample_every_accepted_moves, 3);
    }

    #[cfg(not(feature = "solver3-experimental-memetic"))]
    #[test]
    fn run_context_rejects_memetic_driver_when_feature_is_disabled() {
        let state = simple_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            search_driver: Solver3SearchDriverParams {
                mode: Solver3SearchDriverMode::SteadyStateMemetic,
                ..Default::default()
            },
            ..Default::default()
        });

        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string().contains("solver3-experimental-memetic"),
            "unexpected error: {err}"
        );
    }

    #[cfg(not(feature = "solver3-experimental-recombination"))]
    #[test]
    fn run_context_rejects_recombination_driver_when_feature_is_disabled() {
        let state = repeat_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            search_driver: Solver3SearchDriverParams {
                mode: Solver3SearchDriverMode::DonorSessionTransplant,
                ..Default::default()
            },
            ..Default::default()
        });

        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string()
                .contains("solver3-experimental-recombination"),
            "unexpected error: {err}"
        );
    }

    #[cfg(not(feature = "solver3-experimental-repeat-guidance"))]
    #[test]
    fn run_context_rejects_repeat_guidance_when_feature_is_disabled() {
        let state = repeat_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            hotspot_guidance: Solver3HotspotGuidanceParams {
                repeat_guided_swaps: Solver3RepeatGuidedSwapParams {
                    enabled: true,
                    guided_proposal_probability: 0.5,
                    candidate_preview_budget: 8,
                },
            },
            ..Default::default()
        });

        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string()
                .contains("solver3-experimental-repeat-guidance"),
            "unexpected error: {err}"
        );
    }

    #[cfg(feature = "solver3-experimental-repeat-guidance")]
    #[test]
    fn run_context_rejects_out_of_range_repeat_guidance_probability() {
        let state = simple_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            hotspot_guidance: Solver3HotspotGuidanceParams {
                repeat_guided_swaps: Solver3RepeatGuidedSwapParams {
                    enabled: true,
                    guided_proposal_probability: 1.5,
                    candidate_preview_budget: 8,
                },
            },
            ..Default::default()
        });

        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string()
                .contains("hotspot_guidance.repeat_guided_swaps.guided_proposal_probability"),
            "unexpected error: {err}"
        );
    }

    #[cfg(feature = "solver3-experimental-repeat-guidance")]
    #[test]
    fn run_context_rejects_zero_repeat_guidance_budget_when_enabled() {
        let state = simple_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            hotspot_guidance: Solver3HotspotGuidanceParams {
                repeat_guided_swaps: Solver3RepeatGuidedSwapParams {
                    enabled: true,
                    guided_proposal_probability: 0.5,
                    candidate_preview_budget: 0,
                },
            },
            ..Default::default()
        });

        let err = SearchRunContext::from_solver(&config, &state, 7).unwrap_err();
        assert!(
            err.to_string()
                .contains("hotspot_guidance.repeat_guided_swaps.candidate_preview_budget"),
            "unexpected error: {err}"
        );
    }

    #[cfg(feature = "solver3-experimental-repeat-guidance")]
    #[test]
    fn run_context_auto_disables_repeat_guidance_without_repeat_constraint() {
        let state = simple_state();
        let mut config = solver3_config();
        config.solver_params = SolverParams::Solver3(Solver3Params {
            hotspot_guidance: Solver3HotspotGuidanceParams {
                repeat_guided_swaps: Solver3RepeatGuidedSwapParams {
                    enabled: true,
                    guided_proposal_probability: 0.75,
                    candidate_preview_budget: 6,
                },
            },
            ..Default::default()
        });

        let context = SearchRunContext::from_solver(&config, &state, 7).unwrap();
        assert!(!context.repeat_guided_swaps_enabled);
        assert_eq!(context.repeat_guided_swap_probability, 0.0);
        assert_eq!(context.repeat_guided_swap_candidate_preview_budget, 0);
    }

    #[test]
    fn progress_state_tracks_acceptance_and_best_state() {
        let mut progress = SearchProgressState::new(simple_state());
        progress.record_preview_attempt(crate::models::MoveFamily::Swap, 0.25, 1.5);
        progress.record_accepted_move(crate::models::MoveFamily::Swap, 0.1, 1.5, true);
        progress.record_acceptance_result(true);
        progress.current_state.total_score -= 2.0;
        progress.refresh_best_from_current(4, 0.42);
        progress.finish_iteration(4);

        assert_eq!(progress.move_metrics.swap.attempts, 1);
        assert_eq!(progress.move_metrics.swap.accepted, 1);
        assert_eq!(progress.local_optima_escapes, 1);
        assert_eq!(progress.iterations_completed, 5);
        assert_eq!(progress.no_improvement_count, 0);
        assert_eq!(progress.recent_acceptance.back(), Some(&true));
        assert_eq!(
            progress.best_state.total_score,
            progress.current_state.total_score
        );
    }

    #[test]
    fn progress_update_reports_completed_iterations_for_ui() {
        let state = simple_state();
        let run_context = SearchRunContext::from_solver(&solver3_config(), &state, 7).unwrap();
        let mut progress = SearchProgressState::new(state);
        progress.finish_iteration(4);

        let update = progress.to_progress_update(&run_context, 4, 1.0, 0.5, None);

        assert_eq!(update.iteration, 5);
        assert_eq!(update.iterations_since_last_reheat, 5);
    }
}
