import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const cli = join(dirname(fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"))), "bundle/cli.js");

export interface Evidence { kind: string; tool?: string; isError?: boolean; result?: { content: Array<{ text?: string }>; details?: { code?: string; [key: string]: unknown } }; context?: unknown }

export type Calls = Array<{ name: string; arguments: Record<string, unknown> }>;

export type FixtureOptions = { excludedTools?: string[]; toolActivation?: "eager" | "dynamic" | "auto"; blockRead?: boolean; blockWrite?: boolean; blockBash?: boolean; largeDiff?: boolean; calls?: Calls | ((skills: string) => Calls); prompt?: string; upstream?: string; runtime?: boolean; omitSkill?: string; parentOnlySkill?: string; userOnlySkill?: string; roleOverrides?: Record<string, unknown>; childProbe?: boolean; reviewProbe?: "both" | "skip" | "fail" | "abort"; gitFixture?: boolean; emptyDiff?: boolean; invalidBaseline?: boolean; originalReviewSkill?: string; originalResearchSkill?: string; researchProbe?: "success" | "fail" | "delayed" | "blocked" | "live"; sourceUrl?: string; worktreeFixture?: boolean };

export function fixture(t: { after: (fn: () => void) => void }, options: FixtureOptions = {}) {
  const temporary = mkdtempSync(join(tmpdir(), "matt-compat-pi-"));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const dir = options.worktreeFixture ? join(temporary, "repo") : temporary;
  mkdirSync(dir, { recursive: true });
  const agentDir = join(temporary, "agent");
  const skills = join(agentDir, "skills");
  for (const [name, instructions, userOnly] of [
    ["grill-with-docs", "Call the Skill tool for grilling and domain-modeling. ROOT_WORKFLOW_MARKER", true],
    ["grilling", "Ask a question. GRILLING_MARKER", false],
    ["domain-modeling", "Read references/domain.md. DOMAIN_MARKER", false],
    ["tdd", "Load codebase-design with Skill. TDD_CHILD_MARKER", false],
    ["codebase-design", "Read design.md. DESIGN_CHILD_MARKER", false],
    ["code-review", "Review the assigned axis. REVIEW_CHILD_MARKER\nOn top of whatever the repo documents: BASELINE_FIXTURE_MARKER\n### 4. Spawn reviewers", false],
    ["research", "Investigate primary sources. RESEARCH_CHILD_MARKER", false],
  ] as const) {
    if (name === options.omitSkill) continue;
    const folder = options.parentOnlySkill === name ? join(dir, "parent-skills", name) : join(skills, name);
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, "SKILL.md"), `---\nname: ${name}\ndescription: Fixture ${name}\ndisable-model-invocation: ${userOnly || name === options.userOnlySkill}\n---\n${instructions}\n`);
  }
  mkdirSync(join(skills, "domain-modeling", "references"));
  writeFileSync(join(skills, "domain-modeling", "references", "domain.md"), "REFERENCE_MARKER");
  writeFileSync(join(dir, "AGENTS.md"), "REPO_CONTEXT_MARKER\nFollow this repository's vocabulary.\n");
  writeFileSync(join(agentDir, "settings.json"), JSON.stringify({
    packages: [root], subagents: { agentOverrides: options.roleOverrides ?? {} },
  }));
  if (options.originalResearchSkill) writeFileSync(join(skills, "research/SKILL.md"), readFileSync(options.originalResearchSkill));
  if (options.originalReviewSkill) writeFileSync(join(skills, "code-review/SKILL.md"), readFileSync(options.originalReviewSkill));
  if (options.invalidBaseline) writeFileSync(join(skills, "code-review/SKILL.md"), "---\nname: code-review\ndescription: Invalid baseline fixture\n---\nNo baseline section.\n");
  if (options.gitFixture) {
    const git = (args: string[]) => {
      const result = spawnSync("git", args, { cwd: dir, encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr);
    };
    git(["init", "--quiet", ...(options.worktreeFixture ? ["--initial-branch=integration"] : [])]);
    if (options.worktreeFixture) { git(["config", "user.name", "Fixture"]); git(["config", "user.email", "fixture@example.invalid"]); }
    writeFileSync(join(dir, "feature.txt"), "before\n");
    writeFileSync(join(dir, "CONTRIBUTING.md"), "STANDARD_FIXTURE_MARKER\nUse clear names.\n");
    writeFileSync(join(dir, "spec.md"), "SPEC_FIXTURE_MARKER\nThe feature must say after.\n");
    git(["add", "feature.txt", "CONTRIBUTING.md", "spec.md", ...(options.worktreeFixture ? ["AGENTS.md"] : [])]);
    git(["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "-m", "base"]);
    git(["tag", "review-base"]);
    if (!options.emptyDiff) {
      writeFileSync(join(dir, "feature.txt"), "after PINNED_DIFF_MARKER\n" + (options.largeDiff ? "large diff line\n".repeat(3000) : ""));
      git(["add", "feature.txt"]);
      git(["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "-m", "implement feature"]);
      // The review must use committed content, not this uncommitted change.
      if (!options.worktreeFixture) writeFileSync(join(dir, "feature.txt"), "DIRTY_TREE_NOT_REVIEWED\n");
    }
  }
  mkdirSync(join(agentDir, "extensions/subagent"), { recursive: true });
  writeFileSync(join(agentDir, "extensions/subagent/config.json"), JSON.stringify({ toolActivation: options.toolActivation ?? "eager" }));
  const evidence = join(temporary, "evidence.jsonl");
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => ["PATH", "TMPDIR", "SYSTEMROOT", "LANG", "LC_ALL", "TZ"].includes(name)));
  Object.assign(env, {
    HOME: temporary, PI_CODING_AGENT_DIR: agentDir, PI_OFFLINE: "1", PI_TELEMETRY: "off",
    MATT_TEST_EVIDENCE: evidence, MATT_TEST_CALLS: JSON.stringify(typeof options.calls === "function" ? options.calls(skills) : options.calls ?? []),
    MATT_TEST_BLOCK_WRITE: options.blockWrite ? "1" : "0",
    MATT_TEST_BLOCK_BASH: options.blockBash ? "1" : "0",
    MATT_TEST_BLOCK_READ: options.blockRead ? "1" : "0",
    MATT_TEST_WORKTREE_PROBE: options.worktreeFixture ? "1" : "0",
    MATT_TEST_RESEARCH_PROBE: options.researchProbe ?? "",
    MATT_TEST_SOURCE_URL: options.sourceUrl ?? "",
    MATT_TEST_REVIEW_PROBE: options.reviewProbe ?? "",
    MATT_TEST_CHILD_PROBE: options.childProbe ? "1" : "0",
  });
  const args = [
    cli, "--mode", "json", "--no-session", "--no-extensions", "--no-context-files", "--no-prompt-templates", "--no-themes",
    "--extension", join(root, "extensions/index.ts"),
    "--extension", join(root, "test/fixtures/scripted-provider.ts"),
    ...(options.runtime ? ["--extension", join(root, "node_modules/pi-subagents/index.js")] : []),
    ...(options.excludedTools?.length ? ["--exclude-tools", options.excludedTools.join(",")] : []),
    ...(options.parentOnlySkill ? ["--skill", join(dir, "parent-skills", options.parentOnlySkill)] : []),
    "--provider", "matt-compat-fixture", "--model", "scripted", "--thinking", "off",
    ...(options.upstream ? ["--no-skills", "--skill", join(options.upstream, "skills/engineering"), "--skill", join(options.upstream, "skills/productivity")] : []),
    options.prompt ?? "/skill:grill-with-docs",
  ];
  return { dir, args, env, evidence, skills };
}

export function run(t: { after: (fn: () => void) => void }, options: FixtureOptions = {}): { rows: Evidence[]; skills: string } {
  const { dir, args, env, evidence, skills } = fixture(t, options);
  const result = spawnSync(process.execPath, args, { cwd: dir, env, encoding: "utf8", timeout: options.worktreeFixture ? 60000 : 30000, maxBuffer: 4 * 1024 * 1024 });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.ok(!result.stderr.includes("Failed to load extension"), result.stderr);
  return { rows: readFileSync(evidence, "utf8").trim().split("\n").map((line) => JSON.parse(line) as Evidence), skills };
}

