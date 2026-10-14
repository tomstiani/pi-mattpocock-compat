# First-version acceptance — 14 October 2026

Local package **0.1.0** completes the approved first-version feature set. It remains private and unpublished. All four target workflows have small live ChatGPT acceptance in native Pi, in addition to deterministic adapter and failure tests. This is a bounded compatibility claim for the versions and scenarios below; the inventory of 27 published skills is not 27 full workflow tests.

## Environment and source

| Component | Verified baseline |
| --- | --- |
| Pi / pi-ai / agent-core | `1.0.3` |
| Native subagent runtime | `pi-subagents@0.78.0` |
| Child web tools | `pi-web-access@0.40.0` |
| Original skills | `mattpocock/skills@49dd158d1076134a641b33efb035946536778336` |
| Live model | `openai-codex/gpt-6.1-sol`, low thinking |
| Execution | Node `26.10.0`, local disposable repositories |
| Delivered source | [SHA-256 manifest](2026-10-14-first-version-source.json) |

Live scenarios ran during finalization of the alpha.5 implementation; the final regression ran after the lifecycle fixes and release version update. The source manifest identifies the delivered code, configuration, tests, and instructions. This checkout is local, uncommitted work; no package source commit or publication is claimed.

The live harness reads the existing locally configured ChatGPT access token into memory, without printing, copying, persisting, or refreshing credentials. Normal package execution does not load this opt-in fixture. An assembly check confirmed that `test/fixtures/chatgpt-auth.ts` is excluded from the package file list. Saved evidence was checked for credential-like JWTs; none were found.

## Results

`MATT_UPSTREAM_CHECKOUT=/tmp/pi-matt-skills-audit MATT_LIVE_WEB_SMOKE=1 npm run check` passed strict typechecking and **79 tests, 0 failures, 0 skips**. The [saved check output](2026-10-14-first-version-check.txt) includes actual native Pi foreground/background workers and resumes, independent parallel reviewers, policy denials, failed/cancelled children, conflicts, failed checks, concurrent isolated writers, and preservation/cleanup recovery cases.

`node scripts/check-upstream.ts /tmp/pi-matt-skills-audit` reported matching revision and contents, with no additions, removals, changed files, or invocation-policy drift. Package assembly was inspected with `npm pack --dry-run --json`; installation does not rewrite original skills. Third-party code was not copied; dependency and metadata provenance is retained in `THIRD_PARTY_NOTICES.md`.

| Original workflow | Live behavior observed | Saved evidence |
| --- | --- | --- |
| `grill-with-docs` | Native explicit invocation; nested `grilling`/`domain-modeling`; fixture question/answer rounds; scout finds repository facts; bundled glossary format read; resolved domain terms saved. No ADR was warranted. | [Evidence](live/grill-with-docs/evidence.json), [glossary](live/grill-with-docs/GLOSSARY.md) |
| `research` | Native background child; parent reads project test command while research runs; child retrieves Node.js and ECMAScript primary sources; cited findings saved; native completion/path annotation arrives; parent inspects findings. | [Evidence](live/research/evidence.json), report in [research output directory](live/research/research/) |
| `code-review` | Independent fresh Standards and Spec children share one captured committed target. Standards reports no actionable findings; Spec correctly identifies deliberately omitted required behavior tests. Parent preserves the unresolved finding. | [Both reports and final result](live/code-review/evidence.json) |
| `implement-spec` | Two dependent background workers on separate owned branches/worktrees; first is integrated and validated before second allocation; serialized mergers; independent final review; fixture tracker closed and committed; final checks bound to exact HEAD; both eligible worktrees removed, branches retained. | [Timeline, reports and native runs](live/implement-spec/evidence.json), [receipts and check logs](live/implement-spec/worktree-evidence/) |

Implementation details verified from the saved timeline:

- First ticket base: `fe8ef5ba56439424ebc24192e84be336edb83e1e`.
- First validated integration commit / second ticket base: `77ce352b88ec6a0f2c3e194bfdb2159d10061a45`; the second receipt names the first as a dependency.
- Final reviewed code: `90c4d3529e4f818e812a7a1702c33e5b68ebfb4e`, with zero actionable Standards/Spec findings.
- Tracker closure adds the final commit `6c8c1f35aad432b6fe482ae6a4b0792bfd7bea0d`. All six project tests passed at that commit. Both cleanup receipts carry passing validation for that exact final integration HEAD and hashed logs.
- Both ticket branches remain available after cleanup. Native worker transcripts showed failing tests before implementation and passing checks afterward; the [compact child check trace](live/implement-spec/child-checks.json) preserves those observations.

The implementation scenario also resumed the persisted parent session after a rejected merger override. Existing worker commits and receipts survived; no completed worker was repeated. The separate deterministic native-resume test revives a completed owned worker into the same checkout and validates both native run bindings.

## Recovery and scope

Background launch receipts retain ownership until `reconcile-child` verifies the exact native run, worker, cwd, call/session correlation, runner instance, terminal lifecycle state, and public observed process proof. Resume checks the latest lineage and native exclusive session ownership. Terminal task status, dead PID, age, and missing locks never authorize releasing a child lease. Unknown proof after parent exit, missing foreground terminal results, and interrupted merger ownership preserve files, branches, receipts and logs for inspection; automatic reuse/removal is refused.

The runtime's automatic worktree allocator is disabled for owned ticket workers. Misbased work is refused and retained instead of reset. Cleanup uses reviewed expiring plans, revalidates ownership/merge/check evidence, never forces removal, and retains branches. Untracked package runtime evidence in the parent does not invalidate source checks; untracked/ignored worker files still block cleanup.

The checked dispatch contract covers the package's direct roles, prepared research, owned workers/resumes, and named review workflow. Packaged roles are leaf agents. Arbitrary custom workflow scripts, external commands, and other packages remain under native host policy rather than adapter guarantees. Optional services and external tracker/PR integration need their normal host configuration; the live implementation used a local JSON tracker and requested no PR. Hosted search backends were not collectively certified.

During development, the initial model probe hit sandbox network restrictions; the authorized network-enabled retry succeeded. One automatic approval review for the regression command timed out before execution; the permitted retry completed. Live invalid launch attempts and their diagnostic results are retained in the scenario evidence, rather than omitted from the success record.

The four live fixtures are small acceptance examples, not promises of deterministic model judgment. Runtime/dependency upgrades and upstream content drift require rerunning the relevant checks.
