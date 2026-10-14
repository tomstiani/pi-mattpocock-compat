import assert from "node:assert/strict";
import { test } from "node:test";
import { loadSkill, selectSkill, type DiscoveredSkill } from "../src/skills.ts";

const tdd: DiscoveredSkill = { name: "tdd", filePath: "/skills/tdd/SKILL.md", baseDir: "/skills/tdd", disableModelInvocation: false };
const source = "---\nname: tdd\ndescription: Test behavior\n---\nRead [examples](references/tests.md).\n";

test("loading preserves instructions, argument bytes, and the reference directory", async () => {
  const args = 'Fix $HOME and `literal`\nsecond line';
  const loaded = await loadSkill({ skill: "tdd", args }, [tdd], async (path) => {
    assert.equal(path, tdd.filePath);
    return { text: source };
  });
  assert.ok(loaded.text.includes("Read [examples](references/tests.md)."));
  assert.ok(loaded.text.includes("References are relative to /skills/tdd."));
  assert.ok(loaded.text.endsWith(args));
  assert.equal(loaded.path, tdd.filePath);
});

test("a model cannot load a user-only skill, even when it is in the catalog", async () => {
  let reads = 0;
  await assert.rejects(loadSkill({ skill: "tdd" }, [{ ...tdd, disableModelInvocation: true }], async () => {
    reads++;
    return { text: source };
  }), { code: "user_only" });
  assert.equal(reads, 0);
});

test("missing, ambiguous, and path-like names cannot trigger filesystem reads", async () => {
  for (const [name, catalog, code] of [
    ["missing", [tdd], "missing_skill"],
    ["tdd", [tdd, tdd], "ambiguous_skill"],
    ["../tdd", [tdd], "invalid_name"],
    ["/skill:tdd", [tdd], "invalid_name"],
  ] as const) {
    await assert.rejects(loadSkill({ skill: name }, catalog, async () => {
      assert.fail("Unexpected filesystem read");
    }), { code });
  }
});

test("a policy change on disk is enforced without a reload", async () => {
  await assert.rejects(loadSkill({ skill: "tdd" }, [tdd], async () => ({
    text: source.replace("description: Test behavior", "description: Test behavior\ndisable-model-invocation: true"),
  })), { code: "user_only" });
});

test("renamed, incomplete, and invalid skills fail instead of executing partial guidance", async () => {
  for (const [result, code] of [
    [{ text: source, truncated: true }, "incomplete_read"],
    [{ text: source.replace("name: tdd", "name: renamed") }, "stale_catalog"],
    [{ text: "---\nname: tdd\n---\nInstructions" }, "invalid_skill"],
    [{ text: "---\nname: tdd\ndescription: Testing\n---\n" }, "invalid_skill"],
    [{ text: "---\nname: [unterminated\n---\nInstructions" }, "invalid_frontmatter"],
  ] as const) {
    await assert.rejects(loadSkill({ skill: "tdd" }, [tdd], async () => result), { code });
  }
});

test("metadata comes from Pi and relative catalog paths are rejected", () => {
  assert.throws(() => selectSkill("tdd", [{ ...tdd, filePath: "./SKILL.md" }]), { code: "invalid_catalog" });
});
