# Section mesh panel background

Objective: let the Section mesh panel own one background, matching result
charts. The user's explicit mesh-background request supersedes the previous
blanket canvas-palette preservation rule for this background only.

Change class: 1, presentation only. Authorities: docs/00, development/01 and
/04, docs/08, development/09 and workspace-style-design. Implementation owner:
SectionMeshChart; remove its unused dedicated background token from the
drawing palette. Update the design contract, canonical skill and thin Claude
adapter together. Preserve other drawing colours and all calculation,
geometry, camera, mesh, export, validation and persistence contracts.

Canvas uses an alpha-enabled context and clears before each redraw. No
full-canvas background fill; transparent wrappers reveal the panel surface.

Passed structure/parity, typecheck, all 340 unit tests, two focused mesh-view
tests, 12 geometry tests, production build and bundle limits (initial JS
372.6 KiB gzip / 375 KiB). Canonical and Claude-adapter schema validation pass.
The aggregate application suite again stops at the same four ADSEC source-hash
failures documented in the preceding workspace review. No oracle/manifest was
changed; later aggregate export/CAD suites are not rerun for this canvas-only
follow-up and retain their earlier passing evidence.

Rendered light/dark checks pass on the complex section with two holes. Panel,
outside-mesh margin and both hole backgrounds are identical: RGB 255/255/255
in light and 40/40/40 in dark. All canvas/body wrappers compute transparent.
Two zoom/fit cycles (pointer and keyboard) restore identical mesh-region
pixels, with zero changed pixels and no accumulated translucent fill.
The read-only browser inspection surface does not expose canvas context APIs;
alpha is therefore verified by the declared renderer settings and composed
screenshot pixels, not a direct runtime context-attribute probe.

Evidence in the active Codex visualization directory's `workspace-style-qa`:
`mesh-background-tests.log`, `mesh-background-surfaces.json`,
`mesh-background-pixel-checks.json`, and light/dark/redraw PNGs. The temporary
preview tab and server are cleaned up; no input or project draft was changed.
No numerical, schema, export or report impact. This is presentation evidence,
not engineering acceptance or a release gate.

CLI runtime discovery probes remain unexecuted: the earlier automatic approval
review rejected transmission of private skill/design documents to OpenAI;
the user has not authorized that transmission, and Claude CLI was unavailable.
Do not treat schema/parity checks as runtime verification.
