# Independent review milestone — 14 October 2026

Package `pi-mattpocock-compat@0.1.0-alpha.3`. Requirements: implemented R4 and additional portions of R3/R8–R10. This is deterministic integration evidence using actual Pi sessions and scripted providers. No real-model acceptance is claimed.

## Delivered behavior

`matt_review_prepare` captures a committed review target from the repository root. It resolves the supplied base and `HEAD`, pins their merge-base, and records the diff and commit list. Standards are captured from the pinned head; the supplied spec is read into the bundle. Root `CODING_STANDARDS.md` and `CONTRIBUTING.md` are included when present in that commit, and the caller supplies other applicable standards discovered through the original skill. The full smell baseline is read from the effective original `code-review` skill at runtime. The adapter neither bundles nor rewrites the upstream skill.

Evidence access uses native `bash`, `read`, and `write`, including their policy hooks. Invalid refs, empty diffs, truncated output, empty specs, and unrecognized baseline layout fail explicitly. The saved bundle is content-addressed under `.pi/matt-compat/reviews/<digest>/bundle.json`; the in-memory binding to its launch is scoped to the current session and limited to 16 distinct snapshots.

Preparation returns a `subagent` call for the named `matt-compat.review` workflow. The launch guard rejects capability overrides and background mode, checks the current directory/session binding, and repeats child capability preflight. The public `pi-subagents/workflow-resources` API expands captured tasks into `runs.all`, with both children explicitly foreground and fresh. Standards and Spec receive separate task bodies containing the same captured diff/commit IDs. Findings are not merged or reranked.

Each axis retains native session/report paths. Failed or cancelled child execution fails the workflow while retaining available sibling reports. Successful execution does not imply a clean review. An explicitly unavailable spec skips the Spec axis and records the reason.

## Validation

Environment: Node `26.10.0`, TypeScript `7.0.2`, Pi and sibling runtime libraries `1.0.3`, `pi-subagents` `0.78.0`. Original skill checkout: `49dd158d1076134a641b33efb035946536778336`.

`MATT_UPSTREAM_CHECKOUT=/tmp/pi-matt-skills-audit npm run check` passed strict typechecking and **35 tests**, with zero failures or skips. The 13 new review checks cover:

- Two actual Pi child sessions crossing a shared start barrier before either finishes, with no parent conversation or sibling findings in their model contexts.
- Equal pinned target IDs in both tasks and separate native sessions and durable output files.
- One failed reviewer producing a workflow error while the successful sibling report remains available.
- A scripted provider cancellation producing an incomplete failed review.
- Explicit missing-spec skip without a pass claim.
- Invalid revision, empty diff, unrecognized baseline, denied native read, denied native Git command, and truncated diff failing before child launch.
- Rejected launch overrides.
- Moving `HEAD` after preparation leaving both children on the captured target; uncommitted implementation content is also excluded.
- Capturing all 12 baseline smells, including the first and last, from the unmodified original upstream `code-review` skill.

The prior 22 adapter, child capability, policy, and upstream checks remain passing. Tests use isolated temporary agent directories, strip account credentials, and make no external model calls.

`npm run check:upstream -- /tmp/pi-matt-skills-audit` still matches the exact pinned revision and all 27 published skill inventories, with no content or invocation-policy drift. Package assembly uses `npm pack --dry-run --json --cache /tmp/pi-matt-compat-npm-cache`; nothing was published or installed into user settings.

Source/dependency hashes and results are recorded in the [machine-readable receipt](2026-10-14-independent-review.json). The package remains uncommitted locally, so source hashes identify this milestone rather than a project commit.

## Failures retained and corrections

The first review run had four failures. Workflow children inherited the runtime's background default, where a process-local fixture provider was unavailable. Explicit `async: false` on each child now implements the original skill's foreground review behavior. Returning `executionComplete: false` did not itself make the native workflow fail; the script now emits the separate summary and throws when an axis fails. Empty shell output was rendered as a nonempty display placeholder, so empty-diff detection now reads the native structured output and rejects truncated evidence.

A subsequent original-baseline assertion counted 14 bold list items because it also counted the two precedence/judgment rules. Restricting the assertion to the upstream smell-entry syntax confirms all 12 smells while preserving those two rules in the captured baseline.

## Limits and next steps

R4 is implemented, with real-model workflow acceptance pending. The cancellation test injects a provider abort; it does not establish recovery from user interruption, session exit, or reload. Independent contexts share repository access and are not filesystem sandboxes. The adapter depends on the parent following the original skill's issue/spec lookup and standards discovery. It reviews committed changes only, and launch bindings must be prepared again after reload.

R3 covers direct launches and this named review workflow. Other workflow scripts, nested dispatch, resumes, and worktrees remain pending. Background research, its durable findings/completion/failure delivery, full integration recovery, and all four real-model workflow acceptance runs remain ahead.
