use crate::models::{
    MoveFamily, MovePolicy, Solver3LocalImproverMode, Solver3PathRelinkingOperatorVariant,
    Solver3SearchDriverMode, SolverConfiguration,
};
use crate::solver_support::SolverError;

use super::super::super::runtime_state::RuntimeState;
use super::super::path_relinking::MAX_EXACT_ALIGNMENT_SESSIONS;
use super::super::tabu::SgpWeekPairTabuConfig;
use super::validation::{
    ensure_conflict_restricted_sampler_feature_available, ensure_repeat_guidance_feature_available,
    ensure_search_driver_feature_available, validate_multi_root_balanced_session_inheritance,
};

const DEFAULT_MAX_ITERATIONS: u64 = 10_000;

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
    pub(crate) runtime_scaled_no_improvement_stop: Option<RuntimeScaledNoImprovementStopConfig>,
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

#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) struct RuntimeScaledNoImprovementStopConfig {
    pub(crate) runtime_scale_factor: f64,
    pub(crate) grace_seconds: f64,
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
        let runtime_scaled_no_improvement_stop = &solver3_params
            .search_driver
            .runtime_scaled_no_improvement_stop;
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
        let repeat_guided_swaps_enabled =
            solver3_params.hotspot_guidance.repeat_guided_swaps.enabled
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

        if runtime_scaled_no_improvement_stop.enabled
            && (!runtime_scaled_no_improvement_stop
                .runtime_scale_factor
                .is_finite()
                || runtime_scaled_no_improvement_stop.runtime_scale_factor < 0.0)
        {
            return Err(SolverError::ValidationError(
                "solver3 search_driver.runtime_scaled_no_improvement_stop.runtime_scale_factor must be finite and >= 0.0".into(),
            ));
        }

        if runtime_scaled_no_improvement_stop.enabled
            && (!runtime_scaled_no_improvement_stop.grace_seconds.is_finite()
                || runtime_scaled_no_improvement_stop.grace_seconds < 0.0)
        {
            return Err(SolverError::ValidationError(
                "solver3 search_driver.runtime_scaled_no_improvement_stop.grace_seconds must be finite and >= 0.0".into(),
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
            runtime_scaled_no_improvement_stop: runtime_scaled_no_improvement_stop
                .enabled
                .then_some(RuntimeScaledNoImprovementStopConfig {
                    runtime_scale_factor: runtime_scaled_no_improvement_stop.runtime_scale_factor,
                    grace_seconds: runtime_scaled_no_improvement_stop.grace_seconds,
                }),
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
