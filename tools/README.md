# Repository Tools

- `fixtures/`: deterministic generators for checked-in test/example inputs.
- `verification/`: engineering comparison utilities that consume reference material and emit audit
  evidence.
- `architecture/`: repository-boundary and physical-layout checks used by CI/test scripts.
- `release/public-snapshot.mjs`: builds the slim public snapshot on the local `public` branch. The
  full repository and CI live in the private `internal` remote; the public `origin` remote receives
  only `git push origin public:main`. Its `EXCLUDED` list names what stays private.

Tools may depend on public workspace-package APIs. Production packages and the web application must
never import from `tools/`.
