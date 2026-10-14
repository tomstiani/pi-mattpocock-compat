# Foreground worktree lifecycle milestone — 14 October 2026

Package `pi-mattpocock-compat@0.1.0-alpha.5`. Requirements: foreground portions of R3/R6, integration-check implementation for R7, and additional R8–R10 evidence. Background/resume ownership and full real-model workflow acceptance remain pending.

## Scope and adaptation

The installed `pi-subagents@0.78.0` automatic worktree lifecycle can force-remove captured temporary worktrees and their branches after patch capture, before integration. That conflicts with the approved R6 retention rule. This adapter therefore creates explicit Git worktrees with durable ownership receipts while continuing to use the existing Pi child runtime. Owned worker calls require `worktree:false` to avoid the temporary allocator and currently require `async:false` for a bounded foreground lease.

The parent creates/checks out the intended integration branch using its native Git workflow. `matt_worktree create` requires that named local branch to be checked out, captures its exact tip, and journals allocation before invoking Git. Each ticket receives a distinct `codex/matt-<ticket>-<uuid>` branch and worktree under `.pi/subagents/matt-compat/worktrees/<uuid>`. Receipts live under the Git common directory's `matt-compat/worktrees/` store. Failed or interrupted allocation never triggers automatic reset or removal.

Cross-directory preflight accepts only a verified owned worktree in the same trusted repository, with matching root, Git common directory, registration, and branch. It does not create a global trust grant. A durable metadata lease permits one owned foreground worker at a time. Only a matching local terminal result releases it; missing, detached, or remote evidence retains the lease. Parent-serialized merger children run in the integration checkout. The adapter does not automatically merge or reset work.

After merge, `validate` checks the expected worker head, commit ancestry, quiescence, source state, and unfinished Git operations. It runs caller-supplied configured command/args checks in the integration checkout with a total timeout ceiling of ten minutes. It journals failure before executing checks, captures durable logs with hashes, and accepts only when every check passes and both heads/source states remain stable. Ignored build artifacts permit validation but prevent removal. Dependent-ticket allocation requires intact passing dependency evidence and starts from the then-current integration tip.

Cleanup saves an expiring plan, then apply revalidates the receipt digest, exact heads, ancestry, Git registration, source state, lease, and hashed logs under a repository operation lock. Removal uses `git worktree remove` without force. Every local branch is retained. A claimed plan is not replayed. Interrupted removal can reconcile metadata only when both the path and Git registration are absent; reconciliation performs no deletion. Explicit stale-lock recovery requires the exact token and a provably exited owner, retaining old owner evidence. Live/unknown owners remain blocked, and inspection works through an operation lock.

## Validation

Environment: Node `26.10.0`, TypeScript `7.0.2`, Pi/sibling runtime libraries `1.0.3`, `pi-subagents` `0.78.0`, and `pi-web-access` `0.40.0`. Upstream baseline: `49dd158d1076134a641b33efb035946536778336`.

```text
MATT_UPSTREAM_CHECKOUT=/tmp/pi-matt-skills-audit npm run check
```

Strict typechecking passed. The suite ran **74 tests: 73 passed, zero failed, one skipped**. The skipped case is the opt-in live public-page web smoke, previously passed in the alpha.4 milestone and unrelated to these worktree changes. All models in this milestone are scripted. See the [saved check log](2026-10-14-worktree-lifecycle-check.txt) and [source/dependency receipt](2026-10-14-worktree-lifecycle.json).

Twenty-six worktree checks were added:

- Actual Pi workers load the skill adapter and commit two dependent tickets in separate owned worktrees. Actual Pi merger children integrate them sequentially, and configured checks run against the integration checkout. Ticket two's recorded base equals ticket one's validated integration head. Eligible cleanup removes the second worktree and retains its branch.
- A real Pi worker failure after writing preserves partial files and blocks cleanup.
- A native bash policy hook can deny worktree Git mutations.
- An owned worker cannot silently switch to background execution.
- Direct disposable-repository cases cover dependency readiness, distinct branches and worktree bases, branch retention, and idempotent cleanup receipts.
- Two simultaneously running writer processes cross a shared readiness barrier and write the same relative filename in separate worktrees without overwriting each other.
- Cleanup refuses tracked, staged, untracked, ignored, unmerged, active/uncertain, and conflicted work; it revalidates new work after a saved plan.
- Failed checks retain logs and block cleanup/dependents. A check that advances the integration head cannot produce passing validation. Missing or tampered logs, changed integration heads, and Git locks block cleanup.
- Forged/foreign ownership is rejected; a changed writer lease invalidates an older cleanup plan.
- Interrupted cleanup reconciles only proven completed removal; stale-lock recovery requires the exact token and an exited owner, retaining owner evidence.
- Ignored build artifacts can coexist with validation but remain protected from cleanup.

The original upstream inventory still matches all 27 published skills and the pinned revision. Package assembly uses `npm pack --dry-run --json --cache /tmp/pi-matt-compat-npm-cache`. No user repository commits, global Pi settings, publication, force removal, branch deletion, or tracker changes were performed; all test Git changes occur in disposable repositories.

## Failures retained and corrections

Initial typechecking caught the fixture provider treating every message content value as an array; narrowing the user message and handling text content fixed the fixture. The first real Pi end-to-end worktree tests then passed.

The first lock-recovery regression failed because `rmSync` without recursive mode cannot remove an empty directory; that cleanup error masked the intended live-owner refusal. Using `rmdirSync` for the empty recovery lock fixed it. The subsequent complete regression passed. No live-owner lock or retained user work was removed to make tests pass.

Further required-case inspection led to two explicit protections: validation records hashed check logs so missing/altered evidence cannot authorize cleanup, and ignored build artifacts are tolerated during integration validation while still blocking deletion. The final suite includes these cases and simultaneous-process writer isolation.

## Limits and next first-version work

R6 remains in progress because background child leases, detached supervisor continuations, interrupted/resumed child recovery, and reload ownership need integration and acceptance. Uncertain leases intentionally remain retained rather than being cleared by age or guessed process state. Native execution outside the checked adapter paths is outside this lease contract. Private metadata is extension-owned; this is not a sandbox against arbitrary Git/bash commands.

R7's commit-bound integration checks are implemented. Full `implement-spec` acceptance still needs the original skill's final independent review, configured tracker/PR handling, and real-model execution. Scripted fixture implementation is not evidence of real-model TDD, design judgment, or spec correctness. All four original target workflows remain pending complete real-model acceptance.
