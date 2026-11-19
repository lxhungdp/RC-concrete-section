# Performance Benchmarks

- `equivalent-block/`: standard-independent block-kernel benchmarks and verification notes.
- `stress-strain/`: strain-domain/fibre sampling experiments.
- `cross-model/`: end-to-end comparisons between calculation mechanics.

Package-local hot-loop baselines remain with their owner, for example `packages/pm-analysis/bench`.
Benchmarks measure performance and numerical drift; they do not define engineering acceptance or
replace verification tests.
