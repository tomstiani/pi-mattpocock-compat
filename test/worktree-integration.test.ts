import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { run, type Calls } from "./helpers/pi.ts";
const roleOverrides = { "matt-compat.worker": { model: "matt-worktree-fixture/worker" }, "matt-compat.merger": { model: "matt-worktree-fixture/merger" } };
const create = (ticket: string, dependsOn?: string[]) => ({ name: "matt_worktree", arguments: { action: "create", ticket, integrationRef: "integration", ...(dependsOn ? { dependsOn } : {}) } });
const inspect = (ticket: string) => ({ name: "matt_worktree", arguments: { action: "inspect", id: `$wt:${ticket}:id` } });
const worker = (ticket: string, dependency?: string, fail = false) => ({ name: "subagent", arguments: { agent: "matt-compat.worker", cwd: `$wt:${ticket}:path`, async: false, worktree: false, options: { acceptance: false },
  task: `FIXTURE_TICKET ${JSON.stringify({ file: `${ticket}.txt`, content: `${ticket}\n`, ...(dependency ? { dependency } : {}), ...(fail ? { fail } : {}) })}` } });
const merger = (ticket: string) => ({ name: "subagent", arguments: { agent: "matt-compat.merger", async: false, options: { acceptance: false }, task: `FIXTURE_TICKET {"head":"$wt:${ticket}:head"}` } });
const validate = (ticket: string) => ({ name: "matt_worktree", arguments: { action: "validate", id: `$wt:${ticket}:id`, expectedHead: `$wt:${ticket}:head`, checks: [{ command: process.execPath, args: ["-e", `if(!require('node:fs').existsSync('${ticket}.txt'))process.exit(1)`] }] } });

test("actual Pi workers and serialized mergers implement dependent tickets on owned bases", (t) => {
  const calls: Calls = [create("first"), worker("first"), inspect("first"), merger("first"), validate("first"),
    create("second", ["$wt:first:id"]), worker("second", "first.txt"), inspect("second"), merger("second"), validate("second"),
    { name: "matt_worktree", arguments: { action: "plan-cleanup", id: "$wt:second:id" } },
    { name: "matt_worktree", arguments: { action: "apply-cleanup", planId: "$wt:second:planId" } }];
  const { rows } = run(t, { runtime: true, gitFixture: true, worktreeFixture: true, roleOverrides, calls, prompt: "Implement the two approved dependent tickets. PARENT_SECRET_MARKER" });
  const results = rows.filter((row) => row.kind === "result" && ["matt_worktree", "subagent"].includes(row.tool!));
  for (const result of results) assert.equal(result.isError, false, JSON.stringify(result));
  const worktrees = results.filter((row) => row.tool === "matt_worktree").map((row) => row.result!.details!);
  const firstValidation = worktrees.find((row) => (row.receipt as { ticket: string; state: string }).ticket === "first" && (row.receipt as { state: string }).state === "validated")!;
  const secondCreate = worktrees.find((row) => (row.receipt as { ticket: string }).ticket === "second")!;
  assert.equal((secondCreate.receipt as { baseCommit: string }).baseCommit, (firstValidation.receipt as { validation: { integrationHead: string } }).validation.integrationHead);
  const removed = worktrees.at(-1)!;
  assert.equal(removed.removed, true);
  const receipt = removed.receipt as { path: string; repo: string; lease?: unknown };
  assert.equal(existsSync(receipt.path), false);
  assert.equal(readFileSync(join(receipt.repo, "first.txt"), "utf8"), "first\n");
  assert.equal(readFileSync(join(receipt.repo, "second.txt"), "utf8"), "second\n");
  assert.ok(rows.some((row) => row.kind === "worktree_request"));
});

test("a failed real Pi worker preserves partial files and blocks cleanup", (t) => {
  const { rows } = run(t, { runtime: true, gitFixture: true, worktreeFixture: true, roleOverrides, calls: [create("partial"), worker("partial", undefined, true), inspect("partial"),
    { name: "matt_worktree", arguments: { action: "plan-cleanup", id: "$wt:partial:id" } }] });
  const child = rows.find((row) => row.kind === "result" && row.tool === "subagent")!;
  assert.equal(child.isError, true, JSON.stringify(child));
  const result = rows.filter((row) => row.kind === "result" && row.tool === "matt_worktree").at(-1)!;
  assert.equal(result.isError, true);
  const receipt = result.result!.details!.receipt as { path: string };
  assert.equal(readFileSync(join(receipt.path, "partial.txt"), "utf8"), "partial\n");
});

test("native bash policy can deny all worktree Git mutations", (t) => {
  const { rows } = run(t, { runtime: true, gitFixture: true, worktreeFixture: true, blockBash: true, calls: [create("denied")] });
  const result = rows.find((row) => row.kind === "result" && row.tool === "matt_worktree")!;
  assert.equal(result.isError, true);
  assert.match(JSON.stringify(result), /Bash denied/);
});

test("an owned worker requires an explicit lifecycle mode", (t) => {
  const call = worker("foreground"); Reflect.deleteProperty(call.arguments, "async");
  const { rows } = run(t, { runtime: true, gitFixture: true, worktreeFixture: true, roleOverrides, calls: [create("foreground"), call] });
  const result = rows.find((row) => row.kind === "result" && row.tool === "subagent")!;
  assert.equal(result.isError, true);
  assert.match(JSON.stringify(result), /explicit async/);
  assert.ok(!rows.some((row) => row.kind === "worktree_request"));
});

test("background owned workers retain leases until native process proof and resume on the same worktree", (t) => {
  const call = worker("background"); call.arguments.async = true;
  const overrides = { ...roleOverrides, "matt-compat.worker": { ...roleOverrides["matt-compat.worker"], subagentOnlyExtensions: [resolve("extensions/child.ts"), resolve("test/fixtures/worktree-provider.ts")] } };
  const { rows } = run(t, { runtime: true, gitFixture: true, worktreeFixture: true, roleOverrides: overrides, calls: [
    create("background"), call, inspect("background"), { name: "fixture_wait_worker", arguments: {} },
    { name: "matt_worktree", arguments: { action: "reconcile-child", id: "$wt:background:id" } },
    { name: "subagent", arguments: { action: "resume", id: "$run", message: "Report the committed ticket result without changing files." } },
    { name: "fixture_wait_worker", arguments: {} },
    { name: "matt_worktree", arguments: { action: "reconcile-child", id: "$wt:background:id" } }, inspect("background"),
  ] });
  const results = rows.filter((row) => row.kind === "result");
  for (const result of results) assert.equal(result.isError, false, JSON.stringify(result));
  const worktrees = results.filter((row) => row.tool === "matt_worktree").map((row) => row.result!.details!);
  assert.ok((worktrees[1]!.receipt as { lease?: unknown }).lease, "A dispatch receipt must retain the lease");
  const receipt = worktrees.at(-1)!.receipt as { path: string; lease?: unknown; runHistory: string[]; lastRun: { success: boolean } };
  assert.equal(receipt.lease, undefined);
  assert.equal(receipt.runHistory.length, 2);
  assert.equal(receipt.lastRun.success, true);
  assert.equal(readFileSync(join(receipt.path, "background.txt"), "utf8"), "background\n");
});
