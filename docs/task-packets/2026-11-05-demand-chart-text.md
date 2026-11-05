# Demand chart text snapshots

Date: 2026-11-05. Class 1 presentation-only change; Stage 1 Preview.

- Objective: add a Data button to each Demand CAD panel, opening a readable text modal with copy
  and optional Save as `.txt`, independently of the chart's available size.
- Owners: ResultsWorkspace chart chrome/readouts, a presentation snapshot adapter, and application
  browser file helpers. Authorities: development/01, development/04, root 08 and the canonical
  workspace design standard. Relevant contracts: DEV-ARCH-002/006 and the display-unit boundary.
- Contract: copy displayed strings, selected options, units, unavailable markers and frame warnings.
  Keep loadcase identity and Preview status explicit. No solver, material, geometry, acceptance,
  unit-conversion formula, project schema, resistance factor or CAD palette change.
- Failure boundaries: denied clipboard, failed/cancelled save and pending or previous
  results. A missing field stays unavailable; opening text never starts a new calculation.
- Verification: structure/typecheck and focused presentation checks, full application tests,
  production build/bundle, and populated browser checks of all three panels in both themes and a
  narrow layout. Compare every exported field label/value against the rendered readouts, verify
  UTF-8 download/copy, explicit prior-frame status and safe literal handling of user labels.
- Existing untracked `tools/verification/demand-navigation/` work is outside this change.

## Delivered behavior

- All three populated Demand panels use the shared outlined `Data` action at chart density.
  They open a native modal in the application. No popup, new tab or automatic download is used.
- The file-viewer chrome has one prominent title on the Copy all / Save as / close row and the text
  area. The repeated filename and permanent Preview/help footer were removed at the user's request.
  The title bar is draggable and supports arrow-key movement; Shift+arrows and the native corner
  grip resize the window. CSS size limits and viewport clamping keep its controls reachable.
  Only actionable copy/save feedback appears in the toolbar. The document retains Preview identity,
  units and frame warnings.
- The read-only, scrollable text has grouped aligned label/value rows, project/section/loadcase,
  captured UTC time, units, frame status, chart summary/options, field metrics, drawing labels and
  notes. Capturing rendered strings keeps the existing labels, rounding, signs and unavailable
  markers. A pending/outgoing frame retains its warning and requested loadcase identity.
- Copy all uses the clipboard, with select-all/manual-copy feedback if access is unavailable.
  Save as uses the browser's file picker where supported and a named UTF-8 `.txt` download otherwise.
  Cancellation does not download; failed writes abort the temporary stream. Saved bytes equal the
  displayed text. User labels are literal text and filenames remove forbidden path characters.
- Escape and the close button dismiss the modal and restore focus to the initiating Data button.
  Opening, copying and saving initiate no analysis job. The modal snapshot is fixed until closed.

Owners changed: `ResultsWorkspace.tsx` chart chrome and readout markers, `demand-chart-text.ts`
presentation capture, `DemandChartDataDialog.tsx`, `application/files/text-document.ts`, scoped modal
layout in `workspace-chrome.css`, this packet and development/04. The numerical packages, schemas,
report DTOs, units owner, factors and drawing palette are unchanged. No dependency was added.

## Observed verification

Windows/x64, Node 24.22.1/npm 11.19.1 (supported preview runtime). Local evidence is under
`C:/Users/USER/.codex/visualizations/2026/11/04/01a1a56f-b560-77f1-b37b-0dde0a31f0cc`.

| Gate | Result |
|---|---|
| Structure and strict typecheck | Passed, including the aggregate lint gate |
| Focused Results tests | 46 passed; includes Unicode/sign/unit/unavailable text and save/cancel/write-abort boundaries |
| Full `npm test` | Passed: 620 main tests, 5 ADSEC tests, CAD, project round trips and workbook/PDF integration |
| Production build | Passed; sandbox `EPERM` on `.next/static/media` required approved build escalation |
| Production bundle | Passed unchanged ceilings: initial 352.1/375 KiB, Plotly 1325.4/1400 KiB, analysis worker 69.5/120 KiB, Excel 248.1/300 KiB; gzip |
| Actual Edge browser | All six populated panel/mechanics combinations passed; every field label/value matched the text; all six saved UTF-8 files matched it exactly |
| Interaction boundaries | Outlined nontransparent 1px Data borders, same-page modal, copy handler, denied-clipboard selection, cancelled picker, no extra analysis requests, Escape/close focus and previous-frame warning passed; pointer move, corner resize, keyboard move/resize and viewport clamping also passed |
| Visual review | Populated 1600×1100 light and 390×900 dark captures inspected; controls remain reachable, modal fits the viewport and text scrolls without truncating saved data |

Latest simplified/movable-window evidence: `demand-data-window-test.log`,
`demand-data-window-build.log`, `demand-data-window-bundle.log`, `demand-data-window-browser.log`
and `demand-data-window-browser/browser.json`, screenshots and six `.txt` files. The production
browser measured an 80×40 px drag, a 960×760 -> 840×660 px corner resize, and the expected keyboard
movement/size change. Shrinking the viewport to 390 px kept the modal inside it with unchanged text.
One visible title stays on the same row as the action buttons; there is no repeated filename or
permanent help footer. Position and size are transient to the open modal, not project inputs.
The repeatable browser harness is `tools/verification/demand-data/browser.mjs`. It isolates clipboard
and picker adapters rather than overwriting the workstation clipboard or exercising an OS save
dialog; the download path writes and compares actual files. Its initial import/worker observation
race was corrected by waiting for the imported mechanics and pending checks before measuring.
Loopback browser verification used approved sandbox escalation and stopped its own server.

Status: implemented and presentation checks passed. This changes no engineering verification or
release status. Canonical skill/adapter workflows were unchanged; no agent-CLI invocation claim is
made from the existing structure/parity gate. Unrelated demand-navigation work was preserved.
