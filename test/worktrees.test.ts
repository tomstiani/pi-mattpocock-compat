import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { beginIntegrationLease, finishIntegrationLease, beginWorktreeLease, bindWorktreeRun, finishWorktreeLease, manageWorktree, ownedWorktree, type WorktreeReceipt } from "../src/worktrees.ts";

function repo(t: { after: (fn: () => void) => void }) {
  const path = mkdtempSync(join(tmpdir(), "matt-worktree-"));
  t.after(() => rmSync(path, { recursive: true, force: true }));
  const git = (cwd: string, ...args: string[]) => {
    const result = spawnSync("git", args, { cwd, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
  };
  git(path, "init", "--quiet", "--initial-branch=integration");
  git(path, "config", "user.name", "Fixture"); git(path, "config", "user.email", "fixture@example.invalid");
  writeFileSync(join(path, "feature.txt"), "base\n");
  writeFileSync(join(path, ".gitignore"), "ignored.txt\n");
  git(path, "add", "."); git(path, "commit", "--quiet", "-m", "base");
  const create = (ticket: string, dependsOn?: string[]) => {
    const result = manageWorktree(path, { action: "create", ticket, integrationRef: "integration", ...(dependsOn ? { dependsOn } : {}) });
    assert.equal(result.ok, true, JSON.stringify(result)); return result.receipt as WorktreeReceipt;
  };
  const commit = (entry: WorktreeReceipt, file = "feature.txt", body = entry.ticket) => {
    writeFileSync(join(entry.path, file), body + "\n"); git(entry.path, "add", file); git(entry.path, "commit", "--quiet", "-m", entry.ticket); return git(entry.path, "rev-parse", "HEAD");
  };
  const validate = (entry: WorktreeReceipt, expectedHead: string, code = "process.exit(0)") => manageWorktree(path, { action: "validate", id: entry.id, expectedHead,
    checks: [{ command: process.execPath, args: ["-e", code] }] });
  const merge = (head: string) => git(path, "merge", "--no-ff", "--no-edit", head);
  return { path, git, create, commit, validate, merge };
}

test("interrupted binding can be recovered only from exact native identity and observed process proof", (t) => {
  const r = repo(t), entry = r.create("recover");
  beginWorktreeLease(entry.path, r.path, "original-call");
  const native = join(entry.commonDir, "fixture-native"); mkdirSync(native);
  const status = { runId: "native-run", toolCallId: "original-call", cwd: entry.path, mode: "single", state: "complete", steps: [{ agent: "matt-compat.worker", exitCode: 0 }], processTerminal: { runnerProcessInstanceId: "instance" } };
  const proof = { version: 1, state: "pending", runId: "native-run", runnerProcessInstanceId: "instance", observedAt: Date.now(), instances: [{ kind: "runner", processInstanceId: "instance", closeObservedAt: Date.now() }] };
  writeFileSync(join(native, "status.json"), JSON.stringify({ ...status, toolCallId: "wrong-call" }));
  assert.throws(() => bindWorktreeRun(entry.path, r.path, "original-call", "native-run", native), /identity/);
  writeFileSync(join(native, "status.json"), JSON.stringify(status));
  writeFileSync(join(native, "process-terminal.json"), JSON.stringify(proof));
  assert.throws(() => manageWorktree(r.path, { action: "reconcile-child", id: entry.id, runId: "native-run", asyncDir: native }), /proof/);
  assert.ok(ownedWorktree(entry.path, r.path).receipt.lease);
  writeFileSync(join(native, "process-terminal.json"), JSON.stringify({ ...proof, state: "observed", runnerProcessInstanceId: "other-instance" }));
  assert.throws(() => manageWorktree(r.path, { action: "reconcile-child", id: entry.id }), /proof/);
  writeFileSync(join(native, "process-terminal.json"), JSON.stringify({ ...proof, state: "observed", canonicalSession: { freeAtObservation: false, leaseDisposition: "released" } }));
  assert.throws(() => manageWorktree(r.path, { action: "reconcile-child", id: entry.id }), /proof/);
  writeFileSync(join(native, "process-terminal.json"), JSON.stringify({ ...proof, state: "observed" }));
  const recovered = manageWorktree(r.path, { action: "reconcile-child", id: entry.id }).receipt as WorktreeReceipt;
  assert.equal(recovered.lease, undefined); assert.equal(recovered.lastRun?.success, true);
  assert.equal(existsSync(entry.path), true);
});

test("integration merger leases serialize native writers and retain uncertain ownership", (t) => {
  const r = repo(t), entry = r.create("merge"), tip = r.commit(entry); r.merge(tip);
  beginIntegrationLease(r.path, "merger-one");
  assert.throws(() => beginIntegrationLease(r.path, "merger-two"), /active or uncertain/);
  assert.throws(() => r.create("blocked"), /merger lease/);
  assert.throws(() => r.validate(entry, tip), /quiescent/);
  assert.throws(() => finishIntegrationLease(r.path, "unrelated-result"), /does not match/);
  assert.match(JSON.stringify(manageWorktree(r.path, { action: "inspect", id: entry.id })), /integration merger is active/);
  finishIntegrationLease(r.path, "merger-one");
  assert.equal(r.validate(entry, tip).ok, true);
});

test("parent review evidence does not invalidate otherwise clean integration checks", (t) => {
  const r = repo(t), entry = r.create("review"), tip = r.commit(entry); r.merge(tip);
  mkdirSync(join(r.path, ".pi/matt-compat/reviews"), { recursive: true });
  writeFileSync(join(r.path, ".pi/matt-compat/reviews/bundle.json"), "owned runtime evidence");
  assert.equal(r.validate(entry, tip).ok, true);
  writeFileSync(join(entry.path, "untracked-work.txt"), "worker work must still block");
  assert.throws(() => r.validate(entry, tip), /quiescent/);
});

test("dependent tickets allocate from the validated integration tip, and eligible cleanup retains branches", (t) => {
  const r = repo(t), first = r.create("first"), firstHead = r.commit(first);
  assert.throws(() => r.create("premature", [first.id]), /not been integrated/);
  r.merge(firstHead);
  const checked = r.validate(first, firstHead);
  assert.equal(checked.ok, true, JSON.stringify(checked));
  const second = r.create("second", [first.id]);
  assert.equal(second.baseCommit, r.git(r.path, "rev-parse", "HEAD"));
  assert.equal(readFileSync(join(second.path, "feature.txt"), "utf8"), "first\n");
  const secondHead = r.commit(second, "second.txt"); r.merge(secondHead);
  assert.equal(r.validate(second, secondHead).ok, true);
  const plan = manageWorktree(r.path, { action: "plan-cleanup", id: second.id }); assert.equal(plan.ok, true);
  const id = (plan.plan as { id: string }).id;
  const removed = manageWorktree(r.path, { action: "apply-cleanup", planId: id });
  assert.equal(removed.ok, true); assert.equal(existsSync(second.path), false);
  assert.equal(r.git(r.path, "rev-parse", second.branch), secondHead);
  assert.equal(manageWorktree(r.path, { action: "apply-cleanup", planId: id }).ok, true, "A claimed plan is not applied twice");
});

test("concurrent ticket worktrees have independent branches and writers", (t) => {
  const r = repo(t), a = r.create("a"), b = r.create("b");
  assert.notEqual(a.path, b.path); assert.notEqual(a.branch, b.branch); assert.equal(a.baseCommit, b.baseCommit);
  r.commit(a, "same.txt", "A"); r.commit(b, "same.txt", "B");
  assert.equal(readFileSync(join(a.path, "same.txt"), "utf8"), "A\n");
  assert.equal(readFileSync(join(b.path, "same.txt"), "utf8"), "B\n");
  assert.equal(existsSync(join(r.path, "same.txt")), false);
  for (const entry of [a, b]) assert.match(JSON.stringify(manageWorktree(r.path, { action: "plan-cleanup", id: entry.id })), /not merged/);
});

for (const kind of ["dirty", "untracked", "ignored", "staged-cancelled"] as const) test(`cleanup refuses ${kind} work even after merge and validation`, (t) => {
  const r = repo(t), entry = r.create(kind), tip = r.commit(entry); r.merge(tip); assert.equal(r.validate(entry, tip).ok, true);
  if (kind === "dirty") writeFileSync(join(entry.path, "feature.txt"), "partial work\n");
  if (kind === "untracked") writeFileSync(join(entry.path, "extra.txt"), "untracked\n");
  if (kind === "ignored") writeFileSync(join(entry.path, "ignored.txt"), "ignored work\n");
  if (kind === "staged-cancelled") {
    writeFileSync(join(entry.path, "feature.txt"), "staged\n"); r.git(entry.path, "add", "feature.txt");
    writeFileSync(join(entry.path, "feature.txt"), kind + "\n");
  }
  const plan = manageWorktree(r.path, { action: "plan-cleanup", id: entry.id }); assert.equal(plan.ok, false);
  assert.throws(() => manageWorktree(r.path, { action: "apply-cleanup", planId: (plan.plan as { id: string }).id }), /blocked/);
  assert.equal(existsSync(entry.path), true);
});

test("failed integration checks retain logs and block cleanup and dependent tickets", (t) => {
  const r = repo(t), entry = r.create("failure"), tip = r.commit(entry); r.merge(tip);
  const result = r.validate(entry, tip, "console.log('FAILED_CHECK_MARKER');process.exit(1)");
  assert.equal(result.ok, false);
  const receipt = result.receipt as WorktreeReceipt;
  assert.match(readFileSync(receipt.validation!.checks[0]!.log, "utf8"), /FAILED_CHECK_MARKER/);
  assert.equal(manageWorktree(r.path, { action: "plan-cleanup", id: entry.id }).ok, false);
  assert.throws(() => r.create("blocked-dependent", [entry.id]), /not been integrated/);
  assert.equal(existsSync(entry.path), true);
});

test("a check that changes HEAD cannot produce a passing validation receipt", (t) => {
  const r = repo(t), entry = r.create("moving"), tip = r.commit(entry); r.merge(tip);
  const result = r.validate(entry, tip, "require('node:child_process').execFileSync('git',['commit','--allow-empty','--quiet','-m','unexpected change'])");
  assert.equal(result.ok, false);
  assert.equal(manageWorktree(r.path, { action: "plan-cleanup", id: entry.id }).ok, false);
});

test("a merge conflict preserves both branches and unfinished integration state", (t) => {
  const r = repo(t), a = r.create("left"), b = r.create("right");
  const left = r.commit(a), right = r.commit(b); r.merge(left);
  const conflict = spawnSync("git", ["merge", "--no-ff", "--no-edit", right], { cwd: r.path, encoding: "utf8" });
  assert.equal(conflict.status, 1);
  assert.throws(() => r.validate(b, right), /unfinished Git|clean worktrees/);
  assert.equal(manageWorktree(r.path, { action: "plan-cleanup", id: b.id }).ok, false);
  assert.ok(existsSync(join(r.path, ".git/MERGE_HEAD")));
  assert.ok(existsSync(a.path) && existsSync(b.path));
});

test("cleanup revalidates changed heads and new dirty files after a saved plan", (t) => {
  const r = repo(t), entry = r.create("stale"), tip = r.commit(entry); r.merge(tip); r.validate(entry, tip);
  const plan = manageWorktree(r.path, { action: "plan-cleanup", id: entry.id });
  const planId = (plan.plan as { id: string }).id;
  writeFileSync(join(entry.path, "new.txt"), "new work\n");
  assert.throws(() => manageWorktree(r.path, { action: "apply-cleanup", planId }), /revalidation/);
  assert.equal(existsSync(entry.path), true);
});

test("active and uncertain leases preserve work and reject another writer", (t) => {
  const r = repo(t), entry = r.create("lease");
  beginWorktreeLease(entry.path, r.path, "call-one");
  assert.throws(() => beginWorktreeLease(entry.path, r.path, "call-two"), /lease/);
  assert.throws(() => finishWorktreeLease(entry.path, r.path, "wrong-call", "run", true), /does not match/);
  assert.match(JSON.stringify(manageWorktree(r.path, { action: "inspect", id: entry.id })), /active or uncertain/);
  finishWorktreeLease(entry.path, r.path, "call-one", "native-run", true);
  assert.equal(ownedWorktree(entry.path, r.path).receipt.lease, undefined);
});

test("unknown worktree paths and forged ownership are rejected", (t) => {
  const r = repo(t), entry = r.create("owned");
  assert.throws(() => ownedWorktree(r.path, r.path), /UUID/);
  const receipt = join(r.path, ".git/matt-compat/worktrees", entry.id + ".json");
  writeFileSync(receipt, JSON.stringify({ ...entry, path: r.path }));
  assert.throws(() => ownedWorktree(entry.path, r.path), /foreign worktree/);
});

test("stale lock ownership is reported without automatically removing a lock", (t) => {
  const r = repo(t); r.create("lock");
  const lock = join(r.path, ".git/matt-compat/operation.lock"); mkdirSync(lock);
  writeFileSync(join(lock, "owner.json"), JSON.stringify({ pid: 99999999, token: "do-not-guess" }));
  assert.throws(() => r.create("blocked"), /locked/);
  assert.ok(existsSync(lock));
});

test("interrupted cleanup reconciles only an absent path and absent Git registration", (t) => {
  const r = repo(t), entry = r.create("recover"), tip = r.commit(entry); r.merge(tip); r.validate(entry, tip);
  const result = manageWorktree(r.path, { action: "plan-cleanup", id: entry.id });
  const plan = result.plan as { id: string; phase: string };
  plan.phase = "applying"; writeFileSync(result.planPath as string, JSON.stringify(plan));
  assert.throws(() => manageWorktree(r.path, { action: "recover-cleanup", planId: plan.id }), /cannot prove/);
  r.git(r.path, "worktree", "remove", entry.path);
  assert.equal(manageWorktree(r.path, { action: "recover-cleanup", planId: plan.id }).ok, true);
  assert.equal(r.git(r.path, "rev-parse", entry.branch), tip);
});

for (const change of ["missing log", "tampered log", "moved integration", "Git lock"] as const) test(`cleanup refuses ${change} after a valid receipt`, (t) => {
  const r = repo(t), entry = r.create("evidence"), tip = r.commit(entry); r.merge(tip);
  const checked = r.validate(entry, tip); assert.equal(checked.ok, true);
  const receipt = checked.receipt as WorktreeReceipt;
  if (change === "missing log") rmSync(receipt.validation!.checks[0]!.log);
  if (change === "tampered log") writeFileSync(receipt.validation!.checks[0]!.log, "changed evidence");
  if (change === "moved integration") r.git(r.path, "commit", "--allow-empty", "--quiet", "-m", "advanced");
  if (change === "Git lock") writeFileSync(join(r.path, ".git/index.lock"), "locked");
  assert.equal(manageWorktree(r.path, { action: "plan-cleanup", id: entry.id }).ok, false);
  assert.equal(existsSync(entry.path), true);
});

test("a new writer lease invalidates an already-reviewed cleanup plan", (t) => {
  const r = repo(t), entry = r.create("new-writer"), tip = r.commit(entry); r.merge(tip); r.validate(entry, tip);
  const plan = manageWorktree(r.path, { action: "plan-cleanup", id: entry.id });
  // A changed durable receipt, including lease bookkeeping, cannot reuse the older plan.
  const path = join(r.path, ".git/matt-compat/worktrees", entry.id + ".json");
  const receipt = JSON.parse(readFileSync(path, "utf8"));
  receipt.lease = { toolCallId: "another-owner", parentPid: process.pid, startedAt: new Date().toISOString() };
  writeFileSync(path, JSON.stringify(receipt));
  assert.throws(() => manageWorktree(r.path, { action: "apply-cleanup", planId: (plan.plan as { id: string }).id }), /stale/);
});

test("explicit lock recovery requires the exact token and a provably exited owner", (t) => {
  const r = repo(t), entry = r.create("recover-lock");
  const lock = join(r.path, ".git/matt-compat/operation.lock"); mkdirSync(lock);
  const ownerFile = join(lock, "owner.json");
  const token = "00000000-0000-0000-0000-000000000001";
  writeFileSync(ownerFile, JSON.stringify({ pid: process.pid, token }));
  assert.throws(() => manageWorktree(r.path, { action: "recover-lock", lockToken: token }), /still alive/);
  assert.throws(() => manageWorktree(r.path, { action: "recover-lock", lockToken: "wrong" }), /exact recorded/);
  writeFileSync(ownerFile, JSON.stringify({ pid: 99999999, token }));
  assert.equal(manageWorktree(r.path, { action: "inspect", id: entry.id }).ok, true, "Inspection remains available through a stale operation lock");
  const result = manageWorktree(r.path, { action: "recover-lock", lockToken: token });
  assert.equal(result.ok, true);
  assert.ok(existsSync(result.retainedOwnerEvidence as string));
  assert.equal(existsSync(lock), false);
  assert.equal(r.create("next").state, "ready");
});


test("two live writers can write the same relative path concurrently without overwriting each other", async (t) => {
  const r = repo(t), entries = [r.create("parallel-a"), r.create("parallel-b")];
  const markers = [join(r.path, ".git/ready-a"), join(r.path, ".git/ready-b")];
  await Promise.all(entries.map((entry, index) => new Promise<void>((done, reject) => {
    const script = `const fs=require('node:fs'); const markers=${JSON.stringify(markers)}; fs.writeFileSync(markers[${index}], 'ready'); const timer=setInterval(()=>{if(markers.every(p=>fs.existsSync(p))){clearInterval(timer);for(let n=0;n<100;n++)fs.writeFileSync('parallel.txt', ${JSON.stringify(String(index))});process.exit(0)}},10);setTimeout(()=>process.exit(2),5000).unref();`;
    const child = spawn(process.execPath, ["-e", script], { cwd: entry.path, stdio: "ignore" });
    t.after(() => { child.kill(); });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? done() : reject(new Error(`Parallel writer exited ${code}`)));
  })));
  assert.equal(readFileSync(join(entries[0]!.path, "parallel.txt"), "utf8"), "0");
  assert.equal(readFileSync(join(entries[1]!.path, "parallel.txt"), "utf8"), "1");
  assert.equal(existsSync(join(r.path, "parallel.txt")), false);
});

test("ignored build artifacts permit integration validation but still prevent cleanup", (t) => {
  const r = repo(t), entry = r.create("build-artifacts"), tip = r.commit(entry); r.merge(tip);
  writeFileSync(join(entry.path, "ignored.txt"), "build output retained\n");
  assert.equal(r.validate(entry, tip).ok, true);
  assert.equal(manageWorktree(r.path, { action: "plan-cleanup", id: entry.id }).ok, false);
});
