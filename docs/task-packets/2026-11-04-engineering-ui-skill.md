# Compact engineering UI skill guidance

Objective: extend the existing workspace-style-design skill so it governs minimal, complete
engineering forms as well as visual consistency. Use general dependency-review criteria, without
embedding a particular material example or imposing a universal form layout.

Documentation/skill-only change. Owners: canonical SKILL.md, its design standard, the matching thin
Claude adapter and the workspace implementation map. The canonical/adapter descriptions now cover
form simplification. The standard requires input classification, a minimal sufficient independent
input set, one authoritative write basis, dependency/consistency checks and verification against
the active calculation contract. Visual guidance favours flat hierarchy, ordinary controls, short
labels and task-relevant information, with readable units, validation and engineering status.

Verification on 2026-11-04:

- `npm run check:structure` passed, including canonical/adapter identity and link parity.
- Platform `quick_validate.py` passed for both skill directories using Python UTF-8 mode. The first
  canonical validation hit the Windows cp949 default; UTF-8 mode resolved that environment issue.
- Explicit and description-triggered Codex CLI reviews passed. Both read the canonical skill and
  standard, identified redundant/conflicting entry, recommended an independent editable set and
  derived readout, and removed visual/interaction clutter while preserving units and validation.
  The initial sandboxed CLI launch could not access its runtime state; the read-only ephemeral
  reviews succeeded with host runtime access. Logs: ignored `outputs/skill-verification/` JSONL files.
- Claude CLI was not found on PATH, so its explicit/implicit runtime checks remain unexecuted;
  schema/parity validation does not establish Claude runtime discovery.
- Diff whitespace check passed. No application, numerical, persistence or report code changed;
  application build/numerical benchmarks were not applicable to this documentation-only change.

No commit or deployment. Skill content and available-Codex behavioral verification are complete;
cross-CLI runtime verification is limited by the unavailable Claude CLI.
