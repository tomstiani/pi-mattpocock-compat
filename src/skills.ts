import { isAbsolute } from "node:path";
import { parseFrontmatter, type Skill } from "@earendil-works/pi-coding-agent";

export type DiscoveredSkill = Pick<Skill, "name" | "filePath" | "baseDir" | "disableModelInvocation">;
export interface SkillRequest { skill: string; args?: string }
export interface SkillRead { text: string; truncated?: boolean }
export interface LoadedSkill {
  name: string;
  path: string;
  baseDir: string;
  text: string;
}

export class SkillLoadError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "SkillLoadError";
  }
}

function xml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

/** Only Pi's effective catalog is authoritative; do not scan additional paths. */
export function selectSkill(name: string, catalog: readonly DiscoveredSkill[]): DiscoveredSkill {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || name.length > 64) {
    throw new SkillLoadError("invalid_name", "Supply a skill name such as tdd, without a path or slash command.");
  }
  const found = catalog.filter((entry) => entry.name === name);
  if (found.length === 0) {
    throw new SkillLoadError("missing_skill", `Skill '${name}' is not in Pi's current catalog. Install it in a trusted skill location and run /reload.`);
  }
  if (found.length !== 1) {
    throw new SkillLoadError("ambiguous_skill", `Skill '${name}' has multiple catalog entries. Resolve the collision and run /reload.`);
  }
  const skill = found[0]!;
  if (skill.disableModelInvocation) {
    throw new SkillLoadError("user_only", `Skill '${name}' requires explicit user invocation. The user can run /skill:${name}; another skill cannot invoke it.`);
  }
  if (!isAbsolute(skill.filePath) || !isAbsolute(skill.baseDir)) {
    throw new SkillLoadError("invalid_catalog", `Skill '${name}' has non-absolute resource paths. Reload the skill catalog.`);
  }
  return skill;
}

/** The caller supplies a read routed through Pi's tool hooks and permissions. */
export async function loadSkill(
  request: SkillRequest,
  catalog: readonly DiscoveredSkill[],
  read: (path: string) => Promise<SkillRead>,
): Promise<LoadedSkill> {
  const skill = selectSkill(request.skill, catalog);
  const source = await read(skill.filePath);
  if (source.truncated) {
    throw new SkillLoadError("incomplete_read", `Skill '${skill.name}' exceeded the read tool's limit. No partial instructions were loaded. Split its supporting material into referenced files.`);
  }
  let parsed: ReturnType<typeof parseFrontmatter>;
  try {
    parsed = parseFrontmatter(source.text.replace(/^\uFEFF/, ""));
  } catch {
    throw new SkillLoadError("invalid_frontmatter", `Skill '${skill.name}' has invalid frontmatter. Repair it and run /reload.`);
  }
  // A policy change on disk must take effect even before the next /reload.
  if (parsed.frontmatter["disable-model-invocation"] === true) {
    throw new SkillLoadError("user_only", `Skill '${skill.name}' now requires explicit user invocation. Use /skill:${skill.name}.`);
  }
  if (parsed.frontmatter.name !== undefined && parsed.frontmatter.name !== skill.name) {
    throw new SkillLoadError("stale_catalog", `Skill '${skill.name}' was renamed on disk. Run /reload before loading it.`);
  }
  if (typeof parsed.frontmatter.description !== "string" || !parsed.frontmatter.description.trim() || !parsed.body.trim()) {
    throw new SkillLoadError("invalid_skill", `Skill '${skill.name}' needs a description and nonempty instructions. Repair it and run /reload.`);
  }
  const text = [
    `<skill name="${xml(skill.name)}" location="${xml(skill.filePath)}">`,
    `References are relative to ${skill.baseDir}. Resolve bundled files against this directory.`,
    "",
    parsed.body.trim(),
    "</skill>",
    ...(request.args === undefined ? [] : ["", "User arguments:", request.args]),
  ].join("\n");
  return { name: skill.name, path: skill.filePath, baseDir: skill.baseDir, text };
}
