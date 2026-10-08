# Native section DWG import

Objective: route binary DWG to a local browser decoder instead of the ASCII DXF
reader, while retaining the section drawing's single `pm` layer contract.

Class 3: new external input/dependency pipeline. Requirements: ENG-GEO-001/002/005,
ENG-MAT-001, DEV-ARCH-002/004 and the existing DXF-001 through DXF-006 interchange
requirements. DWG-001: native bytes, explicit supported versions and units;
DWG-002: complete reader diagnostics, resolved ownership/layers and no partial
publication; DWG-003: bounded isolated decoding; DWG-004: independently encoded
fixtures and coordinate/diameter/frame evidence.

Owners: development/03 geometry exchange; web drawing file/worker adapters;
tools/drawing-dwg pinned Rust decoder build; existing section-dxf.ts topology
classification and pm-geometry validation; section-drawing-import.ts material
assembly. Current uncommitted work on dev/newUI is preserved.

Contract: DWG decoding runs locally in a disposable Worker, with no uploaded CAD
data. The Rust wrapper projects only closed straight 2D polylines and circles
on `pm` into the existing DXF input contract. It preserves coordinates, radii,
units, closure, widths, bulges, elevation, thickness and extrusion for validation.
No curve approximation, block expansion, unit inference or partial geometry is
permitted. Import remains an editable draft; Apply is the calculation transition.
Export remains ASCII DXF. No mechanics, tolerances, project schema, material
defaults, result/report contracts or acceptance status change.

Blocking failures: unsupported signature/version, malformed/truncated DWG,
decoder diagnostics/skipped records/recovery, unresolved layer or model-space
ownership, unsupported pm entities/blocks/frames, invalid topology/bar disks,
units without explicit choice, invalid materials and input/time/memory/output
limits. State must remain unchanged on failure.

Dependency basis: exact acadrust 0.6.1, MPL-2.0, published source commit
aa82773574654f5f7cb1eaea98f4fa3109a4b6ea, crate SHA-256
1db2bd3da02ed787f3f5c8afba8779dd104b4459b78bb1431b1a0211cc3719f0.
The unmodified library is wrapped; Cargo.lock pins transitive packages. WASM is
loaded only on DWG import. Distribution must include license/source notices and
a reproducible build. Unlike the earlier dwgdxf 2.0.1 audit, this revision exposes
read_with_stats; the earlier packet remains historical evidence, not approval.
Primary sources accessed 2026-10-08:
[acadrust](https://github.com/hakanaktt/acadrust/tree/aa82773574654f5f7cb1eaea98f4fa3109a4b6ea),
[published crate](https://crates.io/crates/acadrust/0.6.1),
[ACadSharp 3.8.0](https://www.nuget.org/packages/ACadSharp/3.8.0).

Oracles: ACadSharp 3.8.0 independently encodes a known mm section with multiple
outers, holes, circles and translated coordinates. Public paired CAD DWG/DXF
fixtures independently check reader coordinates, radii, widths, bulges, normals,
units and closure. Corrupted/truncated inputs, unsupported shapes and metadata
exercise blocking paths. Browser upload tests cover draft preservation, unit
confirmation and both extensions. Analytical section/bar properties remain
owned by existing geometry validation tests.

Required gates: structure, typecheck, focused Rust and web tests, npm test,
remaining integration checks if its existing ADSEC manifest gate stops the run,
build, web-bundle, security/dependency review, bench:pipelines and diff review.
No cross-agent skill change is planned. Native ZWCAD opening and the user's
unprovided DWG file cannot be asserted from fixture evidence.

Verification status: in progress; native probes read public R2000/R2007/R2018
fixtures with zero skipped records, recovered errors and structured diagnostics.
Reader informational notifications are not permission to ignore other warnings.
Implementation and independent end-to-end evidence remain pending.

Browser cost review requested during implementation:

- The candidate WASM is 1,730,306 bytes (658,886 bytes with gzip); bindings are
  8,062 bytes. The 586,836-byte notice bundle is not loaded by the decoder.
  Decoder/Worker are imported only for a DWG file, not on ordinary page startup.
- Local Node 24 WASM measurements, not browser/device benchmarks: initialization
  3.1 ms; first 5.7 KiB fixture 19.4 ms, second 6.6 KiB section 1.4 ms;
  public 1.08 MB R2018 fixture 39.4 ms. Linear WASM memory grew from 1.31 MiB
  to 1.56 MiB for small sections and 10.56 MiB for the larger fixture. These
  are observed values, not guarantees or the whole browser's memory footprint.
  The 256 MiB cap is a maximum, not upfront allocation.
- Seven actual-WASM web tests passed: exact independently encoded R2000/R2018
  and legacy 2D geometry, metadata rejection, units, malformed/truncated input,
  memory cap, file routing, response validation and source/asset hashes.
  Structure, typecheck and production build passed for the candidate.
- Public paired DXF decimal text differs from the binary doubles by a few final
  digits; an exact text-vs-binary comparison failed. It was retained as an audit
  finding, not fixed by loosening a tolerance. ACadSharp direct binary-DWG
  semantic audit data was collected for a separate exact decoder comparison;
  that comparison and browser upload/full dependency gates remain pending.
- The additional Rust/WASM build toolchain, pinned dependency/license review,
  format diagnostics and regression scope are materially more complex than the
  existing TypeScript ASCII-DXF path. For a browser-first product prioritizing
  a small maintenance surface, DXF-only is recommended. The user was asked to
  choose DXF-only or on-demand DWG support before the capability is finalized.

Final browser-first scope decision, 2026-10-08:

- After providing the cost review and a reasonable opportunity to choose, the
  recommended DXF-only scope was retained. The entire native prototype, fixtures,
  locked Rust dependencies and generated WASM were moved to the task's QA
  `dwg-native-audit/browser-prototype` directory. No DWG library, Rust toolchain
  dependency, WASM asset or decoder Worker remains in the application/repository.
  No claim of completed native-DWG interoperability/security verification is made.
- The delivered change is a file-boundary/feedback correction: ASCII DXF remains
  the supported format. The file adapter checks byte size, extension and binary
  signatures, including a renamed DWG, before the existing text parser. A blocked
  DWG gives explicit ASCII-DXF save/import instructions for ZWCAD. The chooser
  stays .dxf-only and draft/material/applied state is unchanged on failure.
- Final delivered slice: Class 2, a result-identical file-boundary refactor with
  explicit unsupported-format feedback. Its affected owner, regression,
  integration and production-build checks are required; the native Class 3
  dependency/capability is archived rather than added to the product.
- The final slice changes no valid geometry, numerical rule, schema, material
  assignment, report or acceptance status. The native Class 3 feature is not
  shipped; its audit above is retained as prototype evidence only. Final file
  routing regressions and existing application gates are recorded below.

Final DXF-only verification:

- Passed structure, typecheck and all 16 focused file/DXF tests, including
  valid ASCII input, native DWG with either extension, binary DXF, other file
  types and byte-limit rejection. The aggregate npm test unit phase passed;
  its ADSEC phase still fails at the same four existing source-hash mismatches
  recorded in the preceding task packets. No manifest/oracle/tolerance changed.
- Passed production build, CAD tests, project round trip, both Excel result
  exports, demand workbook, PDF report and diff checks. Final initial JavaScript
  is 374.2 KiB gzip (375 KiB budget), with no DWG decoder assets/Worker/dependency
  remaining. No numerical kernel or schema change is delivered, so additional
  numerical benchmarks were not selected for this format-feedback slice.
- Browser: imported the independent ASCII fixture (13 vertices, three bars,
  two outers and one hole), then applied it. Choosing its native DWG counterpart
  produced a blocking alert. The original boundary, Final state, area 365,000
  mm2 and displayed centroid remained unchanged. Browser warning/error log clean.
  Evidence: workspace-style-qa/dxf-only-dwg-rejection-preserved.png.

Status: the DXF-only correction passes focused/application checks. The overall
repository aggregate gate is still non-green due to the existing ADSEC source
provenance failures. Native DWG support is not shipped or claimed verified. The
prototype and cost report are retained outside the application for review. No
commit/push, design skill edit or engineering acceptance promotion occurred.
