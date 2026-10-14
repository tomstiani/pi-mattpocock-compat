import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { DefaultResourceLoader, SettingsManager, getAgentDir, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { ownedWorktree } from "./worktrees.ts";
import { isCompatRole, missingCapabilities } from "./roles.ts";

export interface PreflightReport {
  ok: boolean;
  role: string;
  cwd: string;
  errors: string[];
  warnings: string[];
  missing: { skills: string[]; tools: string[] };
  contextFiles: string[];
  skills: string[];
  tools: string[];
  parentDispatch: { subagentRegistered: boolean; subagentActive: boolean; activationToolActive: boolean };
  launchContractDigest?: string;
}

const BUILTIN_TOOLS = ["read", "bash", "edit", "write", "grep", "find", "ls", "powershell"];

/** Inspect the installed runtime and effective role that direct dispatch uses. */
export async function preflightRole(role: string, cwd: string, pi: ExtensionAPI, ctx: ExtensionContext): Promise<PreflightReport> {
  const report: PreflightReport = { ok: false, role, cwd: resolve(cwd), errors: [], warnings: [],
    missing: { skills: [], tools: [] }, contextFiles: [], skills: [], tools: [],
    parentDispatch: { subagentRegistered: false, subagentActive: false, activationToolActive: false } };
  if (!isCompatRole(role)) {
    report.errors.push(`Unknown compatibility role '${role}'. Use a matt-compat role supplied by this package.`);
    return report;
  }
  if (resolve(cwd) !== resolve(ctx.cwd)) {
    try {
      if (!ctx.isProjectTrusted()) throw new Error("The integration project must be trusted before dispatching an owned worktree child.");
      ownedWorktree(cwd, ctx.cwd);
    } catch (error) {
      report.errors.push(`Cross-directory dispatch requires a verified adapter-owned worktree in this trusted repository: ${error instanceof Error ? error.message : String(error)}`);
      return report;
    }
  }
  const registeredParent = new Set(pi.getAllTools().map((tool) => tool.name));
  const activeParent = new Set(pi.getActiveTools());
  report.parentDispatch = { subagentRegistered: registeredParent.has("subagent"), subagentActive: activeParent.has("subagent"), activationToolActive: activeParent.has("subagents_enable") };
  if (!registeredParent.has("subagent") && !registeredParent.has("subagents_enable")) {
    report.errors.push("No subagent launcher is visible in the host tool inventory. Load pi-subagents@0.78.0 if it is not active; otherwise check session tool allowlists/exclusions. Installing the npm dependency alone does not activate its extension.");
    return report;
  }
  if (!activeParent.has("subagent")) {
    report.errors.push(activeParent.has("subagents_enable")
      ? "The parent's subagent tool is registered but inactive. Call subagents_enable({}), then retry this check before preparation or dispatch. Some bridges expose added tools only on the next user prompt. For eager availability set toolActivation to eager in extensions/subagent/config.json under the Pi agent directory; host exclusions still apply."
      : "The parent has no active subagent launch tool or subagents_enable activation tool. A resumed session created before the runtime was loaded can preserve this old tool selection in auto mode. Restart with --exclude-tools subagents_enable, or configure eager activation in the native runtime config and restart. Also check session tool allowlists/exclusions; eager activation does not override host exclusions. Installing or configuring a child role does not expose the parent launcher.");
  }
  try {
    const require = createRequire(import.meta.url);
    const runtimeEntry = require.resolve("pi-subagents");
    const manifest = JSON.parse(await readFile(join(dirname(runtimeEntry), "package.json"), "utf8"));
    if (manifest.version !== "0.78.0") throw new Error(`Expected pi-subagents@0.78.0; found ${String(manifest.version)}.`);
    const { resolveSubagentLaunchContract } = await import("pi-subagents/preflight");
    const result = await resolveSubagentLaunchContract({
      agent: role, cwd: report.cwd, agentScope: "both", projectTrusted: ctx.isProjectTrusted(),
      ...(ctx.model ? { parentModel: { provider: ctx.model.provider, id: ctx.model.id } } : {}),
      availableModels: ctx.modelRegistry.getAll(),
      scopedModelIds: ctx.scopedModels.map((entry) => `${entry.model.provider}/${entry.model.id}`),
      parentSessionFile: ctx.sessionManager.getSessionFile(), parentSessionId: ctx.sessionManager.getSessionId(),
      parentLeafId: ctx.sessionManager.getLeafId(), sessionRoot: ctx.sessionManager.getSessionDir(), runtimeSnapshotHost: pi,
    });
    if (!result.ok) {
      report.errors.push(result.message);
      return report;
    }
    const contract = result.contract;
    report.launchContractDigest = contract.launchContractDigest;
    report.warnings.push(...contract.diagnostics.map((item) => item.message));
    if (contract.context !== "fresh") report.errors.push("Compatibility roles require independent fresh contexts. Restore defaultContext: fresh.");
    if (!contract.inheritProjectContext) report.errors.push("The effective role disables repository instructions. Restore inheritProjectContext: true.");
    if (!contract.inheritSkills) report.errors.push("The effective role hides the skill catalog from the Skill adapter. Restore inheritSkills: true.");
    if (!contract.tools.explicitAllowlist) report.errors.push("Compatibility roles require an explicit child tool allowlist.");
    if (contract.tools.effectiveAllowlist.includes("subagent") || contract.tools.internalTools.includes("subagent")) report.errors.push("Compatibility roles are leaf agents. Nested dispatch must remain in the parent so checked workflow, output, and worktree bindings apply.");
    const settingsManager = SettingsManager.create(report.cwd, getAgentDir(), { projectTrusted: ctx.isProjectTrusted() });
    const loader = new DefaultResourceLoader({ cwd: report.cwd, agentDir: getAgentDir(), settingsManager,
      noExtensions: true, noPromptTemplates: true, noThemes: true, additionalExtensionPaths: contract.tools.configuredExtensions });
    await loader.reload();
    const extensions = loader.getExtensions();
    report.errors.push(...extensions.errors.map((error) => `Child provider '${error.path}': ${error.error}`));
    report.contextFiles = loader.getAgentsFiles().agentsFiles.map((file) => file.path);
    report.skills = loader.getSkills().skills.filter((skill) => !skill.disableModelInvocation).map((skill) => skill.name);
    const registered = new Set([...BUILTIN_TOOLS, ...extensions.extensions.flatMap((extension) => [...extension.tools.keys()])]);
    report.tools = contract.tools.effectiveAllowlist.filter((name) => registered.has(name));
    report.missing = missingCapabilities(role, report);
    for (const name of contract.skills.requested) {
      if (!report.skills.includes(name) && !report.missing.skills.includes(name)) report.missing.skills.push(name);
    }
    for (const name of contract.tools.requiredChildTools) {
      if (!contract.tools.internalTools.includes(name) && !report.tools.includes(name) && !report.missing.tools.includes(name)) report.missing.tools.push(name);
    }
    if (report.missing.skills.length) report.errors.push(`Child cannot discover required model-invoked skills: ${report.missing.skills.join(", ")}. Install them in the child's configured locations; parent-only --skill arguments are not inherited.`);
    if (report.missing.tools.length) report.errors.push(`Required child tools are missing or denied: ${report.missing.tools.join(", ")}. Check the effective role's allowlist and provider extensions.`);
    report.ok = report.errors.length === 0;
  } catch (error) {
    report.errors.push(error instanceof Error ? error.message : String(error));
  }
  return report;
}
