#[cfg(target_arch = "wasm32")]
use js_sys;

#[cfg(not(target_arch = "wasm32"))]
use std::time::Instant as RelabelingInstant;

#[cfg(target_arch = "wasm32")]
type RelabelingInstant = f64;

/// Wall-clock budget for the bounded relabeling search.
///
/// `None` means the caller has not imposed a relabeling-specific limit. Production construction
/// paths should pass the remaining constructor budget so the relabeler can return the best mapping
/// found so far instead of overrunning the enclosing solve budget.
#[derive(Debug, Clone, Copy, PartialEq)]
pub(super) struct RelabelingSearchBudget {
    time_limit_seconds: Option<f64>,
}

impl RelabelingSearchBudget {
    pub(super) fn from_remaining_seconds(time_limit_seconds: Option<f64>) -> Self {
        Self {
            time_limit_seconds: time_limit_seconds.map(|seconds| seconds.max(0.0)),
        }
    }

    #[cfg(test)]
    pub(super) fn unbounded() -> Self {
        Self {
            time_limit_seconds: None,
        }
    }

    pub(super) fn start(self) -> RelabelingDeadline {
        RelabelingDeadline {
            started_at: relabeling_now(),
            time_limit_seconds: self.time_limit_seconds,
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub(super) struct RelabelingDeadline {
    started_at: RelabelingInstant,
    time_limit_seconds: Option<f64>,
}

impl RelabelingDeadline {
    pub(super) fn is_expired(self) -> bool {
        self.time_limit_seconds
            .is_some_and(|limit| self.elapsed_seconds() >= limit)
    }

    pub(super) fn elapsed_seconds(self) -> f64 {
        relabeling_elapsed_seconds(self.started_at)
    }
}

#[cfg(not(target_arch = "wasm32"))]
fn relabeling_now() -> RelabelingInstant {
    RelabelingInstant::now()
}

#[cfg(target_arch = "wasm32")]
fn relabeling_now() -> RelabelingInstant {
    js_sys::Date::now()
}

#[cfg(not(target_arch = "wasm32"))]
fn relabeling_elapsed_seconds(started_at: RelabelingInstant) -> f64 {
    started_at.elapsed().as_secs_f64()
}

#[cfg(target_arch = "wasm32")]
fn relabeling_elapsed_seconds(started_at: RelabelingInstant) -> f64 {
    ((js_sys::Date::now() - started_at) / 1000.0).max(0.0)
}
