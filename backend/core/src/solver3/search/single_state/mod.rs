#[cfg(not(target_arch = "wasm32"))]
use std::time::Instant;

#[cfg(target_arch = "wasm32")]
use js_sys;

mod correctness;
mod default_loop;
mod diversification;
mod driver;
mod general_loop;
mod result;

pub(crate) use correctness::maybe_run_sampled_correctness_check;
use diversification::{
    extend_no_improvement_streak, should_attempt_diversification_burst, try_diversification_burst,
};
#[cfg(any(
    test,
    feature = "solver3-experimental-memetic",
    feature = "solver3-experimental-recombination"
))]
pub(crate) use driver::polish_state;
pub(crate) use driver::{run, LocalImproverBudget, LocalImproverRunResult};
use driver::{run_local_improver, LocalImproverHooks};
pub(crate) use result::{apply_previewed_move, build_solver_result, should_emit_progress_callback};

const TIME_REFRESH_INTERVAL: u64 = 64;

#[cfg(not(target_arch = "wasm32"))]
fn get_current_time() -> Instant {
    Instant::now()
}

#[cfg(target_arch = "wasm32")]
fn get_current_time() -> f64 {
    js_sys::Date::now()
}

#[cfg(not(target_arch = "wasm32"))]
fn get_elapsed_seconds(start: Instant) -> f64 {
    start.elapsed().as_secs_f64()
}

#[cfg(target_arch = "wasm32")]
fn get_elapsed_seconds(start: f64) -> f64 {
    (js_sys::Date::now() - start) / 1000.0
}

#[cfg(not(target_arch = "wasm32"))]
fn get_elapsed_seconds_between(start: Instant, end: Instant) -> f64 {
    end.duration_since(start).as_secs_f64()
}

#[cfg(target_arch = "wasm32")]
fn get_elapsed_seconds_between(start: f64, end: f64) -> f64 {
    (end - start) / 1000.0
}

#[inline]
fn time_limit_exceeded(elapsed_seconds: f64, time_limit_seconds: Option<f64>) -> bool {
    time_limit_seconds.is_some_and(|limit| elapsed_seconds >= limit)
}
