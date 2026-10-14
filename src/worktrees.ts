import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, renameSync, rmdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

export interface Check { command: string; args: string[]; timeoutMs?: number }
export interface WorktreeRequest { action: "create" | "inspect" | "validate" | "plan-cleanup" | "apply-cleanup" | "recover-cleanup" | "recover-lock" | "reconcile-child"; lockToken?: string; id?: string; planId?: string; ticket?: string; integrationRef?: string; dependsOn?: string[]; expectedHead?: string; checks?: Check[]; runId?: string; asyncDir?: string }
interface NativeRun { runId: string; asyncDir: string; runnerProcessInstanceId?: string; sessionFile?: string }
interface Validation { workerHead: string; integrationHead: string; ok: boolean; checks: Array<Check & { exitCode: number | null; log: string; sha256: string }> }
export interface WorktreeReceipt {
  schemaVersion: 1; id: string; repo: string; commonDir: string; path: string; branch: string; integrationRef: string;
  baseCommit: string; ticket: string; dependsOn: string[]; state: "allocating" | "ready" | "creation-failed" | "validated" | "validation-failed" | "removed";
  lease?: { toolCallId: string; parentPid: number; startedAt: string; native?: NativeRun; resumedFrom?: NativeRun }; lastRun?: { runId?: string; native?: NativeRun; success: boolean };
  validation?: Validation; error?: string; cleanupPlanId?: string; runHistory?: string[];
}
interface Repository { repo: string; commonDir: string; store: string }
const integrationLease = (r: Repository): string => join(r.store, "integration-lease.json");
export function beginIntegrationLease(cwd: string, toolCallId: string): void {
  const r = repository(cwd);
  locked(r, () => {
    if (existsSync(integrationLease(r))) throw new Error("An integration merger is active or uncertain; preserve its lease and inspect native execution before any new merge.");
    atomic(integrationLease(r), { toolCallId, parentPid: process.pid, startedAt: new Date().toISOString() });
  });
}
export function finishIntegrationLease(cwd: string, toolCallId: string): void {
  const r = repository(cwd);
  locked(r, () => {
    if ((bytes(integrationLease(r)) as { toolCallId: string }).toolCallId !== toolCallId) throw new Error("Merger result does not match the integration lease.");
    rmSync(integrationLease(r));
  });
}
interface CleanupPlan { schemaVersion: 1; id: string; receiptId: string; receiptDigest: string; repo: string; head: string; integrationHead: string; blockers: string[]; expiresAt: number; phase: "planned" | "applying" | "complete" | "failed"; error?: string }
const hash = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const safeId = (id: string | undefined): string => { if (!id || !/^[a-f0-9-]{36}$/.test(id)) throw new Error("Supply an adapter-issued UUID."); return id; };
const bytes = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));
function atomic(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  const fd = openSync(temporary, "wx", 0o600);
  try { writeFileSync(fd, JSON.stringify(value, null, 2) + "\n"); fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(temporary, path);
  const directory = openSync(dirname(path), "r");
  try { fsyncSync(directory); } finally { closeSync(directory); }
}
function git(cwd: string, args: string[], allowed = [0]): string {
  const result = spawnSync("git", ["--no-pager", ...args], { cwd, encoding: "utf8", timeout: 30000, maxBuffer: 2 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" } });
  if (result.error || !allowed.includes(result.status ?? -1)) throw new Error(`git ${args[0]} failed: ${result.error?.message ?? result.stderr.trim() ?? result.stdout.trim()}`);
  return result.stdout;
}
function repository(cwd: string): Repository {
  const repo = realpathSync(cwd);
  if (realpathSync(git(repo, ["rev-parse", "--show-toplevel"]).trim()) !== repo) throw new Error("Run from the integration checkout's repository root.");
  const commonDir = realpathSync(git(repo, ["rev-parse", "--path-format=absolute", "--git-common-dir"]).trim());
  const store = join(commonDir, "matt-compat");
  if (existsSync(store) && realpathSync(store) !== store) throw new Error("Adapter metadata directory was redirected.");
  return { repo, commonDir, store };
}
function locked<T>(r: Repository, run: () => T): T {
  mkdirSync(r.store, { recursive: true });
  const lock = join(r.store, "operation.lock");
  if (existsSync(join(r.store, "recovery.lock"))) throw new Error("A lock-recovery operation is in progress.");
  try { mkdirSync(lock); } catch { throw new Error(`Repository operation locked: ${lock}. Inspect its owner and retained receipts; no lock is removed by age.`); }
  try { atomic(join(lock, "owner.json"), { pid: process.pid, token: randomUUID(), startedAt: new Date().toISOString() }); return run(); }
  finally { rmSync(lock, { recursive: true }); }
}
function receiptPath(r: Repository, id: string): string { return join(r.store, "worktrees", `${safeId(id)}.json`); }
function load(r: Repository, id: string | undefined): WorktreeReceipt {
  const entry = bytes(receiptPath(r, safeId(id))) as WorktreeReceipt;
  if (entry.schemaVersion !== 1 || entry.id !== id || entry.repo !== r.repo || entry.commonDir !== r.commonDir || !/^[a-f0-9]{40,64}$/.test(entry.baseCommit)
    || entry.path !== join(r.repo, ".pi/subagents/matt-compat/worktrees", entry.id) || !entry.branch.startsWith("codex/matt-") || !entry.integrationRef.startsWith("refs/heads/")) throw new Error("Invalid or foreign worktree ownership receipt.");
  return entry;
}
function save(r: Repository, entry: WorktreeReceipt): void { atomic(receiptPath(r, entry.id), entry); }
const head = (cwd: string): string => git(cwd, ["rev-parse", "--verify", "HEAD^{commit}"]).trim();
function integrationHead(r: Repository, entry: WorktreeReceipt): string {
  if (git(r.repo, ["symbolic-ref", "HEAD"]).trim() !== entry.integrationRef) throw new Error("The integration checkout is on a different branch; restore the recorded integration branch.");
  return head(r.repo);
}
function clean(cwd: string, parent = false, includeIgnored = true): string[] {
  const tracked = (git(cwd, ["diff", "--no-ext-diff", "--no-textconv", "--name-only", "--"]) + git(cwd, ["diff", "--no-ext-diff", "--no-textconv", "--cached", "--name-only", "--"])).trim();
  const untracked = git(cwd, ["ls-files", "--others", "--exclude-standard", "-z"]).split("\0").filter(Boolean)
    .filter((path) => !(parent && (path.startsWith(".pi/subagents/") || path.startsWith(".pi/matt-compat/"))));
  const ignored = parent || !includeIgnored ? [] : git(cwd, ["ls-files", "--others", "--ignored", "--exclude-standard", "-z"]).split("\0").filter(Boolean);
  return [...(tracked ? ["tracked or staged changes"] : []), ...(untracked.length ? ["untracked files"] : []), ...(ignored.length ? ["ignored files"] : [])];
}
function gitLocks(cwd: string): boolean {
  return ["index.lock", "HEAD.lock", "packed-refs.lock", "MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "rebase-merge", "rebase-apply"].some((name) => existsSync(resolve(cwd, git(cwd, ["rev-parse", "--git-path", name]).trim())));
}
function ancestor(r: Repository, from: string, to: string): boolean {
  const result = spawnSync("git", ["merge-base", "--is-ancestor", from, to], { cwd: r.repo, encoding: "utf8", timeout: 30000 });
  if (result.error || (result.status !== 0 && result.status !== 1)) throw new Error("Cannot establish commit ancestry.");
  return result.status === 0;
}
function validationEvidence(r: Repository, entry: WorktreeReceipt): boolean {
  const validation = entry.validation;
  if (!validation?.ok || !Array.isArray(validation.checks) || !validation.checks.length) return false;
  return validation.checks.every((check) => {
    try {
      return check.exitCode === 0 && dirname(check.log) === join(r.store, "checks") && realpathSync(check.log) === check.log
        && createHash("sha256").update(readFileSync(check.log)).digest("hex") === check.sha256;
    } catch { return false; }
  });
}
function inspect(r: Repository, entry: WorktreeReceipt) {
  if (!existsSync(entry.path)) return { receipt: entry, exists: false, blockers: ["worktree path missing; inspect allocation/removal evidence"] };
  if (lstatSync(entry.path).isSymbolicLink() || realpathSync(entry.path) !== entry.path) throw new Error("Owned worktree path was redirected.");
  if (realpathSync(git(entry.path, ["rev-parse", "--path-format=absolute", "--git-common-dir"]).trim()) !== r.commonDir
    || realpathSync(git(entry.path, ["rev-parse", "--show-toplevel"]).trim()) !== entry.path
    || git(entry.path, ["symbolic-ref", "HEAD"]).trim() !== `refs/heads/${entry.branch}`) throw new Error("Worktree repository or branch does not match its ownership receipt.");
  const workerHead = head(entry.path), integrated = integrationHead(r, entry);
  const blockers = [...clean(entry.path), ...clean(r.repo, true).map((reason) => `integration checkout has ${reason}`), ...(gitLocks(entry.path) || gitLocks(r.repo) ? ["Git lock or unfinished operation"] : []),
    ...(entry.lease ? ["owned child lease is active or uncertain"] : []), ...(existsSync(integrationLease(r)) ? ["integration merger is active or uncertain"] : []), ...(!ancestor(r, workerHead, integrated) ? ["worker HEAD is not merged into the integration HEAD"] : []),
    ...(!validationEvidence(r, entry) || entry.validation!.workerHead !== workerHead || entry.validation!.integrationHead !== integrated ? ["passing validation with intact check logs does not bind these exact heads"] : [])];
  return { receipt: entry, exists: true, head: workerHead, integrationHead: integrated, blockers };
}
function planPath(r: Repository, id: string): string { return join(r.store, "cleanup", `${safeId(id)}.json`); }
function loadPlan(r: Repository, id: string | undefined): CleanupPlan {
  const plan = bytes(planPath(r, safeId(id))) as CleanupPlan;
  if (plan.schemaVersion !== 1 || plan.id !== id || plan.repo !== r.repo || !Number.isSafeInteger(plan.expiresAt) || !Array.isArray(plan.blockers) || plan.blockers.some((reason) => typeof reason !== "string") || !/^[a-f0-9]{64}$/.test(plan.receiptDigest) || !["planned", "applying", "complete", "failed"].includes(plan.phase)) throw new Error("Invalid cleanup plan.");
  return plan;
}
function registered(r: Repository, path: string): boolean { return git(r.repo, ["worktree", "list", "--porcelain", "-z"]).split("\0").includes(`worktree ${path}`); }

/** Owned metadata reads, used by launch preflight; never confers authority for an arbitrary cwd. */
export function ownedWorktree(cwd: string, parent: string) {
  const r = repository(parent);
  const id = relative(join(r.repo, ".pi/subagents/matt-compat/worktrees"), realpathSync(cwd));
  const entry = load(r, safeId(id));
  const state = inspect(r, entry);
  if (!state.exists || entry.state === "removed" || !registered(r, entry.path)) throw new Error("Owned worktree is unavailable or unregistered.");
  return state;
}
/** Lease bookkeeping is extension-owned metadata. Git mutations run through the host bash tool. */
export function beginWorktreeLease(cwd: string, parent: string, toolCallId: string, resume = false): void {
  const r = repository(parent);
  locked(r, () => {
    const { receipt } = ownedWorktree(cwd, parent);
    if (receipt.lease) throw new Error("This worktree already has an active or uncertain child lease.");
    if (receipt.state !== "ready" && receipt.state !== "validation-failed" && !(resume && receipt.state === "validated")) throw new Error("Allocate a fresh worktree or inspect the recorded lifecycle before dispatch.");
    receipt.lease = { toolCallId, parentPid: process.pid, startedAt: new Date().toISOString(), ...(resume && receipt.lastRun?.native ? { resumedFrom: receipt.lastRun.native } : {}) };
    delete receipt.validation; save(r, receipt);
  });
}
export function finishWorktreeLease(cwd: string, parent: string, toolCallId: string, runId: string | undefined, success: boolean): void {
  const r = repository(parent);
  locked(r, () => {
    const { receipt } = ownedWorktree(cwd, parent);
    if (receipt.lease?.toolCallId !== toolCallId) throw new Error("Terminal result does not match the worktree's lease.");
    const native = receipt.lease.native;
    delete receipt.lease; receipt.lastRun = { ...(runId ? { runId } : {}), ...(native ? { native } : {}), success }; save(r, receipt);
  });
}

/** Bind public lifecycle artifacts to the originating tool call, never a caller's PID guess. */
export function bindWorktreeRun(cwd: string, parent: string, toolCallId: string, runId: string, asyncDir: string, liveReceipt = false): void {
  const r = repository(parent);
  locked(r, () => {
    const { receipt } = ownedWorktree(cwd, parent);
    if (receipt.lease?.toolCallId !== toolCallId) throw new Error("Native receipt does not match the owned lease.");
    const directory = realpathSync(asyncDir);
    const status = bytes(join(directory, "status.json")) as NativeStatus;
    const resumedFrom = receipt.lease.resumedFrom;
    const previous = resumedFrom ? bytes(join(resumedFrom.asyncDir, "status.json")) as NativeStatus : undefined;
    const correlated = resumedFrom ? status.sessionId === previous?.sessionId && typeof status.sessionId === "string" && runId !== resumedFrom.runId
      && (!status.sessionFile || status.sessionFile === resumedFrom.sessionFile) : status.toolCallId === toolCallId;
    // The launch receipt may precede status hydration. Only a live native tool result may
    // bind that pending run; reconciliation still requires all durable identity fields.
    if (status.runId !== runId || (!liveReceipt && (!correlated || typeof status.cwd !== "string" || realpathSync(status.cwd) !== receipt.path
      || status.mode !== "single" || status.steps?.length !== 1 || status.steps[0]?.agent !== "matt-compat.worker"))) throw new Error("Native worker identity is missing or mismatched; lease retained.");
    receipt.lease.native = { runId, asyncDir: directory, ...(status.processTerminal?.runnerProcessInstanceId ? { runnerProcessInstanceId: status.processTerminal.runnerProcessInstanceId } : {}), ...(status.sessionFile ? { sessionFile: status.sessionFile } : {}) };
    receipt.runHistory = [...new Set([...(receipt.runHistory ?? []), runId])];
    save(r, receipt);
  });
}
export function worktreeForRun(parent: string, runId: string): WorktreeReceipt | undefined {
  let r: Repository;
  try { r = repository(parent); } catch { return undefined; }
  const folder = join(r.store, "worktrees");
  if (!existsSync(folder)) return undefined;
  for (const file of readdirSync(folder).filter((file) => /^[a-f0-9-]{36}\.json$/.test(file))) {
    const receipt = load(r, file.slice(0, -5));
    if (receipt.lastRun?.runId === runId || receipt.lease?.native?.runId === runId || receipt.runHistory?.includes(runId)) return receipt;
  }
  return undefined;
}
interface TerminalProof { version: number; state: string; runId: string; runnerProcessInstanceId: string; observedAt?: number; instances?: Array<{ kind: string; processInstanceId: string; closeObservedAt: number }>; canonicalSession?: { freeAtObservation?: boolean; leaseDisposition?: string } }
interface NativeStatus { runId: string; sessionId?: string; toolCallId?: string; sessionFile?: string; cwd: string; mode: string; state: string; steps?: Array<{ agent: string; exitCode?: number }>; processTerminal?: TerminalProof }
function reconcileChild(r: Repository, entry: WorktreeReceipt): void {
  const native = entry.lease?.native;
  if (!native) throw new Error("No bound native run. Supply its original runId/asyncDir to reconcile-child; unknown dispatch is never repeated automatically.");
  const status = bytes(join(native.asyncDir, "status.json")) as NativeStatus;
  const proof = bytes(join(native.asyncDir, "process-terminal.json")) as TerminalProof;
  const instanceId = native.runnerProcessInstanceId ?? status.processTerminal?.runnerProcessInstanceId;
  const correlated = entry.lease!.resumedFrom ? status.sessionFile === entry.lease!.resumedFrom.sessionFile && typeof status.sessionFile === "string" : status.toolCallId === entry.lease!.toolCallId;
  if (status.runId !== native.runId || !correlated || realpathSync(status.cwd) !== entry.path
    || status.mode !== "single" || status.steps?.length !== 1 || status.steps[0]?.agent !== "matt-compat.worker"
    || !["complete", "failed", "stopped", "paused"].includes(status.state)
    || typeof instanceId !== "string" || proof.version !== 1 || proof.state !== "observed" || proof.runId !== native.runId || proof.runnerProcessInstanceId !== instanceId
    || !Number.isFinite(proof.observedAt) || !proof.instances?.some((instance) => instance.kind === "runner" && instance.processInstanceId === instanceId && Number.isFinite(instance.closeObservedAt))
    || (proof.canonicalSession && (proof.canonicalSession.freeAtObservation !== true || !["released", "not-held"].includes(proof.canonicalSession.leaseDisposition ?? "")))) throw new Error("Native terminal process proof is missing, unknown, or mismatched; work and lease retained.");
  native.runnerProcessInstanceId = instanceId;
  if (status.sessionFile) native.sessionFile = status.sessionFile;
  entry.lastRun = { runId: native.runId, native, success: status.state === "complete" && status.steps[0]?.exitCode === 0 };
  delete entry.lease; save(r, entry);
}

export function manageWorktree(cwd: string, request: WorktreeRequest): Record<string, unknown> {
  const r = repository(cwd);
  if (request.action === "reconcile-child" && request.runId && request.asyncDir) {
    const entry = load(r, request.id);
    if (!entry.lease) throw new Error("No active lease to recover.");
    bindWorktreeRun(entry.path, cwd, entry.lease.toolCallId, request.runId, request.asyncDir);
  }
  if (request.action === "inspect") {
    const entry = load(r, request.id);
    return { ok: true, ...inspect(r, entry), receiptPath: receiptPath(r, entry.id) };
  }
  if (request.action === "recover-lock") {
    const recovery = join(r.store, "recovery.lock"), lock = join(r.store, "operation.lock");
    mkdirSync(recovery);
    try {
      const owner = bytes(join(lock, "owner.json")) as { pid: number; token: string };
      if (!Number.isSafeInteger(owner.pid) || owner.pid < 1 || owner.token !== request.lockToken) throw new Error("Supply the exact recorded lock token; unknown ownership cannot be recovered automatically.");
      try { process.kill(owner.pid, 0); throw new Error("Lock owner is still alive; preserve the lock."); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
      const retained = join(r.store, `recovered-lock-${safeId(owner.token)}`);
      renameSync(lock, retained);
      return { ok: true, recovered: true, retainedOwnerEvidence: retained };
    } finally { rmdirSync(recovery); }
  }
  return locked(r, () => {
    if (request.action === "create") {
      if (!request.ticket || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(request.ticket)) throw new Error("ticket must be a short lowercase label.");
      if (!request.integrationRef || !/^(refs\/heads\/)?[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(request.integrationRef)) throw new Error("Supply the intended local integration branch.");
      const integrationRef = request.integrationRef.startsWith("refs/heads/") ? request.integrationRef : `refs/heads/${request.integrationRef}`;
      if (git(r.repo, ["symbolic-ref", "HEAD"]).trim() !== integrationRef) throw new Error("Create from the checkout of the intended integration branch.");
      if (clean(r.repo, true).length || gitLocks(r.repo) || existsSync(integrationLease(r))) throw new Error("Integration checkout must be clean with no unfinished Git operation or merger lease.");
      const baseCommit = head(r.repo), dependsOn = request.dependsOn ?? [];
      for (const id of dependsOn) {
        const dependency = load(r, id);
        if (!validationEvidence(r, dependency) || dependency.lease || dependency.integrationRef !== integrationRef || !ancestor(r, dependency.validation!.workerHead, baseCommit)
          || !ancestor(r, dependency.validation!.integrationHead, baseCommit)) throw new Error(`Dependency ${id} has not been integrated and validated on this branch.`);
      }
      const id = randomUUID();
      const entry: WorktreeReceipt = { schemaVersion: 1, id, repo: r.repo, commonDir: r.commonDir, path: join(r.repo, ".pi/subagents/matt-compat/worktrees", id),
        branch: `codex/matt-${request.ticket}-${id}`, integrationRef, baseCommit, ticket: request.ticket, dependsOn, state: "allocating" };
      save(r, entry);
      try {
        for (const suffix of [".pi", ".pi/subagents", ".pi/subagents/matt-compat", ".pi/subagents/matt-compat/worktrees"]) {
          const path = join(r.repo, suffix);
          if (existsSync(path) && realpathSync(path) !== path) throw new Error("Worktree base directory is redirected.");
        }
        mkdirSync(dirname(entry.path), { recursive: true });
        if (realpathSync(dirname(entry.path)) !== dirname(entry.path)) throw new Error("Worktree base directory is redirected.");
        git(r.repo, ["worktree", "add", "-b", entry.branch, entry.path, baseCommit]);
        entry.state = "ready"; save(r, entry);
        return { ok: true, receiptPath: receiptPath(r, id), ...inspect(r, entry) };
      } catch (error) { entry.state = "creation-failed"; entry.error = error instanceof Error ? error.message : String(error); save(r, entry); return { ok: false, receipt: entry, error: entry.error }; }
    }
    if (request.action === "apply-cleanup" || request.action === "recover-cleanup") {
      const plan = loadPlan(r, request.planId), entry = load(r, plan.receiptId);
      if (plan.phase === "complete") return { ok: true, removed: true, plan, receipt: entry };
      if (request.action === "recover-cleanup") {
        if (plan.phase !== "applying" || existsSync(entry.path) || registered(r, entry.path)) throw new Error("Recovery cannot prove the journaled removal finished; preserve and inspect the worktree.");
        entry.state = "removed"; entry.cleanupPlanId = plan.id; save(r, entry); plan.phase = "complete"; atomic(planPath(r, plan.id), plan);
        return { ok: true, removed: true, recovered: true, receipt: entry, plan };
      }
      if (plan.phase !== "planned") throw new Error("This plan was already claimed. Inspect its receipt; do not repeat deletion.");
      if (plan.expiresAt < Date.now() || plan.blockers.length || plan.receiptDigest !== hash(entry)) throw new Error("Cleanup plan is expired, blocked, or stale. Inspect and create a fresh plan.");
      const state = inspect(r, entry);
      if (!state.exists || state.head !== plan.head || state.integrationHead !== plan.integrationHead || state.blockers.length || !registered(r, entry.path)) throw new Error(`Cleanup revalidation refused: ${state.blockers.join(", ") || "changed ownership or heads"}`);
      plan.phase = "applying"; atomic(planPath(r, plan.id), plan);
      try { git(r.repo, ["worktree", "remove", entry.path]); }
      catch (error) { plan.phase = "failed"; plan.error = error instanceof Error ? error.message : String(error); atomic(planPath(r, plan.id), plan); throw error; }
      entry.state = "removed"; entry.cleanupPlanId = plan.id; save(r, entry); plan.phase = "complete"; atomic(planPath(r, plan.id), plan);
      return { ok: true, removed: true, branchRetained: entry.branch, receipt: entry, plan };
    }
    const entry = load(r, request.id), state = inspect(r, entry);
    if (request.action === "reconcile-child") {
      if (entry.lease) reconcileChild(r, entry);
      return { ok: true, ...inspect(r, entry) };
    }
    if (request.action === "inspect") return { ok: true, ...state, receiptPath: receiptPath(r, entry.id) };
    if (request.action === "validate") {
      if (!state.exists || state.head !== request.expectedHead || !/^[a-f0-9]{40,64}$/.test(request.expectedHead ?? "")) throw new Error("Expected worker HEAD does not match the owned worktree.");
      if (entry.lease || existsSync(integrationLease(r)) || entry.lastRun?.success === false || clean(entry.path, false, false).length || clean(r.repo, true).length || gitLocks(entry.path) || gitLocks(r.repo)) throw new Error("Validation requires quiescent, clean worktrees and no unfinished Git operation.");
      if (!ancestor(r, state.head!, state.integrationHead!)) throw new Error("Worker HEAD must be merged into integration before validation.");
      if (!request.checks?.length || request.checks.length > 16) throw new Error("Supply 1–16 configured integration checks as command/args.");
      for (const check of request.checks) if (!check.command || !Array.isArray(check.args) || check.args.some((arg) => typeof arg !== "string") || (check.timeoutMs !== undefined && (!Number.isSafeInteger(check.timeoutMs) || check.timeoutMs < 1 || check.timeoutMs > 600000))) throw new Error("Invalid finite integration check.");
      if (request.checks.reduce((total, check) => total + (check.timeoutMs ?? 120000), 0) > 600000) throw new Error("Configured check timeouts must total at most ten minutes per validation call.");
      entry.state = "validation-failed"; delete entry.validation; save(r, entry);
      const checks: Validation["checks"] = [];
      for (const check of request.checks) {
        const result = spawnSync(check.command, check.args, { cwd: r.repo, encoding: "utf8", timeout: check.timeoutMs ?? 120000, maxBuffer: 1024 * 1024 });
        const log = join(r.store, "checks", `${entry.id}-${randomUUID()}.log`);
        atomic(log, { stdout: result.stdout ?? "", stderr: result.stderr ?? "", error: result.error?.message, exitCode: result.status });
        checks.push({ ...check, exitCode: result.status, log, sha256: createHash("sha256").update(readFileSync(log)).digest("hex") });
        if (result.error || result.status !== 0) break;
      }
      const stable = head(entry.path) === state.head && integrationHead(r, entry) === state.integrationHead && !clean(entry.path, false, false).length && !clean(r.repo, true).length && !gitLocks(entry.path) && !gitLocks(r.repo);
      const ok = stable && checks.length === request.checks.length && checks.every((check) => check.exitCode === 0);
      entry.validation = { workerHead: state.head!, integrationHead: state.integrationHead!, ok, checks }; entry.state = ok ? "validated" : "validation-failed"; save(r, entry);
      return { ok, receipt: entry, error: ok ? undefined : "Integration checks failed or the validated repository state changed; work is retained." };
    }
    if (request.action === "plan-cleanup") {
      const plan: CleanupPlan = { schemaVersion: 1, id: randomUUID(), receiptId: entry.id, receiptDigest: hash(entry), repo: r.repo,
        head: state.head ?? "", integrationHead: state.integrationHead ?? "", blockers: state.blockers, expiresAt: Date.now() + 30 * 60 * 1000, phase: "planned" };
      atomic(planPath(r, plan.id), plan); return { ok: plan.blockers.length === 0, plan, planPath: planPath(r, plan.id), receipt: entry };
    }
    throw new Error("Unknown worktree action.");
  });
}
