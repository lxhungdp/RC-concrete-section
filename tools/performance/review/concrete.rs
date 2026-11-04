//! Bench-only EN n=2 concrete contribution for prevalidated finite fixture arrays.
#![no_std]

#[panic_handler]
fn panic(_: &core::panic::PanicInfo) -> ! { core::arch::wasm32::unreachable() }

#[derive(Clone, Copy, Default)]
struct Sum { total: f64, correction: f64 }

impl Sum {
    fn add(&mut self, value: f64) {
        let next = self.total + value;
        self.correction += if self.total.abs() >= value.abs() {
            (self.total - next) + value
        } else {
            (value - next) + self.total
        };
        self.total = next;
    }
}

#[no_mangle]
pub unsafe extern "C" fn integrate(fibres: *const f64, n: usize, states: *const f64, m: usize,
                                    eps_c2: f64, eps_cu2: f64, peak: f64, out: *mut f64) {
    let fibres = core::slice::from_raw_parts(fibres, 3 * n);
    let states = core::slice::from_raw_parts(states, 3 * m);
    let output = core::slice::from_raw_parts_mut(out, 3 * m);
    for (state, dest) in states.chunks_exact(3).zip(output.chunks_exact_mut(3)) {
        let mut sums = [Sum::default(); 3];
        for f in fibres.chunks_exact(3) {
            let strain = state[0] + state[1] * f[1] + state[2] * f[0];
            let stress = if strain <= 0.0 || strain > eps_cu2 { 0.0 } else if strain <= eps_c2 {
                let r = 1.0 - strain / eps_c2;
                peak * (1.0 - r * r)
            } else { peak };
            let force = stress * f[2];
            sums[0].add(force);
            sums[1].add(force * f[1]);
            sums[2].add(force * f[0]);
        }
        for (i, s) in sums.iter().enumerate() { dest[i] = s.total + s.correction; }
    }
}
