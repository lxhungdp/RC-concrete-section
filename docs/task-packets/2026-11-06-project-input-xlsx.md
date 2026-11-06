# Project input Excel exchange

Class 3 exchange and application pipeline change. The workbook and editor adapters in
`@pm/spreadsheet` own this change under development/02 §10 and development/04.

- Objective: exchange Section, Rebar, Material and Loadings in four visible worksheets without
  notes or frozen rows.
- Requirements: DEV-ARCH-006/007, UNITS-005, ENG-MAT-001 and ENG-LOAD-001.
- Keep applied boundaries, rebars and As, material definitions and profile identity, and ordered
  factored ULS loads. Transfer loads about the centroid and declare source units for decoding.
- Create project information, analysis options, resistance and check basis from current project
  defaults on import. The selected material profile determines the analysis and resistance defaults.
- The previous workbook format needs its old profile, units and origin to interpret input values.
  Its extra configuration is outside the import boundary. Invalid input or missing interpretation
  data fails before project publication. P16 UMD and other user-defined concrete models under a
  design Code require the full Project JSON resistance record.
- Verify exact fixture input round trips in canonical units, legacy source-unit interpretation,
  centroidal loads with a nonzero source origin, defaults compared with the project registry,
  and atomic editor Update.
- The workbook format changes. JSON, result exports, standalone table workbooks, mechanical
  models and design-code coefficients are outside this change. Calculations remain Preview.

The 42 focused tests cover file and evaluated-snapshot import, legacy load-reference interpretation,
current profile defaults, strict material validation and canonical input round trips. A production
Edge smoke test exported a KDS example, inspected the four worksheet names, notes and views,
imported it with the default 3D Load Ray restored, and updated through the native Excel editor.
The production build and bundle check passed. The numerical fingerprint matched all 8 sections and
24 quantities with the recorded runtime. The cross-model pipeline benchmark reported no failures.
Evidence is in the ignored `outputs/project-input-xlsx-*` logs and editor screenshot.

Options unit follow-up. Project Export and Open capture the displayed unit selection and record it
in workbook properties. Visible inputs carry matching labels and converted numbers. Legacy canonical
v2 workbooks remain readable. No cell note is written. Visible conversions may round at binary64
precision, with an exact rebar diameter/area source pair retained only if both cells still match it.
The 37 focused tests cover force, signed moments, coordinates, bar diameter and area, strength,
modulus, and curve stress. The 39 fixture/unit round trips cover Metric, US and a mixed selection.
Production Edge confirmed Metric and US downloads, a US import with Metric selected, and editor
Update. The production bundle and unchanged numerical fingerprint passed. Evidence is in the
ignored `outputs/project-xlsx-units-*` logs.
