# Child capability milestone — 14 October 2026

Package: `pi-mattpocock-compat@0.1.0-alpha.2`. Requirements: R3 and portions of R8–R10. This is deterministic integration evidence, not real-model workflow acceptance.

## Delivered behavior

Six package-discovered roles have explicit allowlists, fresh contexts, inherited repository instructions, and child-only skill loading. A researcher bridge expects the pinned optional web provider. `matt_preflight` resolves the effective role using the public `pi-subagents/preflight` API and inspects discoverable child skills and registered tool providers. New direct calls to owned roles repeat the check before dispatch. Parent-only CLI skills, user-only dependencies, missing providers, denied required tools, disabled repository instructions, and unsupported per-call overrides fail explicitly.

The automatic guard currently covers new direct launches in the current directory. Workflow scripts, nested launches, resumes, other directories, worktree lifecycle, review aggregation, and background completion remain pending. A successful registration probe does not validate credentials, remote services, or session-start behavior. Native runtime checks still apply.

## Environment and results

- Pi and sibling runtime libraries: `1.0.3`.
- `pi-subagents`: `0.78.0` (pinned optional peer and development dependency).
- Optional `pi-web-access`: `0.40.0` expected; absent during tests. Only its missing-provider failure was exercised.
- Node: `26.10.0`; TypeScript: `7.0.2`.
- Original Matt Pocock skills: `49dd158d1076134a641b33efb035946536778336`.
- Source snapshot hashes and dependency versions: [machine-readable receipt](2026-10-14-child-capabilities.json). The package has no project commit yet; hashes identify the tested source instead.

`MATT_UPSTREAM_CHECKOUT=/tmp/pi-matt-skills-audit npm run check` passed strict typechecking and all **22 tests**, with zero skips. Tests run actual Pi loops with scripted providers in isolated temporary directories, without account credentials or external model calls.

The actual foreground scout child received a repository `AGENTS.md`, exposed `Skill`, loaded the `tdd` fixture, and had no shell, write, or delegation tools. Other tests cover effective worker configuration, inactive runtime, absent child skills, parent-only skills, user-only dependencies, disabled repository context, denied tools, absent research provider, blocked direct dispatch, and blocked per-call capability overrides. The original 11 skill/inventory checks also pass, including loading original upstream nested skills.

`npm run check:upstream -- /tmp/pi-matt-skills-audit` reports the exact pinned revision and content match, with no added, removed, changed, or invocation-policy changes across 27 published skills.

`npm pack --dry-run --json --cache /tmp/pi-matt-compat-npm-cache` passes and includes all six profiles plus parent, child, and web extension entry points. No package was published or installed into user settings.

## Failures retained and corrections

Early fixtures put `async` inside `options`; the native runtime requires a top-level field. Correcting that fixture enabled actual child dispatch. Another fixture used a string for a settings tool override, but the runtime requires an array; the corrected test now exercises the intended denied-tool diagnostic. These failures exposed invalid fixtures, rather than missing-tool acceptance results.

The first package dry run attempted the default npm cache and failed with `EPERM`. Repeating it with the existing temporary project cache succeeded. User cache ownership and global configuration were not changed.

## Remaining acceptance

R3 remains in progress until the additional dispatch paths are integrated. Independent parallel review against one pinned revision, background research with durable findings and completion/failure delivery, worktree recovery/integration, and all four real-model workflow runs remain unverified.
