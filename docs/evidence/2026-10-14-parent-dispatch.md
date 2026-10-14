# Parent launch-tool readiness — 0.1.1

The reported symptom was a researcher passing preflight while the conversation could not discover a `subagent` launch tool. This report verifies a defect in the adapter's readiness check; it does not claim to have inspected the affected live session's provider/bridge projection.

## Reproduction

The real Pi fixture now writes native `toolActivation: "dynamic"` to its isolated agent directory's `extensions/subagent/config.json`. This is a runtime config key, not a `subagents` Pi settings key. Earlier fixtures wrote an ignored settings key and therefore did not establish lazy activation. Default fixtures now use the correct native `eager` config. They also isolate `HOME`, preventing subsequently installed shared skills from silently satisfying missing-skill tests.

The minimized command is:

```bash
node --test --test-name-pattern='registered but hidden' test/preflight.test.ts
```

With the parent-active guard omitted, the corrected fixture reproduces the bug: `ok:true` while `parentDispatch` reports `subagentRegistered:true`, `subagentActive:false`, `activationToolActive:true`. That assertion failed in a captured baseline run. Restoring the guard makes the same fixture pass.

## Fix

Preflight checks both the host tool inventory and `pi.getActiveTools()`, returns `parentDispatch`, and treats a missing/inactive parent launcher as an error even when the child configuration is valid. If the native loader is active, the diagnostic names `subagents_enable({})`; otherwise it directs inspection of tool filtering and runtime activation. It does not infer that an extension is absent solely because a launch tool is not visible.

Research preparation uses the same check, so an inactive launcher produces no prepared request or findings placeholder. `/matt-compat` displays launcher/loader status. The adapter neither automatically enables tools nor changes host permissions.

The native loader path was verified to make preflight and research preparation succeed while retaining unrelated read/write tools. Eager startup succeeds without a loader. Starting with `--exclude-tools subagents_enable` likewise exposes the launcher; an explicit host exclusion of `subagent` still blocks readiness.

Some bridges expose newly activated tools only on the next user prompt. The adapter can report native Pi activation but cannot certify an external model bridge's tool projection. If native status says active while the agent still cannot discover a definition, that requires inspecting the affected bridge/session rather than reinstalling the package on speculation.

## User recovery

In an existing session, discover and call `subagents_enable({})`, then retry preflight. Send a new prompt first if the host fixes tools for a whole prompt. If that activation tool is not exposed, start a fresh Pi session with:

```bash
pi --exclude-tools subagents_enable
```

For a persistent eager preference, merge `{"toolActivation":"eager"}` into `~/.config/pi/extensions/subagent/config.json` on this machine and start a fresh session. Preserve other config fields. No global user configuration was changed by this fix.

### Follow-up: launcher registered, both launch paths inactive

The user subsequently reported `subagentRegistered:true`, `subagentActive:false`, `activationToolActive:false`. A real persisted-session test reproduces these exact values by creating a parent before loading the runtime, then adding the runtime and reopening the saved conversation under `auto`. The pinned runtime preserves the recorded tool selection and does not add a loader the session never declared. This establishes a reproducible cause, without claiming access to the user's exact live session.

The test copies that same original session for each recovery variant. Both native `toolActivation:"eager"` and startup `--exclude-tools subagents_enable` produce `subagentActive:true`, with the original conversation retained. The user can exit and run `pi --continue --exclude-tools subagents_enable` from the same project directory. Diagnostics now name saved-session selection as a possible cause rather than implying only tool exclusion. The [saved-session regression output](2026-10-14-saved-session-activation-check.txt) covers these paths alongside the cold-session and exclusion checks.

Strict typechecking passed. `MATT_UPSTREAM_CHECKOUT=/tmp/pi-matt-skills-audit npm run check` ran 83 tests: 82 passed, no failures, one optional live-network smoke skipped. The targeted startup check also verified the documented `--exclude-tools subagents_enable` remedy and host-exclusion behavior. Package assembly reports version `0.1.1`.

The [full regression output](2026-10-14-parent-dispatch-check.txt), [baseline failure](2026-10-14-parent-dispatch-red.txt), [startup remedy check](2026-10-14-parent-dispatch-startup.txt), and [source hashes](2026-10-14-parent-dispatch-source.json) are saved beside this report. No additional real-model acceptance is claimed for this patch; the regression exercises actual native tool activation and policy paths with an offline model.
