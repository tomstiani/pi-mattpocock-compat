export const ROLE_REQUIREMENTS = {
  "matt-compat.scout": { skills: [], tools: ["read", "grep", "find", "ls", "Skill"] },
  "matt-compat.worker": { skills: ["tdd", "codebase-design"], tools: ["read", "bash", "edit", "write", "Skill"] },
  "matt-compat.standards-reviewer": { skills: ["code-review"], tools: ["read", "grep", "find", "ls", "Skill"] },
  "matt-compat.spec-reviewer": { skills: ["code-review"], tools: ["read", "grep", "find", "ls", "Skill"] },
  "matt-compat.researcher": { skills: ["research"], tools: ["read", "write", "Skill", "web_search", "fetch_content", "get_search_content", "source_check"] },
  "matt-compat.merger": { skills: [], tools: ["read", "bash", "edit", "write", "Skill"] },
} as const;

export type CompatRole = keyof typeof ROLE_REQUIREMENTS;
export function isCompatRole(name: string): name is CompatRole {
  return Object.hasOwn(ROLE_REQUIREMENTS, name);
}

export function missingCapabilities(role: CompatRole, available: { skills: readonly string[]; tools: readonly string[] }): { skills: string[]; tools: string[] } {
  const requirements = ROLE_REQUIREMENTS[role];
  return {
    skills: requirements.skills.filter((name) => !available.skills.includes(name)),
    tools: requirements.tools.filter((name) => !available.tools.includes(name)),
  };
}
