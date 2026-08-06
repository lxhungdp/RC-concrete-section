# Equivalent-block import projects

This directory contains import-ready schema-v1 projects for auditing the equivalent rectangular
stress-block pipeline. Use **Import project JSON** in the application, then open **Results** and
inspect the Vertical Slice at 0°, 90°, 180° and 270°.

Each numbered KDS/ACI pair has identical geometry, reinforcement and characteristic material
strengths. Only the calculation profile, code-derived material parameters and design-resistance
rules differ.

| Pair | Geometry | KDS project | ACI project |
| --- | --- | --- | --- |
| 01 | 400 × 500 mm rectangle, 8 bars | `KDS-EB-01-rectangle-8-bars.pm-project.json` | `ACI-EB-01-rectangle-8-bars.pm-project.json` |
| 02 | 600 × 500 mm hollow rectangle with a 260 × 180 mm void, 8 bars | `KDS-EB-02-hollow-8-bars.pm-project.json` | `ACI-EB-02-hollow-8-bars.pm-project.json` |
| 03 | Non-convex L-shaped section, 8 bars | `KDS-EB-03-l-shape-8-bars.pm-project.json` | `ACI-EB-03-l-shape-8-bars.pm-project.json` |
| 04 | Two disconnected concrete regions, 8 bars | `KDS-EB-04-two-islands-8-bars.pm-project.json` | `ACI-EB-04-two-islands-8-bars.pm-project.json` |

## Common inputs

- Concrete characteristic strength: 40 MPa.
- Reinforcement yield strength: 420 MPa; elastic modulus: 200,000 MPa.
- Every bar has an exact area of 400 mm²; its stored diameter is
  `sqrt(4 × 400 / pi) = 22.5675833419 mm`.
- Equivalent-block production sampling: shared `unified-22-v1` 22 fixed stations, 36 fixed seed
  directions, and Design-only adaptive station/direction tolerance of 0.75%.
- Each project includes three factored ULS audit loads generated from evaluated design states:
  one oblique neutral-axis ray and two cardinal neutral-axis rays at 0° and 90°.
- Resultants use the shared project convention `Mx = ΣF(y-yc)`, `My = ΣF(x-xc)`. The audit-load
  `My` components were regenerated with that convention; their physical rays, load factors, and
  utilization values are unchanged from the legacy block-sign fixtures.

## Automated acceptance

`packages/pm-analysis-equivalent-block/test/integration.test.ts` parses all eight files, rebuilds
their production design surfaces, verifies closed cardinal Vertical Slices (including angles just
to either side of 90°, 180° and 270°), and solves all 24 included load combinations.

The files are reproducible with:

```powershell
npm.cmd exec -- tsx tools/fixtures/generate-equivalent-block-examples.ts
```
