# Complex-section fixture CI synchronization

Status: implemented; local software gates passed. Class 2 artifact/persistence synchronization,
with expected identical engineering inputs/results. A Class 3 regression-reference follow-up
also selects a versioned fingerprint for the already implemented 28-station fibre schedule.

- Objective: repair the CI `Complex-section fixture is current` failure without bypassing its
  generator/diff gate or changing the canonical project writer.
- Authorities/contracts: development/02 canonical v3 exports and explicit v1/v2 readers;
  development/11 and REBAR-AS-001..003 stored-area/legacy operation order; engineering/02
  UNITS-001 canonical units; ENG-AN-003 retained-state/topology/query regression evidence;
  development/05 controlled fixtures and unchanged oracles.
- CI-FIX-001: the canonical creator already writes v3, while the checked-in generated complex example
  is v1. Regeneration adds the existing stored-area and zero-centroid/proportional-basis fields.
  The example-menu test independently hardcodes v1 for every file.
- Owners: generated complex JSON, menu-example contract comment/tests, workbook authoring tests
  that consume this fixture, and persistence documentation.
  Keep the generator, schema/parser, reference model, engineering kernels and CI strict diff unchanged.
- The two affected workbook authoring tests must now supply explicit As for their newly added
  bars under the canonical v3 contract. They verify independent manual areas and unchanged area
  after a diameter edit; missing As retains a typed rejection. The importer is not relaxed.
- CI-FIX-002: the historical 27-station fingerprint has 972 points per
  case; current defaults have 1008. The portable gate reports 94 shape deviations. Preserve that
  file unchanged and select a new explicitly versioned 28-station reference through package scripts.
  Allowed additional owners are the new benchmark baseline/README and architecture provenance note.
  Comparison policy and every numerical tolerance remain unchanged.
- CI-FIX-003: the P16 regression record has the same historical station-count mismatch. Retain its old JSON,
  select a versioned 28-station record in `tools/verification/p16/verify.ts`, and document that
  selection in the reference-case README. Keep its source report, project input, external
  comparison data and all three regression/external tolerances unchanged. The complete old
  record must be recovered by removing only the added midpoint; every non-polyline case result
  and all scalar anchors must remain bit-identical in the current record.
- Contract: the first generated example is current canonical v3; retained legacy examples preserve
  their declared reader versions. IDs, geometry, effective bar areas, materials, options, design
  basis, centroidal demands and metadata timestamps must retain their existing meaning.
- Oracles: regeneration idempotence, explicit supported version tests, zero-offset/proportional
  default equality, effective rebar-area equality and exact surface-resultant/topology comparison
  between the prior v1 fixture and regenerated v3 input.
- Failures: parse warnings/errors, unexpected field/value drift, non-idempotent generation or
  changed engineering resultants block completion. No tolerance/oracle relaxation is permitted.
- Gates: reproduction of the generator/diff failure, focused example/persistence tests, structure,
  typecheck, full application tests and production build/bundle. Inspect later CI numerical gates
  separately; a local fix does not claim a remote GitHub run or engineering release acceptance.
- Baseline review gate: on all eight benchmark geometries, removing only the new midpoint must
  recover all historical surface values and the independently rerun contour/moment-plane queries
  under the existing portable policy. The added state retains the pure-tension task's independent
  midpoint/domain tests. Then verify the new reference by a separate benchmark run, full numerical
  matrix, external P16 gate, application tests, build/bundle and production dependency audit.

## Review evidence and gate outcomes

CI-FIX-001 is a stale generated artifact, not a generator exception. The regenerated file's Git
blob is `227c8c3974986f2cf86a793c513ae76068de8b7d`, matching the runner's `227c8c3` output.
Repeated generation, including Node 24.20.0/npm 11.19.0, is byte-identical. The old v1 input and
new v3 input have equal effective engineering inputs under the explicit reader/default contracts.
Separate uncached executions give exactly equal 848 Design points, 1008 Nominal points, topology,
states, ledgers, cap evidence and six load checks (three loads × two bases). No generator, parser,
schema, production workbook importer or calculation implementation changed.

CI-FIX-002 originally reports 94 deviations against the historical point-array shapes. On each of
eight geometries, the review removes only the 36 new `pure-tension-transition-50` points and reruns
the original fixed-P contours and moment-plane query. Every historical fingerprint field, including
inverse diagnostics, is compared with no excluded quantities under the unchanged portability
policy. Seven cases are exact; the dense rectangle has 17 already permitted resultant roundoffs,
worst `4.9573078742041815e-17` of section scale, and zero violations. The new reference is recorded
through `npm run bench:record` under Node 24.20.0/npm 11.19.0, V8 13.6.233.17-node.53, Windows x64.
Separate exact and portable benchmark runs both report 8 sections × 24 capacity quantities
bit-identical. The old baseline is unmodified; policy and solver-diagnostic handling are unchanged.
An initial direct-Node candidate lacked npm provenance and was rejected before selecting the
official npm-recorded reference; its reviewed case values and the final reference are exactly equal.

CI-FIX-003 is reviewed separately from the external agreement criterion. All six UMD records,
sampled and exact Mu/ratios, inverse planes, scalar anchors, poles, material point values, metadata
and mesh remain bit-identical to the historical record. Only three resolved station counts and
twelve P–M polylines change: ten gain four points and two gain eight. Rebuilding the queries after
removing only the added midpoint recovers the complete historical JSON values bit-identically.
The new versioned record passes a separate read-only `verify:p16` run, including the original
external flexural/pole checks. Source report, historical expected JSON and project input remain
unmodified; no comparison tolerance changed. Console pole numbering now uses the resolved count.

Local gate results:

- `npm test`: pass; structure/docs/traceability/typecheck, 708 unit tests, five ADSEC parser tests,
  11 CAD tests, project round trips, independently recalculated stress-strain/block/demand workbooks
  and PDF report checks. Focused example/workbook tests also pass (17 tests).
- `npm run bench:verify` and `npm run bench:verify:portable`: pass under the recorded reference
  runtime. This is a Windows run of both policies, not an observed Linux GitHub run.
- `npm run verify:p16`, `npm run bench:strain-sampling`, `npm run bench:equivalent-block`,
  `npm run bench:pipelines`, and `npm run bench:sampling-modes`: pass with unchanged limits.
- `npm run build`: pass with isolated `PM_NEXT_DIST_DIR=dist/fixture-ci-next`.
  `npm run check:web-bundle`: pass; initial/Plotly/worker/Excel gzip sizes are
  352.9/1325.4/69.3/248.1 KiB, inside unchanged budgets.
- `npm run check:security`: pass at the existing high-severity gate; the audit retains two
  pre-existing moderate findings in the ExcelJS/uuid dependency chain. No dependency is changed.

The fixture encoding changes from v1 to canonical v3; there is no new schema definition, mechanics,
material law, factor, acceptance/uncertainty policy or released-report behavior. The versioned
regression references follow the previously selected sampling behavior; they are not independent
accuracy certificates. The documented compact Fixed hardening interpolation uncertainty remains
open. Author review is Codex; independent structural/software and release approval are not claimed.
The working-tree repair does not claim that GitHub has rerun successfully before commit/push.
