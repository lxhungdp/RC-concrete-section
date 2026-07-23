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
  pm-materials/           Material definitions and stress-strain compile pipeline
  pm-project/             Versioned project JSON document (geometry, materials, loadings, …)

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
