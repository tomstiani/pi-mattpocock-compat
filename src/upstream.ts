import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { parseFrontmatter } from "@earendil-works/pi-coding-agent";

export interface SkillSnapshot {
  name: string;
  description: string;
  userOnly: boolean;
  files: Record<string, string>;
}
export interface UpstreamSnapshot { skills: Record<string, SkillSnapshot> }
export interface UpstreamDifference { added: string[]; removed: string[]; changed: string[]; invocationChanged: string[] }

async function hashTree(root: string, folder: string, files: Record<string, string>): Promise<void> {
  for (const entry of (await readdir(folder)).sort()) {
    const path = join(folder, entry);
    const stat = await lstat(path);
    if (stat.isSymbolicLink()) throw new Error(`Upstream snapshot does not follow symlinks: ${path}`);
    if (stat.isDirectory()) await hashTree(root, path, files);
    else if (stat.isFile()) files[relative(root, path).split(sep).join("/")] = createHash("sha256").update(await readFile(path)).digest("hex");
  }
}

/** Inventory the published skill set, including supporting references and scripts. */
export async function snapshotUpstream(checkout: string): Promise<UpstreamSnapshot> {
  const root = resolve(checkout);
  const manifest = JSON.parse(await readFile(join(root, ".claude-plugin", "plugin.json"), "utf8")) as { skills?: unknown };
  if (!Array.isArray(manifest.skills) || !manifest.skills.every((path) => typeof path === "string")) {
    throw new Error("Expected the upstream plugin manifest to declare a skills array.");
  }
  const skills: Record<string, SkillSnapshot> = {};
  for (const entry of [...manifest.skills].sort()) {
    const folder = resolve(root, entry as string);
    const location = relative(root, folder);
    if (isAbsolute(location) || location === ".." || location.startsWith(`..${sep}`)) throw new Error("Upstream skill path escapes the checkout.");
    const parts = location.split(sep);
    let parent = root;
    for (const part of parts) {
      parent = join(parent, part);
      if ((await lstat(parent)).isSymbolicLink()) throw new Error(`Upstream snapshot does not follow symlinks: ${parent}`);
    }
    const files: Record<string, string> = {};
    await hashTree(folder, folder, files);
    const { frontmatter } = parseFrontmatter(await readFile(join(folder, "SKILL.md"), "utf8"));
    if (typeof frontmatter.name !== "string" || typeof frontmatter.description !== "string") throw new Error(`Missing skill metadata in ${folder}`);
    if (skills[frontmatter.name]) throw new Error(`Duplicate upstream skill name: ${frontmatter.name}`);
    skills[frontmatter.name] = { name: frontmatter.name, description: frontmatter.description,
      userOnly: frontmatter["disable-model-invocation"] === true, files };
  }
  return { skills };
}

export function compareUpstream(expected: UpstreamSnapshot, current: UpstreamSnapshot): UpstreamDifference {
  const before = Object.keys(expected.skills).sort();
  const after = Object.keys(current.skills).sort();
  const common = before.filter((name) => current.skills[name]);
  return {
    added: after.filter((name) => !expected.skills[name]),
    removed: before.filter((name) => !current.skills[name]),
    changed: common.filter((name) => JSON.stringify(expected.skills[name]) !== JSON.stringify(current.skills[name])),
    invocationChanged: common.filter((name) => expected.skills[name]!.userOnly !== current.skills[name]!.userOnly),
  };
}
