//! Constraint-scenario + oracle-guided construction scaffolding for solver3.
//!
//! The design is documented in
//! `backend/core/src/solver3/CONSTRAINT_SCENARIO_ORACLE_GUIDED_CONSTRUCTION_PLAN.md`.
//! This module owns the data contracts and implementation for the current
//! constraint-scenario oracle constructor. It is housed under `solver_support`
//! so construction heuristics have one coherent home, even though the data model
//! is still solver3-specific today.

mod merge;
mod oracle_backend;
mod projection;
mod signals;
mod template_candidates;
mod types;

#[cfg(test)]
mod ensemble;
#[cfg(test)]
mod tests;

pub(crate) use merge::merge_projected_oracle_template_into_scaffold;
pub(crate) use oracle_backend::{PureStructureOracle, Solver6PureStructureOracle};
pub(crate) use projection::project_oracle_schedule_to_template;
pub(crate) use signals::{
    build_constraint_scenario_scaffold_mask, extract_constraint_scenario_signals_from_scaffold,
    repeat_pressure_is_relevant,
};
pub(crate) use template_candidates::generate_oracle_template_candidates;
pub(crate) use types::{
    ConstraintScenarioOracleConstructionResult, ConstraintScenarioOracleOutcomeKind,
    ConstraintScenarioOracleTelemetry, OracleTemplateCandidate, PureStructureOracleRequest,
};

#[cfg(test)]
pub(crate) use ensemble::build_constraint_scenario_ensemble;
#[cfg(test)]
pub(crate) use oracle_backend::validate_pure_oracle_schedule;
#[cfg(test)]
pub(crate) use signals::extract_constraint_scenario_signals;
#[cfg(test)]
pub(crate) use types::{
    ConstraintScenarioCandidate, ConstraintScenarioCandidateSource, ConstraintScenarioSignals,
    OracleTemplateProjectionResult, PureStructureOracleSchedule,
};
