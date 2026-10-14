import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { loadSkill, SkillLoadError, type DiscoveredSkill } from "./skills.ts";

/** A compatibility tool, not a second skill discovery or workflow system. */
export function registerSkillAdapter(pi: ExtensionAPI): void {
  let catalog: readonly DiscoveredSkill[] = [];

  pi.on("session_start", () => { catalog = []; });
  pi.on("session_shutdown", () => { catalog = []; });
  pi.on("before_agent_start", (event) => {
    catalog = event.systemPromptOptions.skills.map((skill) => ({
      name: skill.name,
      filePath: skill.filePath,
      baseDir: skill.baseDir,
      disableModelInvocation: skill.disableModelInvocation,
    }));
  });

  pi.registerTool({
    name: "Skill",
    label: "Load skill",
    description: "Load an installed, model-invoked skill by name. Use when another skill says to call the Skill tool. User-only skills must be invoked by the user with /skill:name.",
    promptSnippet: "Load a skill's instructions and resource directory",
    promptGuidelines: [
      "When a skill instructs you to call the Skill tool, use Skill with its exact name.",
      "Follow loaded instructions in this session. Loading a skill does not itself execute its workflow or start a child agent.",
      "For Matt workflows use matt-compat.scout, matt-compat.worker, matt-compat.standards-reviewer, matt-compat.spec-reviewer, matt-compat.researcher, or matt-compat.merger with the subagent runtime. matt_preflight checks the effective child capabilities before a direct launch.",
    ],
    parameters: Type.Object({
      skill: Type.String({ description: "Installed skill name, for example tdd" }),
      args: Type.Optional(Type.String({ description: "Arguments to pass unchanged to the loaded skill" })),
    }),
    async execute(_id, params, signal, _onUpdate, ctx) {
      try {
        signal?.throwIfAborted();
        const loaded = await loadSkill(params, catalog, async (path) => {
          const outcome = await ctx.executeTool("read", { path }, { signal });
          if (outcome.isError || outcome.result.isError) {
            throw new SkillLoadError("read_failed", `Pi could not read '${params.skill}'. ${outcome.result.content.filter((c) => c.type === "text").map((c) => c.text).join("\n")}`);
          }
          const content = outcome.result.content;
          if (content.length !== 1 || content[0]?.type !== "text") {
            throw new SkillLoadError("invalid_read", `Reading '${params.skill}' did not return one text document.`);
          }
          const details = outcome.result.details as { truncation?: { truncated?: boolean } } | undefined;
          return { text: content[0].text, truncated: details?.truncation?.truncated };
        });
        signal?.throwIfAborted();
        return {
          content: [{ type: "text" as const, text: loaded.text }],
          details: { skill: loaded.name, path: loaded.path, baseDir: loaded.baseDir },
        };
      } catch (error) {
        if (signal?.aborted) throw error;
        return {
          content: [{ type: "text" as const, text: error instanceof Error ? error.message : String(error) }],
          details: { code: error instanceof SkillLoadError ? error.code : "load_failed" },
          isError: true,
        };
      }
    },
  });

  pi.registerCommand("matt-compat", {
    description: "Show the skill adapter's effective catalog and current milestone",
    async handler(_args, ctx) {
      const skills = ctx.getSystemPromptOptions().skills ?? [];
      const modelInvoked = skills.filter((skill) => !skill.disableModelInvocation).length;
      const active = new Set(pi.getActiveTools());
      const registered = pi.getAllTools().some((tool) => tool.name === "subagent");
      const launchStatus = active.has("subagent") ? "active" : registered ? "registered but inactive" : "not visible in the host inventory";
      ctx.ui.notify(
        `Skill adapter active: ${modelInvoked} model-invoked skills; ${skills.length - modelInvoked} user-only skills. Parent subagent launcher: ${launchStatus}. Native subagents_enable loader: ${active.has("subagents_enable") ? "active" : "inactive or unavailable"}. Use /skill:name for explicit invocation and matt_preflight to check a child role and launch-tool activation. Direct packaged-role launches are checked automatically. Use matt_review_prepare for captured independent review, matt_research_prepare for background research, and matt_worktree for preserved foreground/background ticket worktrees. Reconcile native terminal proof before integrating background workers; uncertain leases and branches are retained. Arbitrary user workflow scripts remain outside the adapter's checked dispatch contract.`,
        "info",
      );
    },
  });
}
