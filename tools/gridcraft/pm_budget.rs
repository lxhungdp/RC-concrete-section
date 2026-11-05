//! P-M spreadsheet work limits; these are resource limits, not numeric tolerances.
use std::cell::RefCell;

const MAX_STEPS: u64 = 2_000_000;
const MAX_MS: f64 = 2_000.0;
#[derive(Default)]
struct Budget { active: bool, started: f64, steps: u64, exhausted: bool }
thread_local! { static BUDGET: RefCell<Budget> = RefCell::new(Budget::default()); }
pub struct Guard { outer: bool }
impl Drop for Guard {
    fn drop(&mut self) { if self.outer { BUDGET.with(|budget| budget.borrow_mut().active = false); } }
}
pub fn begin() -> Guard {
    let outer = BUDGET.with(|value| {
        let mut budget = value.borrow_mut();
        if budget.active { return false; }
        *budget = Budget { active: true, started: gridcraft_core::date::unix_now_ms().unwrap_or(0.0), steps: 0, exhausted: false };
        true
    });
    Guard { outer }
}
pub fn spend() -> bool {
    BUDGET.with(|value| {
        let mut budget = value.borrow_mut();
        if !budget.active { return true; }
        budget.steps = budget.steps.saturating_add(1);
        if budget.steps > MAX_STEPS || budget.steps % 256 == 0 && gridcraft_core::date::unix_now_ms().is_some_and(|now| now - budget.started > MAX_MS) {
            budget.exhausted = true;
        }
        !budget.exhausted
    })
}
pub fn exhausted() -> bool { BUDGET.with(|budget| budget.borrow().exhausted) }

#[cfg(test)]
mod tests {
    #[test]
    fn exhausted_work_is_blocked_and_the_next_run_gets_a_new_budget() {
        { let _guard = super::begin(); for _ in 0..=super::MAX_STEPS { let _ = super::spend(); } assert!(super::exhausted()); assert!(!super::spend()); }
        let _guard = super::begin(); assert!(super::spend()); assert!(!super::exhausted());
    }
    #[test]
    fn nested_work_cannot_reset_its_outer_budget() {
        let _outer = super::begin();
        { let _nested = super::begin(); for _ in 0..=super::MAX_STEPS { let _ = super::spend(); } }
        assert!(super::exhausted()); assert!(!super::spend());
    }
}
