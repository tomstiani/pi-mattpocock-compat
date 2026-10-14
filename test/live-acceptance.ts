/** Opt-in live workflow acceptance. All repository changes are disposable local fixtures. */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as pause } from "node:timers/promises";

assert.equal(process.env.MATT_LIVE_CHATGPT, "1", "Explicit MATT_LIVE_CHATGPT=1 required");
const scenario = process.argv[2];
assert.ok(["grill-with-docs", "research", "code-review", "implement-spec"].includes(scenario!));
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
assert.ok(process.env.MATT_UPSTREAM_CHECKOUT, "Set MATT_UPSTREAM_CHECKOUT to the pinned skills checkout");
assert.ok(process.env.MATT_LIVE_MODEL, "Set MATT_LIVE_MODEL to an available openai-codex model ID");
const upstream = resolve(process.env.MATT_UPSTREAM_CHECKOUT);
const model = process.env.MATT_LIVE_MODEL;
const resuming = process.env.MATT_LIVE_RESUME_DIR;
const base = resuming ?? join(tmpdir(), `matt-live-${scenario}-${Date.now()}`);
const repo = join(base, "repo"), agent = join(base, "agent");
mkdirSync(repo, { recursive: true }); mkdirSync(join(agent, "skills"), { recursive: true });
for (const category of ["engineering", "productivity"]) for (const skill of readdirSync(join(upstream, "skills", category))) {
  cpSync(join(upstream, "skills", category, skill), join(agent, "skills", skill), { recursive: true });
}
const auth = join(root, "test/fixtures/chatgpt-auth.ts"), child = join(root, "extensions/child.ts");
const roles = Object.fromEntries(["scout", "worker", "merger", "standards-reviewer", "spec-reviewer", "researcher"].map((role) => [`matt-compat.${role}`, {
  model: `openai-codex/${model}`, thinking: "low", subagentOnlyExtensions: [child, auth, ...(role === "researcher" ? [join(root, "extensions/web.ts")] : [])],
}]));
writeFileSync(join(agent, "settings.json"), JSON.stringify({ packages: [root], subagents: { agentOverrides: roles } }));
mkdirSync(join(agent, "extensions/subagent"), { recursive: true });
writeFileSync(join(agent, "extensions/subagent/config.json"), JSON.stringify({ toolActivation: "eager" }));
const put = (file: string, content: string) => { mkdirSync(dirname(join(repo, file)), { recursive: true }); writeFileSync(join(repo, file), content); };
const git = (args: string[]) => { const r = spawnSync("git", args, { cwd: repo, encoding: "utf8" }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
if (!resuming) {
put("AGENTS.md", `This is a disposable local acceptance repository. Follow original skills. Issue tracker: tickets.json is the authoritative local tracker; resolve tickets by setting state to closed and committing the update. No GitHub or external tracker actions. Use Node built-in test runner. No dependency installation. Integration branch: integration. Use matt_worktree for ticket allocation, reconcile background children before integration, and serialize mergers. For original code-review use matt_review_prepare with baseRef review-base and specPath spec.md, then its exact returned launch. Never treat a launch as completion. Do not use automatic native worktree allocation.\n`);
put("CONTRIBUTING.md", "Use ESM JavaScript, Node built-ins, small public functions and behavior tests. Avoid external dependencies.\n");
put("package.json", JSON.stringify({ name: "disposable-acceptance", private: true, type: "module", scripts: { test: "node --test" } }));
put("spec.md", "Implement normalizeName(value): trim string input, return Guest for blank input, reject non-strings with TypeError. Then implement greet(value) using normalizeName and returning Hello, NAME!. Keep tests for both.\n");
put("tickets.json", JSON.stringify([{ id: "normalize", dependsOn: [], state: "open", description: "Implement src/name.js normalizeName with behavior tests." }, { id: "greet", dependsOn: ["normalize"], state: "open", description: "Implement src/greet.js greet using normalizeName with behavior tests." }], null, 2));
put("src/domain.js", "export const HOLD_MINUTES = 10;\nexport function expiresAt(createdAt) { return createdAt + HOLD_MINUTES * 60000; }\n");
git(["init", "-q", "--initial-branch=integration"]); git(["config", "user.name", "Acceptance Fixture"]); git(["config", "user.email", "fixture@example.invalid"]);
git(["add", "."]); git(["commit", "-qm", "acceptance base"]); git(["tag", "review-base"]);
if (scenario === "code-review") {
  put("src/name.js", "export function normalizeName(value) { if (typeof value !== 'string') throw new TypeError('name must be a string'); return value.trim() || 'Guest'; }\n");
  put("src/greet.js", "import {normalizeName} from './name.js'; export function greet(value) { return `Hello, ${normalizeName(value)}!`; }\n");
  put("test/name.test.js", "import {test} from 'node:test'; import assert from 'node:assert/strict'; import {greet} from '../src/greet.js'; test('greeting',()=>assert.equal(greet(' Ada '),'Hello, Ada!'));\n");
  git(["add", "."]); git(["commit", "-qm", "implement fixture feature"]);
}
}
const prompts: Record<string, string> = {
  "grill-with-docs": "/skill:grill-with-docs Design the language for a ten-minute seat hold. Find current expiration behavior using matt-compat.scout. I want a Hold to reserve a seat temporarily and a Reservation to mean confirmed booking. Stress-test expiration versus cancellation. Ask the decision frontier and wait for my answers. Update GLOSSARY.md as terms settle using the original bundled format. No code implementation is requested. When shared understanding is confirmed and documentation is saved, end with ACCEPTANCE_COMPLETE.",
  research: "/skill:research Investigate what Node.js assert.strictEqual considers equal, using https://nodejs.org/api/assert.html as the primary source. Use matt_research_prepare with docs/research and its exact returned background launch. While it runs read package.json and report the configured test command. When native completion arrives, read the saved findings and check their source citations, then end ACCEPTANCE_COMPLETE. Do not declare success while research is pending.",
  "code-review": "/skill:code-review Review integration against review-base using spec.md and CONTRIBUTING.md. Prepare captured evidence with matt_review_prepare and run its returned launch unchanged. Report both independent axes, tested HEAD, and unresolved findings. Do not fix code in this review-only acceptance. End ACCEPTANCE_COMPLETE only after both reports return.",
  "implement-spec": "/skill:implement-spec Implement spec.md and both dependent tickets in tickets.json on integration. Use matt_worktree owned branches and workers (async:true, worktree:false where possible), native status and completion, reconcile-child after process proof, serialized matt-compat.merger children, and npm test validation after each merge. The second ticket must start after the first is integrated and validated, with dependsOn receipt IDs. Load code-review and perform captured independent final review against review-base using spec.md; address findings in a worker. Close local tracker tickets and commit their updates. Revalidate all worktrees on the final integration HEAD with npm test before planning/applying cleanup. Retain every branch. Report the final tested commit and unresolved findings. End ACCEPTANCE_COMPLETE only when all work and eligible cleanup are finished. This is a local fixture: no PR is configured or requested.",
};
const cli = join(dirname(fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"))), "bundle/cli.js");
const args = [cli, ...(resuming ? ["--continue"] : []), "--mode", "rpc", "--no-extensions", "--no-prompt-templates", "--no-themes", "--extension", join(root, "extensions/index.ts"), "--extension", auth, "--extension", join(root, "node_modules/pi-subagents/index.js"), "--provider", "openai-codex", "--model", model, "--thinking", "low"];
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => ["PATH", "TMPDIR", "TMP", "TEMP", "SYSTEMROOT", "HOME", "USERPROFILE", "LANG", "LC_ALL", "TZ", "MATT_LIVE_CHATGPT"].includes(key)));
Object.assign(env, { PI_CODING_AGENT_DIR: agent, PI_OFFLINE: "1", PI_TELEMETRY: "off" });
const processChild = spawn(process.execPath, args, { cwd: repo, env, stdio: ["pipe", "pipe", "pipe"] });
let buffer = "", finished = false, round = 0, settled = false;
const events: any[] = [];
const log = join(base, "events.jsonl"), err = join(base, "stderr.log");
if (resuming) events.push(...readFileSync(log, "utf8").trim().split("\n").flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } }));
else { writeFileSync(log, ""); writeFileSync(err, ""); }
processChild.stdout.on("data", (chunk) => {
  buffer += chunk.toString();
  let newline;
  while ((newline = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
    try { const event = JSON.parse(line); events.push(event); if (event.type === "agent_settled") settled = true; if (event.type === "agent_start") settled = false; } catch { /* Non-JSON diagnostics are retained in stderr by Pi. */ }
    // Provider credentials never occur in Pi's conversation events.
    writeFileSync(log, line + "\n", { flag: "a" });
  }
});
processChild.stderr.on("data", (chunk) => writeFileSync(err, chunk, { flag: "a" }));
const prompt = (message: string) => { settled = false; processChild.stdin.write(JSON.stringify({ type: "prompt", message }) + "\n"); };
prompt(resuming ? "Continue the original implement-spec acceptance from this persisted session and existing receipts. Do not repeat completed workers. Merger children MUST use async:false and no worktree override, in the integration checkout. Complete the remaining dependency, review, tracker closure and commit-bound validation/eligible cleanup. Then end ACCEPTANCE_COMPLETE." : prompts[scenario!]!);
console.log(JSON.stringify({ scenario, directory: base, pid: processChild.pid }));
try {
  const deadline = Date.now() + 20 * 60 * 1000;
  while (Date.now() < deadline) {
    await pause(250);
    if (processChild.exitCode !== null) throw new Error(`Pi exited early: ${readFileSync(err, "utf8")}`);
    if (!settled) continue;
    const final = events.findLast((event) => event.type === "message_end" && event.message?.role === "assistant")?.message;
    const text = final?.content?.filter((part: any) => part.type === "text").map((part: any) => part.text).join("\n") ?? "";
    if (final?.stopReason === "error") throw new Error(final.errorMessage ?? "Model error");
    if (text.includes("ACCEPTANCE_COMPLETE")) { finished = true; break; }
    if (scenario === "grill-with-docs" && ++round <= 6) prompt("Yes to every recommendation in this round. A Hold expires automatically after ten minutes; cancellation is an explicit user decision before expiration; a Reservation is confirmed and never silently expires. I confirm our shared understanding once no decision frontier remains. Save resolved domain terms now. Do not implement code. If a real tradeoff does not justify an ADR, do not create one. Finish ACCEPTANCE_COMPLETE when the original workflow is complete.");
    else if (scenario !== "research" && ++round <= 12) prompt("Continue the original task through the remaining steps. Use native status for pending background children; do not redispatch them. Merger children require async:false and no worktree override. End ACCEPTANCE_COMPLETE when finished.");
  }
  assert.ok(finished, "Live acceptance exceeded its finite deadline; all work retained");
  const toolResults = events.filter((event) => event.type === "tool_execution_end");
  const used = (name: string) => toolResults.some((event) => event.toolName === name && !event.isError);
  if (scenario === "grill-with-docs") { assert.ok(used("Skill") && used("subagent")); assert.ok(existsSync(join(repo, "GLOSSARY.md"))); assert.ok(round > 0, "Interview must wait for fixture answers"); }
  if (scenario === "code-review") assert.ok(used("matt_review_prepare") && used("subagent"));
  if (scenario === "research") { assert.ok(used("matt_research_prepare") && used("read")); const files = readdirSync(join(repo, "docs/research")); assert.ok(files.some((file) => /https:\/\/nodejs.org/.test(readFileSync(join(repo, "docs/research", file), "utf8")))); }
  if (scenario === "implement-spec") {
    assert.ok(used("matt_worktree") && used("matt_review_prepare"));
    assert.ok(JSON.parse(readFileSync(join(repo, "tickets.json"), "utf8")).every((ticket: any) => ticket.state === "closed"));
    const check = spawnSync("npm", ["test"], { cwd: repo, encoding: "utf8" }); assert.equal(check.status, 0, check.stdout + check.stderr);
    assert.equal(git(["worktree", "list", "--porcelain"]).split("worktree ").length - 1, 1);
  }
  const summary = { scenario, ok: true, model: `openai-codex/${model}`, upstream: "49dd158d1076134a641b33efb035946536778336", head: git(["rev-parse", "HEAD"]), directory: base, rounds: round, toolResults: toolResults.length };
  writeFileSync(join(base, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
  console.log(JSON.stringify(summary));
} finally { processChild.stdin.end(); await pause(300); if (processChild.exitCode === null) processChild.kill(); }
