# Routine form text cleanup

Status: implemented. Class 1/2 presentation-only follow-up to the active-input audit.
The working tree includes that earlier authorized change; preserve it and record this slice separately.

Objective: remove routine clutter, including the default-cap reminder and the populated generated
`Project-selected post-yield steel law.` reason. Apply the user's rule in Materials and Resistance,
and preserve it in AGENTS.md and the canonical workspace standard/skill adapter.

Owners: MaterialPanel, SteelHardeningFields, DesignBasisPanel and one shared modification-reason
field. The shared field hides an existing reason unless Details is opened, shows a required missing
reason and keeps it mounted while typing in the current panel session. All existing handlers,
validators, code/profile status, provenance, units and calculation values remain unchanged.

Remove static block/factor explanations and the default-cap/auto-save paragraphs. Keep concise
evaluated equations, invalid-input messages, profile/Preview status, required units and controls.
No schema, parser, mechanics, factor, acceptance policy, dependency or numerical baseline change.

Gates: structure/docs/traceability/typecheck, focused owner tests, full npm test, production build/
bundle, actual rendered filled/missing/Details reason states and browser light/dark checks. Validate
canonical/adapter parity and the installed CLI skill-discovery gates. Implementation author is
Codex; UI verification does not confer independent engineering/release approval.

## Evidence and impact

- Routine Materials hides the existing generated hardening reason and default-cap reminder.
  Repeated block/factor paragraphs, the automatic-save notice and reason-provenance instructions
  are removed. Compact evaluated equations, active parameter values, units, Preview/profile status
  and actionable validation errors remain.
- One shared ModificationReasonField owns empty/filled/Details visibility for Materials and
  Resistance. Empty required reasons remain editable; an editor started here remains mounted
  through canonical-state echoes for the panel session. Opening Resistance Details exposes an
  existing reason. This changes visibility, not whether a reason is required.
- Separate component rendering confirms that filled reasons produce no routine editor, blank
  reasons produce an editor, explicit Details exposes the stored value, missing-reason validation
  still fails, and rendering does not mutate the DesignBasis or generated provenance.
- Chrome localhost:3001 confirms hardening On -> generated reason hidden in Concrete; no default
  Pmax paragraph; Resistance has no filled editor until Details is opened. Clearing the reason,
  closing Details and typing `Project material review` keeps one stable editor with the exact
  entered text. The original reason is restored before leaving the test; it then hides on the
  fresh Materials panel. Theme round trip is exercised using existing shared primitives.
- `npm test`: pass, including structure/docs/traceability/typecheck, 712 unit tests, five ADSEC
  parser tests, 11 CAD tests, project round trips, recalculated workbooks and PDF checks.
- Final `npm run build` and `npm run check:web-bundle`: pass with isolated
  `PM_NEXT_DIST_DIR=dist/routine-form-text-next`. Initial/Plotly/worker/Excel gzip sizes are
  352.8/1325.4/69.2/248.1 KiB within unchanged budgets. The final production chunks contain none
  of the removed cap or factor-group reminders. Final lint/link/traceability/type checks pass.
- Canonical/Claude-adapter platform validation and repository parity pass. Installed Codex CLI
  explicit and description-triggered read-only skill discovery both identify the new routine-form
  rule. Claude CLI is not installed; no Claude runtime invocation is claimed.

This slice changes presentation only. Existing stored reasons and validation, material law,
resistance factors, UR, report audit data, JSON/workbook versions, and engineering/release status
are unchanged. Earlier active-input changes in the working tree are retained. No commit/push.
