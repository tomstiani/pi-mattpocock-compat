# Pi Matt Pocock compatibility

A small compatibility layer for [Matt Pocock’s original skills](https://github.com/mattpocock/skills) in Pi. Goals, requirements, progress, and acceptance evidence live in [the project plan](docs/project-plan.md).

Current local version: **0.1.1**. This package has pinned runtime dependencies. It supplies skill loading, explicit child roles, checked delegation, captured parallel review, background research, preserved ticket worktrees, and upstream drift detection. The project plan and evidence distinguish deterministic checks from live model acceptance. It is not published to npm.

## Current behavior

- The `Skill` tool lets one model-invoked skill load another by name, preserving its argument text and reference directory.
- The adapter uses only Pi’s effective skill catalog. It does not scan additional directories or install skills.
- Reads go through Pi’s `read` tool, including tool hooks and permission checks.
- User-only skills must be invoked explicitly with Pi’s native `/skill:name` command. The model-callable adapter rejects them.
- Truncated, invalid, renamed, or unavailable instructions fail with an explanation. A partial read is never presented as a loaded skill.
- Six packaged roles cover scouting, implementation, Standards review, Spec review, research, and integration. Each has an explicit tool allowlist and fresh context.
- `matt_preflight` checks whether the parent launcher is active, resolves the effective role through `pi-subagents`, checks discoverable skills and child tool providers, and reports repository instruction files. New direct `subagent` calls to these roles repeat the check before dispatch.
- `matt_review_prepare` captures review evidence and returns a named workflow that runs independent Standards/Spec children in parallel. Failed children fail the workflow; separate native report paths are retained.
- `matt_research_prepare` binds a background researcher to a unique Markdown output and a saved request. Native completion/failure wakes the parent, with a companion output-path annotation.
- `matt_worktree` journals ticket branches/worktrees, validates exact integrated commits with configured checks, and plans cleanup that refuses dirty, unmerged, stale, or uncertain work.
- `/matt-compat` reports the effective catalog and parent launcher/activation-tool status.
- The upstream check detects published-skill additions, removals, content/reference changes, and invocation-policy changes without fetching or rewriting upstream files.

Loading returns instructions for the current agent to follow. It does not execute a workflow or start an agent by itself.

## Verified versions

Version `0.1.1` adds parent launch-tool readiness checks and saved-session activation recovery diagnostics. The current regression result is recorded in [the project plan](docs/project-plan.md#current-verification); the [activation fix report](docs/evidence/2026-10-14-parent-dispatch.md) explains the reproduced failure.

The first version, `0.1.0`, passed 79 regression checks and small live ChatGPT scenarios on Pi `1.0.3`, `pi-subagents@0.78.0`, `pi-web-access@0.40.0`, and upstream skills commit `49dd158d1076134a641b33efb035946536778336`.

| Workflow | Verified behavior |
| --- | --- |
| `grill-with-docs` | Nested skills/references, questions and answers, scout facts, glossary updates |
| `research` | Background execution, useful parent work, cited findings, completion and output-path delivery |
| `code-review` | Independent parallel Standards/Spec reports on a pinned diff; unresolved findings surfaced |
| `implement-spec` | Two dependent background ticket workers, correct bases, serialized integration, final review, fixture tracker closure, exact-commit checks, eligible cleanup |

The [acceptance report](docs/evidence/2026-10-14-first-version.md) links durable results and recovery limits. This certifies the named scenarios, not every workflow in the 27-skill inventory, every hosted search service, or an external tracker/PR service.

## Local development

The test environment is pinned to Pi `1.0.3`; Node `22.19.0` or later is required. `compatibility.json` records target dependencies, and `package-lock.json` pins the installed development tree. `pi-subagents` `0.78.0` is an optional peer and pinned development dependency. `pi-web-access` `0.40.0` is also an optional peer and pinned development dependency; this package loads its web bridge only for research children.

```bash
npm ci --ignore-scripts
npm run check
```

Tests include a scripted provider in the real Pi loop. Default tests make no network or external-model calls and use isolated home/agent directories without inheriting account credentials or globally installed skills. The fixture sets activation mode in the native runtime config and separately tests cold, activated, excluded, and resumed-session tool selection. The optional live web smoke fetches one public page through the real provider, using a scripted model. This verifies tool execution and policy behavior, not model judgment or complete engineering workflows.

To also exercise the actual upstream skill files from a local checkout:

```bash
npm run check:upstream -- /absolute/path/to/mattpocock-skills
MATT_UPSTREAM_CHECKOUT=/absolute/path/to/mattpocock-skills npm test
```

The checker reads the upstream published-skill manifest and hashes each skill’s instructions, scripts, references, and assets. A different Git revision is reported separately from content drift. The initial content baseline is commit `49dd158d1076134a641b33efb035946536778336`.

## Install and start using it

Use Pi `1.0.3` and Node `22.19.0` or later for the verified setup. From this checkout, install its pinned dependencies and register both packages with Pi. Replace the example checkout path:

```bash
cd /absolute/path/to/pi-mattpocock-compat
npm ci --ignore-scripts
pi install npm:pi-subagents@0.78.0
pi install /absolute/path/to/pi-mattpocock-compat
```

The package is local and unpublished. Keep the checkout at its installed path. Installing only `extensions/index.ts` supplies adapter tools but does not register the packaged agent profiles; use the package installation for delegated workflows. The researcher loads the pinned `pi-web-access@0.40.0` beside this checkout, so a separate global web package is not required by this adapter.

### Install the original skills once

Matt's original skills are installed separately. If you already installed them in a shared Pi location, keep that installation and skip this example; duplicate copies can create name collisions. To install the exact tested revision manually:

```bash
mkdir -p "$HOME/.local/share"
git clone https://github.com/mattpocock/skills.git "$HOME/.local/share/mattpocock-skills"
git -C "$HOME/.local/share/mattpocock-skills" checkout 49dd158d1076134a641b33efb035946536778336
mkdir -p "$HOME/.agents/skills/mattpocock"
cp -R "$HOME/.local/share/mattpocock-skills/skills/engineering" \
      "$HOME/.local/share/mattpocock-skills/skills/productivity" \
      "$HOME/.agents/skills/mattpocock/"
```

This example assumes the clone and destination are new. Pi discovers these skill directories recursively. A user/shared installation makes dependencies available to ticket worktrees; parent-only `--skill` CLI arguments do not satisfy child dependencies. Keep the original files unmodified and update them deliberately, checking drift against `upstream.lock.json`.

### Configure each project once

Start Pi from the project you want to work on and run:

```text
/skill:setup-matt-pocock-skills
```

The original setup skill establishes that project's issue tracker and documentation conventions. Then optionally run `/matt-compat` and ask:

```text
Check matt_preflight for matt-compat.worker and matt-compat.researcher.
If the native loader is available, call subagents_enable first and retry.
Report any missing skills, tools, or launcher activation.
```

Use Pi's normal project-trust controls for owned worktrees. Preflight checks native tool activation and child capabilities, not credentials, model entitlement, network availability, or an external bridge's tool projection.

### Use it in later sessions

Package installation and per-agent model settings persist. There is no adapter startup command to run every session; `/matt-compat` is an optional diagnostic. New sessions with the runtime loaded expose either `subagent` directly or `subagents_enable`, which the agent calls when delegation is authorized. Model switching does not itself reset a saved session's tool selection.

Invoke the workflow you need, for example:

```text
/skill:grill-with-docs I want to build ...
/skill:research Investigate ...
/skill:code-review Review this branch against ...
/skill:implement-spec Implement the approved spec and its tickets ...
```

`implement-spec` needs the spec, tickets, blocking relationships, and tracker configuration. User-only skills use Pi's explicit `/skill:name` command; a model cannot automatically load them through `Skill`. `grill-with-docs` loads `grilling` and `domain-modeling`, asks for decisions, and records resolved domain terms. ADR creation remains conditional on the original criteria.

Start a new process or reload after package/skill changes so the resources are refreshed. **A new process that resumes an old conversation is not a new session**; the activation recovery below applies to preserved tool selections.

## Per-agent models

The six packaged roles do not pin a model. Without a role override or `subagents.defaultModel`, they inherit the main Pi session's model. Configure persistent overrides in your active Pi agent directory's `settings.json` (on this machine, `~/.config/pi/settings.json`) or in the project's `.pi/settings.json`; project settings take precedence.

For a Sol parent and Luna research/scouting, merge this block into your existing settings, preserving other keys:

```json
{
  "subagents": {
    "agentOverrides": {
      "matt-compat.researcher": {
        "model": "openai-codex/gpt-6-luna",
        "thinking": "medium"
      },
      "matt-compat.scout": {
        "model": "openai-codex/gpt-6-luna",
        "thinking": "low"
      },
      "matt-compat.worker": { "model": "inherit" },
      "matt-compat.merger": { "model": "inherit" },
      "matt-compat.standards-reviewer": { "model": "inherit" },
      "matt-compat.spec-reviewer": { "model": "inherit" }
    }
  }
}
```

Select Sol for the main Pi session normally. The overrides select child models; they do not configure authentication or switch the parent. Use model IDs available in your own Pi registry/account. The Luna split is a configuration example; recorded live workflow acceptance used `openai-codex/gpt-6.1-sol`. Existing running or resumed children retain their resolved model/capabilities; use a new independent launch for changed role assignments.

Use settings rather than editing the packaged profiles. The adapter rejects per-call model/tool/context overrides on its checked launch paths so preflight and dispatch use the same effective role configuration.

## Parent launcher activation and recovery

Version `0.1.1` fixes preflight reporting success when `subagent` is registered but inactive. `/matt-compat` displays launcher/loader status, and `matt_preflight` returns `parentDispatch`. Research preparation refuses an unlaunchable job before writing a request or findings placeholder.

| Diagnostic | Meaning and next step |
| --- | --- |
| `subagentActive: true` | The native parent launcher is active. An inactive loader is normal in eager mode. |
| `subagentActive: false`, `activationToolActive: true` | Ask the agent to call `subagents_enable({})`, then retry preflight/preparation. |
| `subagentRegistered: true`, both active flags `false` | A saved tool selection or a host restriction can leave both paths inactive. Use saved-session recovery below, then inspect exclusions if needed. |
| Launcher absent from the host inventory | Check runtime extension loading and session allowlists/exclusions. An installed dependency alone does not activate the extension. |

### Recover an older saved conversation

In automatic mode, a session created before the runtime was loaded can retain an old tool selection with both launch paths inactive. A reload can restore that same selection. Exit Pi and restart from the **same project directory**:

```bash
pi --continue --exclude-tools subagents_enable
```

This keeps the conversation and exposes `subagent` from startup. The pinned runtime treats excluding its loader as eager launcher availability; it does not disable delegation. This recovery is tested against copies of the same persisted session. New sessions with the runtime already loaded normally need no recovery flag.

### Choose eager startup permanently

Merge this into `extensions/subagent/config.json` under the active Pi agent directory, preserving existing fields:

```json
{
  "toolActivation": "eager"
}
```

On this machine the file is `~/.config/pi/extensions/subagent/config.json`. Create its parent directory/file if absent, then restart Pi. **This is the native runtime config, not `subagents.toolActivation` in Pi's `settings.json`.** Model overrides belong in `settings.json`; activation mode belongs in this separate runtime config.

Neither recovery path overrides a host exclusion of `subagent`. If it remains inactive, inspect session tool allowlists/exclusions and extension loading. If native status says active but the agent cannot discover a tool definition, inspect the host/bridge projection. Some bridges fix tool definitions for an entire user prompt, so send a new prompt after loader activation before dispatching.

## Child capabilities

| Role | Purpose | Required skills |
| --- | --- | --- |
| `matt-compat.scout` | Read local facts | None |
| `matt-compat.worker` | Implement an assigned ticket | `tdd`, `codebase-design` |
| `matt-compat.standards-reviewer` | Review the Standards axis | `code-review` |
| `matt-compat.spec-reviewer` | Review the Spec axis | `code-review` |
| `matt-compat.researcher` | Write research findings | `research` |
| `matt-compat.merger` | Integrate assigned work | None |

The researcher requires `pi-web-access@0.40.0` installed beside this package. Its child-only bridge rejects missing or mismatched versions. Capability loading, native internal-address rejection, and a real public-page fetch have been tested. Live ChatGPT primary-source research also passed. Search service readiness still depends on provider configuration and network access.

The automatic guard covers direct packaged roles, the package-owned review workflow, prepared research, owned foreground/background workers, and native resumes of recorded owned workers. Per-call capability overrides and unrelated directories are rejected. Owned workers require explicit `async` and `worktree:false`. Roles are leaf agents: the parent owns delegation. Arbitrary user-authored workflow scripts and external commands are outside this adapter's checked dispatch contract and remain subject to native host policies. This adapter is not a security sandbox against repository commands.

Preflight inspects native parent activation, extension registration, and child capabilities without a model call. It does not validate credentials, network services, or provider session-start behavior. Pi and `pi-subagents` still perform their native launch and policy checks.

## Independent review

Load the original `code-review` skill and follow its spec/tracker lookup and standards discovery steps. From the repository root, call:

```json
{
  "baseRef": "main",
  "specPath": "docs/feature-spec.md",
  "standardsPaths": ["docs/coding-conventions.md"]
}
```

These are `matt_review_prepare` arguments. Supply every applicable standards path; root `CODING_STANDARDS.md` and `CONTRIBUTING.md` are included automatically when committed. The adapter does not infer an issue tracker or fetch a spec on your behalf. Save fetched spec content locally first. If the user states no spec exists, supply `noSpecReason` instead of `specPath`.

Preparation resolves the base and `HEAD` to commit IDs, computes their merge-base, and captures the committed diff, commit list, standards at the captured head, current spec contents, and the original skill's full smell baseline. Native `bash`, `read`, and `write` tool hooks apply. Bad refs, empty/truncated evidence, or unrecognized baseline layout fail before dispatch. Uncommitted implementation changes are outside the review target.

Call `subagent` with the exact `launch` object returned by preparation:

```json
{
  "workflow": "matt-compat.review",
  "args": { "bundleId": "<returned digest>" },
  "async": false
}
```

Both reviewer profiles are preflighted again, then launched in parallel foreground sessions with fresh contexts. Tasks contain captured evidence, so later ref movement does not change either target. Standards receives its rules and smell baseline; Spec receives the spec. Reports remain separate, with native session and output artifact paths. A child failure or cancellation fails the workflow and retains available sibling reports. Execution completion does not mean the code passed review; an omitted Spec axis is explicitly skipped.

Bundles are saved under `.pi/matt-compat/reviews/<digest>/bundle.json`. Prepared launch bindings last for the current session, with a maximum of 16 distinct snapshots; reload requires preparation again. This workflow does not support per-call capability overrides or background mode. Review contexts are independent, but the profiles share repository access; this is not filesystem isolation. Live ChatGPT acceptance returned separate reports and surfaced deliberately missing spec-required tests. Reprepare after interruption or reload; available native reports remain recoverable.

## Background research

Choose the repository's existing notes directory as the original `research` skill requires. Call `matt_research_prepare` with:

```json
{
  "question": "Investigate this question against primary sources...",
  "outputDir": "docs/research",
  "name": "topic"
}
```

Preparation preflights the researcher, writes a request receipt under `.pi/matt-compat/research/<id>/request.json`, and reserves `docs/research/topic-<id>.md` with a pending/incomplete marker. Both writes use native tool hooks. The UUID avoids replacing an existing topic's findings. Preparation does not start research; the request receipt permanently records that stage.

Call `subagent` with the returned `launch` object unchanged. The guard checks the child again and permits that prepared request once, with background mode and its bound output. Continue other work after dispatch and retain the native `runId` and `asyncDir` receipt. A lost or rejected launch must be inspected through native status before trying new work.

The child receives the original `research` skill, repository instructions, and child web tools. It returns a cited Markdown report, which the native runtime persists at the bound path; it may also write that exact path directly. Successful dispatch is not completed research. The native runtime sends completion/failure and wakes the parent. A companion `matt-research-result` message includes the run ID, findings path, and native status path without starting another turn. A failed run may leave the pending marker or partial evidence; its native status and diagnostic artifacts remain authoritative.

Detached work continues when the parent exits, but that closed session cannot receive a completion wake or the companion annotation. Findings and native `status.json` remain on disk. Reopen the original persisted parent session or inspect the paths retained in the native launch receipt; a new session is not proof that the old run stopped. Reload clears prepared launch bindings and restores output/run correlation from the persisted parent session. It does not cancel detached work or fabricate a completion notice missed while the parent was closed. Never redispatch solely because a receipt or notification is missing.

Default lifecycle tests use an explicitly labelled offline web fixture. The real pinned provider is separately exercised for tool registration and internal-address rejection. To include its public-page smoke test:

```bash
MATT_LIVE_WEB_SMOKE=1 MATT_UPSTREAM_CHECKOUT=/absolute/path/to/mattpocock-skills npm run check
```

This makes a credential-free request to `https://example.com`; model calls remain scripted. Live ChatGPT research against Node.js and ECMAScript primary sources passed. No blanket claim is made for every hosted search backend. The package retains Pi's native status/stop controls and adds no polling loop or second background runner.

## Ticket worktrees and integration

First create/check out the integration branch required by `implement-spec`, using the native Git workflow. Run this tool from that integration checkout's repository root:

```json
{
  "action": "create",
  "ticket": "ticket-one",
  "integrationRef": "codex/feature-integration"
}
```

These are `matt_worktree` arguments. The named local branch must already be checked out. The source must be clean, apart from untracked `.pi/subagents/` and `.pi/matt-compat/` runtime evidence. The tool pins its current commit and creates `codex/matt-<ticket>-<uuid>` in a distinct `.pi/subagents/matt-compat/worktrees/<uuid>` checkout. Ownership is journaled before allocation under `<git-common-dir>/matt-compat/worktrees/<uuid>.json`. Interrupted or failed allocations preserve their records and any actual branch/worktree; they are never reset or automatically removed.

Delegate the implementer with the native `subagent` tool:

```json
{
  "agent": "matt-compat.worker",
  "task": "Implement the approved ticket; use its spec and acceptance criteria...",
  "cwd": "<returned receipt.path>",
  "async": false,
  "worktree": false
}
```

Cross-directory preflight accepts only verified owned worktrees in the same trusted repository. No global trust setting changes. A durable lease permits one owned writer at a time. A matching local foreground terminal result releases it. Background launches bind the native run and retain their lease until explicit `reconcile-child` proves terminal process evidence. Merger children require `async:false` with no worktree override in integration; a separate durable merger lease serializes them. Raw workflows and external commands remain outside this lease contract.

Use `inspect` with the receipt `id` to check the branch, observed head, lease, and cleanup blockers. Workers commit before returning, and the parent serializes `matt-compat.merger` children in the integration checkout to merge the expected worker commits. The adapter does not reset a worker or perform an automatic merge. This preservation rule replaces the original skill's suggestion to reset a misbased implementer: a wrong base/ownership is refused and existing work is retained.

After the merger finishes, call:

```json
{
  "action": "validate",
  "id": "<worktree id>",
  "expectedHead": "<committed worker SHA>",
  "checks": [{ "command": "npm", "args": ["test"], "timeoutMs": 120000 }]
}
```

Supply the project's actual configured checks. The worker commit must be an ancestor of the integration head, and the worktrees must be quiescent with no tracked/staged/untracked changes or unfinished Git operation. Ignored build artifacts do not prevent validation, but they prevent cleanup. Checks run in the integration checkout and have a total timeout ceiling of ten minutes per validation call. Receipts bind results to both exact heads and durable hashed logs. Failed checks, changed heads, or changed source state never produce a passing receipt.

For a dependent ticket, include `dependsOn: ["<first worktree id>"]` on `create`. Each dependency must have intact passing evidence and merged commits on the recorded integration branch. The new worktree starts from the then-current integration tip.

Cleanup requires `plan-cleanup` with `id`, inspection of the saved plan, then `apply-cleanup` with its `planId`. The plan expires after 30 minutes, and apply repeats ownership, Git registration, head, merge, lease, source-state, and evidence checks under a repository operation lock. It uses `git worktree remove` without force and **retains every local branch**. Dirty, untracked, ignored, unmerged, active/uncertain, stale, or malformed evidence blocks removal. Integration advancement requires fresh validation before cleanup of an older ticket.

Allocation, validation, and removal journals survive failure. An interrupted cleanup marked `applying` can use `recover-cleanup` with `planId` only when both the directory and Git registration are absent; this reconciles metadata and performs no deletion. A stale operation lock remains until `recover-lock` receives its exact recorded token and verifies that the owner PID exited. The old lock evidence is retained. Live, reused, inaccessible, or unknown process identities remain blocked; lock age grants no authority. `inspect` remains available through an operation lock.

Git mutations and configured checks execute through Pi's native `bash` tool and its hooks. The extension writes its own lease/ownership metadata directly. This is an adapter lifecycle, not a security sandbox against arbitrary repository commands. Uncertain leases preserve work. See recovery details below. Tracker and PR operations remain the parent's responsibility under the original skill and repository configuration; the adapter never invents a tracker or closes external work on its own.

## Background worker recovery

Use the same worker launch with `async:true` to delegate in the background. Retain its native `runId` and `asyncDir`; dispatch alone leaves the owned lease active. After completion, call `matt_worktree` with `{"action":"reconcile-child","id":"<worktree id>"}`. Reconciliation requires the recorded run, worker, cwd, originating call, runner instance, and observed public `process-terminal.json` proof to agree. Resume additionally binds the original child session and released canonical session lease. Failed/stopped work is retained and cannot pass validation as a successful child.

After a lost launch receipt or parent restart, the same action can include the original `runId` and `asyncDir`. It binds only matching native evidence; no automatic redispatch occurs. Reconciliation is repeatable after success. Resume the latest recorded run using native `subagent` with only `action:"resume"`, `id`, and `message`; the adapter reacquires ownership and preflights the current role, while the runtime checks its persisted capabilities, session ownership, and exclusive session lease. Reconcile the newly returned run before integration.

A terminal task status, elapsed time, dead PID, or absent lock is insufficient process proof. If the parent exits before observing runner closure, the pinned runtime may retain `pending`/`unknown` proof. The adapter preserves the lease, files, branch, and native logs; it does not automatically make that checkout reusable or removable. Missing foreground terminal receipts and interrupted merger leases are likewise retained for manual inspection/recovery. You can always inspect and recover committed work from the retained branch; cleanup does not force its removal.

## Live model acceptance

Live acceptance is separate from offline tests. The opt-in harness uses an existing local ChatGPT sign-in in memory, never copies or refreshes credentials, and writes only disposable repositories and evidence. It is not loaded by the installed package:

```bash
MATT_LIVE_CHATGPT=1 MATT_UPSTREAM_CHECKOUT=/path/to/pinned/skills node test/live-acceptance.ts grill-with-docs
MATT_LIVE_CHATGPT=1 MATT_UPSTREAM_CHECKOUT=/path/to/pinned/skills node test/live-acceptance.ts research
MATT_LIVE_CHATGPT=1 MATT_UPSTREAM_CHECKOUT=/path/to/pinned/skills node test/live-acceptance.ts code-review
MATT_LIVE_CHATGPT=1 MATT_UPSTREAM_CHECKOUT=/path/to/pinned/skills node test/live-acceptance.ts implement-spec
```

The harness uses `openai-codex/gpt-6.1-sol` in native Pi. Normal package use follows your Pi model/authentication settings and does not read Codex credentials. Grilling answers and the implementation tracker are explicitly local acceptance fixtures. A configured external tracker or PR service needs its normal host tools and authorization.

## Reuse and licensing

The code is MIT licensed. [Third party provenance](THIRD_PARTY_NOTICES.md) records the audited design references and the policy for later code reuse. Upstream skills remain externally managed and unmodified.
