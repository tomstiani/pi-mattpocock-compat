# Pi Matt Pocock Compatibility Package

Build a small Pi package that lets Matt Pocock’s original skills use Pi’s skill loading, child agents, and Git worktrees reliably. Preserve the upstream workflows and reuse an existing subagent runtime.

**Status:** First version implemented locally; current patch `0.1.1` adds parent launch-tool readiness checks. All four original target workflows passed small live ChatGPT acceptance; deterministic regression and release evidence are recorded below. Package remains private and unpublished.

## Approved decisions

- Preserve upstream behavior. Document every necessary adaptation.
- Use `pi-subagents` as the first supported agent runtime.
- Keep Matt’s original skill files externally managed and unmodified.
- Require deterministic tests and a small real-model acceptance run before claiming a workflow is supported.
- Start with `grill-with-docs`, `research`, `code-review`, and a two-ticket `implement-spec` workflow.

## Goals

1. **Preserve Matt’s workflows.** Run the original skill files with minimal adaptation.
2. **Make delegation reliable.** Give child agents the skills, tools, context, and files their assignments require.
3. **Support parallel implementation safely.** Keep work recoverable through worktree creation, review, integration, and cleanup.
4. **Stay small and maintainable.** Reuse Pi and an existing subagent runtime.
5. **Make compatibility measurable.** Publish exactly which versions and workflows have been verified.

## Requirements

| ID | Requirement | Acceptance criterion | Status |
| --- | --- | --- | --- |
| R1 | Load skills by name. Translate references to the `Skill` tool into Pi-compatible loading, preserving arguments and relative paths. | A skill can load its dependencies and bundled references correctly. Missing skills produce actionable errors. | Verified |
| R2 | Respect invocation rules. Preserve `disable-model-invocation` and explicit user invocation. | User-only skills remain unavailable for automatic selection. | Verified |
| R3 | Configure child capabilities explicitly. Children receive required skills, repository instructions, and tool providers. | Preflight detects missing capabilities before dispatch. | Verified |
| R4 | Provide independent parallel reviews. Standards and Spec reviews use separate contexts against the same pinned revision. | Both reports return separately; a failed reviewer cannot produce a successful aggregate result. | Verified |
| R5 | Support background research. The parent remains usable while research runs. | Completion or failure arrives with a durable findings path. Session-exit behavior is documented and tested. | Verified |
| R6 | Preserve implementation work. Each implementer uses its own branch and worktree based on the intended integration branch. | Work remains recoverable after errors, cancellation, or interrupted integration. Cleanup never removes unmerged work. | Verified |
| R7 | Verify integration. Run the project’s configured checks after integration. | Delivery identifies the tested commit, results, and unresolved findings. | Verified |
| R8 | Follow host permissions. Package tools respect Pi’s tool controls and project trust. | No hidden approval bypasses or additional confirmation system. | Verified |
| R9 | Track upstream compatibility. Record supported Pi, subagent-runtime, and skill revisions. | A compatibility check identifies upstream additions, removals, and changed dependencies. | Verified |
| R10 | Preserve reuse provenance. Retain licenses and attribution for copied code. | Every reused component records its source, revision, and local modifications. | Verified |

Requirements move from **Pending** to **In progress**, **Implemented**, then **Verified**. An implemented requirement becomes verified only when its acceptance evidence is recorded below. Mark a requirement **Blocked** only with its blocker and the next action documented.

## First release acceptance

Use a disposable repository to prove all four workflows. Loading an extension or passing unit tests alone does not establish workflow support.

| Workflow | Successful behavior | Requirements |
| --- | --- | --- |
| `grill-with-docs` | Loads nested skills and their references, asks the user questions, and updates the intended domain documents. | R1, R2, R3, R8 |
| `research` | Runs in the background while the parent remains usable, writes cited findings, and delivers completion or failure with the findings path. | R1, R3, R5, R8 |
| `code-review` | Runs independent Standards and Spec reviewers against one pinned diff, preserving separate reports and surfacing child failures. | R1, R3, R4, R8 |
| `implement-spec` | Implements two dependent tickets on the correct worktree bases, reviews and integrates the work, runs validation, and cleans up only eligible worktrees. | R1, R3, R4, R6, R7, R8 |

The implementation scenario must include a dependency: the second ticket starts after the first ticket has been integrated. Also test concurrent worktree isolation so parallel writers cannot overwrite each other.

Required failure cases:

- Missing skill, reference, tool provider, or runtime capability.
- Attempted automatic invocation of a user-only skill.
- Failed or cancelled child agent, including a single failed review axis.
- Merge conflict and failed integration checks.
- Interrupted execution with recoverable work and evidence.
- Cleanup requested for dirty or unmerged work.
- Parent-session exit during background research.

## Initial scope boundaries

Defer automatic skill routing, a new workflow UI, publishing to npm, experimental Claude-specific skills, and support for multiple subagent runtimes. The package must not become a replacement engineering methodology or a second subagent runtime.

Installation and upgrades must not rewrite Matt’s original skill files. Any adapter guidance must remain distinguishable from upstream content.

## Delivery checklist

- [x] Investigate Pi, the current upstream skills, and existing integration packages.
- [x] Agree on goals, requirements, the initial runtime, and scope boundaries.
- [x] Save this plan as the project tracking artifact.
- [x] Establish package structure, version pins, and the test harness.
- [x] Implement skill loading and invocation policy with deterministic tests in the real Pi loop.
- [x] Verify the complete `grill-with-docs` workflow, including domain-document updates, fact-finding, and real-model acceptance.
- [x] Implement child capability setup and preflight for new direct launches in the current directory.
- [x] Check the package-owned review workflow, native owned-worker resumes, and foreground/background worktrees; keep packaged roles as leaf agents. Arbitrary user-authored workflow scripts remain outside the adapter dispatch contract.
- [x] Implement and deterministically verify independent parallel review against captured evidence.
- [x] Implement and deterministically verify background research, native completion/failure delivery, output paths, and parent exit.
- [x] Complete real-model research and review acceptance.
- [x] Implement foreground worktree ownership, integration validation, recovery journals, and safe cleanup.
- [x] Complete background worktree leases and interrupted/resumed child recovery.
- [x] Deterministically verify dependent tickets with actual Pi workers/mergers and simultaneous isolated writer processes.
- [x] Complete the full implement-spec scenario with final review, tracker handling, and real-model acceptance.
- [x] Record the initial upstream inventory, bundled-file hashes, and metadata attribution.
- [x] Extend compatibility and provenance checks as runtime integration and code reuse are added.
- [x] Run the required failure scenarios and real-model acceptance cases.
- [x] Publish the verified compatibility matrix and installation instructions.

## Compatibility baseline

These are the pinned versions used by the recorded verification. The four target workflows have acceptance evidence for this baseline; the 27-skill inventory does not certify every upstream workflow. Dependency upgrades require a new compatibility check and relevant regression/acceptance runs.

| Component | Investigation baseline | Package verification |
| --- | --- | --- |
| Pi | Version `1.0.3`; local development dependencies pinned | Deterministic adapters and four live ChatGPT scenarios passed |
| Matt Pocock skills | Commit `49dd158d1076134a641b33efb035946536778336`; 27 published skills | Content inventory matches; original nested skill loading passed |
| Subagent runtime | `pi-subagents` `0.78.0`; pinned optional peer and development dependency | Direct foreground/background children, independent review, owned worktrees and native resume passed |
| Web research provider | `pi-web-access` `0.40.0`; pinned optional peer and development dependency | Child registration, internal-address policy, public-page smoke and live primary-source research passed; hosted-search backends require their own configuration |

## Worktree adaptation

The pinned runtime's automatic worktree path can remove captured worktrees and branches before integration. That conflicts with R6. This package therefore owns explicit Git worktree allocation and durable receipts, while retaining the existing Pi child runtime. No automatic patch-capture cleanup is used. Owned workers set `worktree:false` and explicitly choose foreground or background mode. Background/revived runs retain their durable lease until exact native process proof is reconciled. Foreground merger leases serialize integration. No branch is deleted by cleanup; unknown process evidence preserves ownership. Wrong bases are refused instead of resetting existing work.

## Reuse candidates

Inspect and reuse narrowly. A candidate is not automatically a dependency, and no third-party implementation has been copied into this project yet.

| Project | Useful ideas or components |
| --- | --- |
| [pi-matt-subagent](https://github.com/hu3rror/pi-matt-subagent) | Separate review roles, background completion delivery, and research tool setup. |
| [pi-matt-implement-flow](https://github.com/toomanyopenfiles/pi-matt-implement-flow) | Child skill selection, captured review bundles, worktree handoffs, and integration checks. |
| [FradSer Pi packages](https://github.com/FradSer/pi-packages/tree/main/packages/matt-pocock) | Upstream tracking and compatibility checks. |
| [pi-matt-skill-router](https://github.com/zhangnan/pi-matt-skill-router) | Route explanations and missing-skill diagnostics, without importing automatic selection behavior. |

## Current verification

Current package: **0.1.1**, local and unpublished. On 14 October 2026, `MATT_UPSTREAM_CHECKOUT=/tmp/pi-matt-skills-audit npm run check` passed strict typechecking and **83 tests**, with **0 failures** and **1 optional live-network smoke skipped** (84 total). The [saved regression output](evidence/2026-10-14-current-regression-check.txt) includes the added persisted-session activation regression. No live model calls or global configuration changes were made for the documentation refresh.

The [documentation check](evidence/2026-10-14-documentation-check.json) verifies local links/anchors, JSON and shell example syntax, and agreement between package, lockfile, and compatibility versions. Upstream revision and content still match the pinned inventory. Historical evidence reports and runtime code were left unchanged by this documentation refresh.

The [parent dispatch report](evidence/2026-10-14-parent-dispatch.md) records the registration-versus-activation defect and the exact saved-session state with both launch paths inactive. Both eager startup and `--exclude-tools subagents_enable` recovered a copy of the same saved conversation. New sessions with the runtime already loaded expose a launcher or loader normally, subject to host tool restrictions. The README documents installation persistence, one-time project setup, per-agent model settings, and recovery.

The [first-version acceptance report](evidence/2026-10-14-first-version.md) records four small live ChatGPT scenarios using the original skills, separate from scripted regression checks. The earlier live network smoke remains evidence for that recorded version; the current skipped smoke is not a fresh network verification. External search backends and external tracker/PR services are not collectively certified.

## Historical acceptance evidence

The following reports retain the state and limits recorded at each milestone. Their pending statuses and source hashes describe those snapshots, not today's checkout. Source manifests are dated evidence and are not silently rewritten when documentation changes.

| Milestone | Recorded evidence |
| --- | --- |
| [Skill adapter](evidence/2026-10-14-skill-adapter.md) | 11 checks; skill loading, invocation policy, upstream inventory, package assembly. |
| [Child capabilities](evidence/2026-10-14-child-capabilities.md) | 22 checks; explicit roles and real foreground Pi child with a scripted provider. |
| [Independent review](evidence/2026-10-14-independent-review.md) | 35 checks; parallel fresh review axes, captured evidence, separate reports and failure handling. |
| [Background research](evidence/2026-10-14-background-research.md) | 48 checks; detached lifecycle, output paths, native notifications, parent exit, and public-page smoke with a scripted model. |
| [Foreground worktree lifecycle](evidence/2026-10-14-worktree-lifecycle.md) | 73 passed, one optional smoke skipped; dependency bases, actual workers/mergers, checks, concurrent writers, and safe cleanup/recovery journals. |
| [First version 0.1.0](evidence/2026-10-14-first-version.md) | 79 passed without skips, including opt-in network smoke; four small live ChatGPT workflow scenarios recorded separately. |
| [Parent dispatch correction 0.1.1](evidence/2026-10-14-parent-dispatch.md) | Initial patch regression: 82 passed, one optional network smoke skipped; subsequent saved-session recovery checks recorded separately and included in the current 84-test suite. |

For future verification, record the date, requirement IDs, source/dependency revisions, command or scenario, actual results, and durable evidence path. Retain failures and distinguish offline fixtures, live network calls, and real-model runs.

## Progress log

| Date | Update | Next action |
| --- | --- | --- |
| 14 October 2026 | Goals, requirements R1–R10, initial runtime, and first-release acceptance approved. Tracking artifact created. | Establish package structure, version pins, and test harness. |
| 14 October 2026 | Package `0.1.0-alpha.1`, `Skill` adapter, policy checks, upstream inventory checker, and deterministic Pi integration tests implemented. All 11 tests passed against Pi `1.0.3`, including original upstream nested loading. | Implement explicit child capabilities and launch preflight, then verify delegated review and research. |
| 14 October 2026 | Package `0.1.0-alpha.2` adds six child profiles, child-only skill/provider bridges, and direct-launch preflight. All 22 tests passed, including actual foreground child execution and missing/denied capability failures. | Verify independent review and background research; extend launch contracts to their dispatch paths. |
| 14 October 2026 | Package `0.1.0-alpha.3` adds captured three-dot review evidence and a guarded named workflow with parallel fresh Standards/Spec children. Child failure/cancellation fails the aggregate; explicit missing spec is skipped. | Implement background research with durable findings and completion/failure delivery, then continue real-model and recovery acceptance. |
| 14 October 2026 | Package `0.1.0-alpha.4` adds prepared background research, unique bound findings files, native lifecycle notifications with path annotations, and the pinned child web provider. Deterministic lifecycle and public-page smoke acceptance recorded separately from model quality. | Implement worktree ownership, integration, recovery, and safe cleanup; then run the remaining first-version workflow and real-model acceptance cases. |
| 14 October 2026 | Package `0.1.0-alpha.5` adds journaled foreground worktrees, owned worker leases, dependency-base checks, integration validation with hashed logs, reviewed cleanup plans, and explicit lock/removal recovery. | Complete background worktree ownership and interrupted/resumed child recovery, then run the remaining original-workflow and real-model acceptance cases. |
| 14 October 2026 | First version `0.1.0` completes native background run binding, terminal reconciliation, same-worktree resume, merger serialization, and all four small live ChatGPT scenarios. Full implement-spec closes the fixture tracker, reviews both axes, validates final HEAD and safely removes both eligible worktrees while retaining branches. | Local delivery complete; installation and any later publication remain separate user actions. |
| 14 October 2026 | Patch `0.1.1` checks parent launcher activation as well as child capabilities, blocks preparation of unlaunchable research, reports loader status, and documents recovery of saved sessions created before runtime installation. Native fixtures now use the correct activation config and isolate global skill discovery. | Use native loader activation or eager startup; preserve host tool restrictions. |
| 14 October 2026 | Documentation refreshed for installation, one-time project setup, persistent model overrides, new versus resumed sessions, activation config location, and verification scope. Current regression: 83 passed, one optional network smoke skipped. | Keep dated evidence intact; update current status and rerun relevant checks when behavior changes. |

Update this checklist, requirement statuses, acceptance evidence, and progress log after each meaningful milestone. Record changes to approved scope or behavior before treating them as new requirements.
