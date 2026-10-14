# Portability check

## Scope

Checked that the package can install and run offline tests without the developer's existing home directory, global Git configuration, installed skills, or model credentials. This is local macOS evidence, not verification of every operating system.

## Changes

- Added Linux/macOS CI for Node `22.19.0` and `24`, including pinned upstream inputs and package assembly.
- Removed the opt-in live harness's fixed upstream checkout and model defaults. It now requires `MATT_UPSTREAM_CHECKOUT` and `MATT_LIVE_MODEL` explicitly.
- Documented Bash and Git requirements and the lack of verified native Windows support.

## Local verification

Copied the current source into a fresh temporary checkout whose path contained spaces, excluding `.git` and `node_modules`. Used an empty home and Pi agent directory, disabled system/global Git configuration, and removed model and GitHub authentication environment variables.

| Command | Result |
| --- | --- |
| `npm ci --ignore-scripts` | Fresh dependency installation succeeded; npm reported zero vulnerabilities. |
| `npm run check` | Typechecking passed; 81 tests passed, zero failed, three skipped. |
| `npm pack --dry-run` | Package assembly succeeded. |

The three skipped tests require an upstream checkout or opt-in live network access. The local check did not supply either. A separate typecheck passed after updating the live harness. Invoking that harness without its required checkout variable failed before any live model call.

## Remaining limits

The CI workflow has been added but was not triggered in this session. Linux, Node `24`, WSL, and native Windows were not locally exercised. Live model credentials and external service readiness remain user configuration. Historical verification reports remain unchanged.
