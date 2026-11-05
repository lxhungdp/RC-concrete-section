# Selectable display units — decision and task packet

Date: 2026-10-26. Change class: **3** (input/export pipeline and pinned dependency).
Status: implemented and regression-checked, with the cross-platform exact-baseline limitation
recorded below. All engineering outputs remain Preview; no acceptance or release promotion.

Objective: add Metric, US Customary and per-quantity selections without changing the canonical
mm/N/MPa/N·mm model, solver, signs, numerical options, code factors or acceptance status.
Requirements: UNITS-001 through UNITS-006 in engineering/02; ENG-LOAD-001 and ENG-REP-002.
Owners: pm-units (boundary conversion), web presentation/editors, existing import adapters,
pm-report presentation. Analysis and code packages are excluded from implementation changes.

Input contract: finite canonical numbers or explicit decimal source text with captured unit context.
Output contract: canonical committed numbers or presentation copies with declared units.
Blocking failures: invalid preference/quantity/unit, blank numeric input, overflow, nonzero underflow,
malformed workbook unit declaration, incompatible dimensions. Invalid stored preference is disclosed
and reset to the documented Metric UI default; engineering data is never repaired by this reset.

Package strategy: consume @jscad/engineering-units 1.0.0 as a repository-contained npm artifact,
not an import from a sibling checkout. MIT; no transitive dependencies, I/O, solver or DOM role.
The source digest and archive integrity are recorded beside the artifact. Conversion authority:
NIST SP 811 (2008), Appendix B.9 and footnote 24, accessed 2026-10-26:
https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors/nist-guide-si-appendix-b9
https://www.nist.gov/pml/special-publication-811/nist-guide-si-footnotes
Curvature derives from reciprocal length; density derives from mass/length cubed using the shared
international inch/foot/pound definitions. They are not alternative engineering models.

Preference: local browser storage only, version 2; opening a project retains the user's display
selection. No project JSON schema change. Display selection is absent from analysis payloads and
surface/cache keys. Exports capture their presentation selection at request time.
Editable workbooks declare source units and version; imports never read UI preference. Canonical
JSON and mm DXF contracts remain unchanged. Formula audit ledgers retain their declared units;
summary views and PDFs can use the selected units.

Acceptance/oracles: independent NIST anchors; dimensional powers/inverse powers; exact no-op edits;
invalid/nonfinite/overflow/underflow rejection; canonical JSON identity through preference switches;
surface/result identity and no added analysis jobs; equivalent physical input in different units;
both mechanics, including asymmetric signed biaxial demand; workbook round trip and independent
formula recalculation; PDF content and visual QA. Existing numerical fingerprints are immutable.

Required gates: structure, typecheck, focused unit/UI/import/report tests, npm test, production build,
security, web bundle, bench:verify, bench:strain-sampling, bench:equivalent-block, bench:pipelines.
Actual outcomes and limitations are recorded below. No release or profile promotion.

The existing AdSec source manifests hash CRLF artifacts, while the repository-wide LF checkout
policy changed their bytes. All twelve CRLF candidates were checked against the unchanged pinned
hashes before restoration. A scoped `.gitattributes` rule now preserves those source bytes on
checkout. No oracle hash, engineering value or test tolerance changes.

### Required security gate repair

The 2026-10-26 npm audit found the existing Next.js 16.3.8 dependency affected by
GHSA-2464-fhr4-w9xw, GHSA-673q-mjm6-r5xr and GHSA-p3m5-59mp-jv5r. The publisher identifies
16.4.1 as patched; both root and web manifests pin that exact version. This bounded framework
update is required to complete the repository high/critical-advisory gate. No numerical package
or engineering default is upgraded. Build, bundle/security, full tests, browser invariants
and portable numerical regression were repeated after the lockfile change. Sources (accessed 2026-10-26):
https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw
https://github.com/vercel/next.js/security/advisories/GHSA-673q-mjm6-r5xr
https://github.com/vercel/next.js/security/advisories/GHSA-p3m5-59mp-jv5r

## Delivered contracts

- `@pm/units` owns conversion and preference validation. Numerical packages cannot import it;
  the repository structure gate enforces that boundary. The core and code profiles are unchanged.
- Options > Units provides Metric and US action buttons and four visible independent choices:
  Coordinates & dimensions (including bar diameter), Force, Moment, and Stress & modulus.
  The 2026-11-05 [active-input audit](17-active-inputs-and-audit.md) removes the unused Mass density
  selector together with concrete mc/Ec authoring. The density group remains in existing preference
  and workbook contracts for exact compatibility; it has no current visible quantity consumer.
  No preset or Custom mode is stored. Area, section modulus, inertia and curvature derive
  from the selected length. Existing angular conventions remain fixed.
- Browser preference v2 stores only its version and five groups, under `pm-column.display-units.v2`.
  Previous browser preferences are not migrated, and the provider removes the retired v1 entry on
  load. The existing Metric initial selection applies until a v2 selection is saved. Workbook Units v1 remains a separate quantity-specific transport
  declaration, retaining independent source diameter/modulus units on import. New exports expand
  the five choices to those seven declared quantities; no workbook or project revision is needed.
- An editor captures the original canonical value and its unit selection on focus. An unchanged
  numeric edit returns that exact original binary64 value, even when conversion is not invertible.
  Actual edits convert once on commit; invalid text remains a draft. Resting fields show compact
  presentation text; focused drafts start from the full-precision editing representation. Rounded
  resting text never enters a no-op commit. Optional quantity clearing remains an explicit authoring
  action; the former Ec editor is removed by the active-input audit.
- Project JSON uses its canonical v3 and explicit v1/v2 readers, independently of the first
  external Project XLSX format v1. The [stored-area contract](11-rebar-area-and-catalogs.md)
  keeps As independent of diameter. Project, section, rebar and loadcase workbooks require an
  explicit Units declaration. Imports use it and reject missing/inconsistent metadata.
  IDs, order and references are never quantity-scaled.
- Excel cells remain editable numeric display values. Where conversion cannot round-trip exactly,
  a validated `pm-unit-source/v1` cell comment retains the original canonical value. It is used only
  while the declared unit and visible value still match; an authored edit converts its visible
  number. An inconsistent record fails closed. No hidden project snapshot overrides input cells.
- PDF view values and chart coordinates use the captured export selection. Exact drawing geometry
  stays canonical internally. Formula-audit workbook sheets retain their existing calculation
  values/formulas; an additional Display sheet converts explicit source fields only. Material-law
  audit equations keep their labelled calculation units. DXF remains explicitly mm.

## Verification evidence

Evidence was produced on Node 24.20.0 / npm 11.19.0, Windows x64, on 2026-10-26.

| Gate | Outcome |
|---|---|
| Shared jscad package tests | 5/5 passed before packaging; installed source/archive digest checks passed |
| `check:structure`, `typecheck` | passed |
| Unit and pipeline focus | 12/12 passed, including independent NIST anchors, dimensional powers, strict invalid boundaries, compact resting text versus full-precision edits, exact no-op edits and workbook round trips |
| `npm test` | passed: 375 unit tests, 5 AdSec tests, 11 CAD tests, JSON round trip, independent spreadsheet recalculation for both mechanics and demand, deterministic/Unicode PDF checks |
| Production `build` | passed with Next.js 16.4.1 |
| `check:web-bundle` | passed: initial 373.7/375 KiB, Plotly 1325.4/1400 KiB, worker 118.9/120 KiB, Excel 248.1/300 KiB gzip; budgets unchanged |
| `check:security` | passed at the repository high/critical threshold; two pre-existing moderate uuid/ExcelJS advisories remain |
| `bench:strain-sampling`, `bench:equivalent-block`, `bench:pipelines` | passed with empty failure lists |
| `bench:verify` | refused exact comparison at its provenance gate: recorded darwin/arm64 versus current win32/x64; no baseline rewritten |
| `bench:verify:portable` | passed using the existing v2 policy: 17 resultant roundoff deviations, worst section-normalized difference 4.957e-17; topology, counts, flags and sampled states remain exact |
| Production browser | both mechanics passed; no console errors; unit-only changes submit zero worker jobs |
| Visual QA | populated custom-unit controls/charts and calculation dialogs in light/dark, narrow Options layout, PDF input/capacity/demand/detail pages; unit declarations are legible and Preview retained |

The exact-baseline gate is not reported as passed. The existing portable policy is documented in
`docs/task-packets/2026-09-03-node-24-runtime-hardening.md`; its criteria and numerical baseline are
unchanged. A same-platform exact-baseline run remains unavailable in this Windows environment.
Local production builds and browser launching required sandbox escalation; successful retries used
the same source and existing budgets. No engineering formula, coefficient, oracle or tolerance was
changed to obtain a pass.

The permanent browser harness is `tools/verification/display-units/browser.mjs`. Run against
`npm run start` on port 3001 with `PM_PLAYWRIGHT_MODULE` pointing to an installed Playwright runtime
and Edge available (`PM_BROWSER_CHANNEL` and `PM_TEST_URL` can select another installed target).
It instruments actual worker requests/responses, cycles Metric/US actions and individual choices,
performs no-op material and demand edits, exports canonical JSON before/after, exercises an authored 100 kip demand and a
rejected blank edit, and exports populated custom-unit PDFs for both mechanics.

The five-group control revision and its current verification evidence are recorded in
[the 2026-11-04 task packet](../task-packets/2026-11-04-unit-controls.md). Evidence below belongs to
the original units implementation and its subsequent dated corrections.

Canonical inputs and retained worker surface responses remain identical through the display-only
cycles; SHA-256 digests from the browser evidence are:

| Fixture | Canonical input JSON | Surface response |
|---|---|---|
| KDS complex stress-strain | `967f416ae10a43f4c3f83186549918968d1e633a1c4481c3d5d3a4129aedc10c` | `1ff6150449876431f74a177e6d50ab1e1984bfa697f3bd6db049e03a6d579654` |
| ACI equivalent block | `76245c73f56f3e4aeb831d7f71f589d4b26f6afdbd10092c089815a2f0ad8d8c` | `9b77e9f7618aaad934f0caff7131c54626554aa069f57ab9f6f4129ded2d8640` |

The authored 100 kip edit gives 444822.16152604995 N, within the independent exact-decimal NIST
anchor's explicit binary64 operation bound. Only that authored field changes; every other input
and the reusable resistance surface stay exact. Blank input is rejected without committing zero.
Report-model comparisons retain identical utilization, uncertainty interval and classification
under different selections. Generated logs, screenshots and PDFs are local QA intermediates under
ignored `outputs/units`; they are not released design artifacts.

## Table presentation correction after user review

The quantity editor initially wrapped even unitless in-cell inputs in `ws-field-group`, exposing
an ordinary field border at rest. Table inputs now render directly into their cells, reusing the
original table role and its focus border. The material-curve stress unit is declared in its column
header. No CSS, tokens, field dimensions, conversion or commit logic changed.

Production-browser QA checked 50 field/theme combinations across stress-strain, equivalent-block
and P16 user-curve fixtures: no visible field frame at rest, one frame on focus, the original table
field height, and no frame after Escape/blur. Loadcase, rebar, point and material-curve tables were
inspected in light and dark themes. Canonical JSON and retained surface responses remained exact;
unit switches submitted zero worker jobs and no console errors occurred. The full `npm test`,
structure/typecheck, production build, bundle and whitespace gates passed again. Evidence is in
ignored `outputs/units/table-style-evidence.json` and the matching table screenshots.

The Options tab grid was subsequently corrected from three to four columns so Points, Mesh/Block,
Resistance and Units share one row. Only that grid-column declaration changed. Production-browser
QA passed all 12 combinations of two mechanics, two themes and default/minimum/mobile widths,
retaining the existing 28px tab height and 13px type. Full tests, build, bundle and whitespace gates
passed. Local evidence is in `outputs/units/unit-tabs-evidence.json` and matching screenshots.

## Compact resting inputs

Objective: shorten converted input text while preserving exact canonical data and existing table
styling. Change class 2, expected result-identical. Requirements: UNITS-001/002/003/006. Owners:
`@pm/units` presentation formatting and the web `QuantityInput` edit boundary. Input/output contracts
retain captured canonical values and unit contexts; no JSON, workbook, worker or report contract
changes. Kernel mechanics, factors, signs, CSS and numerical tolerances are out of scope.

Resting fields use at most three fractional digits, or one for elastic modulus, without grouping
separators or unnecessary trailing zeros. A nonzero value that would round to zero uses scientific
notation. Focus always seeds the full editing text from canonical data. Enter/Tab/blur without an
authored change and Escape cancellation retain the original canonical binary64 value. Explicitly
typing the rounded number is an actual authored edit and converts once; it is not silently ignored.

Blocking failures are rounded text committed by focus alone, canonical/result drift, hidden tiny
nonzero values, invalid drafts committed as zero, or table-style regression. Oracles are exact
canonical JSON and worker-result identity across focus/commit/cancel and unit cycles, independent
known conversions for actual edits, and populated browser inspection. Formatting reuses the built-in
`Number.toLocaleString` / `Intl.NumberFormat` behavior through the existing unit-formatting owner.
The existing focus capture and canonical commit path remain unchanged; no additional editor state,
dependency or UI setting was introduced.

Verification passed: 12 focused tests; full `npm test` including 375 unit tests; structure/typecheck;
production build and unchanged bundle budgets; existing portable capacity regression. The exact
cross-platform baseline limitation above remains unchanged. Production-browser checks for both
mechanics show `4.351` at rest versus `4.351132131906277` while editing, and `5607.392` at rest versus
`5607.391955670684` while editing. Enter/Tab without changes, Escape, repeated unit changes and
canonical JSON export retain the same input and surface hashes listed above, with zero unit-only
worker jobs. Explicitly typing rounded text and a new 100 kip value both commit the authored number;
blank invalid input is still rejected. The 50 table field/theme checks passed again across three
fixtures, including user-curve data, with unchanged table styling and exact canonical input/results.
Evidence is under ignored `outputs/units` in `browser-evidence.json`, `table-style-evidence.json`,
the compact-input test/build/benchmark logs and screenshots.

## Generator input lifetime correction

Reproduction before correction: Cover 40 mm -> 1.574803149606299 in; deleting trailing digits to
1.57 and pressing Enter displayed 1.57, but visiting Options and returning to Rebar restored 40 mm.
`RebarPanel` owned its generator parameters in local state and was unmounted during navigation,
so a fresh panel silently recreated DEFAULT_PARAMS. This affected diameter, spacing/count, pattern
and replace/append selection as well as Cover. It was a state-lifetime failure after commit.

Objective: retain committed generator inputs while changing presentation/menu. Class 3 (editor
input lifecycle), requirements UNITS-001/002/003 and ENG-GEO-001/005. Owners: workspace UI state
and the controlled RebarPanel; existing generator and conversion functions remain unchanged.
Canonical parameters are mm; 1.57 in must be stored as 39.878 mm. Opening another project resets
the transient generator form; unit changes and ordinary menu/subtab changes retain it. No schema,
report, storage or numerical tolerance change is allowed. Existing bars must remain unchanged
until Generate is explicitly pressed. Kernel mechanics and cover semantics are out of scope.

Blocking failures: edited inputs revert on navigation, unit changes trigger capacity analysis, no-op/cancel
changes a canonical input, invalid drafts commit, or Generate ignores retained canonical parameters.
Oracles: the user's exact deletion/navigation sequence, independent 1.57 x 25.4 conversion, exact
project/surface identity before Generate, and independently checked rectangular bar-center offsets
after Generate.

Correction: the workspace owns one ordinary React state object for generator parameters, pattern
and replace/append choice; RebarPanel is controlled by props. The existing DEFAULT_PARAMS values,
unit converter, commit behavior and generator implementation are unchanged. No context/store or
persistence subsystem was added. A project import explicitly creates fresh helper defaults.

Verification passed: full `npm test` (375 unit tests plus the existing integration suites),
structure/typecheck, production build, bundle, portable capacity fingerprint, strain-sampling,
equivalent-block and cross-model pipeline benchmarks. The same-platform exact-baseline limitation
above remains unchanged. The permanent browser regression is
`tools/verification/display-units/rebar-generator.mjs`; evidence is under ignored `outputs/units`.

Both mechanics retained Cover 39.878 mm / 1.57 in, Diameter 19.05 mm / 0.75 in, Spacing 88.9 mm /
3.5 in, Count 6, pattern and replace/append choice across repeated unit/menu/subtab changes. Direct
menu navigation committed 1.58 in as 40.132 mm without needing Enter. Escape/no-op/blank-input cases
retained the prior value. Canonical project inputs and resistance responses remained exact before
Generate. No new capacity/demand jobs were submitted; the stress-strain Options mesh viewer made
11 existing `buildSectionMesh` view requests during navigation, recorded separately from capacity.
For the 400 x 500 mm rectangle, Generate produced 12 bars with centerline extrema x = +/-160.122 mm
and y = +/-210.122 mm, matching the independent 39.878 mm offset oracle. Only the bar array changed.
Re-import restored the existing 40/20/4 helper defaults, and no browser errors occurred.
