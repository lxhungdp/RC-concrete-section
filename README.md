# P-M Column Designer

Modular web platform for reinforced concrete column section geometry and future P-M-M capacity analysis.

## Project Structure

```text
apps/
  web/                    Next.js application

packages/
  cad-drawing/            Reusable CAD drawing foundation adapted from the develop/frame reference
  pm-ids/                 Shared positive-integer entity id helpers (gap-fill)
  pm-geometry/            Geometry data model and polygon calculations
  pm-materials/           Material definitions, stress-strain compile pipeline, model support gates
  pm-project/             Versioned project JSON document (geometry, materials, loadings, …)
  pm-analysis/            Preview P-M-M kernel: fibres, stations, surface, slicing, inverse solve
  pm-report/              Excel workbook export built from the analysis kernel

docs/
  engineering/            Structural-engineering scope, conventions, acceptance, and governance
  development/            Package, pipeline, API, testing, and AI coding instructions
  01...11                 Detailed mathematical, numerical, and V&V references

data/
  excel/                  Original Excel calculation workbooks used as references
```

## Documentation

Start at [`docs/00-README.md`](docs/00-README.md). Engineering rules and programming rules are kept
as separate instruction groups; source code and reference spreadsheets do not override them.

## Current App

The current working slices are Geometry and Materials input:

- 2D polygon section input
- smooth pan and pointer-centered zoom
- fixed-size labels, dimensions, handles, and toolbar controls
- light/dark theme tokens aligned with the referenced `develop/frame` platform
- separate geometry package for later use by the P-M-M calculation kernel
- concrete and steel definition editors with preview stress-strain curves
- toolbar Import / Export JSON for the full project input document (`@pm/project`)

Loadings has a persisted seed contract but its UI is still a placeholder. The analysis kernel,
accepted Results workflow, and Excel/PDF Report workflow are not yet implemented; current output is
input/preview only.

## Commands

```bash
npm run dev
npm run typecheck
npm run test
npm run build
```

`npm test` runs the typecheck, the `node --test` unit suites, the `cad-drawing` suite, and the three
verification fixtures (project round trip, P-M stations vs the reference workbook, Excel export
re-evaluated through HyperFormula). All of it runs on every pull request via
[`.github/workflows/ci.yml`](.github/workflows/ci.yml). Every dependency is pinned to an exact
version and `npm ci` enforces the lockfile, so a result-relevant build is reproducible.

## Analysis gates

The kernel fails closed rather than substituting a plausible value:

- a rebar referencing a steel material that does not exist is a typed `MISSING_STEEL_MATERIAL` error
  instead of a bar that silently contributes nothing;
- the ACI Whitney block is rejected as `UNSUPPORTED_CONCRETE_MODEL` until it has a resistance-level
  adapter, because `β1` never reaches the fibre stress evaluation;
- a mesh over its cell budget, an empty concrete region, or a mesh that fails its own area and
  first-moment checks are `MESH_RESOURCE_LIMIT`, `EMPTY_CONCRETE_SECTION` and `MESH_NOT_VERIFIED`
  rather than a capacity surface built from the reinforcement alone;
- an inverse solve reports `converged` and `admissibility` separately, and `ok` requires both;
- every surface names the ultimate strain domain it was built on, and flags a material law that
  belongs to a different one.

## Numerical uncertainty

Every surface reports `directionError`: how much it still depends on how coarsely the strain-plane
directions were sampled, measured by evaluating the true state between two sampled directions. On
the benchmark sections this is 1–16% in moment — thirty times the integration-mesh error — and it is
always conservative. Refinement is available and off by default, so no result moves unless asked.
See [`docs/06`](docs/06-mesh-sizing-and-convergence.md) §4.1 and §5.1 for the measured tables.

## Benchmarks

```bash
npm run bench           # 8 sections, one process each, min-of-N per stage
npm run bench:verify    # bit-identity gate against the committed capacity fingerprint
npm run bench:record    # regenerate that fingerprint after a deliberate engineering change
```

`bench:verify` runs in CI. It compares 24 capacity quantities across 8 sections at full double
precision and fails on a single changed bit; a 1-in-10¹² perturbation of the concrete law is enough
to trip it. Solver iteration-path diagnostics are reported separately, since an improved Jacobian is
meant to move them.
