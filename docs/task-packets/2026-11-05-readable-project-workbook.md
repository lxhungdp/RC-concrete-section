# Engineering-facing project input workbook

Subsequent presentation update: the [project spreadsheet dialog task](2026-11-05-project-spreadsheet-dialog.md)
supersedes the earlier visual styling with dark-blue input text only, without cell fills or bold
headings. The first-format schema and this packet's historical input/round-trip evidence remain
unchanged; current presentation checks are recorded in that follow-up packet.

Status: implemented; software verification passed on 2026-11-05. Class 3 input-contract/pipeline
change; Preview. Independent engineering/release approval remains open.

Objective: implement the user's requested Project XLSX redesign. Each input area has a clear sheet;
labels use concise engineering names/symbols, input values are blue, and machine property paths and
noneditable format/version/provenance rows are absent from the worksheets. All applied inputs,
input options and source units remain complete. Camera/chart state and report selection are excluded.

Requirements: ENG-LOAD-001, ENG-REP-002, UNITS-001..006, DEV-ARCH-002/003/007, development/02 section
10 and the active-input inventory. Authorities are the control map, engineering/02, development/01,
/02, /04 and /17. No material formula, code coefficient, resistance rule or acceptance policy changes.

Owner: `@pm/spreadsheet/project-xlsx`; the web project adapter is a thin re-export. The existing
typed field parser is factored into a private package codec, preserving the concurrent
mc/Ec visibility change. The user explicitly declares this the first workbook v1: no old Excel format
reader, migration, or v5-v8 compatibility is implemented. Native JSON schema versions remain unchanged.
One owning JSON parser bug is repaired: explicit KDS Appendix minimum-eccentricity inputs must not
be overwritten by defaults. Declared capability, finite/range and override-reason checks remain.
The spreadsheet adapter reuses the installed inward material/design owners; no external dependency
is added. Runtime exports continue to use the repository ExcelJS
adapter; spreadsheet skill guidance and Artifact Tool are used for disposable layout inspection.

Contract: writer v1 uses Project, Section, Rebar, Material, Loadings, Load reference, Options,
Resistance and Units. All are engineering-facing. Units is the one source declaration; table/field
unit labels are validated against it. Analysis is replaced by input-only Options. The existing raw
schema is reconstructed in memory and passes through the strict transport/project validators.
Each boundary performs one XLSX parse or serialization. Indexed field contexts, labels and rebar
provenance avoid repeated full-list lookup. No second workbook file or calculation kernel is maintained.

Necessary readonly identity/version/provenance and saved compatibility values are kept in workbook
properties, never an editable JSON backup. They contain no copy of an editable input value and
cannot override an input cell. No workbookFormat/workbookVersion rows are stored. The one workbook
format/version marker is a document property, required to choose the explicit reader. Aliases for
equal material law/boundary fields store binding paths only, not duplicate values. Non-equal active
bounds remain distinct, meaningfully labelled inputs. Inactive concrete mc/Ec remain compatibility
data, not editable controls. Plateau/bilinear steel yield-snapshot presence is bound to the material
compiler, so fy/Es edits do not restore a stale derived value. Resistance overrides consume the
design owner's modified/reason policy. Missing required v1 input rows/configuration fail before JSON
defaults can silently change the project. Optional clears are explicit; copied records retain the
existing ID/area-source semantics.

Allowed files: spreadsheet package project-workbook modules/exports/tests; thin web adapter and
focused tests; the project parser and regression for explicit eccentricity-input preservation;
current persistence/architecture/active-input docs and traceability. Existing local
authoring, display-units, skill and report changes are preserved.

Blocking failures: missing metadata/input groups, duplicate/conflicting fields, unreadable labels,
unknown field/type/model/unit, conflicting source unit labels, invalid references/topology, nonfinite
values, resource limits, metadata shadowing or verified-status promotion. No tolerance or oracle is
relaxed. Only the declared first format is accepted; no guessed version/model/unit fallback.

Independent oracles: canonical fixture leaf equality over all profiles, both mechanics and modes;
existing first-format rejection cases; direct numeric/option edits; hidden compatibility and independent
physical-bound preservation; missing/conflicting input mutations; independent XLSX/XML/CRC reading;
Artifact Tool rendered inspection. Nonzero input-origin roundoff retains the existing qualified
contract. No UI state is added to project JSON.

Gates: structure, docs/traceability/typecheck; focused package and facade tests; full npm test,
production build/bundle; relevant pipeline/fingerprint evidence for unchanged canonical inputs.
Native Excel and independent engineering/release review are reported only if actually executed.

Out of scope: calculation/audit report workbook redesign, Gridcraft modal behavior, kernel/profile
updates, project JSON schema changes, runtime-result storage, new external dependencies, commits or pushes.

## Delivered contracts and impact

- `packages/pm-spreadsheet/src/project-xlsx.ts` owns the public builder/importer. Private
  `project-workbook-fields.ts` owns labels, input activation and bindings;
  `project-workbook-codec.ts` owns the explicit typed field/table normalization. The web adapter
  only re-exports the package API. Package exports/lockfile declare the existing inward material
  and design owners at 0.1.0; no external package/version is added.
- Shared quantity encoding is factored into a pure helper without changing its conversion or
  precision-note policy. Stored As, load origin, source units, IDs and validation remain owned by
  their existing packages. The format has no earlier Excel reader or editable input backup.
- Native project schema versions are unchanged. The owning JSON parser now preserves supplied
  Appendix minimum-eccentricity inputs instead of replacing them with defaults, validates them,
  and rejects an unsupported profile declaration. Valid overrides may therefore change a reopened
  demand check to reflect the values already authored; no eccentricity equation is changed.
- Required mesh/check-basis controls are checked independently of metadata presence claims.
  Missing inputs, dormant/mismatched model/format fields, conflicting units, formulas, invalid
  physical caps, metadata shadows and verification promotion fail without partial application.
  An explicit optional physical-cap clear removes that cap. Coherent peak/cutoff, mesh,
  direction-list and Fixed-to-Adaptive edits are covered.
- Existing layout-specific tests are moved to the package's first-format contract, with the web
  facade and independent rebar-area pipeline retained. No numerical oracle, tolerance, baseline
  or acceptance classification is changed.

## Verification evidence

The working checkout includes unrelated local authoring/report changes. These were preserved;
software gates assess the combined checkout, not an isolated release commit. Disposable evidence
is under ignored `outputs/project-workbook-v1/`.

| Check | Result |
|---|---|
| Focused owner/project/facade/unit/rebar tests | 60 passed |
| `npm test` | Passed: 722 unit tests, 5 ADSEC tests, 11 CAD tests, JSON round trips, both calculation workbooks, demand-check workbook and PDF integration checks |
| Structure, documentation, traceability and strict typecheck | Passed through the full test gate; final documentation checks rerun after this record |
| 104 export/import cases, all profiles/both mechanics and multiple source-unit selections | No failures or missing inputs. 100 exact canonical leaf round trips; four nonzero-origin cases retain the documented binary64 moment roundoff, at most 1.1920928955078125e-7 Nmm |
| `npm run bench:verify` | Exact baseline comparison passed: 8 sections × 24 capacity quantities, no bit changed. Used installed Node 24.20.0, npm 11.19.0 and the baseline's Windows/x64 V8 runtime; no provenance/tolerance bypass |
| `npm run bench:pipelines` | Passed, five block pipeline cases, no failures |
| Production build and `check:web-bundle` | Passed using isolated `apps/web/dist/project-workbook-v1-next`; initial/Plotly/worker/Excel gzip 353.1/1325.4/69.2/248.1 KiB, within unchanged budgets |
| `npm run check:security` | Passed the high-severity gate; the existing two moderate ExcelJS/uuid advisories remain, with no dependency version change |
| Independent ZIP/XML inspection | Both generated and native-saved samples pass CRC/XML, nine visible sheets, plain-value, 8-digit ARGB and input/property separation checks |
| Artifact Tool layout review | All nine sheets rendered and inspected; readable Greek/unit labels, blue input values, fitted text and clear topic tables |
| Native Microsoft Excel | Excel 16.0 build 20527 opened and saved separate US-unit/hardening and custom-curve samples; reimport preserved every project input and identity field exactly |

The initial default-runtime fingerprint attempt was rejected by provenance validation; the final
comparison used the installed matching runtime. Sandbox-only Next.js directory/Excel COM and npm
network restrictions were resolved with the authorized local build/native QA and online audit.
The user's running development server and active workbooks were not used or stopped.

Remaining limits: native save coverage is two representative workbooks in this Excel version,
not every spreadsheet application. The format requires its v1 identity and plain evaluated input
values. Nonzero-origin roundoff remains qualified as above. Stage 1 scope, Preview/draft status,
independent numerical/structural review and accepted-result/released-report gates are unchanged.
