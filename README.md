# P-M Column Designer

Modular web platform for reinforced concrete column section geometry and future P-M-M capacity analysis.

## Project Structure

```text
apps/
  web/                    Next.js application

packages/
  cad-drawing/            Reusable CAD drawing foundation adapted from the develop/frame reference
  pm-geometry/            Geometry data model and polygon calculations

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

## Commands

```bash
npm run dev
npm run typecheck
npm run build
```
