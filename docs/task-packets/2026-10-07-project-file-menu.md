# Project file menu and share-link removal

Objective: make Import/Export unambiguous with file-direction icons and visible labels; remove
project share-link creation, clipboard notices, URL-fragment loading and the unused Brotli codec.

Change class: 3 for application input-route and dependency removal; no numerical owner changes.
Authorities: development/01 application boundaries; development/02 sections 2, 8 and 10;
development/05 testing/dependency workflow; engineering/06 section 6.

Owners/allowed files: development/02 first; SectionDrawingClient and menu styles (including the
geometry route); share-only adapters/tests; web package imports/dependency and lockfile; bundle
gate for the removed codec; this packet. Preserve pre-existing workbook and unrelated user work.

Input/output contract: only explicit Excel/JSON files, example selection and recent-file actions
can apply projects. URL fragments no longer decode/apply engineering inputs. Import validation,
applied project snapshots, autosave, canonical schema, units/signs and calculation kernels are
unchanged. Import/Export labels follow the selected file format and retain their busy state.

Blocking failures: compilation or remaining references to deleted share adapters; accidental
change to file parsing/project apply/recents; remaining share control/URL loader; production
bundle/security gate failures. No compatibility layer or replacement sharing service is added.

Oracles/gates: exact canonical project XLSX/JSON round trips; existing examples/recents and full
unit tests; structure/typecheck; npm test; production build/bundle; security audit after removing
the share-only dependency; UI inspection of Excel/JSON action labels, collapsed examples and both
routes; a former share fragment must not apply its embedded project. Pipeline benchmark provides
unchanged calculation evidence. Removed share tests only exercised the deleted feature.

Impact: no numerical, schema, result-classification or report change. Existing project share URLs
stop loading projects; users transfer inputs with Excel/JSON files. Out of scope: numerical kernels,
design-code rules, workbook content changes, report exports, dependency upgrades, deployment.

## Verification

Implemented the requested controls and removed all share-only UI, source, tests and dependency
entries. Remaining lockfile entries exactly match HEAD; no dependency was upgraded. The four
deleted share tests account for the unit count changing from 340 to 336.

Passed on Node 24.20.0 / npm 11.19.0:

- structure, typecheck, all 336 unit tests and git diff whitespace checks;
- all 10 workbook tests, including exact full-document round trips of 14 independent JSON files;
- CAD (11 tests), canonical JSON roundtrip and cross-model pipeline benchmark (no failures);
- production build and bundle gate: initial gzip 371.7 KiB / 375 KiB, Excel lazy chunk
  248.1 KiB / 300 KiB; the removed Brotli codec has no production import or WASM budget;
- main and Geometry menus visually inspected: visible Import/Export labels, Excel/JSON accessible
  names, no Share control, and the Example files group still collapsed by default;
- a valid formerly generated share URL was loaded and reloaded: its geometry was not applied,
  area remained zero, no share success/error notice appeared, and the URL fragment was not consumed.
  The disposable local tab/server were closed; the unrelated existing port-3001 server was preserved.

Aggregate npm test passed structure/typecheck/unit phases and failed at the same four pre-existing
ADSEC source-hash conflicts. CAD/JSON roundtrip were run separately; later report-export phases
did not run in this follow-up and their preceding workbook-task evidence remains scoped there.
ADSEC fixtures, source evidence and oracles were preserved.

The required production security audit failed: 7 vulnerabilities (1 low, 2 moderate, 3 high,
1 critical), including critical Next.js and high brace-expansion, sharp and source-map-js advisories.
The retained dependency graph exactly matches HEAD; these packages were not changed by removal
of brotli-wasm. No audit fix or unrequested upgrade was performed. Installed Next.js remains
16.3.0 while the manifest/lock pin 16.3.5, as in preceding tasks.

Status: requested input/UI removal is implemented; aggregate/security gates remain incomplete.
No numerical acceptance, released-report or deployment claim. Native file dialogs/downloads were
not retested for this label edit; their handlers and validation remain unchanged.
