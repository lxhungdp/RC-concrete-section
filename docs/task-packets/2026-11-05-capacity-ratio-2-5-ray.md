# Capacity Direct-beta ray at strain ratio 2.5

Presentation annotation, Class 1. Add the stored epsilon_s/epsilon_y = 2.5 state to the existing
key-ray/key-label selection alongside 0 and 1. Reuse the existing ray style and source coordinates
for Design, Nominal-only and opposite branches. Numerical states and resistance factors retain
their existing owners. An absent criterion remains absent rather than being interpolated into a
fabricated physical state. The standard Fixed 27-station schedule includes 2.5; custom/adaptive
schedules can omit it.

## Meaning and source review

The coefficient discussed is phi. The current KDS Main-body profile resolves the tensile limit
as 0.005 at fy <= 400 MPa and 2.5 epsilon_y at higher yield strengths. For its SD400 / 200000 MPa
example, epsilon_y = 0.002 and 0.005/0.002 = 2.5. Other steel definitions, overrides and code
profiles need their own declared transition rule. The ray is labelled as a strain ratio without
claiming a universal phi boundary. The KDS compression factors are 0.65 for other reinforcement
or 0.70 for qualifying spirals, with tension factor 0.85.

Owners and provenance are engineering/04 section 5, root 11 section 6, and the KDS adapter and its
boundary tests. Official sources consulted on 2026-11-05 are KDS 14 20 10 section 4.2.3 and
KDS 14 20 20:2022 section 4.1.2 through the KCSC viewer. Search indexing reproduced the factor
table, while the viewer did not expose readable clause text to the web reader. No new normative
value or code-profile change is introduced by this annotation task.

## Verification

Passed `npm run check:structure`, `npm run typecheck`, the 12 focused KDS/direct-moment tests,
and `npm test` (683 unit tests, 5 AdSec tests, CAD, workbook and PDF checks). The isolated web
production build (`npm run build -w @pm/web`) and `npm run check:web-bundle` passed.

Browser checks passed on the KDS stress-strain complex-section and equivalent-block rectangle
fixtures. In both themes, Design and Nominal-only views expose the three labels 0, 1 and 2.5;
every broken ray connects the origin to the exact stored key-marker coordinates. Opposite-branch
coordinates remain negative, and all stored curve coordinates/custom data are identical after
the visibility/theme round trip. Four screenshots were inspected. Evidence and the temporary
browser harness are under `outputs/ratio-2-5/`.

The root `npm run build` gate remains blocked before Next.js by an unrelated in-progress
Gridcraft artifact/source checksum mismatch (`tools/gridcraft/patch.mjs`). The artifact was not
rebuilt or its checksum bypassed. The web build above verifies this presentation patch, but does
not turn that root gate into a pass. No numerical, persistence, report, or schema contract changed.
This is UI verification of development-preview results, not independent engineering certification.
