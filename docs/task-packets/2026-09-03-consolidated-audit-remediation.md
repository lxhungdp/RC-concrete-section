# Consolidated Audit Remediation

Date: 2026-09-03  
Change class: **Class 2 — result-identical verification, test, provenance, and scope hardening**  
Status: implementation complete; required verification in progress; no merge, tag, deployment, or
profile promotion authorized

## Objective

Independently assess `PMAUDITFIXLIST.md` against the current repository and close only findings that
are both reproducible and supported by the owning project authorities. Improve verification
coverage and provenance without changing section mechanics, design-code coefficients, resistance
surfaces, utilization, project schema, or calculation precision.

## Engineering requirement IDs

- `ENG-MAT-002`, `ENG-MAT-005`: independently expressed material-law ordinate and boundary tests;
- `ENG-SOL-006`, `ENG-SOL-007`: independent dense sampling evidence and explicit regression gates;
- `ENG-ACC-003`, `ENG-ACC-004`: external-reference provenance, residual explanation, and immutable
  expected evidence;
- `DEV-ARCH-006`, release Gates A, B, and F: CI-visible verification with no generated-source drift;
- product-scope truthfulness requirements in `engineering/01` and `AGENTS.md`.

## Owners and allowed files

- material-law contracts: `packages/pm-materials/src/**` and package-owned tests;
- sampling verification only: `bench/stress-strain/strain-domain-sampling.ts` and its owner docs;
- P16 external comparison: `tools/verification/p16/verify.ts`, the committed source note, project
  snapshot, expected JSON, root scripts, and CI;
- scope and verification status: `docs/engineering/01-product-scope-and-workflow.md`,
  `docs/development/06-current-state-and-roadmap.md`, the public-preview release note, and this packet.

## Input contract

The audit file is evidence and a set of hypotheses, not an authority. The current branch state at
`c154513` is the implementation under review. Governing project documents and exact profile source
provenance outrank the audit, examples, existing outputs, and regression baselines.

## Output contract

- every implemented material law has package-owned stress-ordinate tests at its branch points,
  using equations written independently in the tests;
- KDS post-ultimate evaluation remains an explicitly documented diagnostic continuation and cannot
  be mistaken for an admissible resistance state;
- the stress-strain sampling benchmark uses a dense 144-direction reference and independently
  refines its station schedule, evaluates the complete non-cap reference set, reports signed
  under/over prediction separately, and fails on declared regression bounds as well as missing
  intersections;
- the P16 verifier has a non-mutating check mode suitable for CI, preserves committed expected data,
  and records the pure-compression residual decomposition and assumption mismatch;
- SI-only input/display and reinforcement-ratio/design-detailing exclusions are explicit;
- no draft profile, Preview result, or report is promoted by these changes.

## Blocking failure cases

- any production capacity fingerprint or result DTO changes;
- any invented EN 1992 or AS 3600 minimum-eccentricity, capacity-factor, reinforcement-ratio, or
  applicability value;
- treating a dense faceted surface or the UMD program as normative authority;
- a verification command that rewrites its committed oracle in check mode;
- a benchmark limit selected to make a changed algorithm pass rather than to preserve measured,
  reviewed behaviour;
- claiming Node.js 24 evidence from the local Node.js 22 host.

## Independent oracles and acceptance evidence

- direct equations in package-owned material tests, evaluated at zero, branch transitions,
  plateau/hardening, ultimate, and post-ultimate points;
- 144-direction reference with independent station refinement, compared on every non-cap vertex;
- the committed distributable UMD source transcription for P16, with concrete and reinforcement
  contributions decomposed analytically at the pure-compression pole;
- bit-identical capacity fingerprint and the repository gates required by `AGENTS.md`.

## Confirmed but blocked or separately staged findings

- EN 1992 and AS 3600 minimum-eccentricity applicability, AS 3600 factor branches, and per-code
  reinforcement-ratio limits require the exact published standard and named engineering review;
- axial-cap radial-fill ledger sign-off requires a named discipline decision; Preview trace already
  labels the face as geometric and retains the pre-cap physical state;
- Node.js 24.20.0 is pinned in repository/CI but is unavailable on the current local host;
- linter adoption, one end-to-end UI path, undo/redo/autosave, `noUncheckedIndexedAccess`, and
  move-only god-module splits are separate software changes. The indexed-access migration currently
  emits about 1,483 diagnostic lines and must not be hidden by non-null assertions.

## Out of scope

Adding or interpreting normative profile values, changing an engineering equation or tolerance,
adding a unit-conversion system, implementing member/detailing compliance, promoting verification
status, redesigning UI error/undo flows, committing, merging, tagging, or deploying.
