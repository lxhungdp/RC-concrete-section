# Realistic reinforced-section examples

These four schema-v1 projects replace the former simplified equivalent-stress examples in the UI.
Dimensions are in mm. The layouts are illustrative engineering examples, not project-specific
detailing approval.

| File | Section and reinforcement | Bars | As/Ac | Minimum clear distance from concrete face to longitudinal bar |
| --- | --- | ---: | ---: | ---: |
| `KDS-REAL-01-chamfered-hollow.pm-project.json` | 1800 x 1200 chamfered box, 350 walls, outer and inner D25 cages | 44 | 1.369% | 62.5 mm |
| `KDS-REAL-02-chamfered-two-circular-voids.pm-project.json` | 4200 x 1600 chamfered section, two 950 diameter voids, outer D29 cage and D25 void cages | 82 | 0.917% | 62.5 mm |
| `KDS-REAL-03-h-section.pm-project.json` | 1800 x 2000 H-section, 350 flanges, 400 web, two flange layers and paired web rows of D29 | 42 | 1.559% | 65.5 mm |
| `ACI-REAL-04-circular-annulus.pm-project.json` | 2000 outside diameter, 900 inside diameter, outer and inner D29 circular cages | 36 | 0.950% | 60.5 mm |

The generator verifies that every bar centre is in concrete, clear cover is at least 60 mm, clear
bar spacing is at least 40 mm, `As/Ac` is between 0.8% and 2.5%, the project parser emits no warnings,
the equivalent-block surface is closed, and all included ULS load combinations solve inside it.

Regenerate with:

```powershell
node --import tsx tools/fixtures/generate-realistic-section-examples.ts
```
