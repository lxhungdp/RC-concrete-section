# Import icon and DWG feasibility

Objective: clarify Import versus Export, then assess importing native DWG
alongside DXF while retaining DXF export and the current geometry contract.

Implemented Class 1 change: the shared Import vector is exactly the prior
downward arrow and tray rotated 90 degrees counterclockwise around (12, 12).
Paths, stroke, joins, dimensions and action densities remain unchanged.
Export retains its upward arrow/tray. All Import callers (project, drawing,
rebar and loadcases) consume the same `WorkspaceIcons.tsx` definition.
The canonical design standard and its thin Claude adapter are updated together.
Authorities: docs/00; development/01, /04 and /09; docs/08; workspace-style-design.
Preserve all existing uncommitted UI/Rebar/DXF work on dev/newUI.

DWG is a proposed Class 3 input-pipeline/dependency change; it is not enabled.
Requirements: ENG-GEO-001/002/005 and existing DXF-001/004/005/006.
Owner: development/03 drawing exchange and its web geometry adapters.
Input must preserve mm declarations, exact polyline/circle geometry, layers,
OCS/planes, unsupported entities and complete parser diagnostics. Output must
pass the existing geometry/material validation and remain an unapplied draft.
Missing/ambiguous units, partial reads, skipped records, unsupported pm entities,
non-finite geometry and resource exhaustion must block import without mutation.
Independent DWG fixtures with known coordinates, units, layer/plane metadata and
intentional failures are required before capability is advertised.

Feasibility evidence, 2026-10-08:

- Inspected published `dwgdxf` 2.0.1, integrity
  `sha512-AWZsyK0W3yuMRd1ebX/Ew254IM510NkAGZ1SsRao9LIjeblVNVBhAtxAGsfu24dycao8cnpmnLhIt7k+/K/Vkw==`.
  The package includes an 821,610-byte WASM converter and runs locally, with an
  optional CDN mode. It was downloaded only to QA, not installed in the app.
- Verified its npm gitHead `138ad35dc9086ef65575a35be86986e8ab4488f2`, including
  the exact converter source and its acadrust 0.4.0 dependency declaration.
  Its API exposes only DXF bytes or a thrown conversion failure. Its Rust wrapper
  calls `DwgReader::read()` and immediately serializes the document, without
  checking or returning document notifications. The acadrust 0.4.0 source reports
  header/classes/handle/object-read failures as notifications and can return a
  document; skipped-record totals likewise become warnings. Those diagnostics
  do not reach this converter API. A downstream geometry validator cannot recover
  a bar or hole omitted before DXF serialization, or detect a lost unit header.
- Dependency provenance also needs reconciliation: the published converter
  describes its engine as MIT; the actual acadrust 0.4.0 registry metadata and
  source license are MPL-2.0. No application license or dependency was changed.
- LibreDWG's browser wrapper uses GPL-3.0; ODA's browser DWG SDK requires its own
  membership/license assets. Neither was added. No CAD file or private project
  content was uploaded, no vendor account/license was purchased, and no software
  was installed to the user's system.

Decision: keep the current explicit DXF-only importer until a decoder can expose
complete diagnostics, preserve all required fields, pass independent fixtures,
and satisfy the repository's dependency/provenance review. Do not add `.dwg` to
the file chooser or advertise DWG support without that capability. DWG export,
curve approximation, kernel changes and material/default changes are out of scope.

Primary sources, accessed 2026-10-08:
[converter source](https://github.com/ducflair/dwgdxf/blob/138ad35dc9086ef65575a35be86986e8ab4488f2/wasm/src/lib.rs),
[converter API](https://github.com/ducflair/dwgdxf/blob/main/src/index.ts),
[acadrust 0.4.0](https://docs.rs/crate/acadrust/0.4.0),
[LibreDWG](https://www.gnu.org/software/libredwg/),
[ODA membership](https://www.opendesign.com/oda-membership).

Verification, 2026-10-08:

- Passed `check:structure`, `typecheck`, 17 focused workspace-layout/combobox/
  section-DXF tests, production `build`, `check:web-bundle` and
  `git diff --check`. Initial gzip JavaScript is 373.6 KiB within 375 KiB.
- Production browser: the Concrete drawing import, Project import and Rebar
  import show the exact original two paths with `rotate(-90 12 12)`, 14 px SVG,
  1.5 stroke and rounded ends/joins. Export vectors have no rotation. Checked
  both themes and a theme round trip. The existing Detail row retains all four
  controls on one line. Browser warning/error logs were empty.
- `npm test` passed 353 unit tests, then stopped at the same four existing ADSEC
  source-hash failures. Fixtures, manifests and tolerances were not changed.
  Integration gates passed in the preceding DXF container repair; they were
  not repeated for this shared vector-only implementation change.
- Canonical/Claude skill validators and structure/parity checks passed.
  Cross-agent CLI invocation gates remain unexecuted for the previously recorded
  external-transmission approval restriction and unavailable Claude CLI. Schema
  checks do not establish runtime skill discovery.
- No application dependency was added, so no dependency/security change gate or
  numerical benchmark applies. DWG fixture, numerical pipeline and release gates
  have not run; native DWG import remains explicitly unsupported.

Evidence in the task's `workspace-style-qa` directory:
`import-icon-final-light-2026-10-08.png`,
`import-icon-{project,rebar}-dark-2026-10-08.png`,
`import-icon-geometry-2026-10-08.json`, `import-icon-test-2026-10-08.log` and
the isolated `dwg-dependency-audit` source/package review artifacts.

Status: requested icon correction implemented and locally checked. DWG support
is incomplete pending a decoder/provenance contract that passes the stated
input-integrity gates. No engineering acceptance/report status was promoted;
no commit or push was requested.
