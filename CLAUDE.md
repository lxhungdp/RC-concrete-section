@AGENTS.md

# Claude Code Adapter

`AGENTS.md` above is the shared project contract and single always-loaded instruction source.

- Treat every read-on-demand link in it as a required `Read` action before planning or editing the
  affected area; an import is not permission to work from a summary.
- Use plan mode and the documented task packet for Class 3-4 or otherwise result-affecting work.
- After compaction or a long task, re-check the project-root instructions and the relevant linked
  authorities before changing engineering behavior.
- Use `/context` to verify this file loaded when instruction behavior is in doubt.
- Files under `.claude/skills` are discovery adapters. When one is selected, read its linked
  `.agents/skills` source completely and resolve supporting links from the canonical file location.
  Edit workflow substance only in the canonical source, then keep the adapter metadata in sync.
- Do not duplicate engineering rules here; update their mapped authority and the shared contract.
