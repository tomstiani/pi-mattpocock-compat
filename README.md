# Matt Pocock’s skills for Pi

Use [Matt Pocock’s engineering skills](https://github.com/mattpocock/skills) in Pi, with checked agent delegation, independent code reviews, background research, and ticket worktrees.

This community compatibility package connects the **original, unmodified skills** to Pi’s tools and agent runtime. It does not bundle or install the skills, replace their instructions, or start workflows just by loading them.

**Status:** version `0.1.1`, installed from a checkout; not published to npm. Four workflows have recorded small live-model acceptance scenarios. See [verification and limits](#verification-and-limits).

## What you can do

| Workflow | What the adapter supports |
| --- | --- |
| `grill-with-docs` | Load nested skills, gather local facts with a scout, and record resolved domain terms. |
| `research` | Run a background researcher and receive cited Markdown findings with a completion notification. |
| `code-review` | Run independent Standards and Spec reviewers against the same captured, committed diff. |
| `implement-spec` | Delegate approved tickets into owned worktrees, serialize integration, validate exact commits, and review cleanup before removing worktrees. |

The package also checks child capabilities before launch and detects drift from the tested upstream skill revision.

## Requirements

Use the pinned versions for the verified setup:

| Dependency | Version |
| --- | --- |
| Node.js | `22.19.0` or later |
| Pi (`@earendil-works/pi-coding-agent`) | `1.0.3` |
| `pi-subagents` | `0.78.0` |
| `pi-web-access` | `0.40.0` |
| Matt Pocock’s skills | `49dd158d1076134a641b33efb035946536778336` |

Configure Pi with a model and authentication before running workflows. Child agents inherit the parent’s model by default; you can set [per-agent overrides](docs/usage.md#per-agent-models).

Use a Bash-capable macOS or Linux environment with Git. Worktree management requires Git `2.31` or later. Native Windows support is not verified; on Windows, use a Linux environment such as WSL and install Node, Git, and Pi inside it.

External issue trackers and search services need their own tools, credentials, and authorization.

## Install

### 1. Install the compatibility package

With Pi available on your `PATH`, clone this repository and register the package:

```bash
git clone https://github.com/tomstiani/pi-mattpocock-compat.git
cd pi-mattpocock-compat
npm ci --ignore-scripts
pi install npm:pi-subagents@0.78.0
pi install "$PWD"
```

Keep this checkout at its installed path. Install the **package**, not just `extensions/index.ts`: the package includes the agent profiles needed for delegation. Its local dependencies supply the researcher’s web bridge; this adapter does not require a separate global web-package installation.

### 2. Install the original skills

**If you already installed Matt’s skills in a shared Pi location, skip this step.** Duplicate copies can cause name collisions.

For a new installation, clone the tested revision and copy its skill directories into Pi’s shared discovery location:

```bash
mkdir -p "$HOME/.local/share"
git clone https://github.com/mattpocock/skills.git "$HOME/.local/share/mattpocock-skills"
git -C "$HOME/.local/share/mattpocock-skills" checkout 49dd158d1076134a641b33efb035946536778336
mkdir -p "$HOME/.agents/skills/mattpocock"
cp -R "$HOME/.local/share/mattpocock-skills/skills/engineering" \
      "$HOME/.local/share/mattpocock-skills/skills/productivity" \
      "$HOME/.agents/skills/mattpocock/"
```

These commands assume the clone and destination are new. Keep the original skill files unmodified. Shared installation makes the skills available to child agents and ticket worktrees; parent-only `--skill` arguments do not satisfy child dependencies.

### 3. Configure your project

Start Pi from the project you want to work on:

```bash
cd /path/to/your/project
pi
```

Run the original setup skill once to configure the project’s issue tracker, triage vocabulary, and domain documentation conventions:

```text
/skill:setup-matt-pocock-skills
```

Then run `/matt-compat` to inspect the discovered skills and launcher status. You can ask the agent:

```text
Check matt_preflight for matt-compat.worker and matt-compat.researcher.
If subagents_enable is available, call it first and retry.
Report missing skills, tools, or launcher activation.
```

Preflight checks tool and skill availability, not credentials or network readiness. Use Pi’s normal project-trust controls for your repositories and worktrees.

## Run a workflow

Invoke a skill explicitly in Pi:

```text
/skill:grill-with-docs I want to design a reservation expiry flow.
/skill:research Investigate Node.js assertion behavior using primary sources.
/skill:code-review Review this branch against main and the approved spec.
/skill:implement-spec Implement the approved spec and its tickets.
```

Provide the actual spec, tickets, dependencies, and acceptance criteria for `implement-spec`. Review requires a committed diff and the relevant spec and standards; uncommitted implementation changes are outside its target.

Installation persists across sessions. You do not need to run an adapter startup command each time. Reload or restart Pi after changing packages or skills.

User-only skills must use `/skill:name`; the model-callable `Skill` tool deliberately refuses to load them automatically.

## Configuration and troubleshooting

The [configuration and workflow reference](docs/usage.md) covers:

- [Per-agent models](docs/usage.md#per-agent-models)
- [Launcher activation and saved-session recovery](docs/usage.md#parent-launcher-activation-and-recovery)
- [Child roles and capabilities](docs/usage.md#child-capabilities)
- [Independent review](docs/usage.md#independent-review)
- [Background research](docs/usage.md#background-research)
- [Ticket worktrees and integration](docs/usage.md#ticket-worktrees-and-integration)
- [Background worker recovery](docs/usage.md#background-worker-recovery)

If an older saved conversation has neither an active launcher nor loader, exit Pi and resume from the same project directory:

```bash
pi --continue --exclude-tools subagents_enable
```

For the pinned runtime, this exposes the launcher at startup while preserving the conversation. It does not override a host exclusion of `subagent`. See the reference for permanent eager startup and other failure cases.

## Verification and limits

The recorded `0.1.1` regression check passed TypeScript checking and **83 tests**, with **one optional network smoke test skipped**. These are recorded results, not a guarantee for other dependency versions. See the [current verification](docs/project-plan.md#current-verification) and [compatibility manifest](compatibility.json).

Small live ChatGPT scenarios separately exercised `grill-with-docs`, `research`, `code-review`, and two-ticket `implement-spec` for `0.1.0`. The [acceptance report](docs/evidence/2026-10-14-first-version.md) records the evidence and recovery limits; those live scenarios were not rerun for `0.1.1`.

Important boundaries:

- The upstream inventory has 27 skills; only the four named workflows have live scenario acceptance.
- Hosted search backends and external tracker/PR services are not collectively verified.
- The checked dispatch paths do not cover arbitrary custom workflow scripts or external commands. This package is **not a security sandbox**.
- Uncertain worker state preserves leases, files, and branches. Cleanup is explicit, refuses unsafe state, and retains local branches.
- Loading a skill supplies instructions; it does not execute those instructions or authorize publication on your behalf.

## Development

```bash
npm ci --ignore-scripts
npm run check
```

Default tests use scripted providers in real Pi loops, isolated home/agent directories, and no network or external-model calls. They do not inherit account credentials or globally installed skills.

The [CI workflow](.github/workflows/check.yml) runs checks on Linux and macOS with Node `22.19.0` and `24`, including the pinned upstream skill files and package assembly. CI does not run live models or the optional public-page smoke test.

To check a local upstream checkout and test against its original skill files:

```bash
npm run check:upstream -- /absolute/path/to/mattpocock-skills
MATT_UPSTREAM_CHECKOUT=/absolute/path/to/mattpocock-skills npm test
```

The upstream checker detects revision differences, published-skill additions/removals, content changes, and invocation-policy changes. It does not fetch or rewrite upstream files. Update dependencies and skills deliberately rather than assuming newer versions are compatible.

See [live model acceptance](docs/usage.md#live-model-acceptance) for the opt-in harness. Project scope and dated evidence remain in the [project plan](docs/project-plan.md).

## License and attribution

MIT licensed; see [LICENSE](LICENSE). Matt Pocock’s skills remain externally managed and unmodified. This is a community compatibility project, not the upstream skills repository.

[Third-party notices](THIRD_PARTY_NOTICES.md) document provenance and reuse policy.
