# Data Workspace

`excel/` contains legacy spreadsheet inputs that are not currently part of an automated
verification gate. They are kept separate from `docs/examples`, whose files have explicit test or
traceability ownership.

Before promoting a data file into verification evidence, record its provenance and units, move it
under the appropriate `docs/examples` category, and add a deterministic consumer/test.
