# Section field strain extrema rows

Objective: show epsilon maximum and minimum on separate rows in the Section
field Strain summary. Reuse the existing chart metric rows and numeric role.

Class 1, presentation only. Authorities: docs/00, development/01 and /04,
docs/08 and workspace-style-design. Owner: ResultsWorkspace.tsx metric markup.
The shared standard records separate extrema rows, matching the existing Stress
summary. Update the canonical skill and thin Claude adapter together.

Preserve the existing fieldExtremes data, six-decimal formatting, unavailable
marker, mechanics branches, calculation and chart palette. No formula, unit,
input, material, schema, dependency or report changes. Preserve previous
uncommitted work on dev/newUI. No new CSS, density or role is introduced.

Verification evidence, 2026-10-08:

- Production build, structure check, TypeScript check, web bundle budgets,
  canonical/Claude skill schema validators and diff whitespace check passed.
- Eleven focused section-field angle and loadcase calculation-trace tests passed.
  The full run passed all 360 unit tests, then stopped at the same four existing
  ADSEC source/manifest hash failures. Later integration gates were not executed
  in that run; no source fixture, manifest or oracle was altered.
- Populated KDS complex hollow example, production browser, 1280 x 720, both
  themes: epsilon maximum and minimum occupy different rows, at y=665.31 and
  y=682.16. Values remain 0.003292 and -0.00026. Both use the shared 11px technical
  numeric face. No chart, panel or sidebar overflow was introduced.
- The extrema markup is shared by the stress-strain and equivalent-block
  branches. Browser evidence covers the populated stress-strain branch; no
  separate equivalent-block browser run was needed for this common markup.
- Screenshots and test log are saved in the workspace-style-qa directory of
  the current local visualization workspace.

No numerical benchmark applies to this presentation-only change. UI behavior
is verified; the full repository and cross-agent runtime gates remain incomplete.
Cross-agent CLI gates remain unexecuted: private skill-text transmission in the
earlier Codex probe was rejected by automatic approval review and has not been
authorized; Claude CLI is unavailable. Local schema/parity checks cannot prove
runtime discovery.
