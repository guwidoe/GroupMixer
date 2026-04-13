//! Search baseline for `solver3`.

mod acceptance;
mod candidate_sampling;
mod context;
mod engine;
mod family_selection;
mod repeat_guidance;

#[cfg(test)]
mod tests;

pub use engine::SearchEngine;
