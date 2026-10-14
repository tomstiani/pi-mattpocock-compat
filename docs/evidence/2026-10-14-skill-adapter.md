# Skill adapter verification on 14 October 2026

The initial skill adapter passes deterministic checks in the real Pi loop.
The current milestone covers loading and invocation-policy enforcement; it
does not establish complete support for any target engineering workflow.

## Environment

- Package: `pi-mattpocock-compat` `0.1.0-alpha.1`.
- Pi: `1.0.3`, with the Pi AI, agent core, TUI, MCP, and codemode packages pinned to `1.0.3` through npm overrides.
- Node: `26.10.0` on macOS. The declared minimum Node version has not yet been tested.
- Upstream skill revision: `49dd158d1076134a641b33efb035946536778336`.
- Upstream set: 27 published skills. Original files were read without modification.
- A scripted local provider supplied predetermined tool calls. No external model or network requests were used in the acceptance fixtures.

## Results

| Check | Command | Result |
| --- | --- | --- |
| Strict TypeScript validation | `npm run typecheck` | Passed |
| Unit checks and actual Pi loop, including original upstream skills | `MATT_UPSTREAM_CHECKOUT=/absolute/path/to/mattpocock-skills npm run check` | 11 tests passed; zero failed or skipped |
| Upstream metadata and bundled-file comparison | `npm run check:upstream -- /absolute/path/to/mattpocock-skills` | Exact revision and content match; zero added, removed, changed, or invocation-changed skills |
| Package assembly | `npm pack --pack-destination /tmp --json` | Passed; extension, source, checker, content lock, and license notices included |

## Verified boundaries

- Native explicit `/skill:grill-with-docs` loads a user-only root skill.
- The `Skill` tool loads `grilling` and `domain-modeling` in the actual Pi loop.
- The same sequence loads the original upstream files from the recorded revision.
- A referenced file is subsequently read using the returned skill directory.
- Argument text remains unchanged, including newlines and shell-like text.
- An automatic attempt to invoke a user-only skill fails.
- Missing, ambiguous, and path-like names cannot initiate filesystem reads.
- A policy change on disk is enforced before a catalog reload.
- A renamed skill, invalid metadata, empty instructions, or a truncated read fails.
- A Pi `tool_call` hook can deny the nested `read`; the adapter returns the denial and no skill instructions.
- Upstream comparison detects changes to supporting files and invocation policy, additions, and removals; it refuses to follow symlinks.

## Corrections during implementation

The first test pass exposed a TypeScript parameter property unsupported by Node’s strip-only loader. It was replaced with an explicit field, and `erasableSyntaxOnly` now catches that class of issue during typechecking. A fixture argument type was also narrowed to Pi’s tool-call argument type. All subsequent checks listed above passed.

## Remaining acceptance

No real-model run has been performed. Asking meaningful questions, updating domain documents, delegated fact-finding, background research, independent reviews, and worktree implementation remain unverified. The four target workflows retain pending acceptance in `compatibility.json`.

Dependency and source hashes are recorded in the companion [verification receipt](2026-10-14-skill-adapter.json). Tests and fixtures remain in `test/` for reproduction.
