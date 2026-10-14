import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { fixture, run, type Calls, type Evidence } from "./helpers/pi.ts";

function report(rows: ReturnType<typeof run>["rows"]): Record<string, unknown> {
  const result = rows.find((row) => row.kind === "result" && row.tool === "matt_preflight");
  assert.ok(result, "Expected the real Pi loop to execute matt_preflight");
  return result.result!.details!;
}

test("preflight rejects an installed but inactive runtime", (t) => {
  const result = report(run(t, { calls: [{ name: "matt_preflight", arguments: { role: "matt-compat.worker" } }] }).rows);
  assert.equal(result.ok, false);
  assert.match(JSON.stringify(result.errors), /Load pi-subagents/);
});

test("preflight resolves the packaged worker and its actual child Skill provider", (t) => {
  const result = report(run(t, { runtime: true, calls: [{ name: "matt_preflight", arguments: { role: "matt-compat.worker" } }] }).rows);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.ok((result.skills as string[]).includes("tdd"));
  assert.ok((result.tools as string[]).includes("Skill"));
  assert.ok((result.contextFiles as string[]).some((path) => path.endsWith("AGENTS.md")));
  assert.equal(typeof result.launchContractDigest, "string");
});

test("preflight cannot report ready when native subagent is registered but hidden from the parent", (t) => {
  const result = report(run(t, { runtime: true, toolActivation: "dynamic", calls: [{ name: "matt_preflight", arguments: { role: "matt-compat.researcher" } }] }).rows);
  assert.equal(result.ok, false, JSON.stringify(result));
  assert.match(JSON.stringify(result.errors), /subagents_enable/);
  assert.deepEqual(result.parentDispatch, { subagentRegistered: true, subagentActive: false, activationToolActive: true });
});

test("native loader activation makes the parent launcher ready without changing unrelated tools", (t) => {
  const { rows } = run(t, { runtime: true, toolActivation: "dynamic", calls: [
    { name: "subagents_enable", arguments: {} },
    { name: "read", arguments: { path: "AGENTS.md" } },
    { name: "matt_preflight", arguments: { role: "matt-compat.researcher" } },
    { name: "matt_research_prepare", arguments: { question: "Fixture preparation after activation", outputDir: "docs/research" } },
  ] });
  const checked = report(rows);
  assert.equal(checked.ok, true, JSON.stringify(checked));
  assert.equal((checked.parentDispatch as { subagentActive: boolean }).subagentActive, true);
  assert.equal(rows.find((row) => row.tool === "matt_research_prepare" && row.kind === "result")?.isError, false);
  assert.equal(rows.find((row) => row.tool === "read" && row.kind === "result")?.isError, false);
});

test("eager startup exposes the launcher without a loader and respects host exclusions", (t) => {
  const ready = report(run(t, { runtime: true, toolActivation: "eager", calls: [{ name: "matt_preflight", arguments: { role: "matt-compat.scout" } }] }).rows);
  assert.equal(ready.ok, true, JSON.stringify(ready));
  assert.deepEqual(ready.parentDispatch, { subagentRegistered: true, subagentActive: true, activationToolActive: false });
  const startup = report(run(t, { runtime: true, toolActivation: "dynamic", excludedTools: ["subagents_enable"], calls: [{ name: "matt_preflight", arguments: { role: "matt-compat.scout" } }] }).rows);
  assert.equal(startup.ok, true, JSON.stringify(startup));
  assert.deepEqual(startup.parentDispatch, { subagentRegistered: true, subagentActive: true, activationToolActive: false });
  const blocked = report(run(t, { runtime: true, toolActivation: "eager", excludedTools: ["subagent"], calls: [{ name: "matt_preflight", arguments: { role: "matt-compat.scout" } }] }).rows);
  assert.equal(blocked.ok, false, JSON.stringify(blocked));
  assert.equal((blocked.parentDispatch as { subagentActive: boolean }).subagentActive, false);
  assert.match(JSON.stringify(blocked.errors), /allowlist|exclusions/);
});

test("a parent session predating runtime installation reproduces both inactive tools and recovers without discarding history", (t) => {
  const f = fixture(t, { runtime: true, toolActivation: "auto" });
  const common = f.args.slice(0, -1).filter((arg) => arg !== "--no-session");
  const initial = common.filter((arg, index, args) => !arg.endsWith("node_modules/pi-subagents/index.js") && !(arg === "--extension" && args[index + 1]?.endsWith("node_modules/pi-subagents/index.js")));
  const sessions = join(f.dir, "sessions");
  const execute = (args: string[], calls: Calls) => {
    const result = spawnSync(process.execPath, args, { cwd: f.dir, env: { ...f.env, MATT_TEST_CALLS: JSON.stringify(calls) }, encoding: "utf8", timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
    assert.equal(result.error, undefined); assert.equal(result.status, 0, result.stderr + result.stdout);
  };
  execute([...initial, "--session-dir", sessions, "Create an ordinary parent before runtime installation."], []);
  const source = join(sessions, readdirSync(sessions).find((name) => name.endsWith(".jsonl"))!);
  const outcomes: Record<string, unknown>[] = [];
  for (const [label, mode, flags] of [["auto", "auto", []], ["eager", "eager", []], ["no-loader", "auto", ["--exclude-tools", "subagents_enable"]]] as const) {
    const copy = join(f.dir, `${label}.jsonl`); cpSync(source, copy);
    writeFileSync(join(f.dir, "agent/extensions/subagent/config.json"), JSON.stringify({ toolActivation: mode }));
    writeFileSync(f.evidence, "");
    execute([...common, ...flags, "--session", copy, "Check the existing parent's launch readiness."], [{ name: "matt_preflight", arguments: { role: "matt-compat.scout" } }]);
    const rows = readFileSync(f.evidence, "utf8").trim().split("\n").map((line) => JSON.parse(line) as Evidence);
    outcomes.push(report(rows));
    assert.match(readFileSync(copy, "utf8"), /Create an ordinary parent before runtime installation/);
  }
  assert.equal(outcomes[0]!.ok, false);
  assert.deepEqual(outcomes[0]!.parentDispatch, { subagentRegistered: true, subagentActive: false, activationToolActive: false });
  assert.match(JSON.stringify(outcomes[0]!.errors), /resumed session/);
  for (const result of outcomes.slice(1)) {
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.deepEqual(result.parentDispatch, { subagentRegistered: true, subagentActive: true, activationToolActive: false });
  }
});

test("research preparation cannot hand back an unusable launch before native tool activation", (t) => {
  const { rows } = run(t, { runtime: true, toolActivation: "dynamic", calls: [
    { name: "matt_research_prepare", arguments: { question: "Do not prepare an unlaunchable job", outputDir: "docs/research" } },
  ] });
  const result = rows.find((row) => row.kind === "result" && row.tool === "matt_research_prepare")!;
  assert.equal(result.isError, true, JSON.stringify(result));
  assert.match(JSON.stringify(result), /subagents_enable/);
  assert.ok(!rows.some((row) => row.kind === "result" && row.tool === "write"));
});

test("missing required skills fail preflight", (t) => {
  const result = report(run(t, { runtime: true, omitSkill: "tdd", calls: [{ name: "matt_preflight", arguments: { role: "matt-compat.worker" } }] }).rows);
  assert.equal(result.ok, false);
  assert.match(JSON.stringify(result.errors), /tdd/);
});

test("a skill supplied only on the parent CLI cannot produce a false ready result", (t) => {
  const result = report(run(t, { runtime: true, parentOnlySkill: "tdd",
    calls: [{ name: "matt_preflight", arguments: { role: "matt-compat.worker" } }] }).rows);
  assert.equal(result.ok, false);
  assert.match(JSON.stringify(result.errors), /tdd/);
});

test("user-only skills cannot satisfy an automatic child's dependency", (t) => {
  const result = report(run(t, { runtime: true, userOnlySkill: "tdd",
    calls: [{ name: "matt_preflight", arguments: { role: "matt-compat.worker" } }] }).rows);
  assert.equal(result.ok, false);
  assert.match(JSON.stringify(result.missing), /tdd/);
});

test("disabling repository instructions is reported before launch", (t) => {
  const result = report(run(t, { runtime: true, roleOverrides: { "matt-compat.worker": { inheritProjectContext: false } },
    calls: [{ name: "matt_preflight", arguments: { role: "matt-compat.worker" } }] }).rows);
  assert.equal(result.ok, false);
  assert.match(JSON.stringify(result.errors), /repository instructions/);
});

test("compatibility roles cannot override the leaf-agent dispatch contract", (t) => {
  const result = report(run(t, { runtime: true, roleOverrides: { "matt-compat.scout": { tools: ["read", "grep", "find", "ls", "Skill", "subagent"] } },
    calls: [{ name: "matt_preflight", arguments: { role: "matt-compat.scout" } }] }).rows);
  assert.equal(result.ok, false);
  assert.match(JSON.stringify(result.errors), /leaf agents|Nested/);
});

test("a denied child tool fails preflight instead of widening the allowlist", (t) => {
  const result = report(run(t, { runtime: true, roleOverrides: { "matt-compat.worker": { tools: ["read", "grep", "find", "ls", "Skill"] } },
    calls: [{ name: "matt_preflight", arguments: { role: "matt-compat.worker" } }] }).rows);
  assert.equal(result.ok, false);
  assert.match(JSON.stringify(result.missing), /bash/, JSON.stringify(result));
});

test("an actual foreground child receives repository context, its Skill tool, and a bounded allowlist", (t) => {
  const { rows } = run(t, { runtime: true, childProbe: true,
    roleOverrides: { "matt-compat.scout": { model: "matt-child-fixture/scripted" } },
    calls: [{ name: "subagent", arguments: { agent: "matt-compat.scout", task: "Inspect the fixture using the tdd skill", async: false, options: { acceptance: false } } }],
  });
  const result = rows.find((row) => row.kind === "result" && row.tool === "subagent")!;
  assert.equal(result.isError, false, JSON.stringify(result));
  assert.match(JSON.stringify(result), /CHILD_PROBE_OK/);
  assert.equal(rows.filter((row) => row.kind === "child_request").length, 2);
});

test("research fails preflight when the child web provider is absent", (t) => {
  const result = report(run(t, { runtime: true, roleOverrides: { "matt-compat.researcher": { subagentOnlyExtensions: [resolve("extensions/child.ts")] } }, calls: [{ name: "matt_preflight", arguments: { role: "matt-compat.researcher" } }] }).rows);
  assert.equal(result.ok, false);
  assert.match(JSON.stringify(result.errors), /pi-web-access|web_search/);
});

test("direct dispatch cannot bypass the missing-skill preflight", (t) => {
  const { rows } = run(t, { runtime: true, omitSkill: "tdd", calls: [
    { name: "subagent", arguments: { agent: "matt-compat.worker", task: "Implement this approved ticket", async: false } },
  ] });
  const result = rows.find((row) => row.kind === "result" && row.tool === "subagent")!;
  assert.equal(result.isError, true);
  assert.match(JSON.stringify(result), /preflight blocked dispatch/);
  assert.equal(rows.filter((row) => row.kind === "request").length, 2, "Only the parent received model requests");
});

test("per-call capability overrides cannot change a checked direct role", (t) => {
  const { rows } = run(t, { runtime: true, calls: [{ name: "subagent", arguments: {
    agent: "matt-compat.scout", task: "Inspect the repository", async: false,
    options: { skill: "grill-with-docs" },
  } }] });
  const result = rows.find((row) => row.kind === "result" && row.tool === "subagent")!;
  assert.equal(result.isError, true);
  assert.match(JSON.stringify(result), /Per-call overrides/);
  assert.equal(rows.filter((row) => row.kind === "request").length, 2);
});

 test("research preflight loads the pinned real web provider in the child", (t) => {
  const result = report(run(t, { runtime: true, calls: [{ name: "matt_preflight", arguments: { role: "matt-compat.researcher" } }] }).rows);
  assert.equal(result.ok, true, JSON.stringify(result));
  for (const tool of ["web_search", "fetch_content", "get_search_content", "source_check"]) assert.ok((result.tools as string[]).includes(tool));
});
