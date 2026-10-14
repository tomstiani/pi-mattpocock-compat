import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { run, type Calls } from "./helpers/pi.ts";

const roleOverrides = {
  "matt-compat.standards-reviewer": { model: "matt-review-fixture/standards" },
  "matt-compat.spec-reviewer": { model: "matt-review-fixture/spec" },
};
const launch = { name: "subagent", arguments: { workflow: "matt-compat.review", args: { bundleId: "$prepared" }, async: false } };
const calls: Calls = [{ name: "matt_review_prepare", arguments: { baseRef: "review-base", specPath: "spec.md" } }, launch];

test("independent parallel reviewers receive one committed snapshot and retain separate reports", (t) => {
  const { rows } = run(t, { runtime: true, gitFixture: true, reviewProbe: "both", roleOverrides, calls, prompt: "Review the feature. PARENT_SECRET_MARKER" });
  const preparation = rows.find((row) => row.tool === "matt_review_prepare" && row.kind === "result")!;
  assert.equal(preparation.isError, false, JSON.stringify(preparation));
  const saved = JSON.parse(readFileSync(preparation.result!.details!.path as string, "utf8"));
  assert.match(saved.diff, /PINNED_DIFF_MARKER/);
  assert.ok(!saved.diff.includes("DIRTY_TREE_NOT_REVIEWED"));
  const reviewers = rows.filter((row) => row.kind === "review_started");
  assert.equal(reviewers.length, 2, "Both children crossed the shared barrier before either completed");
  for (const reviewer of reviewers) {
    assert.ok(JSON.stringify(reviewer.context).includes(saved.head));
    assert.ok(JSON.stringify(reviewer.context).includes(saved.base));
  }
  const result = rows.find((row) => row.kind === "result" && row.tool === "subagent")!;
  assert.equal(result.isError, false, JSON.stringify(result));
  assert.match(JSON.stringify(result), /STANDARDS_REPORT/);
  assert.match(JSON.stringify(result), /SPEC_REPORT/);
  const workflow = result.result!.details!.workflow as { value: { standards: { outputArtifactPath: string; artifactPaths: string[]; resolvedContext: string }; spec: { outputArtifactPath: string; artifactPaths: string[]; resolvedContext: string } } };
  const { standards, spec } = workflow.value;
  assert.equal(standards.resolvedContext, "fresh");
  assert.equal(spec.resolvedContext, "fresh");
  assert.notEqual(standards.artifactPaths[0], spec.artifactPaths[0], "Independent native session files");
  assert.notEqual(standards.outputArtifactPath, spec.outputArtifactPath);
  assert.match(readFileSync(standards.outputArtifactPath, "utf8"), /STANDARDS_REPORT/);
  assert.match(readFileSync(spec.outputArtifactPath, "utf8"), /SPEC_REPORT/);
});

test("one failed review axis cannot become a successful aggregate", (t) => {
  const { rows } = run(t, { runtime: true, gitFixture: true, reviewProbe: "fail", roleOverrides, calls });
  const result = rows.find((row) => row.kind === "result" && row.tool === "subagent")!;
  assert.equal(result.isError, true, JSON.stringify(result));
  assert.match(JSON.stringify(result), /Injected spec reviewer failure/);
  assert.match(JSON.stringify(result), /STANDARDS_REPORT/);
});

test("explicit missing spec skips that axis without claiming a pass", (t) => {
  const { rows } = run(t, { runtime: true, gitFixture: true, reviewProbe: "skip", roleOverrides, calls: [
    { name: "matt_review_prepare", arguments: { baseRef: "review-base", noSpecReason: "User states no spec exists" } }, launch,
  ] });
  assert.equal(rows.filter((row) => row.kind === "review_started").length, 1);
  const result = rows.find((row) => row.kind === "result" && row.tool === "subagent")!;
  assert.equal(result.isError, false, JSON.stringify(result));
  assert.match(JSON.stringify(result), /skipped/);
  assert.match(JSON.stringify(result), /User states no spec exists/);
});

for (const [name, options, baseRef, expected] of [
  ["invalid revision", {}, "missing-ref", /rev-parse|revision|failed/],
  ["empty diff", { emptyDiff: true }, "review-base", /empty/],
  ["unrecognized baseline", { invalidBaseline: true }, "review-base", /smell baseline/],
  ["blocked native evidence read", { blockRead: true }, "review-base", /Read denied/],
  ["blocked native Git command", { blockBash: true }, "review-base", /Bash denied/],
  ["truncated diff", { largeDiff: true }, "review-base", /truncated evidence/],
] as const) {
  test(`preparation rejects ${name} before either child starts`, (t) => {
    const { rows } = run(t, { runtime: true, gitFixture: true, ...options, calls: [
      { name: "matt_review_prepare", arguments: { baseRef, specPath: "spec.md" } },
    ] });
    const result = rows.find((row) => row.tool === "matt_review_prepare" && row.kind === "result")!;
    assert.equal(result.isError, true, JSON.stringify(result));
    assert.match(JSON.stringify(result), expected);
    assert.equal(rows.filter((row) => row.kind === "review_started").length, 0);
  });
}

test("review launch rejects overrides instead of changing captured child contracts", (t) => {
  const { rows } = run(t, { runtime: true, gitFixture: true, calls: [calls[0]!,
    { ...launch, arguments: { ...launch.arguments, options: { context: "fork" } } },
  ] });
  const result = rows.find((row) => row.kind === "result" && row.tool === "subagent")!;
  assert.equal(result.isError, true);
  assert.match(JSON.stringify(result), /exact foreground launch/);
});


test("a reviewer cancellation is surfaced as an incomplete failed review", (t) => {
  const { rows } = run(t, { runtime: true, gitFixture: true, reviewProbe: "abort", roleOverrides, calls });
  const result = rows.find((row) => row.kind === "result" && row.tool === "subagent")!;
  assert.equal(result.isError, true, JSON.stringify(result));
  assert.match(JSON.stringify(result), /Independent review incomplete/);
});

test("moving HEAD after capture cannot change either review target", (t) => {
  const { rows } = run(t, { runtime: true, gitFixture: true, reviewProbe: "both", roleOverrides, calls: [calls[0]!,
    { name: "bash", arguments: { command: "git -c user.name=Fixture -c user.email=fixture@example.invalid commit --allow-empty --quiet -m moved-after-capture" } }, launch,
  ] });
  const preparation = rows.find((row) => row.tool === "matt_review_prepare" && row.kind === "result")!;
  assert.equal(preparation.isError, false, JSON.stringify(preparation));
  const saved = JSON.parse(readFileSync(preparation.result!.details!.path as string, "utf8"));
  const liveHead = spawnSync("git", ["rev-parse", "HEAD"], { cwd: saved.cwd, encoding: "utf8" });
  assert.equal(liveHead.status, 0);
  assert.notEqual(liveHead.stdout.trim(), saved.head);
  for (const row of rows.filter((row) => row.kind === "review_started")) assert.ok(JSON.stringify(row.context).includes(saved.head));
  assert.equal(rows.filter((row) => row.kind === "review_started").length, 2);
  assert.equal(rows.find((row) => row.kind === "result" && row.tool === "subagent")!.isError, false);
});

test("the original upstream code-review skill supplies the complete captured baseline", { skip: !process.env.MATT_UPSTREAM_CHECKOUT }, (t) => {
  const { rows } = run(t, { runtime: true, gitFixture: true,
    originalReviewSkill: join(process.env.MATT_UPSTREAM_CHECKOUT!, "skills/engineering/code-review/SKILL.md"),
    calls: [calls[0]!],
  });
  const preparation = rows.find((row) => row.tool === "matt_review_prepare" && row.kind === "result")!;
  assert.equal(preparation.isError, false, JSON.stringify(preparation));
  const saved = JSON.parse(readFileSync(preparation.result!.details!.path as string, "utf8"));
  assert.match(saved.baseline.text, /Mysterious Name/);
  assert.match(saved.baseline.text, /Refused Bequest/);
  assert.equal((saved.baseline.text.match(/^- \*\*[^*]+\*\*:/gm) ?? []).length, 12);
});
