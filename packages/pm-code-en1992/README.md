# `@pm/code-en1992`

Code-owned EN 1992-1-1:2004 material and ULS policy used by the generic fibre
pipeline. The package is intentionally independent of UI, project persistence,
meshing and reporting.

The implemented profile uses the recommended values without a National Annex and
is published by the application as `preview/draft`, not as a verified design route.

`EN1992_RECOMMENDED_ULTIMATE_STRAIN_FACTOR = 0.9` is the explicitly named recommended-value
preview choice from EN 1992-1-1:2004 §3.2.7(2). The material layer constructs the immediate inclined
steel branch from the declared characteristic ratio/strength and `epsUk`; each resistance stage
keeps `Es` unchanged and reconstructs the slope through its own yield/construction ordinates.
The construction strain and design cutoff are distinct. `EN1992_CLASS_B_REFERENCE` records the
Annex C Table C.1 Class B lower-bound pair, as presented by JRC/Walraven (22 February 2008,
[page 23](https://eurocodes.jrc.ec.europa.eu/sites/default/files/2022-06/EN1992_1_Walraven.pdf#page=23),
accessed 2026-11-03). Project authoring uses that pair as an editable starter curve, without
qualifying the supplied steel grade. This preview does not resolve a project's jurisdiction or
National Annex; endpoint values still require project material review.

Research basis:

- EN 1992-1-1:2004, clauses and Table 3.1 named in the adapter provenance.
- European Commission JRC, *Eurocode 2: Background & Applications — Design of
  Concrete Buildings, Worked Examples*:
  <https://eurocodes.jrc.ec.europa.eu/publications/eurocode-2-background-appications-design-concrete-buildings-worked-examples>
- JRC Eurocodes Nationally Determined Parameters database and implementation guidance:
  <https://eurocodes.jrc.ec.europa.eu/>
