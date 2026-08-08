# Contributing to P-M Column Designer

Thank you for helping improve P-M Column Designer. Contributions are welcome from structural
engineers, researchers, software developers, reviewers, and users working with different design
standards and markets.

## License of contributions

This project is licensed under the MIT License. By submitting a pull request or other contribution,
you agree that your contribution is provided under the same MIT License and confirm that you have
the right to submit it. Contributors retain copyright in their own contributions.

Do not submit proprietary source code, confidential project data, licensed standard text, or other
material that you do not have permission to redistribute.

## Ways to contribute

- report a reproducible defect or unclear engineering result;
- add independent hand-calculation or benchmark evidence;
- improve geometry, material, solver, performance, report, documentation, or UI packages;
- propose a design-code adapter for another edition, jurisdiction, National Annex, or market;
- review calculation assumptions, applicability limits, sign conventions, or numerical tolerances;
- improve translations and user-facing engineering explanations.

## Before opening a pull request

1. Search existing issues and documentation for the same topic.
2. Open or reference an issue for changes that alter engineering equations, conventions, code
   interpretation, public schemas, package ownership, or result meaning.
3. Keep the change inside the package that owns the behavior. Do not duplicate engineering formulas
   in React, reports, importers, or test helpers.
4. Add tests proportional to the engineering and software risk.
5. Run the relevant verification commands and disclose anything that does not pass.

```bash
npm ci
npm run typecheck
npm test
npm run build
```

For numerical-kernel or performance changes, also run the relevant benchmark suites:

```bash
npm run bench:verify
npm run bench:strain-sampling
npm run bench:equivalent-block
npm run bench:pipelines
```

Do not overwrite a numerical baseline merely to make a test pass. Explain and independently review
every intended result change.

## Requirements for a new design-code or market adapter

A new code-labelled profile starts as `preview`. It must not be presented as a released engineering
check until its verification gates and independent discipline review are complete.

Every proposal must provide:

- exact organization, document, edition, amendment, jurisdiction and National Annex where relevant;
- a clear separation between section mechanics, material law, resistance format and demand rules;
- clause or table traceability using lawful citations without copying restricted standard text;
- applicability limits and typed fail-closed behavior outside those limits;
- declared assumptions, units, signs, strain domains, endpoints, transition rules and axial limits;
- tests at table nodes, transition boundaries, intermediate values and excluded ranges;
- at least one independent hand calculation or reproducible external reference case;
- forward/inverse agreement and cross-method comparisons where two mechanics are offered;
- documentation and report labels that keep `preview` visibly distinct from a verified check.

The repository does not accept silent fallbacks from an unsupported code/model to another standard.
Code editions and resistance methods must remain versioned identities.

## Pull-request expectations

- describe the problem and engineering intent before describing implementation details;
- list affected packages, schemas, UI surfaces, reports and documentation;
- include test and benchmark evidence;
- call out numerical changes, interpretation choices and unresolved limitations;
- keep unrelated formatting or refactoring out of the same change;
- preserve existing copyright, license and third-party notices.

Review approval is a software contribution decision, not certification of a structural design
standard. The Stage 1 product boundary remains Section Resistance Only unless a separately reviewed
project stage expands it.
