# 10 — References, Traceability, and v1→v2 Decision Record

Access review date: **2026-07-23**.

This file records the sources used to shape the generic architecture. It does not reproduce
licensed design-code provisions. A production code adapter must add its own clause-level normative
traceability and approved example set.

## 1. Normative design standards

### Korea

- KDS 14 20 10 official KCSC viewer; 4.2.3 defines the basic nominal-strength times
  strength-reduction-factor method:
  <https://www.kcsc.re.kr/standardCode/viewer/KDS%2014%2020%2010:2022-01-11>
- KDS 14 20 20:2022 official KCSC viewer; the Appendix defines the alternative
  design-material-strength method, including material coefficients `0.65` for concrete and `0.90`
  for reinforcement and prestressing steel:
  <https://www.kcsc.re.kr/standardCode/viewer/KDS%2014%2020%2020:2022-01-11>
- KDS 14 20 00 family, partial amendment effective 2025-01-05 under the Ministry of Land,
  Infrastructure and Transport notice shown by the Korean National Law Information Center:
  <https://www.law.go.kr/LSW/admRulLsInfoP.do?admRulId=76344&efYd=0>

The KDS adapter must identify the exact subordinate document(s), edition/amendment, Korean national
requirements, material applicability, and clause references actually used. A family-level amendment
does not by itself prove that KDS 14 20 20 (flexure and compression) changed; inspect the official
promulgation package and the applicable subordinate-file revision. The generic
`kdsParabolaConcrete` example from v1 is not a verified KDS implementation.

### United States / ACI

- ACI CODE-318-25, *Building Code for Structural Concrete — Code Requirements and Commentary*,
  current ACI listing and edition metadata:
  <https://www.concrete.org/publications/typesofpublications/standards%28codesandspecs%29/suiteofcodes.aspx>

ACI 318-19(22) and ACI 318-25 are distinct adapter identities. Project jurisdiction may adopt a
different edition, so "latest" is never selected implicitly.

- ACI official technical Q&A reproducing ACI 318-19(22) Table 21.2.2 for moment, axial force, and
  combined P-M:
  <https://www.concrete.org/publications/getarticle.aspx?m=icap&pubid=51740277>

### Europe / Eurocode

- European Commission/JRC overview of Eurocode 2:
  <https://eurocodes.jrc.ec.europa.eu/EN-Eurocodes/eurocode-2-design-concrete-structures>
- European Commission/JRC guidance on national standards and National Annexes:
  <https://eurocodes.jrc.ec.europa.eu/en-eurocodes-implementation/national-standards>

An EN 1992 profile must lock the exact part/edition and National Annex. Partial material factors
must not be replaced by KDS/ACI values or by a universal final resultant factor.

## 2. Computational credibility and software V&V

- ASME V&V 10-2019 (R2025), *Standard for Verification and Validation in Computational Solid
  Mechanics*:
  <https://www.asme.org/codes-standards/find-codes-standards/standard-for-verification-and-validation-in-computational-solid-mechanics>
- IEEE 1012-2024, *IEEE Standard for System, Software, and Hardware Verification and Validation*:
  <https://standards.ieee.org/ieee/1012/7324/>

Project use is guidance/alignment unless a formal conformity assessment says otherwise.

## 3. Technical literature informing reference methods

The production requirements remain this specification. These papers support independent algorithm
choices and verification planning:

- Kim, H.S. (2021), “Interaction Diagram of Arbitrarily Shaped Concrete Sections Determined by
  Constrained Nonlinear Optimization,” *KSCE Journal of Civil Engineering*, 25(10), 3823–3834,
  DOI: <https://doi.org/10.1007/s12205-021-2008-3>.
- Fafitis, A. (2001), “Interaction Surfaces of Reinforced-Concrete Sections in Biaxial Bending,”
  *Journal of Structural Engineering*, 127(7), 840–846,
  DOI: <https://doi.org/10.1061/(ASCE)0733-9445(2001)127:7(840)>.
- Rodríguez, J.A. and Aristizábal-Ochoa, J.D. (1999), “Biaxial Interaction Diagrams for Short RC
  Columns of Any Cross Section,” *Journal of Structural Engineering*, 125(6), 672–683,
  DOI: <https://doi.org/10.1061/(ASCE)0733-9445(1999)125:6(672)>.
- Bonet, J.L., Romero, M.L., Miguel, P.F., and Fernández, M.A. (2004), “A Fast Stress Integration
  Algorithm for Reinforced Concrete Sections with Axial Loads and Biaxial Bending,” *Computers &
  Structures*, 82, 213–225, DOI: <https://doi.org/10.1016/j.compstruc.2003.10.009>.
- The open literature on arbitrary composite-section analysis using adaptive strain-mapped
  integration provides a useful independent reference direction:
  <https://doi.org/10.1016/j.compstruc.2012.02.004>.

Do not treat an interpolation or optimization paper as a substitute for the governing design code.

## 4. Software-library behavior references

- `polygon-clipping` API/input/output contract:
  <https://github.com/mfogel/polygon-clipping>
- Plotly `mesh3d`: explicit `i,j,k` is preferred for a general mesh; `alphahull=0` produces a convex
  hull:
  <https://plotly.com/python-api-reference/generated/plotly.graph_objects.Mesh3d.html>

Pin actual package versions in the project lockfile and record them in result provenance.

## 5. Normative hierarchy inside this project

1. Governing law/adopted design code and project-specific design basis.
2. Verified design-code adapter traceability and approved interpretations.
3. This generic v2 engineering specification.
4. Architecture decision records and implementation documentation.
5. Examples, notebooks, plots, and UI help.

When a conflict is found, stop certification, record it, and resolve it at the highest applicable
level. Do not silently change a formula to match an existing regression output.

## 6. Major v1→v2 decisions

| v1 decision/problem | v2 resolution |
|---|---|
| 24×19 declared the full surface | It is only a seed; adaptive beta/state refinement controls interpolation error. |
| Strain direction `beta` or derived N.A. line angle reused as demand moment angle | Demand checks use `thetaLoad = atan2(Muy, Mux)` and geometric ray/plane intersections on the finished `P-Mx-My` surface. |
| Extreme compression fiber taken from mesh centroid | Exact polygon support vertex defines the extreme edge. |
| Universal `fy/Es` and hard-coded strain milestones | Adapter/material-derived breakpoints with monotonic validation. |
| `Pf=φP`, `Mf=φM` assumed universally | File `11` requires a nominal/reference audit followed by exactly one format: global factor, design-material reevaluation, proven contribution transform, or explicit hybrid. |
| KDS `0.90` steel and `0.65` concrete treated as the ordinary KDS `φ` method | They belong to the alternative KDS 14 20 20:2022 Appendix design-material method; basic KDS uses the state-dependent global factors from KDS 14 20 10. The methods are mutually exclusive. |
| Axial cap described as vertex clamping | Closed resistance domain is clipped by a half-space and cap faces are triangulated. |
| `P` assumed monotone on each direction curve | Fixed-P contours slice every triangle and preserve all loops. |
| Fixed-P moment ray called total utilization | Default utilization is the proportional 3D load factor. |
| Pure axial moment ratio returned zero | Pure axial ray intersects the axial resistance boundary and approaches UR=1. |
| Newton used after factored ULS check | Physical/service solver separated from ULS resistance check. |
| Raw Cramer solve and determinant threshold | Dimensionless pivoted solve with conditioning and stagnation checks. |
| Transformed centroid silently became origin | Geometric/user origin is explicit; elastic center is solver-only. |
| Bbox diagonal/40 called conservative | Initial mesh uses minimum width/features; convergence, not a fixed count, establishes accuracy. |
| Area equality treated as evidence of mesh accuracy | Area is a sanity check; resultants/utilization undergo solution verification. |
| One global maximum moment used for convergence | Demand and sentinel quantities control mesh/surface convergence. |
| Plotly convex hull used as capacity mesh | Explicit oriented triangle connectivity only. |
| Warning after non-convergence | Typed fail-closed result; partial output branded preview-only. |
| Random Monte Carlo and inverse round-trip as primary QA | Analytical, invariant, differential, reference-optimizer, code-example, and validation matrix. |

## 7. Open decisions before implementation begins

Create architecture/design records for:

- first supported normative adapter and exact edition;
- runtime schema library;
- polygon self-intersection/robust-predicate implementation;
- triangle intersection and generalized winding implementation;
- internal vs third-party pivoted 3×3 solver;
- independent reference solver technology/language;
- certified-result signing/hash format;
- browser performance budgets and supported runtimes;
- acceptance margin ownership and certification workflow.

These are intentional project choices. None may be hidden inside a convenience function.

## 8. Change-control record template

```text
Change ID:
Date / author:
Class (1–4 from file 09):
Affected requirements and code adapters:
Engineering rationale:
Expected numerical/result impact:
Tests/evidence rerun:
Independent reviewers:
Migration/provenance implications:
Approval and release version:
```

All Class 3–4 records are shipped with the V&V evidence bundle.
