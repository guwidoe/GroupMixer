//! Search baseline for `solver3`.

mod acceptance;
mod candidate_sampling;
mod context;
mod engine;
mod family_selection;
mod memetic;
mod repeat_guidance;
mod sgp_conflicts;
mod single_state;
mod tabu;

#[cfg(test)]
mod tests;

pub use engine::SearchEngine;
