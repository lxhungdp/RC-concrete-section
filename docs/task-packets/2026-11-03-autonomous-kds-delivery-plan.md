# Autonomous KDS Delivery Plan

Date: **2026-11-03** (Asia/Seoul). Status: **delivery proposal; execution system not installed**.
Inspected source revision: `9310a5aa2d033a2295185ac6a7c5450f107105ca`, initially clean.

## 1. Objective and scope

Complete the Stage 1 P-M software and its KDS verification evidence toward an engineering release,
using a coordinator that delegates bounded tasks, verifies their outcomes, records progress, and
continues without a new user prompt for each task. The user confirmed this delivery target during
the planning review.

KDS is the primary delivery scope. Other existing standards remain preview/reference capabilities;
they do not expand the KDS release claim. Preserve their existing behavior unless a separately
scoped task requires a change. Stage 2 member behavior, moment-curvature, stability, slenderness,
second-order effects, detailing and a multi-application portal are outside this plan.

The first release must name the exact KDS profiles, editions, resistance routes, material domains,
topologies and numerical modes it covers. Do not silently omit an unresolved route to obtain a
release. A narrower first release requires an explicit, recorded scope/design-basis decision.

Refactoring, UI and performance tasks must preserve current engineering inputs and results.
Record a fixed current baseline before those tasks. A proven engineering defect follows a separate
Class 3/4 change with authority, impact and independent verification; result preservation does not
justify retaining a defect or rewriting an oracle.

This plan introduces no engineering value, tolerance, formula, acceptance policy or approved profile.
It does not activate a goal, schedule background work, change global settings, or authorize publication.

## 2. User intent recovered from project history

A targeted review read messages from eight related Codex chats, including older project creation,
commercial-readiness, KDS review, adaptive sampling, UI and comparison discussions. It was not an
exhaustive review of every ChatGPT or Claude session. Relevant recurring requirements were:

| Requirement | Delivery consequence |
|---|---|
| KDS is the intended design basis; other standards are mainly for review | Prioritize edition-specific KDS evidence and approval. |
| Preserve results while improving software | Separate result-identical work from numerical corrections; retain current full-precision evidence. |
| Build reusable packages and a coherent pipeline | Change the owner first; avoid feature-specific engineering logic. |
| Run in the frontend browser | Preserve worker separation; verify memory, cancellation, bundle size and responsiveness. |
| Documentation must reflect implementation | Resolve stale summaries before treating the roadmap as an executable backlog. |
| UI must be simple, compact, consistent and suitable for engineering | Reuse the current workspace design authority instead of reopening historical style decisions. |
| Test each meaningful step before continuing | Use evidence-based task transitions and independent review. |

Historical requests for 22 stations, particular tolerances or older menu layouts are commit-scoped
context, not current instructions. The current control map and resolved owning authorities govern.
Raw chat transcripts and private account details are deliberately excluded from repository state.

## 3. Current readiness and conflicts

The repository already implements two mechanics, geometry/material validation, Fixed and Adaptive
paths, workers, uncertainty-aware preview classification, project exchange, workbook audits and
watermarked PDF previews. It already has four specialist skills. It lacks a durable delivery
coordinator and an accepted-result/released-report workflow.

These findings seed the first work packets; they are not engineering verdicts:

| ID | Evidence | Required disposition |
|---|---|---|
| C-01 | [Engineering release gates](../engineering/06-verification-acceptance-and-change-control.md) define A-G; [detailed V&V](../09-verification-validation-and-release.md) defines A-F differently | Use the engineering owner and semantic gate names; reconcile the lower-authority mapping. |
| C-02 | [Roadmap](../development/06-current-state-and-roadmap.md) says all contracts are v1; [persistence owner](../development/02-data-contracts-persistence-and-versioning.md) declares nested DesignBasis v3, matching `DESIGN_BASIS_VERSION` | Separate outer project version from nested contracts. Resolve the legacy normalization/migration policy against the higher-level release contract before changing parsing or approving Gate B. |
| C-03 | The index/roadmap describe fixed-only production; [control map](../01-control-map.md), `pm-project` options/validation and analysis code contain independent Adaptive paths | Reconcile capability descriptions against owning mechanics/sampling authorities and current callers. Do not choose numerical defaults from a summary. |
| C-04 | [Report pipeline](../development/04-loadings-analysis-results-and-report-pipelines.md) says `@pm/results` does not exist; [architecture](../development/01-architecture-and-package-boundaries.md) and the package define its shared classification role | Correct the stale ownership description while retaining the future accepted-result extension as unfinished. |
| C-05 | Architecture describes dropping late worker results; `apps/web/application/analysis/client.ts` now restarts workers and replays surviving jobs | Distinguish implemented worker interruption from remaining cooperative inner-loop/fallback cancellation. |
| C-06 | Root scripts include `test:adsec` and `verify:adsec`; CI does not invoke them | Determine intended release coverage and add missing gates only through a scoped CI task. An omission is not evidence that tests fail. |

Release gaps remain: immutable result identity and trust, per-run numerical acceptance, complete
geometry/material and structural verification matrices, independently reviewed KDS profiles,
KDS Appendix biaxial minimum-eccentricity interpretation, and accepted-result reporting. Recheck
historical compression-endpoint concerns against current sources/code rather than reopening them
from chat conclusions alone.

## 4. Execution architecture

Use one primary coordinator with specialist subagents. Begin with one implementer and one independent
verifier; use the remaining worker slot for source research or a disjoint implementation task. This
session exposes four concurrent agents including the coordinator. Logical roles can outnumber
available slots and execute in sequence.

| Role | Owned outcome | Existing workflow and boundary |
|---|---|---|
| Coordinator and integrator | Ready queue, task packets, ownership, evidence, integration, checkpoints and milestone completion | New `pm-autonomous-delivery` skill; no invented engineering decisions. |
| KDS source and requirements specialist | Exact source/edition, clause trace, applicability, unresolved decisions and independent calculation inputs | `pm-code-profile`; no profile promotion or unsupported value selection. |
| Geometry and material implementer | One bounded input/normalization/material pipeline slice | `pm-engineering-change`; no detailing or scope expansion. |
| Mechanics and acceptance implementer | One bounded solver/surface/check/uncertainty/result-contract slice | `pm-engineering-change`; preserve independent mechanics and mapped owners. |
| Application and report implementer | Browser workflow, stale state, worker integration, report consumption and visual QA | `workspace-style-design` for presentation; engineering workflow whenever contracts or output meaning change. |
| Independent verifier and release auditor | Reproduce failures, challenge claims, inspect oracles, run gates and assemble release findings | `pm-verify`; review without repairing the candidate being assessed. |

The independent qualified structural engineer and release approver required by engineering/06
remain named human review roles. AI subagents can prepare evidence and challenge implementation;
they cannot provide those professional approvals.

### Skills and agent definitions

Add one canonical `.agents/skills/pm-autonomous-delivery/SKILL.md` and its matching thin
`.claude/skills/pm-autonomous-delivery/SKILL.md` adapter. Its trigger is a request to deliver a bounded
P-M milestone autonomously with multiple roles. It must explicitly instruct delegation within the
authorized milestone and route to the four existing specialist skills rather than duplicate them.
Ordinary one-file edits and read-only questions should not activate the delivery loop.

Keep role contracts and the continuation protocol in supporting references. Put live task state
outside the skill. Extend [development/05](../development/05-coding-quality-and-ai-workflow.md) first
when implementing the shared delivery protocol; update the control map only if ownership changes.

Optional project-specific `.codex/agents/*.toml` profiles can package the specialist instructions.
The documented custom-agent format must be checked against the installed CLI before adoption.
They must not duplicate the canonical workflows or imply a separate permissions sandbox. Avoid
fixed model choices in the initial implementation; inherit the current authorized settings.

### Continuation mechanism

Use the built-in Goal mode for the primary coordinator's sustained work. Skills describe procedure;
Goal mode supplies continued execution toward the declared outcome. Goals retain current sandbox
and approval boundaries. Local work requires the computer/workspace to remain available. See
[official long-running-work guidance](https://learn.chatgpt.com/docs/long-running-work).

Custom agents can be defined at project scope, and subagents inherit the parent session's
permissions. See [official subagent guidance](https://learn.chatgpt.com/docs/agent-configuration/subagents).

Use a thread heartbeat only for a requested later continuation or external dependency check, with
notifications on meaningful change or required action. Do not create a second independent writer.
A custom SDK supervisor is a later option if the pilot demonstrates an unmet recovery need; it is
not a prerequisite. Goal mode, a skill or a scheduler does not imply unlimited runtime or usage.

## 5. Durable work and evidence contract

Proposed repository artifacts, to be implemented after the baseline review:

| Artifact | Purpose |
|---|---|
| `docs/delivery/kds-stage1/backlog.json` | Task graph, requirements, contracts, scope, dependencies, status and next actions. |
| `docs/delivery/kds-stage1/evidence.json` | Durable index of command outcomes, candidate/oracle identities and reviewed evidence; references local run logs with explicit availability. |
| `docs/task-packets/<task>.md` | Human-readable engineering task contract using the existing template. |
| `docs/delivery/kds-stage1/decisions.md` | Resolved decisions and explicit authority/approval dependencies. |
| `docs/delivery/kds-stage1/checkpoint.json` | Active milestone, task claims, integration revision, next ready work and remaining gates. |
| A git-ignored local run directory | Logs and generated artifacts; copy only deliberately reviewed evidence into the repository. |

Each task records an ID, source requirement IDs/sections, milestone, dependencies, allowed files,
author/reviewer, change class, input/output contracts, blocking failures, required commands/oracles,
base revision, candidate identity, evidence references and next action. Planning IDs must not be
misrepresented as established engineering requirements.

Use task states `proposed -> ready -> running -> awaiting-review -> done`, with explicit `rework`
and `blocked` branches. These are delivery states, not `reviewed`, `verified`, `acceptedResult` or
`releasedReport`. A worker handoff is only a candidate; the coordinator closes a task after its
declared criteria and independent review pass.

The evidence ledger records source commit plus dirty-diff identity, runtime/tool versions, command,
exit status, oracle identity, artifact hashes, author/reviewer and coverage limitations. Represent
`pass`, `fail`, `not-run` and `unavailable` separately. A content hash establishes identity, not
professional approval or profile trust. Historical passes cannot fill current evidence cells.

Use one coordinator writer for the queue/checkpoint. Shared schema, manifests/lockfile, control map,
aggregate documentation, common CSS and result DTOs require exclusive ownership. Parallel coding
uses approved isolated worktrees or demonstrably disjoint files. Review and final tests run against
a frozen candidate; do not test a checkout while another agent mutates it. Recheck the integrated
state, because a worker's earlier pass does not verify the combined candidate.

## 6. Coordinator loop and stopping rules

1. Load the milestone, checkpoint and work graph; inspect the current diff and active claims.
2. Invalidate affected evidence when code, contracts, authority or runtime changes.
3. Select ready tasks with complete authority packets and nonconflicting file ownership.
4. Delegate bounded work with requirements, allowed files, failure behavior and expected handoff.
5. Collect the candidate and obtain independent review from requirements and raw artifacts, without
   feeding the reviewer an intended answer. An oracle must not reuse the production search path.
6. Integrate through the coordinator, run required gates, inspect the final diff and record evidence.
7. Rework a diagnosed defect, block an unresolved dependency, or mark the task done; checkpoint every
   meaningful transition and select the next ready task without waiting for another user prompt.

On restart, reconcile orphaned claims with actual worker/process/worktree state before reclaiming
them. Use a single-run lock to prevent duplicate coordinators. Preserve user changes. Do not start
a second runner merely because a session is temporarily quiet.

A retry must contribute a changed diagnosis, new evidence or a concrete correction. Repeating the
same failed command/prompt without new information is not progress. Operational run/task limits
must be explicit; reaching one leaves the remaining work open and resumable. Do not manufacture a
completion claim to fit a budget.

Missing normative sources, conflicting engineering authority, unavailable independent evidence or
needed human approval block their affected branch. Continue unrelated ready work. Notify the user
with the precise missing decision/evidence when progress depends on it. Stop a run when its named
milestone passes, no authorized ready work remains, an operational limit is reached or the user
requests a stop. Distinguish milestone completion from engineering release.

Do not edit baselines, loosen tolerances, bypass failed gates, grant trust from imported JSON, or
promote draft profiles to keep the loop moving. Existing authorization governs commits, pushes,
external messages and publication; this planning request does not authorize those actions.

## 7. Milestones and initial work graph

| Milestone | Work | Exit evidence |
|---|---|---|
| M0 — Baseline and authority | Resolve C-01 to C-06; define the exact KDS release matrix; inventory current requirements, symbols, tests, oracles and approval dependencies | Current baseline report with explicit pass/fail/unexecuted cells; no unresolved conflict in any path selected for implementation. |
| M1 — Delivery pilot | Implement the coordinator skill/adapter, bounded role contracts, durable state, ownership and restart protocol | A fresh session resumes the next authorized task from state; independent review rejects missing evidence; skill invocation gates pass in installed platforms. |
| M2 — Trusted result foundations | Implement canonical identity, currentness, immutable lifecycle contracts and fail-closed acceptance seams | Draft/unsupported/stale/cancelled/unconverged inputs cannot construct accepted output; external input cannot grant profile trust. |
| M3 — KDS and numerical evidence | Complete clause/applicability matrix, independent calculations, topology/material/mechanics checks, per-run uncertainty and KDS interpretation decisions | Required source, independent oracle and named structural-review evidence for the declared release matrix. |
| M4 — Application and report integration | Drive released output from accepted results; carry identity/provenance/approval; finish stale-state, worker/resource/fallback and report QA | Preview remains visibly preview; release rejects ineligible results; selected reports match the same accepted artifact. |
| M5 — Release dossier | Run the integrated gates; assemble reproducibility, security, limitations, residual risks and rollback evidence | All applicable engineering/06 gates A-G pass with named approval for the declared scope. Public release remains a distinct action. |

M0 precedes autonomous engineering edits. M1 can use resolved, non-result-affecting tasks while an
authority branch remains blocked. KDS source acquisition/review can proceed alongside M2. M3's
numerical and profile work may run in parallel on disjoint ownership. M4 can implement rejection
paths before profile approval, but cannot create accepted output from draft profiles.

Initial work items:

| ID | Dependencies | Owner | Deliverable and acceptance |
|---|---|---|---|
| AUT-01 | none | Coordinator + verifier | Current baseline and evidence inventory; preserve historical artifacts and current numeric baseline. |
| AUT-02 | AUT-01 | Requirements specialist | Conflict register with owner/source/impact/disposition; explicit source or human-decision dependencies. |
| AUT-03 | AUT-02 for affected scope | Coordinator + structural reviewer | Declared first-release KDS scope and requirement-to-gate matrix; unresolved approval remains open. |
| AUT-04 | AUT-01, resolved workflow basis | Coordinator | Shared delivery protocol, one canonical skill and thin adapter; structure/schema/runtime invocation checks. |
| AUT-05 | AUT-04 | Software implementer + verifier | Queue/checkpoint/claim/evidence helpers; dependency, ownership, duplicate-run, failed-gate and resume behavior verified. |
| AUT-06 | AUT-05 | Coordinator + verifier | Bounded documentation/CI pilot; one fresh-session continuation and reviewed task closure from saved state. |
| KDS-01 | AUT-02 | KDS specialist | Exact sources and clause/applicability matrix; unavailable source is a blocking gap. |
| RES-01 | AUT-03, AUT-06, resolved contracts | Contracts implementer | Identity/lifecycle/trust design and implementation; no acceptance from draft or imported status. |
| NUM-01 | AUT-03, AUT-06 | Numerical implementer + verifier | Missing geometry/material/mechanics oracle cells closed with independent evidence. |
| NUM-02 | RES-01, NUM-01, approved policy | Numerical implementer + verifier | Per-run uncertainty/topology/acceptance evidence and fail-closed boundary tests. |
| KDS-02 | KDS-01, AUT-03 | KDS specialist + qualified reviewer | KDS route interpretations and independent calculations reviewed; profile status changes only through approved evidence. |
| SYS-01 | AUT-06, stable owner contracts | Application implementer + verifier | Remaining resource/progress/cancellation/stale-state tasks proven against browser and fallback behavior. |
| RPT-01 | RES-01, NUM-02; KDS-02 for acceptance | Report implementer + verifier | Accepted-result release seam, identity/provenance and workbook/PDF agreement; ineligible output rejected. |
| REL-01 | All required scope items above | Release auditor + approver | Frozen integrated candidate, current gate dossier, limitations and approved rollback; remaining gaps prevent release. |

## 8. Validation and completion evidence

Apply the repository's existing change classes and required commands; this plan does not replace
their acceptance thresholds. At M0 collect runtime, structure, typecheck, focused tests, full
`npm test`, production build and relevant numerical benchmark evidence. Use `bench:verify` in the
same environment; the distinct portable mode is evidence only for its declared comparison policy.
Keep P16 and AdSec comparisons within their documented applicability and provenance limits.
Run security for dependency/CI work and the bundle gate after web production builds.

The new skill requires canonical/Claude parity, the platform validator and one explicit plus one
description-triggered invocation in each installed CLI. Local checks found Codex CLI 0.152.0 and
Claude Code 2.1.150 installed; versions/help alone do not prove authentication, discovery or runtime
behavior. Use isolated permitted workspaces for invocation tests and report unavailable gates.

The delivery pilot must demonstrate dependency ordering, exclusive file ownership, blocked-branch
continuation, rejection of missing/failed review evidence, crash/context-loss recovery, duplicate-run
prevention and completion tied to the integrated candidate. Test those behaviors rather than skill
wording. If no executable helper is needed, exercise realistic bounded skill runs instead of adding
infrastructure solely to test it.

Software/evidence preparation can finish with clearly enumerated human approval dependencies.
Engineering release cannot finish until the governing specification, independent structural review,
per-run acceptance and release approval gates actually pass. Both outcomes must be reported plainly.

## 9. Planning review verification

This change is documentation-only and changes no runtime code, schema, report or numerical result.
The planning review used three read-only subagents, targeted chat-history reads and repository
inspection. It did not rerun the complete numerical/release suites or invoke external model tasks.
Verification for this documentation-only proposal:

- `npm run typecheck`: passed on Node 24.20.0 / npm 11.19.0.
- `npm run check:structure`: the `tsx` CLI could not create its local IPC socket under the sandbox
  (`EPERM`). The same repository checker passed via
  `node --import tsx tools/architecture/check-repository-layout.ts`; the npm wrapper remains
  environment-blocked, not recorded as a successful invocation.
- All local targets among the ten Markdown links exist; whitespace was checked.
- Two subagents reviewed the completed proposal. The evidence-index path requested in review was
  added; no other actionable planning finding remained.

M0 must establish the full current baseline before autonomous implementation begins. These checks
verify the proposal and basic repository health, not KDS release readiness.
