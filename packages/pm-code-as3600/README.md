# `@pm/code-as3600`

Preview AS 3600:2018 (incorporating Amendments 1 and 2) equivalent rectangular
stress-block adapter. It owns the code coefficients and capacity-reduction policy;
geometry clipping, surface construction and inverse solving remain code-neutral.

This route is deliberately labelled `draft/unverified`. It does not cover member
slenderness, minimum eccentricity, second-order effects, confinement or the 5%/10%
shape reductions that require an explicit AS section classification.

Research basis:

- Standards Australia, AS 3600:2018 and Amendments 1–2 identity; companion
  commentary AS 3600:2018 Sup 1:2022:
  <https://www.standards.org.au/news/revised-document-to-help-industry-prepare-for-earthquakes>
- NCC 2022 adopted-reference register confirming the 2018 edition incorporating
  Amendments 1 and 2:
  <https://ncc.abcb.gov.au/editions/ncc-2022/adopted/volume-one/preface/list-amendments-ncc-2022-volume-one>
- ABCB, *Handbook: Structural Reliability Verification Method*, used as an
  independent public calculation reference for the rectangular stress block:
  <https://ncc.abcb.gov.au/sites/default/files/resources/2022/Handbook-structural-reliability.pdf>
- Chowdhury & Loo, *The New Australian Concrete Structures Standard AS 3600:2018*,
  used to cross-check the published coefficient and capacity-factor equations:
  <https://research-repository.griffith.edu.au/bitstreams/23852b70-2023-431d-a040-887784b9c790/download>
