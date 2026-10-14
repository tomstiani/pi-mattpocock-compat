import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { run } from "./helpers/pi.ts";

test("real Pi explicitly loads a user-only root and resolves two nested skills", (t) => {
  const { rows, skills } = run(t, { calls: (skills) => [
    { name: "Skill", arguments: { skill: "grilling" } },
    { name: "Skill", arguments: { skill: "domain-modeling", args: "Use exact domain terms" } },
    { name: "read", arguments: { path: join(skills, "domain-modeling/references/domain.md") } },
  ] });
  const results = rows.filter((row) => row.kind === "result" && row.tool === "Skill");
  assert.equal(results.length, 2);
  assert.ok(results.every((row) => !row.isError));
  assert.match(JSON.stringify(results[0]), /GRILLING_MARKER/);
  assert.match(JSON.stringify(results[1]), /DOMAIN_MARKER/);
  assert.ok(JSON.stringify(results[1]).includes(join(skills, "domain-modeling")));
  assert.ok(JSON.stringify(results[1]).includes("Use exact domain terms"));
  assert.match(JSON.stringify(rows.find((row) => row.kind === "request")?.context), /ROOT_WORKFLOW_MARKER/);
  assert.ok(rows.some((row) => row.kind === "result" && row.tool === "read" && JSON.stringify(row.result).includes("REFERENCE_MARKER")));
});

test("original upstream grill-with-docs loads its real model-invoked dependencies", { skip: !process.env.MATT_UPSTREAM_CHECKOUT }, (t) => {
  const { rows } = run(t, { upstream: process.env.MATT_UPSTREAM_CHECKOUT, calls: [
    { name: "Skill", arguments: { skill: "grilling" } },
    { name: "Skill", arguments: { skill: "domain-modeling" } },
  ] });
  const results = rows.filter((row) => row.kind === "result" && row.tool === "Skill");
  assert.equal(results.length, 2);
  assert.ok(results.every((row) => !row.isError));
  assert.match(JSON.stringify(results[0]), /Interview the user relentlessly/);
  assert.match(JSON.stringify(results[1]), /GLOSSARY/);
  assert.match(JSON.stringify(rows.find((row) => row.kind === "request")?.context), /Call the Skill tool twice/);
});

test("real Pi rejects an automatic attempt to load the user-only root", (t) => {
  const { rows } = run(t, { prompt: "Inspect available skills", calls: [{ name: "Skill", arguments: { skill: "grill-with-docs" } }] });
  const result = rows.find((row) => row.kind === "result" && row.tool === "Skill")!;
  assert.equal(result.isError, true);
  assert.equal(result.result?.details?.code, "user_only");
  const firstRequest = JSON.stringify(rows.find((row) => row.kind === "request")?.context);
  assert.ok(!firstRequest.includes("ROOT_WORKFLOW_MARKER"));
});

test("read policy hooks block the Skill adapter in the actual Pi loop", (t) => {
  const { rows } = run(t, { blockRead: true, calls: [{ name: "Skill", arguments: { skill: "grilling" } }] });
  const result = rows.find((row) => row.kind === "result" && row.tool === "Skill")!;
  assert.equal(result.isError, true);
  assert.equal(result.result?.details?.code, "read_failed");
  assert.match(JSON.stringify(result), /Read denied by test policy/);
  assert.ok(!JSON.stringify(result).includes("GRILLING_MARKER"));
});
