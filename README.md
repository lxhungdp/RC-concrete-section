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

KDS current-set and ACI 318-19(22) equivalent-block profiles are implemented as draft previews.
Nominal, Design, and factored ULS Demand are separate result stages. See
[`docs/12-calculation-models-defaults-and-workflows.md`](docs/12-calculation-models-defaults-and-workflows.md)
for formulas, workflow, fields, defaults, and benchmark evidence.

The current web app has four top-level workspaces: `Geometry`, `Materials`, `Results`, and
`Analysis Options`. Report generation is not a separate workspace. The result-calculation Excel
workbook currently supports the stress-strain pipeline only; equivalent-block results deliberately
block that export until a dedicated block-ledger workbook exists. The Section-mesh Excel/DXF audit
also applies only to stress-strain integration because the block kernel has no concrete integration
mesh.

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
packages/pm-analysis-equivalent-block/  Project/result bridge for block profiles
packages/pm-report/               Stress-strain result workbook and stress-strain mesh Excel/DXF
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

`npm test` runs typecheck, unit/integration suites, CAD tests, canonical schema-v1 round trip, the
historical workbook regression fixture, and formula-recalculated Excel-export verification.

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

Every dependency is pinned and CI uses the lockfile. Reference workbooks are regression oracles,
not design-code authority.

## Current v1 conventions and known blocker

- The project DTO stores `My` but does not enforce a resultant sign formula. The stress-strain
  backend and its workbook use `My = sum(F*x)`; the equivalent-block backend uses
  `My = -sum(F*x)`. The bridge and UI pass `My` through unchanged. Nonzero-`My` block results,
  especially for asymmetric sections, therefore remain preview-only until one convention is chosen
  or an explicit boundary transform is implemented and regression-tested.
- All current persisted calculation contracts are v1: project version 1, design-basis version 1,
  analysis-options version 1, `strain-domain-surface-v1`, `equivalent-block-surface-v1`, and v1
  station schedules. There is
  no migration or backward-compatibility layer. Omitted-field defaults and steel-ID repair are
  documented as parser behavior within v1.
