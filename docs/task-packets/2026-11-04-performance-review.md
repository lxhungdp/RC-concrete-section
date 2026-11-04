# Computational performance review

## Decision

The user specified a maximum of about 20 loadcases, normally at distinct Pu values, and chose to defer optimization with small absolute savings when the existing implementation is correct. Defer the batch triangle/contour optimization for this workload. Retain the measurements as evidence for a future demonstrated bottleneck. Current engineering priority is closing correctness and verification findings in the owning audit. Adaptive stress–strain integration remains a future candidate if its measured build delay warrants work. Any language decision requires a complete workflow comparison.

## Scope and evidence

The subject is the Stage 1 Preview working tree over commit `4709046611bd7e42f66413e6c9ac4247293e3e7a`, including uncommitted engineering changes. The production web build and the detailed workflow and differential measurements used an isolated source copy. Its analysis entry point has SHA-256 `0f56259e5b98a20311a1d93325aa156497d10a870e1cac583ff5e0bc63019bfa`. The Next build ID was `v9rHegYN2xL2J4u_0BdS7`. The eight-section baseline was run in the live checkout at the beginning of the audit.

- **Owners and requirements.** Analysis owns resistance-domain queries and provenance under ENG-AN-003 and ENG-RES-001/002. Geometry, materials and the two independent mechanics own their numerical kernels. Web workers, results and report adapters consume package outputs under DEV-ARCH-002/005/006/007. The review follows the performance priorities in [architecture §8](../08-software-architecture-and-api.md) and the gates in [engineering change control](../engineering/06-verification-acceptance-and-change-control.md).
- **Engineering contract.** Canonical actions use N and N mm, compression-positive P, and the same axes and origin throughout. Preserve stage, factors, summation order, triangle order and ties, uncertainties, unavailable states, and complete calculation traces. The benchmarks change no application API, numerical rule, project schema or report format. A production performance change with identical results would be Class 2. Unexplained full-precision drift requires engineering review.
- **Environment.** Windows x64, Ryzen 7 8845HS, 16 logical processors, approximately 31 GiB RAM, Node 24.22.1 / V8 13.6, rustc 1.90.0, headless Edge 156.0.4314.58. Timings are wall-clock observations on one workstation. Browser experiments used the production bundle on loopback. Network transfer on deployed hosting and mobile thermal limits require separate measurements.
- **Method.** Eight established stress–strain fixtures used five timed runs per stage. The four integrated workflows below used one warm-up and three measured runs, summarized by the median. The cross-profile inventory used one fresh process per route/mode. Batch A/B used identical compilation settings, five paired runs in alternating order. The Rust comparisons used scalar f64, equal packed data layouts, two discarded rounds, eleven measured pairs, and copied the demands/states into and results out of Wasm memory within the timed call.

## Where time goes

Median ms. The build column reuses preparation and builds the surface anew. Both demand columns are complete 100-load batches with distinct axial forces. The clone is a Node structured clone of the full surface. It measures a copying cost separately from browser IPC.

| Fixture | Design triangles | Build | Proportional 3D | Constant P | Clone |
|---|---:|---:|---:|---:|---:|
| KDS complex, stress–strain, Fixed | 1,550 | 98 | 74 | 133 | 12 |
| KDS rectangle, block, Fixed | 1,534 | 68 | 99 | 181 | 23 |
| EN L-section, stress–strain, Adaptive | 4,588 | 1,675 | 213 | 386 | 23 |
| AS hollow, block, Adaptive | 6,014 | 338 | 272 | 488 | 30 |

**Cross-profile coverage.** Seven registered profiles give nine resistance routes with the two KDS Appendix routes included. Every row used the same eight-bar rectangle in Fixed and Adaptive modes. Each surface was checked with 100 demands under both bases, giving 3,600 baseline load checks. Cold build ms below exclude imports, project parsing and normalization. Each cold value is a single observation.

| Route | Fixed | Adaptive |
|---|---:|---:|
| KDS stress–strain | 170 | 1,174 |
| KDS Appendix stress–strain | 347 | 1,733 |
| KDS block | 85 | 330 |
| KDS Appendix block | 81 | 323 |
| ACI block | 90 | 366 |
| EN stress–strain | 325 | 1,580 |
| AS block | 83 | 401 |
| Custom stress–strain | 181 | 1,219 |
| Custom block | 98 | 362 |

**Geometry, field and inverse.** On the eight existing section fixtures, the standalone surface median ranged from 55 to 256 ms. The dense rectangle had 15,360 quadrature points. For the hollow circular section, mesh construction alone took 45 ms and the inverse benchmark fell from 50 ms with preparation to 1.3 ms with a prepared model. In the four integrated workflows a field map at an already resolved state took 0.03–1.17 ms. An exact-direction curve took 4.5–13.4 ms. The loadcase detail fallback, which also resolves the physical solution, ranged from 14 to 466 ms.

### Measured gain for the complete batch

The private TypeScript candidate reused the assembled explicit triangles and retained at most one Fixed-P contour. Sixteen batches crossed four fixtures, two governing bases and two axial-force patterns. The complete returned objects matched the public production entry point for all 1,600 load checks, including intervals, verdicts, source traces and diagnostic values. For 100 distinct Pu values the median time reduction ranged from 26.3% to 35.3%. For 100 consecutive loads at the same Pu it ranged from 59.0% to 87.7%. The paired baseline measures the unmodified kernel in the same compilation and timing harness as the candidate.

| AS hollow Adaptive, 100 loads | Paired baseline, ms | Candidate, ms |
|---|---:|---:|
| Distinct Pu, proportional 3D | 267.6 | 186.4 |
| Distinct Pu, Constant P | 508.3 | 334.0 |
| Same Pu, proportional 3D | 263.9 | 45.8 |
| Same Pu, Constant P | 488.0 | 186.2 |

### Follow-up for the actual 5–20-load workload

The same frozen kernel and fixtures were remeasured with 5 and 20 loadcases selected at evenly spaced indices from the original batch. All selected loads had distinct Pu values. Each A/B pair used fifteen measured runs in alternating order. The full returned objects matched production for all 200 checks across the four fixtures and two governing bases. Values below are median computation times in ms, excluding browser scheduling and rendering.

| Fixture, 20 distinct Pu | Proportional 3D, baseline → candidate | Constant P, baseline → candidate |
|---|---:|---:|
| KDS complex, stress–strain, Fixed | 14.84 → 11.52 | 23.61 → 18.61 |
| KDS rectangle, block, Fixed | 14.74 → 10.22 | 29.03 → 21.05 |
| EN L-section, stress–strain, Adaptive | 54.12 → 36.90 | 101.83 → 70.67 |
| AS hollow, block, Adaptive | 81.80 → 46.83 | 134.31 → 85.72 |

For these 20-load fixtures, the absolute saving was 3–8 ms in Fixed and 17–49 ms in Adaptive. At five loads, it was 0.9–1.5 ms in Fixed and 2.9–7.9 ms in Adaptive. Batch geometry reuse is a small, bounded improvement for the user's ordinary workload and is deferred following the user's decision. A future compute investigation can target the Adaptive build, which took up to 1.67 s on the integrated fixtures, when that delay affects actual use. Prioritize the owning audit's correctness and verification findings.

The smaller-batch measurements are in `batch-5-distinct.json` and `batch-20-distinct.json`. Set `PM_REVIEW_DISTINCT_ONLY=1` and `PM_REVIEW_LOAD_COUNT=5` or `20` before running `batch.mjs` to reproduce them. Clear these variables to reproduce the original 100-load matrix.

## Findings

1. **PERF-01. Reuse the active Design topology within each batch. High priority.** The explicit-triangle branch rebuilds vertex triples and sampled-edge flags. Each load also slices a contour at Pu, even when the previous load used the same surface and Pu. Constant P additionally checks the starting point and finds the qualified exit. Coordinate with the existing AUD-009 work in [programming audit remediation](2026-11-04-programming-audit-remediation.md). The experiment holds topology by both point-array and index-array identity and retains one contour per synchronous batch. Identical adjacent Pu values qualify for reuse, including correct handling of signed zero. Keep production state local to an immutable dataset or explicit batch context. Retain direction-dependent ambiguity tests and the original order of candidate demands and ties. For predominantly distinct loads, the next experiment is a conservative P-range index for the slice. Compare every contour component and source edge before introducing pruning.

2. **PERF-02. Batch the concrete integrations in Adaptive stress–strain. High priority.** On the EN rectangle, 8,344 station evaluations yielded 2,192 Design points. A separate instrumented run attributed about 85% of sampled wall time to the forward evaluator, compensated accumulation and the EN concrete law combined. Prepare contiguous f64 coordinates, areas and resolved material parameters once. Evaluate independent states in batches and keep each state's fibre reduction in its existing order. Start with the measured EN branch. Measure the full Design plus Nominal build with steel and displaced-concrete ledgers, guards, rejected adaptive probes and all evidence assembly included. Keep the TypeScript reference available for differential tests.

3. **PERF-03. Reduce temporary allocations in equivalent-block Adaptive and narrow the preparation key. High priority for memory and fallback responsiveness.** For the AS rectangle, the fresh process peaked at 408 MiB RSS through the cold surface build, including the Node runtime. Post-GC retained JS heap increased by about 7 MiB. GC led the sampled AS build at 89 ms. The adaptive evaluator also constructs a string key from the angle and serialized station for each lookup. Measure per-direction preparation, stable station identity and scratch storage for exact clipping. Retain complete evidence for published states and enough evidence to reproduce rejected probes. In the browser fallback, serializing the entire selected-load payload just to form the block preparation key took 29 ms for KDS and 67 ms for AS. Serializing the five actual preparation inputs took about 0.01 ms. Narrow that key and reuse a revision-matched core for detail solves. The normal worker already uses a surface handle for subsequent queries, and its detail path constructs a narrow preparation object. Check the build and exact-direction callers for consistent key fields.

4. **PERF-04. Separate the import stall from worker latency.** On Edge, selecting the 100-load project file through the first frame opportunity with all verdict cells correct took 1.49 s for KDS complex and 1.55 s for AS hollow. In both runs a 479–569 ms main-thread long task occurred after file selection and before the surface job was dispatched. This includes UI navigation and lazy initialization. A main-thread trace is needed to attribute the stall to specific handlers or libraries. On subsequent AS Constant P selections the worker round trip was 396–414 ms and the matching table frame followed 22–25 ms later. On KDS the corresponding intervals were 133–143 ms and 21–32 ms. Measure import validation, React commit, chart setup and first chart interaction separately. The Node serialized surface was 1.26–4.20 MiB on the four fixtures. If IPC remains material after query work, benchmark a compact display payload and transferable buffers while keeping the authoritative engineering data in its owning worker. Transferring a buffer changes ownership. The existing handle and restart replay contract must continue to work. [Transferable objects](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects)

5. **PERF-05. Reuse engineering results across reports, then profile workbook serialization.** Four loads with one detailed load took 139 ms for the KDS stress–strain report model and 410 ms for KDS block. PDF rendering with the application font took another 18 ms in each case. The full XLSX exports took 601 and 394 ms respectively. Both export routes invoke the shared loadcase solver. A bounded result keyed by the model revision, loads, profile, sampling and check basis can serve a second format. Check which summaries need an inverse solution and generate expensive detail only where its published fields require it. Measure ExcelJS model creation, ZIP writing and chart injection individually before changing the writer. Verify formula recalculation, source traces, workbook structure and PDF output.

6. **PERF-06. Keep concurrency and frontend changes targeted.** Surface directions and loadcases offer independent work. First profile a bounded worker pool on a low-memory machine. Schedule independent rows within a refinement pass, merge in deterministic direction/station order and preserve adaptive decisions, cancellation and stale-result handling. Multiple copies of an AS adaptive working set can overwhelm the memory benefit. The production gzip checks passed at 349.8 KiB initial, 1,325.4 KiB lazy Plotly, 88.2 KiB analysis worker and 248.1 KiB lazy Excel. Measure selected Plotly trace modules and delayed chart setup against first interaction before adding a custom bundle. Existing mesh spatial classification, compiled material laws and prepared mesh reuse already address earlier hotspots. Dense/mobile CAD editing, project XLSX import, large report selections, long-running memory retention and GPU chart interactions remain separate benchmark workloads.

## Rust decision

| Scalar kernel | Evidence at equal data layout | Disposition |
|---|---|---|
| Proportional origin-ray triangle scan | Four production surfaces × 103 nonzero rays. Packed JS took 0.71–3.68 ms per batch. Wasm took 0.64–3.08 ms. Surface packing cost 0.65–4.09 ms once. All 412 hit results matched the production result, including lambda, barycentric weights, vertex identity and signed zero where present. | Start with the packed JS query. The extra Wasm saving was 0.07–0.60 ms per batch. This experiment covers one subquery of the governing check. |
| EN parabolic concrete, exponent 2, compensated resultants | 256 actual EN L-section states × 4,326 concrete fibres. Packed JS took 5.58 ms and Wasm 4.21 ms, a 24.5% time reduction. All 768 concrete P, Mx, My entries matched the production ledger exactly. Fibre packing cost 0.21 ms. | Best candidate for an integrated Rust pilot. Measure worker startup, cache misses and total surface time on two browser engines. Add material branches, steel, tangents and typed failures only with separate parity evidence. |

Both kernels are measurement-only. The Rust build uses the standard `wasm32-unknown-unknown` target and no external crates. The prototypes operate on bounded, prevalidated arrays. Production integration would need checked buffer ownership, lengths, finite arithmetic, a typed failure channel and the current fallback path. Standard profile policy and report/UI orchestration remain with their present owners. [Rust target documentation](https://doc.rust-lang.org/rustc/platform-support/wasm32-unknown-unknown.html)

## Promotion and reproduction

The production build, bundle budget, repository structure check, root typecheck and 31 focused tests passed. The tests cover Constant P intersection failures, Fixed-P paths, triangle intersections and uncertainty classification. The Rust and batch assertions are comparisons with production. Independent section-capacity certification, full release regression, a deployed Rust worker and cross-browser numerical portability were outside this audit.

For each candidate, profile before and after in the same process/build, record repeat distributions, peak memory and interaction timings, and rerun the per-profile matrix. For a Rust decision, require a repeatable gain for the complete target workflow on target browsers after setup and copying. Block promotion on any mismatch in a ledger, governing triangle, load identity, classification, solver failure, topology, tolerance evidence or report trace. Include poles, cap faces, coplanar rays, multiple components, zero demand, non-finite input, hardening, exhausted refinement, cancellation and cache invalidation. Run the repository's independent numerical, report and portability gates before merging a production optimization. Current differential evidence establishes fixture parity at the specified boundaries. It does not establish independent engineering validation or release readiness.

Run these commands from the repository root, with installed project dependencies and the Rust Wasm target. The audit programs and Rust prototypes are in [tools/performance/review](../../tools/performance/review).

```powershell
node --import tsx tools/performance/review/workflows.mjs
node --import tsx packages/pm-analysis/bench/run.ts --repeats 5 --out outputs/performance-review/engine.json
node --import tsx tools/performance/review/profiles.mjs
node --enable-source-maps --expose-gc --import tsx tools/performance/review/profiles.mjs en-1992-1-1-2004-stress-strain adaptive basic --cpu
node --enable-source-maps --expose-gc --import tsx tools/performance/review/profiles.mjs as-3600-2018-amd2-equivalent-block adaptive basic --cpu
node --import tsx tools/performance/review/batch.mjs
foreach ($kernel in @('ray','concrete')) {
  rustc --edition 2021 --crate-type cdylib --target wasm32-unknown-unknown -C opt-level=3 -C panic=abort -C debuginfo=0 -C strip=symbols "tools/performance/review/$kernel.rs" -o "outputs/performance-review/$kernel.wasm"
  node --import tsx "tools/performance/review/$kernel.mjs"
}
```

For browser timing, start a production web build, point `PM_TEST_URL` at it, set `PM_PLAYWRIGHT_MODULE` to an installed Playwright runtime with Edge available, and run `node tools/performance/review/browser.mjs`. The per-frame check verifies all 100 displayed values against the completed worker result. The frame observation bounds UI readiness and does not measure physical display scanout. Raw local evidence is in `outputs/performance-review` under `engine.json`, `workflows.json`, `profiles.json`, `batch.json`, `ray.json`, `concrete.json`, `browser.json` and the two source-mapped CPU profiles.
