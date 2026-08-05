# P-M Column Designer

Modular TypeScript application for reinforced-concrete column-section P-M-M analysis and design
preview.

## Implemented calculation models

The project contains two independent numerical pipelines:

- **stress-strain integration**: compatible strain plane, concrete/steel material laws, verified
  triangle/quadrature mesh, consistent tangent, Newton inverse solve;
- **equivalent rectangular stress block**: exact polygon clipping of `a = beta1 c`, code-owned
  block stress and strain limits, independent forward/inverse/surface algorithms.

The current stress-strain default is 25 stations with nine mandatory code-aware transition nodes,
36 uniform seed directions, and adaptive angular refinement to a 0.5% target. The equivalent-block
default is independent: 37 initial neutral-axis states, bar-controlled code/rupture event stations,
24 seed directions, and 0.75% adaptive station and direction refinement.

The Materials workflow now selects `Code -> calculation method -> concrete model`. KDS exposes both
implemented mechanics, ACI exposes its implemented equivalent block, and EN 1992-1-1:2004 exposes a
design-material stress-strain preview with an explicit no-National-Annex/strain-domain warning. AS
3600 is registered but disabled until the exact 2018 Amendments 1 and 2 rules are mapped from licensed
text. Legacy `Custom` profile files remain readable, while new user customization is a concrete-model
choice under a Code and is reported as a modified profile.
Nominal, Design, and factored ULS Demand are separate result stages. See
[`docs/12-calculation-models-defaults-and-workflows.md`](docs/12-calculation-models-defaults-and-workflows.md)
for formulas, workflow, fields, defaults, and benchmark evidence.

The current web app has five top-level workspaces: `Geometry`, `Materials`, `Section Results`,
`Demand Check`, and `Analysis Options`. `Section Results` owns the resistance surface and its
presentation; `Demand Check` owns the load combinations checked against it. Report generation is not
a separate workspace: `Demand Check` exports the PDF design report, choosing per combination which
ones get a full worked calculation. Each mechanics has its own result-calculation Excel workbook — a fibre ledger
for stress-strain integration and a block ledger for the equivalent block. The Section-mesh
Excel/DXF audit applies only to stress-strain integration because the block kernel has no concrete
integration mesh.

## Project structure

```text
apps/web/                         Next.js application and section editor
packages/pm-geometry/             Geometry, clipping, and integration mesh
packages/pm-materials/            Persisted material definitions and compiled laws
packages/pm-project/              Version-locked project schema v1 and analysis/profile DTOs
packages/pm-design/               Resistance profile identity, factors, and transition rules
packages/pm-analysis/             Stress-strain forward/inverse/surface kernel
packages/pm-equivalent-block/     Standard-independent rectangular-block kernel
packages/pm-code-kds142020/       KDS 14 20 20 block adapter
packages/pm-code-aci318/          ACI 318 Whitney-block adapter
packages/pm-code-custom/          User-defined block adapter; derives nothing from a code table
packages/pm-analysis-equivalent-block/  Project/result bridge for block profiles
packages/pm-report/               Result workbooks (both mechanics), mesh Excel/DXF, and the PDF report
docs/engineering/                 Structural-engineering meaning and acceptance rules
docs/development/                 Package, schema, UI, test, and release instructions
```

Start documentation at [`docs/00-README.md`](docs/00-README.md). The repository is a development
preview, not a certified design product; code-profile status and release gates are explicit in the
reports and documentation.

## Commands

```bash
npm run dev
npm run typecheck
npm run test
npm run build
npm run bench:strain-sampling
npm run bench:equivalent-block
npm run bench:pipelines
npm run bench:verify
```

`npm run test:pdf-report` builds the PDF report for both mechanics and checks its structure, its
agreement with the kernel, and that the same input produces byte-identical output.

`npm run test:excel-block` recalculates the equivalent-block workbook in an independent formula
engine and reconciles the shoelace recomputation of the clipped compression polygon, the ledger and
the sheet's own φ interpolation against the block kernel.

`npm test` runs typecheck, unit/integration suites, CAD tests, canonical schema-v1 round trip, the
historical workbook regression fixture, and formula-recalculated Excel-export verification for both
the stress-strain and the equivalent-block workbook.

`bench:equivalent-block` exercises the production KDS/ACI block configuration, exact inverse
refinement, fixed-axial queries, topology, admissibility, and batch surface reuse.

`bench:strain-sampling` compares the legacy 19 x 24 fixed grid, the new 25 x 36 fixed grid, and the
production adaptive configuration against a 144-direction/33-transition-node reference. On the
five-fixture 2026-08-04 run, worst 3D ray error improved from 7.800% to 0.521%; every production case
converged and every sampled demand ray intersected the surface.

## Fail-closed analysis gates

- Missing steel material references are typed fatal errors.
- A fiber/material request for an ACI Whitney law is rejected because the Whitney block belongs to
  the equivalent-block pipeline; selecting the ACI equivalent-block calculation profile routes to
  the implemented adapter instead.
- Mesh resource limits, empty concrete, and failed area/first-moment self-checks cannot produce a
  stress-strain surface.
- Inverse convergence and strain admissibility are reported separately; success requires both.
- A faceted-surface fallback is explicitly approximate and is never promoted to a converged
  equilibrium state.
- Adaptive surfaces record effective directions, passes, error estimate, tolerance status, and any
  cap reached.
- A global resistance factor is applied once to the complete resultant ledger; factored demand is
  not reduced again.
- EN material partial factors have one canonical owner in `DesignBasis`; Materials edits that source
  and displays derived `fcd/fyd`, while Design Resistance shows the same values read-only.

Every dependency is pinned and CI uses the lockfile. Reference workbooks are regression oracles,
not design-code authority.

## Current v1 conventions

- A `Custom` profile is not a code check. It is reported as `user-defined`, never `draft`, and
  carries no clause traceability; whoever declares `beta1`, the block stress factor, `epsCu`, the
  `phi` factors and the transition rule owns their justification.
- The project-wide resultant convention is `Mx = sum(F*(y-yc))` and
  `My = sum(F*(x-xc))`. Stress-strain, equivalent-block, the DTO, plots, reports, and both Excel
  exports use the same signs. Asymmetric-section regression tests cover the concrete and steel
  ledgers so a future sign drift fails visibly.
- All current persisted calculation contracts are v1: project version 1, design-basis version 1,
  analysis-options version 1, `strain-domain-surface-v1`, `equivalent-block-surface-v1`, and v1
  station schedules. There is
  no migration or backward-compatibility layer. Omitted-field defaults and steel-ID repair are
  documented as parser behavior within v1.
