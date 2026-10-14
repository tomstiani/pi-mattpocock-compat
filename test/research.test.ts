import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { test } from "node:test";
import { fixture, run, type Calls, type Evidence } from "./helpers/pi.ts";

const prepare = { name: "matt_research_prepare", arguments: { question: "Read the supplied local primary source", outputDir: "docs/research", name: "fixture" } };
const launch = { name: "subagent", arguments: { $research: true } };
const roleOverrides = { "matt-compat.researcher": { model: "matt-research-fixture/scripted", subagentOnlyExtensions: [resolve("extensions/child.ts"), resolve("test/fixtures/offline-web.ts"), resolve("test/fixtures/research-provider.ts")] } };

async function until<T>(read: () => T | undefined | false, description: string, timeout = 25000): Promise<T> {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = read();
    if (value) return value;
    await pause(50);
  }
  throw new Error(`Timed out waiting for ${description}`);
}
function rows(path: string): Array<Evidence & { message?: { customType?: string; content?: unknown }; pid?: number }> {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").trim().split("\n").filter(Boolean).flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } });
}

async function background(t: { after: (fn: () => void | Promise<void>) => void }, probe: "success" | "fail" | "delayed" | "blocked" | "live", exitParent = false, duplicate = false) {
  const sourceUrl = probe === "blocked" ? "http://127.0.0.1:9/private" : probe === "live" ? "https://example.com" : "https://primary.example.invalid/spec";
  const calls: Calls = [{ ...prepare, arguments: { ...prepare.arguments, question: `Investigate ${sourceUrl}` } }, launch, ...(duplicate ? [launch] : []), { name: "read", arguments: { path: "AGENTS.md" } }];
  const effectiveRoles = ["blocked", "live"].includes(probe) ? { "matt-compat.researcher": { ...roleOverrides["matt-compat.researcher"], subagentOnlyExtensions: [resolve("extensions/child.ts"), resolve("extensions/web.ts"), resolve("test/fixtures/research-provider.ts")] } } : roleOverrides;
  const cleanup: Array<() => void> = [];
  const f = fixture({ after: (fn) => { cleanup.push(fn); } }, { runtime: true, calls, roleOverrides: effectiveRoles, researchProbe: probe, sourceUrl, originalResearchSkill: process.env.MATT_UPSTREAM_CHECKOUT ? resolve(process.env.MATT_UPSTREAM_CHECKOUT, "skills/engineering/research/SKILL.md") : undefined });
  const args = f.args.slice(0, -1); args[args.indexOf("json")] = "rpc";
  const child = spawn(process.execPath, args, { cwd: f.dir, env: f.env, stdio: ["pipe", "pipe", "pipe"] });
  let output = "", errors = "";
  child.stdout.on("data", (chunk) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk) => { errors += chunk.toString(); });
  let nativeRun: { asyncDir?: string; runId?: string } | undefined;
  t.after(() => {
    if (nativeRun?.asyncDir) {
      try {
        const status = JSON.parse(readFileSync(resolve(nativeRun.asyncDir, "status.json"), "utf8"));
        if (status.runId === nativeRun.runId && ["running", "queued"].includes(status.state) && typeof status.pid === "number") process.kill(status.pid, "SIGTERM");
      } catch { /* A settled or already-exited fixture needs no stop. */ }
    }
    child.kill(); cleanup.forEach((fn) => fn());
  });
  child.stdin.write(JSON.stringify({ type: "prompt", message: `Research ${sourceUrl}. PARENT_SECRET_MARKER` }) + "\n");
  const launched = await until(() => rows(f.evidence).find((row) => row.kind === "result" && row.tool === "subagent"), "launch receipt").catch((error) => { throw new Error(`${error.message}\nRPC stdout: ${output}\nRPC stderr: ${errors}\nEvidence: ${JSON.stringify(rows(f.evidence)).slice(-4000)}`); });
  assert.equal(launched.isError, false, JSON.stringify(launched) + errors + output);
  const native = launched.result!.details!;
  nativeRun = native as { asyncDir?: string; runId?: string };
  assert.equal(typeof native.asyncDir, "string");
  assert.equal(typeof native.runId, "string");
  const preparation = rows(f.evidence).find((row) => row.kind === "result" && row.tool === "matt_research_prepare")!;
  const outputPath = preparation.result!.details!.outputPath as string;
  await until(() => rows(f.evidence).find((row) => row.kind === "parent_end"), "parent continuing after launch");
  assert.ok(rows(f.evidence).some((row) => row.kind === "result" && row.tool === "read"), "The parent did useful tool work after dispatch");
  if (exitParent) {
    child.stdin.end();
    await until(() => child.exitCode !== null, "parent session exit");
  }
  const statusPath = resolve(native.asyncDir as string, "status.json");
  const status = await until(() => {
    if (!existsSync(statusPath)) return undefined;
    const status = JSON.parse(readFileSync(statusPath, "utf8"));
    return ["complete", "completed", "failed", "stopped"].includes(status.state) ? status : undefined;
  }, "native terminal status");
  if (!["fail", "blocked"].includes(probe) && status.state !== "complete") throw new Error(`Unexpected child failure: ${JSON.stringify(status)}\n${JSON.stringify(rows(f.evidence).filter((row) => row.kind === "research_request")).slice(-14000)}`);
  if (!exitParent) await until(() => rows(f.evidence).find((row) => row.kind === "parent_notice" && row.message?.customType === "subagent-notify"), "native parent completion notification");
  return { rows: rows(f.evidence), native, preparation, outputPath, status, errors, output, parentPid: child.pid };
}

test("detached research loads its skill, saves cited fixture findings and notifies a usable parent", async (t) => {
  const result = await background(t, "success");
  assert.equal(result.status.state, "complete", JSON.stringify(result.status) + result.errors);
  assert.match(readFileSync(result.outputPath, "utf8"), /PRIMARY_SOURCE_FIXTURE_MARKER/);
  assert.match(readFileSync(result.outputPath, "utf8"), /https:\/\/primary\.example\.invalid/);
  const notice = result.rows.find((row) => row.message?.customType === "subagent-notify")!;
  assert.match(JSON.stringify(notice), /completed/);
  assert.ok(JSON.stringify(notice).includes(result.native.runId as string));
  assert.ok(result.rows.findIndex((row) => row.kind === "result" && row.tool === "read") < result.rows.findLastIndex((row) => row.kind === "research_request"), "Parent tool work completed before the research model finished");
  assert.ok(result.rows.some((row) => row.message?.customType === "matt-research-result" && JSON.stringify(row.message).includes(result.outputPath) && JSON.stringify(row.message).includes(result.native.runId as string)), "Completion annotation binds the durable output path to this native run");
  assert.ok(result.rows.filter((row) => row.kind === "research_request").every((row) => row.pid !== result.parentPid));
  if (process.env.MATT_UPSTREAM_CHECKOUT) assert.match(JSON.stringify(result.rows.filter((row) => row.kind === "research_request")), /background agent/);
});

test("failed detached research sends a failure notice and retains output diagnostics", async (t) => {
  const result = await background(t, "fail");
  assert.equal(result.status.state, "failed", JSON.stringify(result.status));
  const notice = result.rows.find((row) => row.message?.customType === "subagent-notify")!;
  assert.match(JSON.stringify(notice), /failed/);
  assert.match(JSON.stringify(notice), /Injected detached research failure/);
  assert.match(readFileSync(result.outputPath, "utf8"), /No completed findings/);
  assert.match(readFileSync(resolve(result.native.asyncDir as string, "status.json"), "utf8"), /Injected detached research failure/);
  assert.ok(result.rows.some((row) => row.message?.customType === "matt-research-result" && JSON.stringify(row.message).includes(result.outputPath) && JSON.stringify(row.message).includes(result.native.runId as string)), "Completion annotation binds the durable output path to this native run");
});

test("parent exit leaves detached research recoverable without claiming a completion wake", async (t) => {
  const result = await background(t, "delayed", true);
  assert.equal(result.status.state, "complete", JSON.stringify(result.status));
  assert.match(readFileSync(result.outputPath, "utf8"), /PRIMARY_SOURCE_FIXTURE_MARKER/);
  assert.ok(!result.rows.some((row) => row.message?.customType === "subagent-notify"));
  assert.equal(JSON.parse(readFileSync(result.preparation.result!.details!.requestPath as string, "utf8")).state, "prepared", "The request receipt is not a false completion receipt");
});

for (const [label, args, expected] of [
  ["unprepared", { agent: "matt-compat.researcher", task: "Research this", async: true }, /exact background launch/],
  ["changed output", { $research: true, output: "elsewhere.md" }, /exact background launch/],
  ["foreground override", { $research: true, async: false }, /exact background launch/],
] as const) test(`research rejects ${label} dispatch`, (t) => {
  const { rows } = run(t, { runtime: true, calls: label === "unprepared" ? [{ name: "subagent", arguments: args }] : [prepare, { name: "subagent", arguments: args }] });
  const result = rows.find((row) => row.kind === "result" && row.tool === "subagent")!;
  assert.equal(result.isError, true, JSON.stringify(result));
  assert.match(JSON.stringify(result), expected);
});

test("research cannot prepare with a missing skill", (t) => {
  const { rows } = run(t, { runtime: true, omitSkill: "research", calls: [prepare] });
  const result = rows.find((row) => row.kind === "result" && row.tool === "matt_research_prepare")!;
  assert.equal(result.isError, true);
  assert.match(JSON.stringify(result), /research/);
});


test("the real web provider's internal-address rejection reaches the parent as research failure", async (t) => {
  const result = await background(t, "blocked");
  assert.equal(result.status.state, "failed");
  const notice = result.rows.find((row) => row.message?.customType === "subagent-notify")!;
  assert.match(JSON.stringify(notice), /Blocked internal address/);
  assert.ok(result.rows.some((row) => row.message?.customType === "matt-research-result" && JSON.stringify(row.message).includes(result.outputPath) && JSON.stringify(row.message).includes(result.native.runId as string)), "Completion annotation binds the durable output path to this native run");
});

test("live public-page smoke with the pinned real web provider", { skip: process.env.MATT_LIVE_WEB_SMOKE !== "1" }, async (t) => {
  const result = await background(t, "live");
  assert.equal(result.status.state, "complete");
  assert.match(readFileSync(result.outputPath, "utf8"), /Example Domain/);
  assert.match(readFileSync(result.outputPath, "utf8"), /https:\/\/example\.com/);
});


test("a second dispatch of the same prepared research is rejected while the first completes", async (t) => {
  const result = await background(t, "success", false, true);
  const launches = result.rows.filter((row) => row.kind === "result" && row.tool === "subagent");
  assert.equal(launches.length, 2);
  assert.equal(launches[0]!.isError, false);
  assert.equal(launches[1]!.isError, true);
  assert.match(JSON.stringify(launches[1]), /already attempted/);
});

test("a denied request-receipt write prevents preparation and dispatch", (t) => {
  const { rows } = run(t, { runtime: true, blockWrite: true, calls: [prepare] });
  const result = rows.find((row) => row.kind === "result" && row.tool === "matt_research_prepare")!;
  assert.equal(result.isError, true);
  assert.match(JSON.stringify(result), /denied or failed writing/);
});

test("research preparation rejects a notes directory outside the repository", (t) => {
  const { rows } = run(t, { runtime: true, calls: [{ ...prepare, arguments: { ...prepare.arguments, outputDir: "../outside" } }] });
  const result = rows.find((row) => row.kind === "result" && row.tool === "matt_research_prepare")!;
  assert.equal(result.isError, true);
  assert.match(JSON.stringify(result), /relative repository notes directory/);
});
