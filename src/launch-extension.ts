import { resolve } from "node:path";
import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { preflightRole } from "./preflight.ts";

export function registerLaunchPreflight(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "matt_preflight", label: "Check child capabilities",
    description: "Check parent subagent launch-tool activation and a matt-compat role's skills, repository context, tool allowlist and child providers without launching a model. A registered but inactive launcher fails with activation guidance. Direct owned-role launches repeat the check.",
    parameters: Type.Object({ role: Type.String({ description: "Role such as matt-compat.worker" }) }),
    async execute(_id, { role }, signal, _onUpdate, ctx) {
      signal?.throwIfAborted();
      const report = await preflightRole(role, ctx.cwd, pi, ctx);
      signal?.throwIfAborted();
      return { content: [{ type: "text" as const, text: JSON.stringify(report, null, 2) }], details: report, isError: !report.ok };
    },
  });

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "subagent") return;
    const input = event.input as Record<string, unknown>;
    if (typeof input.agent !== "string" || !input.agent.startsWith("matt-compat.") || typeof input.task !== "string") return;
    // Research has a bound-output, background-only contract checked by registerResearch.
    if (input.agent === "matt-compat.researcher") return;
    const options = input.options && typeof input.options === "object" ? input.options as Record<string, unknown> : {};
    const cwd = typeof options.cwd === "string" ? options.cwd : typeof input.cwd === "string" ? input.cwd : ctx.cwd;
    const crossDirectory = resolve(cwd) !== resolve(ctx.cwd);
    const permittedRoot = new Set(["agent", "task", "cwd", "async", "options", ...(crossDirectory && input.worktree === false ? ["worktree"] : [])]);
    const permittedOptions = new Set(["acceptance", "timeoutMs", "maxOutput", "artifacts", "artifactDir"]);
    const unsupported = [...Object.keys(input).filter((name) => !permittedRoot.has(name)),
      ...Object.keys(options).filter((name) => !permittedOptions.has(name))];
    if (unsupported.length) return { block: true, reason: `Direct compatibility dispatch uses the effective role configuration. Per-call overrides require later contract binding: ${unsupported.join(", ")}. Configure the role instead.` };
    if (typeof options.cwd === "string" && typeof input.cwd === "string" && resolve(options.cwd) !== resolve(input.cwd)) {
      return { block: true, reason: "Conflicting cwd arguments cannot be preflighted." };
    }
    const report = await preflightRole(input.agent, cwd, pi, ctx);
    if (!report.ok) return { block: true, reason: `Compatibility preflight blocked dispatch:\n${report.errors.join("\n")}` };
  });
}
