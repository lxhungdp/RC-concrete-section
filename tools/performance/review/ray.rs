//! Measurement-only scalar kernel for finite nonzero proportional demand rays.
//! Row layout and the production comparison live in ray.mjs. No external crates.
#![no_std]

#[panic_handler]
fn panic(_: &core::panic::PanicInfo) -> ! {
    core::arch::wasm32::unreachable()
}

#[no_mangle]
pub unsafe extern "C" fn scan(tris: *const f64, ntri: usize, loads: *const f64, nload: usize, out: *mut f64) {
    let triangles = core::slice::from_raw_parts(tris, ntri * 14);
    let demands = core::slice::from_raw_parts(loads, nload * 4);
    let results = core::slice::from_raw_parts_mut(out, nload * 4);
    for (d, result) in demands.chunks_exact(4).zip(results.chunks_exact_mut(4)) {
        let mut best = [f64::INFINITY, -1.0, 0.0, 0.0];
        for (i, t) in triangles.chunks_exact(14).enumerate() {
            let hx = d[1] * t[8] - d[2] * t[7];
            let hy = d[2] * t[6] - d[0] * t[8];
            let hz = d[0] * t[7] - d[1] * t[6];
            let det = t[3] * hx + t[4] * hy + t[5] * hz;
            if det.abs() < 1e-12 { continue; }
            let inv = 1.0 / det;
            let u = inv * (t[0] * hx + t[1] * hy + t[2] * hz);
            if u < -1e-9 || u > 1.0 + 1e-9 { continue; }
            let v = inv * (d[0] * t[9] + d[1] * t[10] + d[2] * t[11]);
            if v < -1e-9 || u + v > 1.0 + 1e-9 { continue; }
            let lambda = if !t[13].is_nan() && d[3] != 0.0 { t[13] / d[3] } else { inv * t[12] };
            if lambda > 1e-10 && lambda < best[0] { best = [lambda, i as f64, u, v]; }
        }
        result.copy_from_slice(&best);
    }
}
