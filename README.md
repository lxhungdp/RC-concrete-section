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
  specs/                  P-M-M algorithm specifications and calculation workflow notes
  research/               Product, repository, and drawing-platform research

data/
  excel/                  Original Excel calculation workbooks used as references
```

## Current App

The first working slice is the geometry editor:

- 2D polygon section input
- smooth pan and pointer-centered zoom
- fixed-size labels, dimensions, handles, and toolbar controls
- light/dark theme tokens aligned with the referenced `develop/frame` platform
- separate geometry package for later use by the P-M-M calculation kernel
- toolbar Import / Export JSON for the full project input document (`@pm/project`)

## Commands

```bash
npm run dev
npm run typecheck
npm run test
npm run build
```
