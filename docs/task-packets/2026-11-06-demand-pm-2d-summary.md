# Demand P–Mr 2D summary

Class 3 transient diagnostic pipeline under ENG-AN-003 and ENG-RES-001. Replace the
Demand P–Mr footer with checked centroidal demand, fixed-N.A. Design crossing and
diagnostic utilization. Engineering/05 and root 05 sections 8–9 own the distinction
between the governing Design-surface check and the fixed-beta 2D construction.

The analysis owner derives the summary from the existing displayed capped Design
intersection and its source fractions. Missing curves, multiple hits, tangency,
overlap, nonpositive factors and unresolved components block a numeric summary.
The UI formats canonical actions with existing display-unit adapters. The summary
belongs to the same displayed loadcase frame as the chart. The chart's Data text
includes its visible metric cards. Project persistence, engineering reports,
surface sampling, material evaluators and governing verdicts retain their contracts.

Independent oracle: use two endpoints with different signed component directions
and solve the planar line intersection by hand for both load bases. Check the
source-component interpolation separately from the plotted magnitude. Exercise
unavailable paths and compare live chart marker coordinates with the footer.

## Verification

- Structure and TypeScript checks passed. The focused suite passed 41 tests, including
  the independent line-intersection oracle and ambiguous geometry cases. The full
  `npm test` run passed 741 unit tests plus AdSec, CAD, project round-trip, workbook,
  and PDF checks.
- `npm run bench:pipelines` reported no failures. Production build and bundle checks
  passed with the final chart layout.
- Edge verified the plotted crossing and signed components for the KDS stress-strain
  fixture under proportional loading and the KDS equivalent block rectangle under
  Constant P. The check compared the displayed UR with the plotted demand/crossing
  moment ratio. It also covered theta visibility, hiding/restoring Design, switching
  to zero demand, both themes and scrolling to all metrics at 390 px. Screenshots and
  the browser harness are under `outputs/demand-pm-2d/`.

This evidence qualifies the transient Preview presentation for the tested scope.
The engineering release status follows the existing independent review gates.
