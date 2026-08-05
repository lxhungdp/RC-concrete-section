# Repository Tools

- `fixtures/`: deterministic generators for checked-in test/example inputs.
- `verification/`: engineering comparison utilities that consume reference material and emit audit
  evidence.
- `architecture/`: repository-boundary and physical-layout checks used by CI/test scripts.

Tools may depend on public workspace-package APIs. Production packages and the web application must
never import from `tools/`.
