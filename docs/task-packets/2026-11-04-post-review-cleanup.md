# Post-review cleanup

Date: 2026-11-04. Change class: 2, refactor expected to be result-identical. Status: Preview only.

Objective: apply the cleanups from the review of the uncommitted hardening work without changing any
engineering value. Requirements: ENG-MAT-005 signed cutoff, UNITS-002 presentation preference, and
development/05 "one authoritative value". Authorities: engineering/04 section 5, engineering/06
section 6, docs/05 section 2.3, development/04 section 6 and development/10.

Allowed files: pm-equivalent-block types/evaluate/inverse, the block bridge admissibility line,
pm-report chart/trace/block workbooks, pm-units, the DisplayUnits provider, two hardening test files
and their owning documents. Inputs and outputs: the existing laws, DTOs and workbook formulas.

Blocking failures: any full-precision result drift; a tensile cutoff becoming a compression bound
for a law with explicit `strainLimits`; a changed station or rupture depth; a formula or defined-name
change in any workbook; a changed test count.

Oracles: a before/after full-precision capture of block and fibre surfaces, block demand solves,
kernel Fixed-P solves over every limit shape and four workbook families; the capacity fingerprint
on one runtime; the portable baseline on its recorded Node 24.20.0 runtime.

Impact: no schema, material law, factor, tolerance, baseline or status change. Two workbook table
headers change text from `fy (MPa)` to `fy,eff (MPa)`, matching their existing stage-resolved value.
At kernel level only, `bar.ultimateStrain` now reports `strainLimits.tension` when a law declares a
different value; every production law declares equal values. Browser storage loses the unread v1 key.

Out of scope: emitting named hardening inputs for every grade in the block workbook, migrating the
retired preference, changing how `surface.ts`, `uniform.ts` and `steel-support.ts` read
`ultimateStrain`, and any engineering decision on the KDS/Custom cutoff default.

## Delivered behavior

- `resolveSteelStrainLimits` and `steelStrainLimitAt` in `evaluate.ts` own signed admissibility
  selection for the forward evaluator, Fixed-P filter, bridge admissibility and block workbook. Depth
  generation and the bridge's compression-material guard keep their existing direct reads.
- The identical uniform-strain and default control-projection branches are one branch.
- The trace workbook resolves its hardening names once.
- `RETIRED_DISPLAY_UNITS_STORAGE_KEY` is removed on load. A removal failure cannot raise the
  stored-preference warning.
- The seven modified working-tree files that held CRLF now hold LF. `.gitattributes` already
  declares `eol=lf`, and other unmodified CRLF checkouts are untouched.
- The two hardening test files are formatted to repository style with unchanged assertions, plus
  two tests for the new helpers.

## Verification

Runtime: Node 24.22.1 / npm 11.19.1, Windows x64, unless stated. No baseline, tolerance or oracle was
changed. The capture scripts are session-local; their results are recorded here.

| Gate | Outcome |
|---|---|
| Before/after capture, 38 records | 24 surface, demand and kernel records byte-identical; all 14 workbook dumps identical in every formula, value and defined name except 12 expected header cells and 2 run timestamps |
| `bench/run.ts --fingerprint-out`, before/after | capacity fingerprint identical across 1,482,971 bytes |
| `bench:verify:portable`, Node 24.20.0 / npm 11.19.0 | PORTABLE-EQUIVALENT, unchanged: 17 resultant roundoff deviations, worst section-normalized delta 4.957e-17 |
| `npm run check:structure`, `npm run typecheck`, `git diff --check` | passed |
| `npm test` | passed: 485 unit tests (483 plus the 2 helper tests), 5 AdSec, 11 CAD, round trip, workbook and PDF self-tests |
| `bench:equivalent-block`, `bench:strain-sampling`, `bench:pipelines` | passed, no failures |
| `npm run build`, `npm run check:web-bundle` | passed: 344.6/375, 1325.4/1400, 81.4/120, 248.1/300 KiB gzip |
| Local dev browser | a planted v1 entry is removed on load; the v2 entry stays byte-identical; no warning or console error. The first attempt ran a bundle compiled before the edit and kept the key; a reload on the recompiled bundle removed it |

A later comment and documentation wording change was rechecked with structure, typecheck and the
focused helper and units tests. These are development checks: no calculation or report is promoted
from its draft/preview status, and independent engineering review remains open.
