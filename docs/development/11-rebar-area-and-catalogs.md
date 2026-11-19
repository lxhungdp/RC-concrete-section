# Stored Rebar Area and Reference Catalogs

Status: implemented Preview; all analysis and exports remain Preview.

## Task packet

- Objective: add a tabbed reference-catalog dialog, editable generator/list As and two one-time
  fill actions. Propagate authored area through both mechanics, persistence and audited reports.
- Change class: 3, input/persistence/pipeline contract. Steel/concrete laws and resistance rules
  are unchanged. Any unexplained result drift blocks completion.
- Requirements: REBAR-AS-001..004, ENG-GEO-001/005 and UNITS-001..006.
- Owners: engineering/03 first; geometry definitions/validation, project persistence, the two
  analysis preparation boundaries, equivalent-block diameter contract, report adapters and web UI.
- Input: canonical positive finite diameter mm and stored area mm²; provenance snapshots are
  independent audit data. Equation/Catalog are commands, never reactive modes.
- Output: prepared steel areas, totals and displaced-concrete corrections consume the same stored
  value; drawing/containment continues to consume diameter.
- Blocking failures: invalid area/source data, unqualified catalog branch, lost area on copying,
  stale result/cache reuse, source snapshots overriding visible edits, or lossy drawing exchange.
- Independent oracles: published dimensional tuples, fixed-strain single-bar steel and displaced-
  concrete ledgers, diameter-vs-area containment cases, independently recalculated workbooks,
  existing untouched numerical baselines and project/file/unit round trips.
- Impact: project exports use v2; v1 remains an explicitly read legacy contract. Area workbooks
  require a new format marker/version. Results and audit tables gain stored area/source fields.
- Exclusions: material/grade derivation, design-code changes, automatic diameter matching, library
  editing, verified detailing/member design, released engineering results and baseline rewrites.

## Authoring and provenance

As and diameter are always editable. Use equation fills once from the current canonical diameter.
Use catalog opens a modal with a single-row, horizontally scrollable tab strip and the entire
selected table, without search. Selection is a draft; Use selected bar copies both values to the
generator. Escape/Cancel does nothing. Existing bars change only on Generate or a row edit.
Generator state remains in the workspace so panel/menu unmounts and unit changes retain it.

An optional discriminated provenance snapshot records Manual, Equation or the selected catalog
tuple/source. It cannot supply an active area. A diameter/area edit makes that source Manual;
imports also discard a source claim that no longer matches its snapshot. A positional/material
edit does not clear dimensional provenance. Catalog snapshots never follow library updates.

Legacy diameter-only programmatic inputs preserve their previous operation order at one geometry
adapter: stress-strain `(PI*d)*d/4`, block `PI*(d*d)/4`. For example d=22 mm already differs by one
binary64 rounding step between routes. Existing baselines are not rewritten. Exporting legacy data
to a stored-area v2 document materializes the selected mechanics' legacy area once, preventing a
save/open operation from introducing that cross-route roundoff. New equation fills use the declared
single authoring expression and both kernels consume the resulting stored value.

## Sources

The research scalar packet is `outputs/rebar-catalog/catalog-research.json` (2026-10-27). Production
reference rows must be copied from inspected sources, with publisher, actual document/table,
source-unit basis and access date. Manufacturer/agency reference data is labelled as such, without
claiming that an uninspected edition is verified. KS 2025 and BS 4449 A3:2016 normative dimensional
tables were not qualified. Their labels are not applied to older reference datasets. The following
10 tabs contain 101 scalar dimensional rows, with source units retained:

| Tab | Published scope | Rows | Source/table |
|---|---|---:|---|
| KS | KS D3504:2021 manufacturer guide, D10-D32; not the 2025 revision | 8 | [Daehan Steel summary, section 4 / PDF page 2](https://drive.google.com/file/d/1OWfN0pqqlIUiKglaaS0WvqJkqZ-yX9Y5/view?usp=drive_link), linked by the [current official product page](https://dhscorp.kr/product_sub02) |
| ASTM US | A706 Grade 60 reference, September 2025; in/in² | 11 | [Caltrans BDD 13.1, table 13.1.1](https://dot.ca.gov/-/media/dot-media/programs/engineering/documents/bridgedesigndetails/chapter-12/202509bdd131reinforcement-a11y.pdf) |
| ASTM SI | A615/A615M-20 SI common-size subset; mm/mm² | 9 | [ASTM table 1, VICASA-hosted copy](https://vicasasteel.com/Upload/files/ASTM_A615_A615M-20.PDF) |
| JIS | Chiyoda D10-D25 product range, areas cross-checked against VIS's JIS G3112:2020 declaration | 6 | [Chiyoda dimensions](https://www.chiyoda-steel.co.jp/product/Deformed-Bar/), [VIS area table](https://vis.com.vn/thep-thanh) |
| TCVN | TCVN 1651-2:2018 manufacturer reference | 13 | [VIS dimensional table](https://vis.com.vn/thep-thanh) |
| AS/NZS AU | AS/NZS 4671:2019, Australian sizes | 10 | [Clause 7.3.1, table 7.5(A), government public record](https://www.industry.gov.au/sites/default/files/adc/public-record/2025-01/attachment_col-c-1.1_-_as_nzs_4671_2019_-_public_record.pdf) |
| AS/NZS NZ | AS/NZS 4671:2019, New Zealand sizes | 10 | Same source, table 7.5(B) |
| BS | Qatar Steel published BS 4449:2005 product reference; no A3:2016 qualification | 14 | [Qatar Steel dimensional table](https://webdev.qatarsteel.com.qa/wp-content/uploads/2019/01/Reinforcement-Steel-Bars.pdf) |
| DIN | DIN 488 manufacturer reference; edition unspecified | 12 | [Sidenor bars table](https://sidenor.gr/en/products-and-solutions/sd-concrete-reinforcing-steel/sd-concrete-reinforcing-steel/sd-bars-coils/) |
| Canada | OCCDC reference guide v3; no CSA 2021 edition claim | 8 | [OCCDC/RSIC guide, PDF page 12](https://rebar.org/wp-content/uploads/2017/03/OCCDC-Reference-Guide-V3.pdf) |

Initial research access was 2026-10-27; the KS source link and dimensional tuples were rechecked
2026-10-29 against the download on Daehan's current product page. The exact reference/edition and source are visible in the dialog and
copied into the per-bar provenance snapshot. Picking a dimensional tuple does not select a steel
grade, jurisdiction or design-resistance profile. US and SI published rounding remains independent;
for example US #8 converts to 509.6764 mm² whereas the SI 25 row is 510 mm².

The native modal uses the existing workspace surfaces/controls and shared project-dialog width.
Its functional layout exceptions are independent numeric column widths and a single scrolling tab
strip, owned by `RebarCatalogDialog` and shared workspace tab chrome. The original terminal input
border/focus role remains unchanged. The panel/catalog are loaded on demand to retain bundle limits.

## Verification

Evidence is kept under ignored `outputs/rebar-catalog/`; no oracle/baseline/tolerance is rewritten.
The permanent focused cases are the geometry, analysis, report and web `stored-rebar-area`/
`rebar-area` tests and the DXF area-loss guard. They cover finite positive area, independent disk
containment, both legacy operation orders, JSON v2/v1 discrimination, source invalidation, exact
workbook transport and explicitly edited 0.5 in² = 322.58 mm². Independent saturated-tension oracles
use `F = -fy*As` in both kernels and independently recalculated HyperFormula workbooks; block-ledger
tests also check displaced concrete and moment arms. Report schedule/drawing checks retain As and d.

`npm test` includes structure/typecheck, owner tests, AdSec, CAD, project round trip, independently
recalculated workbooks/demand checks and deterministic preview PDFs. Production build and bundle
checks pass: initial JavaScript 373.6/375 KiB, worker 119.4/120 KiB, Plotly 1325.4/1400 KiB and Excel
248.1/300 KiB gzip. Catalog data remains outside the initial/worker payloads.
The final full run passes 386 unit cases, 5 AdSec cases, 11 CAD cases and every integration selftest.
The rendered PDF reinforcement schedule was also inspected with Poppler; its separate d, As and
source columns remain legible without clipping.

The unchanged `bench:verify:portable`, `bench:strain-sampling`, `bench:equivalent-block` and
`bench:pipelines` pass. Portable baseline comparison uses the installed Node 24.20.0/npm 11.19.0
runtime required by that baseline; the ordinary test/build runtime is Node 24.22.1/npm 11.19.1.
Exact platform provenance is not claimed on Windows for the macOS baseline. This does not promote
the engineering preview/release status.

`tools/verification/rebar-catalog/browser.mjs` exercises the production UI in headless Edge for both
mechanics: all tabs/rows, no search, one-time equation/catalog fill, free diameter/As edits, Cancel/
Escape and keyboard tabs, Generate, row edits, units, retained generator state and exact project
Excel export/import. Worker instrumentation checks that these proposal/unit actions retain the
same resistance surface before Generate. Light/dark screenshots and narrow modal measurements
check one-row tabs, unclipped published numbers and transparent resting/focused table borders.

### Generator layout follow-up, 2026-10-27

Presentation-only objective: keep Cover and Count (or Spacing) on the geometry row, followed by
Dia, As, Equation and Catalog on one properties row at the standard sidebar width.
`RebarPanel.tsx` changes field placement; `side-panel.css` owns the two-column geometry grid and
flexible property widths. At narrow widths, the complete fill-action group wraps using the existing
layout behaviour. The two secondary fill actions use the existing standard action role, matching
the 26px input height. Short Equation/Catalog labels retain more width for Dia and As without
custom control sizes. Handlers, unit boundaries, data contracts and numerical owners are unchanged.
The browser harness measures row alignment, spacing-mode substitution and keyboard sidebar resizing
alongside its existing editing/generation/unit/file tests. Standard controls and table focus styles
remain owned by the shared workspace primitives.
Follow-up checks pass: structure, explicit typecheck, full `npm test` (386 unit cases plus the
existing integration suites), production build and unchanged bundle budgets. The production-browser
checks pass for both mechanics in both themes, including default-row alignment, wider Dia,
Spacing mode, narrow-sidebar wrapping, free As edits, Generate and exact file/unit round trips.
Evidence logs use `outputs/rebar-catalog/layout-*` and `button-*`; screenshots use
`*-generator-layout-*.png`. Final browser measurements confirm 26px for both fields and both
actions, with a 94.58px Dia field and 72.73/66.11px Equation/Catalog actions at the default width.

### Catalog width follow-up, 2026-10-29

Presentation-only objective: remove the catalog's 760px width override and reuse the shared 520px
project-dialog width, bounded by the viewport. Numeric column widths remain independent from the
table action-column role. Standard tabs retain one horizontal scrolling row. Data, selection,
controls and computation contracts are unchanged. Browser QA checks every published table for
clipped numbers and the modal at a 360px viewport, alongside the existing authoring/unit/file flows.
Verification passes for both mechanics: 520px desktop width, 328px width at the 360px viewport,
all 101 published rows without clipped numeric cells, and no browser errors. Structure, typecheck,
full `npm test`, production build and the unchanged bundle budgets pass. Evidence is recorded in
`outputs/rebar-catalog/width-*` and the current browser evidence/screenshots.

### KS source-link repair, 2026-10-29

The old `www.idaehan.com/kr/download/Deformedbar_KSD3504_gudie1_2021.pdf` URL could not be
resolved (`ENOTFOUND` for that host; the browsing fetch also failed). The current Daehan product
page at `https://dhscorp.kr/product_sub02` returns HTTP 200 and publishes the KS summary through
the Google Drive link above. Its public download returns HTTP 200, a `%PDF-1.5` signature and
255603 bytes; SHA-256 is `61b5657b59aee34fda49bdd671cc60e10520f5e56b486469578776873909e941`.
The two-page summary explicitly identifies KS D 3504:2021. Section 4 on page 2 reproduces all eight
existing designation/diameter/area tuples exactly, confirmed by text extraction and visual review.
Only the source URL, page locator and displayed access date change. Existing bar snapshots,
numeric catalog values, material/profile selection, persistence and calculations are unchanged.
Downloaded evidence is kept under ignored `outputs/rebar-catalog/source-check/`.

### Source footer follow-up, 2026-10-29

All ten catalog tabs and 101 dimensional rows are retained. The source footer shows only the
publisher link on one row, with ellipsis when necessary. Its native link tooltip retains the full
publisher, table/page locator and access date. Shared typography, dialog width, selection behaviour
and dimensional values are unchanged. The production-browser harness checks every source row at
desktop and narrow widths and captures the longest publisher link in both themes.
Both mechanics pass these browser checks: all ten source rows remain 18px high at desktop and
360px viewport widths, with the dialog still 520px / 328px respectively. No browser errors occur;
the unchanged-surface and exact Excel round-trip assertions also pass. The KS source link opens
the public Daehan KS D 3504 summary in Google Drive, and its tooltip exposes the new access date
without changing the dates of other sources. Evidence uses `outputs/rebar-catalog/source-check/`
and the catalog browser evidence/screenshots.
Final follow-up gates pass: structure, typecheck, the focused catalog/persistence cases, full
`npm test` (386 unit cases plus all integration suites), production build and unchanged bundle
budgets. This source/presentation change does not change numeric, schema or report contracts.
