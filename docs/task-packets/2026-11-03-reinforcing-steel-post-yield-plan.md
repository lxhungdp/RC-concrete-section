# Reinforcing steel after yield in section resistance calculations

Research baseline and implementation record, revised 2026-11-03 with the user-selected two-branch scope and both choices exposed under the single KDS Code. Assigned Class 4 change. The implementation evidence is recorded below. This is a draft-preview implementation, not an adopted-profile approval or release assessment.

## Scope and decision

Deliver one standard-neutral definition of ordinary reinforcing steel with exactly two authoring choices for this increment. Both have an initial elastic branch. Hardening off gives a horizontal post-yield branch. Hardening on gives a straight inclined branch starting immediately at yield. A plateau needs no hardening strength or peak strain input. Active hardening needs its construction data and applicable design strain limit. Expose both choices for each grade under the existing KDS Code, without requiring the user to choose between KDS 14 and a bridge category. Expose the same control for EN. The same definition and compiled-law contract serve the supported calculation routes. Edition-specific sources continue to identify the meaning of any derived factors and limits. A separate hardening-onset strain and a delayed-hardening chart are outside this selected increment.

The first integrated increment covers both KDS hardening states in its fibre and equivalent-block routes and both EN 1992-1-1:2004 fibre choices, with corrected charts and an efficient per-material strain-domain check. KDS defaults to hardening off. A user-selected inclined KDS steel law is recorded as a project material modification under the existing KDS identity. Legacy slope and tabulated inputs retain their defined meaning under supported profiles. Qualification of a complete bridge resistance basis, seismic member response, cyclic unloading, bar buckling, fracture simulation, prestressing, EN 2023 and a Caltrans implementation require separate scope and verification.

### Authority and applicability

Sources consulted on 2026-11-03. The following are scoped to ordinary reinforcement. The source and meaning of every input must travel with its project or code basis.

| Basis | Post-yield behaviour and implementation consequence |
|---|---|
| Korean MOLIT, KDS 14 20 20:2022, main text §4.1.1(4), flexure and axial force | Elastic to specified yield, then a horizontal plateau. Both existing KDS mechanics admit this shape. The Appendix material-factor route has its own design ordinate under Appendix §2.1(5) and §2.2. Its steel strength coefficient is independent of any EN strain coefficient. [KCSC standard](https://www.kcsc.re.kr/standardCode/viewer/KDS%2014%2020%2020:2022-01-11) |
| CEN, EN 1992-1-1:2004, §3.2.7(2), Fig. 3.8, Annex C and §6.1, Fig. 6.1 | For normal design, select the horizontal branch without an upper strain check from §3.2.7(2)(b), or the inclined branch with a design strain limit. The historically recommended 0.9 multiplier is subject to national choice. Separate the two branches in the admissibility policy. [JRC diagram, p. 24](https://eurocodes.jrc.ec.europa.eu/sites/default/files/2022-06/EN1992_1_Walraven.pdf#page=24) · [JRC worked example, Fig. 5.7 and following equations](https://eurocodes.jrc.ec.europa.eu/sites/default/files/2022-06/Bridge_Design-Eurocodes-Worked_examples.pdf) · [Nationally determined parameters](https://eurocodes.jrc.ec.europa.eu/en-eurocodes-implementation/nationally-determined-parameters) |
| Korean MOLIT, KDS 24 14 21:2025, concrete bridges, §3.2.3(1)–(2), Fig. 3.2-2 | The clause permits a horizontal branch when a ULS deformation check is unnecessary. It calls for an inclined branch up to the design strain limit when that check is required. This is source evidence for the curve family. A complete bridge resistance method still needs its own qualified factors, domains and limits. It is not a prerequisite for exposing the user's project-defined hardening option in KDS. [Official bridge standard, printed pp. 32–33](https://www.codil.or.kr/filebank/moct2014/202508/MOCT3437_2.PDF?nserialno=3437) |
| California DOT, Seismic Design Criteria 2.1, January 2025, §§3.3.2 and 5.3.6.2 | The nonlinear steel law for the prescribed seismic moment–curvature analysis has an elastic branch, a yield plateau at expected strength, and a strain-hardening range. This demonstrates why a physical curve, the strength basis and the intended analysis must be explicit. A single inclined segment immediately after yield does not implement this model. [Caltrans rule](https://dot.ca.gov/-/media/dot-media/programs/engineering/documents/seismicdesigncriteria-sdc/202501seismicdesigncriteria21a11y.pdf#page=58) · [Application to moment–curvature analysis](https://dot.ca.gov/-/media/dot-media/programs/engineering/documents/seismicdesigncriteria-sdc/202501seismicdesigncriteria21a11y.pdf#page=110) |

For EN, the existing recommended-values profile has no National Annex. Before approving an adopted profile, record the licensed edition, corrigenda/amendments, country, Annex and date, applicable clauses and reviewer. Check the steel product specification or material evidence against the claimed ductility class, including its applicable bounds. A JRC example is verification evidence and cannot authorize a country's design parameters. The pilot can use a separately identified, documented recommended-value preview. Record an unresolved source or adoption as a blocking issue for the affected use. ACI 318-19(22) and AS 3600:2018 Amd 1/2 keep their existing block-profile capabilities in this increment.

### KDS product behaviour

The visible Code remains KDS. Both Hardening Off and Hardening On are selectable per steel grade for both existing KDS mechanics. Code selection or a concrete-only edit must preserve the user's valid steel choice. Opening JSON/XLSX must retain and validate that choice through the same path. Enabling hardening requires complete project-declared construction and limit data before analysis.

For the current KDS basis, record selected hardening as `steelModelModified = true`, `modified = true` and draft status with the factual reason that the user selected immediate steel hardening. Keep `materialModelModified` for its existing concrete meaning, and derive the overall modified state from all active deviations. Persist and report the separate steel evidence. Do not require a new Code item or a bridge selection to set the toggle. Save the law and its source parameters and report that actual model. The project-defined branch receives no inferred bridge factors or automatic EN 0.9 strain coefficient. A physical/design limit entered by the project and a code-derived limit retain their separate provenance.

The KDS block bridge currently rejects hardening and its code adapter constructs a plateau. Replace that restriction with a validated project-law path that consumes the same stage-specific compiled steel definition while preserving independent block mechanics and resistance sequencing. Reference/design laws, compression-pole evaluation, the existing axial-cap definition and strain-factor classification all need explicit tests. A project steel modification does not authorize substituting fu for fy in a separate code cap formula. Record any unresolved capacity-rule interaction as a typed calculation gap.

## Pre-change software evidence

- [Material definitions](../../packages/pm-materials/src/types.ts) already distinguish a plateau, a bilinear law supplied as `hardeningRatio = E_h/E_s`, and a user table with declared clamp behaviour. The [bilinear compiler](../../packages/pm-materials/src/steel/bilinear.ts) calculates stress and tangent and publishes optional ultimate limits. Its slope input and generic `limits.epsU` do not encode an EN construction point or design cutoff.
- [Profile application](../../packages/pm-project/src/calculation-profiles.ts) resets EN steel grades to the plateau. Applying a code-default concrete model also calls the whole-material profile operation. The current [Materials editor](../../apps/web/features/section-editor/materials/MaterialPanel.tsx) exposes the steel-law selector only for legacy Custom profiles. An authorized steel choice must survive changing only the concrete curve, reapplying the same profile and saving/reopening.
- A read-only in-memory reproduction created valid KDS fibre and EN fibre documents, replaced one steel law with `{type: 'bilinear', hardeningRatio: 0.01}` and called `parseProjectDocument`. Both were accepted. Reapplying each profile produced the plateau again. [Project parser](../../packages/pm-project/src/validate.ts) · [Design applicability](../../packages/pm-design/src/index.ts). The [block bridge](../../packages/pm-analysis-equivalent-block/src/index.ts) already rejects non-plateau steel for its code profiles.
- The [domain contract](../../packages/pm-materials/src/support.ts) explicitly identifies the EN tension-side gap. The [fibre surface and inverse](../../packages/pm-analysis/src/index.ts) already contain compression point C, declared-limit checks, a geometrically controlling bar and a pure-tension representative strain for unbounded plateau laws. The forward path compiles a law per material and binds each bar to it. Its current admissibility check separately visits every bar. The revised plan uses per-material strain extremes to cover the same constraints with fewer repeated checks.
- Canonical project JSON is v3 with v1/v2 readers. The [editable project workbook](../../apps/web/features/section-editor/project/project-xlsx.ts) writes v6 and reads v5/v6. The [fibre calculation workbook](../../packages/pm-report/src/excel/stress-strain.ts) initially selects the default steel law for its formula ledger. The block workbook explicitly guards its single-law limitation. Mixed-grade fibre reporting therefore needs its own acceptance case.
- The current `StressStrainCurve` in [MaterialPanel](../../apps/web/features/section-editor/materials/MaterialPanel.tsx) samples both negative and positive steel strains. Stress zero is plotted at SVG y = 55, while the solid bottom axis is at y = 96. Strain zero is near the horizontal centre, while the vertical axis is drawn at x = 12. The lower negative-stress plateau is a tensile branch in the compression-positive convention. Its presentation needs explicit zero axes and sign labels. Sampling 48 evenly spaced ordinates can also miss zero and the exact yield kink.

## Proposed material and analysis contract

### One declaration with an optional hardening branch

Use the existing `SteelMaterial` owner. Extend its idealized-law definition with a discriminated post-yield choice. The application edits this common definition for each grade. Adapters resolve code policy and the compiler specializes the chosen branch once outside the bar loop.

| Input or resolved quantity | Plateau | Active hardening |
|---|---|---|
| Es, yield strength and source | Required | Required |
| Strength meaning | Explicit specified, characteristic, expected or declared basis, with code mapping | Same explicit basis, also covering construction-point strength |
| Hardening | Off | On |
| Onset | Inapplicable | Immediately at the effective yield point, derived from the selected stage |
| Shape and construction | Inapplicable | Straight inclined branch through its declared endpoint. Preserve the legacy user-slope input under its supported profiles. |
| Endpoint data | Inapplicable | Strength/ratio and strain at the peak/construction point for an endpoint definition. Preserve the independent slope meaning for legacy user laws. Require a terminal bound when a qualified hardening domain needs one. |
| Design strain rule | None from hardening. A separately declared physical limit can still apply. | Adapter-owned rule or documented project/Annex declaration. Resolve its design cutoff explicitly. |
| Derived outputs | Effective yield, εy and plateau stress | Effective yield, εy, elastic and post-yield tangents, endpoint and last admissible stress |

Switching hardening off removes its fields from the active engineering contract and from required input validation. A hidden old endpoint cannot restrict or change a plateau. If the UI retains an unsaved edit for convenience, it remains draft state outside saved engineering inputs. A separately declared physical strain bound retains its own meaning. Switching hardening on requires valid data before Apply. Use an atomic operation to choose an authorized law and its parameters when changing profile.

For EN, retain characteristic yield strength as the existing `fy`, labelled **fyk**, and declare **εuk** and **k = (ft/fy)k** with their sources. If the UI accepts a peak strength (`fsuk` in the request), identify its meaning and require an approved mapping to that ratio. Two unrelated characteristic values or two single-test measurements cannot establish the statistical characteristic ratio. Treat endpoint-strength and ratio entry as mutually exclusive input bases with derived companion displays. Do not ask users to enter fy, Es and εy independently.

Map the unified symbols through each code. In the explanatory schematic, **fy**, **fu**, **εu** and **εlim** denote the yield ordinate, construction/peak ordinate, its strain and the active design cutoff of the curve being viewed. For EN Design these become **fyd**, **k·fyd**, **εuk** and **εud**. For KDS 14 main-body nominal mechanics the plateau ordinate is **fy**, and the design route separately applies its resultant factor. The KDS Appendix uses its declared material-factor ordinate. Expected-strength data belong to their specific analysis basis.

### Resolution and material-law evaluation

Let the edition adapter own applicability and the design-strain rule. Resolve εud from that rule or an explicitly authorized project/Annex declaration. Keep the design cutoff, strain at peak force, any physically declared fracture limit and resistance-factor transition strain distinct. Record the source, reason and status of a permitted override. Ambiguous legacy `epsU` values require resolution before assigning a new meaning.

In tensile magnitudes for EN, yield is (fyd/Es, fyd), with fyd = fyk/γs. The inclined line is constructed through (εuk, k·fyd), while design evaluation ends at εud. Its post-yield tangent is (k·fyd − fyd)/(εuk − fyd/Es). The characteristic curve has its own yield and construction ordinates. The resistance-material builder applies the selected stage once, with Es unchanged. It labels reference evaluation at a Design strain plane explicitly. [JRC worked interpolation following Fig. 5.7](https://eurocodes.jrc.ec.europa.eu/sites/default/files/2022-06/Bridge_Design-Eurocodes-Worked_examples.pdf)

Supply validated breakpoints, stress, tangent, signed bounds and limit causes to the calculation APIs. Stress and modulus use MPa, strain is dimensionless, and internal compression is positive. Resolve tension/compression symmetry and limit applicability from the profile. A tensile design limit cannot silently become a symmetric physical fracture rule. Give each kink a deterministic one-sided tangent policy. Any permissive Newton trial evaluation remains separate from publishable admissible states.

Typed failures distinguish unsupported profile/law, missing authority or grade evidence, contradictory input, exceeded domain and unresolved surface. Include material/bar ID, field or strain, applicable bound, stage and source. Validate finite values, compatible strength bases, grade range, units, positive intervals and applicable ordering of yield, cutoff and construction point. Preserve a fully tabulated legacy user law under its existing contract where an idealized elastic-start definition cannot represent its data.

## Material chart plan

- Default to a tensile-magnitude view starting exactly at (0,0), with labels σs and εs and units MPa and explicitly chosen %, ‰ or ratio. Transform signs only at this presentation boundary.
- Offer a signed tension/compression view. Put both axes through zero, label the origin, negative tensile side and positive compressive side, and display both applicable limit directions.
- Draw the selected stage from the same resolved-law output as calculation. Expose Reference and Design, with stage-appropriate fy/fyk/fyd labels and applied factors. The drawing must never invent a hardening line from a default slope.
- Include zero, yield and the design cutoff exactly in the plotting data. Use straight segments for both new authoring choices. The legacy table view retains its actual knots. A construction point beyond εlim can appear with an open marker and a dotted extension labelled as construction. The finite end of a plot window for an unlimited plateau is a display range.
- Show no hardening inputs for a plateau. With hardening enabled, the edited fields, graph, read-only derived values and applied profile must agree before Apply. Preserve the selected law during concrete-only edits.

The current research schematic has two panels, a plateau and a straight inclined branch immediately after yield. It is an explanatory shape diagram with no adopted coefficients. The production graph follows the resolved model and its actual values. Visual verification uses both themes, a narrow Materials panel, the signed view, two grades and the Reference/Design selection.

## Efficient governing-strain checks

### Exact reduction for equal materials

The [forward mechanics](../03-forward-analysis-and-jacobian.md) uses the affine strain plane

`εi = ε0 + κx·(yi − y0) + κy·(xi − x0)`.

For a fixed nonzero strain-gradient direction, define each bar's projection on that direction. Within a group with identical active strain bounds, the most tensile and most compressive strains occur at the minimum and maximum projections. Checking those two extremes covers the interval for every bar in that group. A tension-only check needs only its most tensile bar. This is an exact consequence of the affine field. It requires neither material-law evaluations on all bars nor a nearest-angle approximation.

Group by identical effective law, strength basis, limits and applicable profile/stage policy. Start with validated material IDs. Duplicate definitions may share compiled evaluation only after exact semantic equivalence is established, while retaining their source IDs for reports. A matching grade label or yield strength alone is insufficient if Es, hardening, design strain, physical bounds or overrides differ.

For G active groups, select the tensile extreme in each group, compare their respective finite design margins and retain the governing group/bar. Check a compressive extreme too wherever a compressive limit applies. Within one homogeneous group this reduces to the bar farthest from the neutral axis on the checked side. A single absolute distance cannot represent different tensile and compressive limits. With κx = κy = 0 all bars have the same strain, so check one value per group and record the tied controls deterministically.

Each criterion retains its own definition. A code's tension-controlled resistance factor, a station's yield ratio, a design cutoff and physical rupture are different predicates. The extreme candidates can be shared, but a maximum utilization against one limit cannot replace another code criterion. A nonlinear or nonmonotone stress law still has affine strains, so the reduction checks its strain interval. It does not claim the largest stress always occurs at an endpoint.

### Reuse without repeated geometry work

For fixed surface directions, calculate each group's extreme projections once when geometry/group membership is prepared. Reuse them as axial strain and curvature magnitude change across the stations and refinements for that direction. Keep curvature orientation explicit and swap support sides when the signed gradient reverses. For an adaptive direction, obtain exact support values on demand. Cache the actual direction without angular rounding. A changing inverse direction can use each group's precomputed convex hull if profiling justifies it. Preserve ties and a bounded cache. For a full per-bar violation list, reconstruct it only when detailed diagnostics request it.

Retain the support bar IDs and evaluate their strain with the existing `strainAt` arithmetic and strain-limit tolerance. Normalizing a gradient and multiplying it back can introduce a different binary64 operation order near the boundary. Test cancellation, almost tied projections and cases just inside/on/outside the existing tolerance. Resolve ambiguous numerical ties conservatively using the original coordinates and predicate. No new engineering tolerance or distance rounding is introduced by this plan.

Force and moment integration still accounts for every bar's own area, position and stress and for the displaced-concrete contribution. Bars of one grade can occupy different elastic, yielded and hardening branches in the same plane. Reuse the already compiled grade law and, where the forward loop is already computing all strains, accumulate group extrema during that loop. Measure whether this removes more work than an extra cached-support lookup. Any later branch batching or exact identical-strain aggregation needs its own independent equivalence test and benchmark.

Preprocessing for D fixed directions costs O(N·D), and subsequent strain-bound comparisons cost O(G) per station instead of O(N). This is a comparison-count reduction. Concrete integration, steel resultants, topology and demand queries still contribute to overall time. Set performance targets after measuring prepare, material evaluation, boundary generation, full surface, inverse and export separately, with identical cases and numerical results.

A disposable Python reference checked exhaustive per-bar bounds against per-group extrema for 6,000 deterministic synthetic strain planes, 160 bars and 1, 2 or 4 groups, including zero curvature and different tensile/compressive limits. Their controlling ratios and Boolean outcomes agreed, with zero observed ratio difference in this probe. This supports the mathematical reduction. Production-kernel integration and end-to-end speed remain unmeasured.

One illustrative mixed-grade case has tensile strains proportional to distance from the neutral axis. Group A has a bar at 200 mm with strain 0.020 and a declared limit of 0.040, giving ratio 0.50. Group B has a bar at 150 mm with strain 0.015 and limit 0.012, giving ratio 1.25. The closer bar governs because the groups differ. These are synthetic inputs, not steel defaults.

## Delivery order and exit criteria

| Step | Owners and work | Observable exit criterion |
|---|---|---|
| 1. Unify the definition and applicability | Update [material authority](../engineering/04-materials-and-design-standards.md), [resistance policy](../11-design-standards-and-resistance-formats.md), [source record](../10-normative-references-and-change-control.md) and [control map](../01-control-map.md) before implementing. Extend the one steel definition with an optional hardening contract. Both states are available under KDS and EN. Put EN derived rules in `@pm/code-en1992`, and declare KDS inclined-branch data as project material inputs. Share validation with parser, direct analysis/worker and UI without a dependency cycle. | A plateau requires no hardening data. Valid KDS hardening opens and reapplies without being rejected or reset to the plateau, and its project material modification is recorded. The shared Code selector remains KDS. Incomplete hardening inputs receive field diagnostics. Existing valid horizontal results retain their intended meaning. |
| 2. Compile grades and correct the material chart | Extend `@pm/materials` and `@pm/design` with stage-specific construction, tangent and limit evidence. Use the two-choice unified editor with conditional fields and exact plotting events, a tensile-magnitude default, and signed and Reference/Design views. Preserve immutable raw inputs and grade identity. | Stress, tangent, yield point, construction point and last admissible point match independent calculations. The curve passes through (0,0) and the exact yield point. Toggling hardening changes required fields correctly. Editing γs recomputes the Design branch with Es and reference inputs preserved. |
| 3. Implement exact group comparisons and measure them | Prepare per-material extreme projections for each actual direction, check the active tensile/compressive limits, and share the resolved groups with station generation, inverse checks and diagnostics. Reuse forward-loop strains when that is cheaper. | Exhaustive and grouped checks agree on admissibility, governing margins and reported control ties for equal-grade and mixed-grade cases. Cache invalidation, zero curvature, asymmetric bounds and changed directions pass. Record comparison counts and timings separately from total analysis. |
| 4. Construct the complete section boundary | Implement steel-controlled EN domains 1–2 and their transition to the existing concrete-controlled domains 3–5. Use the exact group candidates together with exact concrete support geometry. In tension-controlled states pivot on the governing steel strain and allow concrete strain to vary. Verify pure tension, the joint limit, point C and changes of governing grade. Establish the plateau limiting resultant independently for the horizontal option. | Both fixed and adaptive routes produce a valid completed surface whose published planes satisfy every applicable constraint. The inverse, capacity field, trace and 3D check refer to the same domain and stage. Unsupported topology or insufficient resolution yields an indeterminate check. |
| 5. Complete state and transport | Wire atomic Apply, concrete-only edits, saved profiles, worker invalidation and canonical raw inputs through JSON and editable XLSX. Preserve strength basis, input alternatives and profile-derived outputs. | Per-grade edits round-trip. Use an explicit new transport revision for the new semantics and bounded readers for existing JSON v1–v3 and supported workbook v5/v6. Do not infer EN inputs from old `epsU` or slopes. Tests cover repeated profile apply, toggles, multiple grades and inconsistent imports. Any changed law, factor, limit or geometry invalidates the affected cache/result/export. |
| 6. Deliver calculation traces and end-to-end evidence | Update Capacity, Demand Check, Detail Calculation, the Excel ledger and preview PDF. Retain per-bar material IDs and exact force/moment accounting even when a grouped check supplies governing strain evidence. Connect the project-selected hardening definition to the independent KDS block route as well as the fibre route. | A mixed-grade Excel ledger reproduces the solver by bar, and PDF reports the same stage, chosen law, governing grade and strain. KDS hardening works through both normal calculation entry points with the correct modification evidence. Whole-pipeline timing, peak memory, preparation cost, inverse behaviour and numerical gates are recorded. Report the measured benefit only. |

For step 4, one independent construction is to fix the direction and represent a compatible plane by axial strain and scalar curvature. A finite strain bound at each bar or concrete support point gives a linear inequality in those two variables. Intersect the applicable inequalities for each code domain, including its concrete pivot rule, and map the admissible boundary to section resultants. This offers a reference for checking the production station generator, including ties and switches between controlling bars. For a plateau with no finite code strain limit, establish an equivalent limiting resultant separately. A sampling strain used to reach saturation must never be recorded as steel ductility.

A future complete KDS 24 resistance basis can reuse the two authoring choices after qualification of its ULS check purpose, factors, design-strain source, concrete/domain rules and a bridge benchmark. Selection of that basis is independent of the KDS hardening toggle delivered here. The Caltrans source is retained as research context for the separately scoped seismic problem. It adds no onset field, nonlinear branch or third chart to this increment.

## Verification and release gates

| Requirement and owner | Independent evidence required |
|---|---|
| ENG-MAT-001/004, project and profile | Round-trip fixtures and an adversarial input matrix for UI, JSON, workbook and direct API. Record exact edition/Annex, scope, units and parameter sources. Check versions, unsupported combinations, missing fields, incompatible ratios, repeated hardening toggles, inactive endpoint data and stale exports. |
| ENG-MAT-002/005, material and adapter | Hand interpolation, one-sided derivatives at yield/cutoff, finite differences strictly inside each segment, and distinct εud and εuk. Check symmetric branches only where the policy allows them, exact plotted zero/yield/events, correct signed axes, inactive hardening fields and dimensional equivalence of 0.05, 5% and 50‰ at a labelled boundary. |
| ENG-MAT-003/006, design and mechanics | Single bar gives F = As·σs. Use two different grades at known coordinates to sum P, Mx and My independently. Vary γs with Es fixed to detect double reduction. Verify KDS main and Appendix separately and retain regression fixtures for both existing block and fibre kernels. |
| ENG-AN-001–003, ENG-RES-001/002, analysis and results | Use independently generated strain planes/section equilibrium for pure tension, pure compression, pure bending, an asymmetric biaxial section, a mixed-grade switch of controlling bar and a demand near UR = 1. Match concrete model, geometry, factors and stage before comparing with published studies. Compare fixed and adaptive results to an independently denser reference and qualify any screening tolerance for the new law before using it. Query the finished Design surface in the demand direction atan2(Muy,Mux). |
| ENG-MAT-007, UI and report | Trace each selection through saved inputs, effective parameters, active bar and domain margin to field, workbook and PDF. Reopen/export a mixed-grade project and compare independently recalculated rows with worker results. Require typed failures when a consumer cannot represent a model. |

For the optimized check, retain an independently written exhaustive per-bar reference in tests. Cover 1, 2 and several groups, duplicate identical definitions, equal yield with different ductility, different Es or hardening, different stages/factors, tied extreme bars, pure axial states, reversed curvature, shifted origins, rotations, asymmetric layouts, arbitrary inverse directions and changes of controlling group. If a result contract requires all violations, compare the reconstructed list with the exhaustive reference as well. A nonmonotone user table must not make the extrema routine stand in for its stress evaluation.

Measure the optimized and existing paths on the same sections with 16, 128 and 512 bars and 1, 2 or 8 active material groups. Include the current fixed directions and actual adaptive/inverse direction sequences. State preparation cost, per-state comparisons, total material evaluations, full wall time and peak memory. Benchmarks must verify result/check equivalence. No engine speed multiplier is assumed from the reduction in comparisons.

A synthetic single-bar fixture uses fyk = 500 MPa, Es = 200,000 MPa, γs = 1.15, k = 1.10, εuk = 0.050 and a declared preview multiplier of 0.90. Rational-arithmetic interpolation gives fyd = 434.782609 MPa, εyd = 0.002173913, εud = 0.045 and σs(εud) = **473.715415 MPa**. The construction stress at εuk is **478.260870 MPa**. The latter is outside this fixture's admissible design range. These are synthetic verification inputs, never product defaults.

Run owner tests, `npm run check:structure`, `npm run typecheck`, `npm test`, `npm run build`, `npm run check:web-bundle`, `npm run bench:materials`, `npm run bench:verify`, `npm run bench:strain-sampling`, `npm run bench:sampling-modes`, `npm run bench:equivalent-block` and `npm run bench:pipelines` as applicable to the integrated slice. Add the independent EN and group-extrema examples explicitly to the evidence set. Establish tolerances and review criteria for new cases before comparing outputs. Existing baseline drift requires explanation.

The first reviewable delivery is the two-state hardening toggle under KDS and EN, conditional data, correct material chart, recorded KDS project-model modification and independently checked Reference/Design single-bar examples. Section capacity follows after the group, mechanics, transport and reporting exit criteria pass. An adopted-profile claim additionally requires identified national parameters, a qualified structural reviewer and the [repository release gates](../engineering/06-verification-acceptance-and-change-control.md). The full bridge resistance basis and Caltrans case remain separately scoped extensions.

## Implemented slice and evidence — 2026-11-03

Objective: deliver the selected two-branch feature through the existing Stage 1 draft-preview
pipeline. Requirements: `ENG-MAT-001`–`ENG-MAT-007`, `ENG-AN-001`–`ENG-AN-003`, and
`ENG-RES-001`–`ENG-RES-002`. Assigned Class 4; no profile status is promoted.

Allowed owners/files for this slice are the material contract/compiler/audit/validator; EN's named
recommended-value coefficient; design-basis material-stage and modification evidence; project
parser/profile application and editable workbook; exact grouped geometry supports; both analysis
bridges and their independent kernels/adapters; Materials/Options and the calculation-detail
consumer; Excel/report-model consumers; the linked owning documentation and focused tests/tools.
Existing unrelated workspace changes were retained. No dependency, commit, push or deployed
release is part of this delivery.

| Contract | Implemented behaviour and impact |
|---|---|
| Material input/output | `linear-hardening` stores a mutually exclusive peak ratio/stress, `epsUk`, and factor/absolute cutoff. The compiler derives stage yield, strength and tangent with unchanged Es. Tensile design and optional physical compression bounds remain distinct. |
| Resistance/provenance | `steelModelModified` is separate from the concrete flag. KDS keeps its Code and selected resistance route, records project hardening as modified/draft and preserves the Main-body fy-based P0 cap. Appendix hardening compression evidence is identified as project material response, not an unchanged Pdo formula. EN's 0.9 choice is a no-National-Annex preview. |
| Geometry/strain checks | Prepared supports group active bars by material ID. One tensile extreme is evaluated per grade, plus the compression extreme when its bound applies. Full violating-bar diagnostics are reconstructed only for failing groups. Every force/moment still includes every bar. |
| Fibre capacity/inverse/field | Compatible concrete/steel inequalities constrain every new-law station. The boundary includes nonuniform all-tension states and a change of governing grade. Adaptive refines the steel transition and pole intervals; the old unbounded pole exception does not suppress them. Inverse/field checks use the same signed limits. |
| Block mechanics | Per-stage project steel compilers feed actual bar forces in the independent block kernel. Per-material tensile depths are constrained. A physical compression bound below the block's prescribed extreme strain fails with a typed material error and directs the user to fibre mechanics. No unsupported compression/tension branch is fabricated. |
| Governing demand | The completed Design surface and its explicit topology remain the governing 3D query. Fixed endpoint-hardening checks have no qualified bound and are indeterminate. Adaptive needs both measured convergence gates; inverse convergence never supplies adequacy. |
| UI/transport | Two choices under KDS and EN, conditional inputs, exact yield/construction/cutoff graph, tensile/signed and Reference/Design views. Reapplying a profile or a concrete-only edit preserves the new steel law. Project JSON remains v3 with a new discriminant; editable workbook revision 7 preserves both input alternatives and the steel audit flag, with bounded v5/v6 readers. |
| Reports | Bar-specific mixed-grade formulas, independently recalculated endpoint slope, separate stage ordinates and physical limits, and governing material/bar evidence are carried through calculation details, Excel and the preview PDF. Declared station counts replace hard-coded 27-row captions for the new domain. |

Blocking failures include incomplete/non-finite or contradictory construction data, unknown input
alternatives, an unsupported profile/law combination, unsupported block compression bounds,
inadmissible inverse states and non-converged sampling. They do not supply an accepted result.
Legacy plateau results retain their numerical regression evidence. Unused hardening definitions
do not activate the fibre-domain extension or change a physical KDS compression pole.

Independent evidence includes:

- the rational single-bar example above, derivatives and sign checks, distinct construction and
  cutoff points, Reference/Design re-evaluation and KDS Appendix anti-double-reduction checks;
- exhaustive affine extrema for 512 bars/eight groups over 360 directions, cache/zero-gradient
  checks, and exhaustive per-bar inverse violations for mixed grades;
- a separate half-plane intersection oracle in `(eps0, kappa)`, including EN point C, concrete
  extremes and every bar's own tensile bound. Its 300/600-subdivision references differ by less
  than 0.01% on the four tested rays. Adaptive capacity differs from the denser reference by
  `-0.479622%`, `+0.002715%`, `-0.000733%` and `-0.000426%`; near-UR=1 queries use the same
  declared 1% sampling criterion. This is a bounded synthetic regression, not a universal error bound;
- HyperFormula re-evaluation of mixed-grade KDS fibre, KDS block and EN bar stresses. A single-grade
  EN workbook also changes its calculated tangent when the peak-ratio input is edited;
- metric/US JSON/editable-workbook round trips and browser worker comparisons for all three routes.
  In the realistic browser fixture, KDS tensile resistance changes from about 4.922 MN to
  5.312 MN with the declared hardening data; EN changes from about 5.035 MN to 5.487 MN.
  Manual entry reproduces imported-input capacity and no page/worker errors were observed;
- a rendered mixed-grade EN preview PDF, visually inspected input/material and capacity pages.

The support microbenchmark covers 16/128/512 bars, one/two/eight grades and 36 directions over
34 states. Grouped and exhaustive extrema checksums are identical. Two-sided checks require
`2G` strain evaluations instead of `N`; the normal tensile-only new law needs only `G` for the
bound comparison. Small sections can lose time to cache overhead. Preparation, isolated loop
time, a full prepare/surface/report sample and process peak RSS are recorded separately in
`outputs/steel-hardening/performance-evidence.json`. There is no whole-engine speed multiplier
claim. The [repeatable evidence tools](../../tools/verification/steel-hardening/README.md) describe
their local browser prerequisites.

Automated gates executed: repository structure and TypeScript; the full `npm test` pipeline;
production build and web-bundle budgets; materials, strain-sampling, sampling-mode,
equivalent-block and pipeline benchmarks. The final full suite passed 447 unit tests plus the
AdSec/CAD/round-trip, independently recalculated Excel and PDF integration gates. The final browser
run passed all three profiles, and the final production/bundle and post-build structure/type gates
passed. The numerical regression uses the repository's reviewed
`bench:verify:portable` policy on the recorded Node 24.20.0/npm 11.19.0 runtime. The strict baseline
is darwin/arm64 and is not relabelled for win32/x64. Portable comparison retains exact state and
structural evidence; 17 force/moment roundoff differences have a worst section-normalized delta
of `4.957e-17`, with unchanged inverse equilibrium errors. No baseline or tolerance was edited.
The materials microbenchmark's reversed user-curve fixture was normalized before compilation to
satisfy the existing ordered-input contract; its comparator retains the original per-call sort
and its stress checksum is unchanged.

Release limitations remain: no qualified National Annex/adopted EN profile, no KDS bridge
resistance qualification, no independently reviewed universal Fixed bound for this new domain,
and no accepted/released-result gate. The block route retains its independent mechanics and may
leave a finite-limit tension-pole interval unresolved; such a result is indeterminate. Independent
professional/code-clause review remains a release gate. Delayed hardening, cyclic/seismic response,
bar buckling, member stability, second-order analysis and detailing remain outside this increment.
