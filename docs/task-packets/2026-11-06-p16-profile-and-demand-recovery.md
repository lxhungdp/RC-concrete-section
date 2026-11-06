# P16 UMD profile conversion and demand recovery

Status: corrected and verified in the local working tree based on `44ec334`. Preview only;
independent engineering release review is not asserted.

- Objective: explain the P16 UMD Nominal/Design separation, repair conversion to KDS, and prevent
  a failed calculation from retaining a former profile's curves or waiting indefinitely for a chart.
- Requirements: ENG-MAT-001/006 (consistent material snapshots and one resistance route),
  ENG-RES-002 (current result identity), DEV-ARCH-006 (presentation consumes result evidence).
- Change class: 3, material-authoring and application pipeline correction. No mechanics, code
  coefficient, tolerance, station schedule or classification rule changes.
- Owners: development/02 section 3 and `@pm/project` calculation-profile authoring;
  development/04 analysis lifecycle and the web selected-detail/result workspace.
- Input contract: the unchanged archived P16 UMD project and an explicit user profile switch.
  Preserve geometry, stored bar areas, strengths, modulus and declared physical strain limits.
  Remove old material resistance snapshots when the new KDS DesignBasis becomes the factor owner.
- Output contract: newly authored materials compile and round-trip; the selected profile supplies
  the surface, checks and fields. Failed surface/detail jobs have visible terminal errors and retry.
  A failed rebuild cannot expose old curves as the new profile or make them exportable as current.
- Blocking cases: inconsistent yield snapshot, invalid material, failed worker job, changed demand,
  changed profile/material/options, and cancelled or superseded requests. Preserve validation.
- Oracles: compiler and canonical project validation; P16 conversion through both KDS mechanics;
  independent algebraic checks of the declared global-factor scaling on uncapped states and the
  compression cap; unchanged P16 external comparison; real-browser worker/request and plot evidence,
  including injected build/detail failure and recovery.
- Impact: repaired explicit profile conversion can now produce the intended KDS results where the
  old authoring path failed. No project/schema migration, fixture rewrite, report formula, dependency,
  acceptance-state promotion or numerical-kernel change. Beta remains the strain-gradient direction;
  theta remains the checked load-moment direction.
- Exclusions: reconstructing characteristic concrete from the UMD design-level user curve, changing
  the original UMD comparison assumptions, independent design-code release approval.

## Findings before correction

1. The original UMD fixture deliberately contains a design-level concrete curve with a 27.62 MPa
   plateau, concrete multiplier 1 and steel divisor 1.111. Its Nominal/reference concrete and Design
   concrete are therefore identical; only the steel law changes. Close curves are expected for this
   fixture, whose source and assumptions are documented in examples/reference-case/README.md.
2. Switching to either KDS mechanics resets `epsY` to `fy/Es` but retains the UMD `gammaS=1.111`.
   The application correctly rejects this inconsistent source material as `INVALID_MATERIAL`.
   The EN-to-KDS authoring adapter must clear obsolete resistance snapshots, as EN/ACI/AS already do.
3. A failed surface build retains the former EN surface while the toolbar shows KDS. A selected
   detail then fails against the inconsistent materials; the chart frame never completes and keeps
   displaying Preparing chart. The original UMD Demand frame itself completed normally in Edge.

Before evidence: ignored `outputs/p16-demand-audit/before-{jobs,results}.json` and browser images.
Named independent engineering release review remains outside this change; existing draft status stays.

## Disposition and verification

- P16-01 (high, ENG-MAT-001/006): corrected the explicit KDS authoring adapter in
  `packages/pm-project/src/calculation-profiles.ts`. Both mechanics now clear old material resistance
  snapshots before deriving nominal yield. Compilation and project round-trip tests cover an EN
  source with partial factors and an additional resistance scale, preserve physical inputs and
  confirm that the source object is unchanged. Material validation remains strict.
- P16-02 (high, ENG-RES-002, DEV-ARCH-006): corrected the web analysis lifecycle in
  `SectionDrawingClient.tsx` and the error state in `LoadcaseCalculationDialog.tsx`. A resistance
  rebuild withdraws the previous surface; failed surface/detail requests terminate with an explicit
  error and a retry action. Failed surfaces cannot be exported. Cancelled/superseded request guards
  and completed-frame reuse within the same surface remain in place.
- Added a P16 application execution regression in `apps/web/test/analysis/execution.test.ts`:
  both KDS mechanics, all six loadcases, and all three Check Basis choices complete; batch and
  detail UR agree and retain the selected basis. The independent pure-tension scaling check is
  `Design / Nominal = 0.85`, from the unchanged declared KDS Main-body factor.
- Production Edge verification imports the built-in P16 UMD example, opens Capacity and Demand
  Check, then switches to each KDS mechanics and selects all six cases under each basis. Every
  requested frame becomes current with no remaining Preparing chart placeholder. The original
  UMD profile also completes all six cases. Injected worker surface/detail failures show terminal
  errors; retry recovers. Failed surface exports are disabled. Light/dark and narrow error layouts
  use existing workspace primitives; browser page errors are absent.
- Original UMD evidence: the compression endpoint is 651,514.511 kN in both stages; pure-tension
  Design/Nominal is `1 / 1.111`. After switching to KDS stress-strain, the nominal compression
  endpoint is 963,092.636 kN and the capped Design endpoint is 500,808.171 kN, with ratio
  `0.65 * 0.8 = 0.52`. These checks distinguish the deliberate original UMD curve from a stale
  chart after a rejected profile switch. They do not establish a complete code-compliance claim.

Completed gates:

- Focused project-authoring and application-execution tests: 22 passed.
- `npm test`, including structure, documentation, traceability, typecheck, unit and report/export
  integration checks; separate `npm run typecheck`; production `npm run build` and
  `npm run check:web-bundle`: passed.
- `npm run verify:p16`: passed against the unchanged UMD comparison for all six cases.
- `npm run bench:equivalent-block` and `npm run bench:pipelines`: passed with no failures.
- `npm run bench:verify`: passed with all eight sections and 24 capacity quantities bit-identical
  using the baseline's recorded Windows x64 Node 24.20.0/npm 11.19.0 runtime. Initial exact and
  portable attempts under host Node 24.22.1/npm 11.19.1 correctly stopped on provenance mismatch.
  The matching official Node archive was downloaded into the ignored audit directory and checked
  against its published SHA-256 checksum. No fingerprint, tolerance or provenance was rewritten.

Local reproduction/evidence: `outputs/p16-demand-audit/verify.mjs`, `verified-browser.json`,
`browser.log`, `focused.log`, `tests.log`, `build.log`, `bundle.log`, `p16.log`,
`bench-{block,pipelines,exact-runtime}.log`, and the before/after/error screenshots.
The tracked regression tests provide persistent coverage; these local diagnostic artifacts are ignored.
No sampling schedule, solver, code coefficient, project schema, fixture or acceptance status changed.
No new physical-validation or independent code-release claim is made.
