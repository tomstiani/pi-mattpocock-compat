# Background research milestone — 14 October 2026

Package `pi-mattpocock-compat@0.1.0-alpha.4`. Requirements: R5 implemented, plus portions of R3/R8–R10. This report separates deterministic lifecycle tests from real web-provider execution and real-model research quality.

## Delivered behavior

`matt_research_prepare` preflights the child and returns one exact native background launch. The caller supplies the research question and the repository's existing notes directory, following the original skill. A UUID gives each job a distinct Markdown output. Preparation writes a request receipt under `.pi/matt-compat/research/<id>/request.json` and reserves the output file with an explicit pending/incomplete marker. Both writes use native tool hooks. Neither preparation nor file existence claims completion.

The direct-launch guard binds the prepared task, output, background mode, and options to the current directory/session. It repeats capability preflight and rejects duplicate attempts or per-call overrides. The original externally managed `research` skill, repository instructions, skill adapter, and child web provider are supplied to the detached child. Pi-subagents owns launching, output persistence, lifecycle/status artifacts, controls, and completion wakes.

A companion `matt-research-result` message is appended on the public native completion event. It correlates the native run ID with the findings path and native status path, without triggering another turn or starting a watcher. Native success/failure remains authoritative. A failed job can retain a placeholder or partial output; the companion message explicitly warns that these are not completed findings. Request receipts permanently describe the preparation stage, while the native launch receipt supplies `runId`/`asyncDir` and native status supplies the outcome.

Parent exit does not stop detached work. Its saved output and native terminal status remain available, but the closed session receives no wake or companion annotation. Reload clears prepared launch bindings and in-memory annotations; it does not prove cancellation. Original-session recovery and explicit native paths must be inspected before new dispatch.

## Validation

Environment: Node `26.10.0`, TypeScript `7.0.2`, Pi and sibling runtime libraries `1.0.3`, `pi-subagents` `0.78.0`, and `pi-web-access` `0.40.0`. The web provider is an optional peer and pinned development dependency. The child bridge resolves the published extension directory to its actual entry file.

Original skill checkout: `49dd158d1076134a641b33efb035946536778336`. With `MATT_UPSTREAM_CHECKOUT` set, research children load the unmodified original `skills/engineering/research/SKILL.md` from a temporary installed location.

```text
MATT_UPSTREAM_CHECKOUT=/tmp/pi-matt-skills-audit MATT_LIVE_WEB_SMOKE=1 npm run check
```

Result: strict typechecking and **48 tests passed**, zero failures and zero skips. The [saved check log](2026-10-14-background-research-check.txt) retains the results. The [machine-readable receipt](2026-10-14-background-research.json) identifies source/dependency hashes; no project commit has been created.

Thirteen checks were added since the 35-test review milestone: one actual pinned-provider preflight and twelve research tests. They establish:

- Native detached child execution in a separate process, with skill loading and repository instructions, without parent conversation leakage.
- The parent executes another tool while research is still running.
- A cited Markdown fixture report is saved, then native completion and a correlated output-path annotation reach the parent.
- Failed research delivers a failure, preserves the incomplete output marker, and records durable native diagnostics.
- The parent can exit before completion; research finishes afterward and its output/status remain readable without a claimed completion wake.
- Unprepared, modified-output, foreground, and duplicate dispatches are rejected.
- Missing skill, denied request write, and traversal outside the repository fail explicitly.
- The real web provider's internal-address rejection is retained and delivered as a research failure.
- A separate real-provider smoke fetches `https://example.com` in the detached child and saves a cited report containing the returned page marker. No real model is used.

Normal lifecycle tests use a clearly labelled offline web test double; they do not establish hosted search quality or availability. The public-page smoke uses the actual pinned web provider with raw fetching and no account credentials. Default `npm run check` omits that network smoke unless `MATT_LIVE_WEB_SMOKE=1`; all model calls remain scripted. The standard test fixture strips authentication environment variables and points Pi/web configuration to temporary agent directories.

`npm run check:upstream -- /tmp/pi-matt-skills-audit` still reports the exact pinned revision and matching content for all 27 published skills, with no additions, removals, content changes, or invocation-policy changes. Package assembly is checked with the temporary npm cache. No package was published and no user Pi settings were changed.

## Failures retained and corrections

The first dependency download failed with sandbox DNS restrictions (`ENOTFOUND`). The pinned development dependency was then downloaded using authorized network access; user cache/configuration was not changed.

The initial local HTTP fixture could not open its socket in the sandbox (`EPERM`). With socket access, the real provider correctly rejected the internal loopback address. That provider policy was preserved, the rejection became a negative test, deterministic lifecycle tests use an explicit web double, and positive real-provider fetching uses a public page. No SSRF policy or provider restriction was relaxed.

The first RPC fixture failed because the scripted child model was absent from the parent's active model registry. Registering the fixture model in both processes fixed preflight while keeping actual child execution detached. Early completion assertions watched `message_start`, then ordinary message entries; idle completion is appended as a native `custom_message` entry. Assertions now inspect that persisted session entry and verify its native run ID.

A failed child can terminate before creating its requested file. Preparation now reserves a clearly incomplete output file through the native write tool. Once this existed, native failure notifications did not always repeat that requested output path. The first complete 48-test run therefore had 46 passes and two failures. The companion native-event annotation fixes path delivery without introducing another launcher, polling loop, or wake. Focused failure checks and the subsequent full 48-test run passed.

## First-version work remaining

R5 is implemented, with real-model acceptance pending. This milestone does not establish hosted search services, model citation accuracy, automatic original-session reattachment, reload recovery, or resume capability checks.

Required first-version work remains: worktree/branch ownership and intended bases, dependent-ticket integration, validation tied to the delivered commit, conflict/interruption recovery, cleanup protection for dirty/unmerged work, concurrent writer isolation, and remaining real-model acceptance for all four target workflows. Arbitrary scripts and nested/resumed dispatch still lack this adapter's prepared-launch checks; native runtime validation remains in place.
