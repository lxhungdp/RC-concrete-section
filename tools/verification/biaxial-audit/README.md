# Biaxial P-M audit oracle

Independent re-check of the production `P-Mx-My` Design surfaces and the KDS Appendix minimum
eccentricity rule. Record and findings:
[2026-11-11 biaxial P-M audit](../../../docs/task-packets/2026-11-11-biaxial-pm-audit.md).

```text
npm run verify:biaxial-audit                  # all gated rows decide the exit status
npm run verify:biaxial-audit -- --gate F-01   # only the listed row IDs decide it
npm run verify:biaxial-audit -- --only F-01   # compute only the listed rows (fast re-check)
```

Runtime is about eight minutes; the command is not part of `npm test`. A JSON copy of every row
and a Markdown summary are written to `outputs/biaxial-audit/latest.json` and `latest.md`
(git-ignored).

## What is independent

`oracle.ts` imports nothing from the production packages. For a strain plane with gradient
`g = (cos theta, sin theta)` and neutral-axis depth `c`, the concrete stress depends only on
`s = g . p`, so every resultant is a one-dimensional integral of stress times the section chord
length `w(s)` and chord first moment `m(s)`. Between vertex projections and material breakpoints
`w` is linear and `m` quadratic, so three-point Gauss-Legendre integrates the n = 2 KDS parabola
and a constant block stress exactly. Holes use the even-odd crossing rule. Bars are point areas
with the displaced concrete removed. `phi` is written from root 11 §6.1 (KDS) and §8 (ACI).

The reference Design surface has two pole fans and a ring of rows. Rows start at 720 uniform
directions and every interval is bisected while the true midpoint row deviates from the chord by
more than 5e-4 in any component, each normalised by its own maximum, over 781 depth states. Chord
errors across a bar entering the stress block are skipped because that step does not shrink with
refinement. A second oracle at half resolution in every coordinate estimates the reference error.
Rays use a bounding-volume hierarchy and the exact first crossing, then the code axial cap.

`audit.ts` builds the production surfaces through the public package APIs with the default Fixed
or Adaptive options and the production mesh settings.

## Rows

| ID | Gate | Meaning |
|---|---|---|
| C-1 | yes | forward resultants, production vs oracle, at sample states (fibre <= 1e-3, docs/06 §6; block <= 1e-9) |
| O-1 | yes | reference vs half-resolution oracle difference <= 0.5 %; it is added to every F-02/F-03 error |
| F-01 | yes | governing concentric Appendix UR equals the worst of the four signed `e_min` candidates |
| F-02 | yes | Fixed capacity over-prediction on a 33 x 72 ray fan stays inside `1/(1-u) - 1`, u = 2 % |
| F-03 | yes | Fixed capacity under-prediction stays below the documented 4.0 % Fixed envelope (docs/12 §6), except the F-08 region |
| F-04 | open | rays whose oracle capacity lies outside the Adaptive interval |
| F-05, F-06 | open | engine value beside an UNVERIFIED clause hypothesis |
| F-07 | open | fibre maximum axial design strength against `0.80 phi P0` |
| F-08 | open | Fixed under-prediction on oracle facets beyond `eps_s/eps_y = 10` (the schedule tension end) |

A pass is code/solution evidence for the declared laws and sampling. It is not design-code
verification, validation, or acceptance of any result.
