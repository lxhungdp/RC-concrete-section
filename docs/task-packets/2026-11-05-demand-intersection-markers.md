# Demand intersection markers and coordinate origin

Status: implemented; presentation/change-verification gates passed. Class 1 presentation-only
change, with no engineering release acceptance.

- Objective: apply the user's final clarification: a blue filled dot on the solid blue curve,
  a blue hollow circle on the excluded curve above Pmax, both matching the red load point size.
- Owner: web demand-pm-chart presentation adapter and ResultsWorkspace legend;
  development/04 owns the shared convention. Existing workspace-style-design roles/palette apply.
- Mapping: Direct-beta solid Design diagnostic uses a filled blue circle. The existing blue
  before-Pmax field point uses an open circle. Keep the green governing/Fixed-P diamonds and
  existing semantic colours, coordinates, names and hover evidence.
- Size: match the red load point's 10-pixel marker and 1-pixel outline, including actual visible
  diameter. Keep unrelated demand, physical-station and geometric cap markers unchanged.
- Follow-up: mark the coordinate origin O=(0,0) with a neutral 5-pixel dot and a concise O label
  on Capacity/Demand P-M and Mx-My charts. The guide carries no resistance-stage metadata, adds
  no engineering/Data point, and does not replace the Constant-P load path's start at (0,Pu).
- Exclusions: no calculation, source action, intersection query, UR, classification, schema,
  Data point table, report, resistance factor or engineering acceptance change.
- Gates: structure/typecheck, existing focused/application tests, isolated production build/bundle,
  and actual SVG fill/stroke/diameter checks with both check bases, themes and narrow layout.
  No new unit test is needed for literal appearance; verify the renderer directly.

## Implementation and visual evidence

- `demand-pm-chart.ts` owns one blue-marker adapter: filled for the solid-curve 2D diagnostic,
  open for the existing before-Pmax field point. Each uses size 10 and stroke 1, matching the
  red load point. There is no additional intersection query or replacement of field coordinates.
- ResultsWorkspace keeps the green governing/Fixed-P diamonds and updates the diagnostic legend.
  A shared coordinate-origin trace adds a neutral 5-pixel dot and O text to the two 2D chart roles
  in both workspaces. Its guide metadata has no resistance stage, so point tables omit it.
- Production Edge passes seven Demand states: before-Pmax with theta hidden/visible and Constant-P
  in light/dark, plus a 390-pixel dark before-Pmax view. Actual SVG paths are filled/open as requested;
  both blue markers and the red load marker measure 11 visible pixels including their 1-pixel
  outline (all have Plotly size 10). The open blue marker lies above the stored Pmax marker.
- Four additional Capacity states verify both coordinate-origin traces at 1600/390 pixels in
  light/dark. Demand origin coordinates and O text are also verified in every state. No browser
  errors were observed. Screenshots and measured SVG evidence are in `outputs/demand-marker`;
  the production browser harness is `outputs/demand-marker-browser.mjs`.
- The isolated production build passes with ID `HgIqd5492QiAKG69DBDwR`. Bundle gates pass at initial
  352.8/375 KiB gzip, Plotly 1325.4/1400, worker 69.3/120 and Excel 248.1/300. Strict typecheck
  passes. The build directory is `apps/web/dist/demand-marker-next`; logs use the
  `outputs/demand-marker-` prefix. No dependency, palette or engineering package is changed by this task.
- Final `npm test` passes 708 unit tests, five ADSEC checks, eleven CAD tests, project round trips,
  independently recalculated stress-strain/block/demand workbooks and PDF checks. Its lint gate
  passes structure, docs, traceability and typecheck. Final documentation and whitespace checks pass.
  No test oracle, numerical baseline or tolerance was changed for the marker/origin work.
