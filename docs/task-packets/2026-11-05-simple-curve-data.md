# Compact resistance point text

Class 1 presentation change, superseding the raw-series text format in the earlier plotted-points
packet. Objective: Nominal/Design point tables with only component moments, resultant magnitude
and P, preceded by N# and Criteria as requested in the follow-up. Preserve precision, signs,
original curve-point indices, stage-specific criteria, closure, path breaks, stage/units, excluded-cap qualification and
snapshot/copy/save behavior. Field Data remains its metric snapshot. No engineering results change.

Owners: chart-text formatter and chart trace/click adapters. Sources are existing analysis-owned
resultants and resultantMomentCoordinate, with existing display converters. No local material,
resistance or utilization calculation, schema change or new dependency. Guard missing/hidden data.
Tests: independent mixed-sign resultants, theta versus magnitude, units, opposite branch, both
stages, cap/gap/closure, long arrays, rendered dialog and exact copy/save.

Implemented: N# is the original one-based plotted-curve index; Criteria uses returned stage-specific
station labels and honest geometric/Fixed-P intersection labels. Column padding is presentation-only;
tab delimiters retain spreadsheet pasteability and numeric values are never rounded or changed.
The earlier metadata-heavy text format is superseded. Field metric Data remains available.

Verification passed: 39 focused tests; final 685-unit application/package suite; lint (structure,
documentation, traceability, TypeScript); root production build and bundle budgets. The first broad
run saw one unrelated in-progress spreadsheet-protection expectation failure (683/684); its owner
updated that expectation and the final full run passes. The initial build was blocked by concurrent
Gridcraft patch/artifact mismatch; the owning build was refreshed independently and final root build
passes. No dependency/artifact or unrelated expectation was edited for this text task.

Real Edge checks passed on both dev and production: 10 populated dialogs across two mechanics and
Capacity/Demand; exact per-point values, indices and criteria against the displayed curves, units,
copy and UTF-8 save parity, unchanged analysis-job counts, field text, previous-frame qualification,
literal Unicode, drag/resize, narrow/dark, cancellation and clipboard failure. Screenshots/text/logs
are under ignored `outputs/simple-curve-data/`. Production checks wait for the new workspace's plot
to replace the outgoing Demand plot before capturing the Capacity oracle. No engineering or release
status is promoted. The temporary production server was stopped; the user's dev server was retained.
