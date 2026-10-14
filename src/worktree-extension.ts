import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { beginIntegrationLease, finishIntegrationLease, beginWorktreeLease, bindWorktreeRun, finishWorktreeLease, manageWorktree, ownedWorktree, worktreeForRun } from "./worktrees.ts";
import { preflightRole } from "./preflight.ts";
const quote = (text: string): string => "'" + text.replaceAll("'", "'\\''") + "'";

export function registerWorktrees(pi: ExtensionAPI): void {
  const resumed = new Map<string, string>();
  pi.registerTool({
    name: "matt_worktree", label: "Manage an owned ticket worktree",
    description: "Create an owned ticket worktree; inspect ownership; reconcile a background child using native terminal proof; validate integration and plan/apply safe cleanup. Worker dispatch requires explicit async and worktree:false. Keeps branches and uncertain work. Reconcile-child can recover a lost launch receipt using the original runId and asyncDir; it never infers termination from PID or age.",
    promptGuidelines: ["For implement-spec, use matt_worktree create for each ready ticket with dependsOn receipt IDs. Delegate matt-compat.worker in that exact cwd with explicit async and worktree:false. After background completion call reconcile-child before merging or validating. Serialize merger children in integration. Validate the expected worker HEAD with configured command/args checks, then inspect and apply cleanup plans. Preserve dirty, unmerged, failed, conflicted, or uncertain work."],
    parameters: Type.Object({
      action: Type.Union([Type.Literal("create"), Type.Literal("inspect"), Type.Literal("validate"), Type.Literal("plan-cleanup"), Type.Literal("apply-cleanup"), Type.Literal("recover-cleanup"), Type.Literal("recover-lock"), Type.Literal("reconcile-child")]),
      runId: Type.Optional(Type.String()), asyncDir: Type.Optional(Type.String()),
      lockToken: Type.Optional(Type.String()), id: Type.Optional(Type.String()), planId: Type.Optional(Type.String()), ticket: Type.Optional(Type.String()), integrationRef: Type.Optional(Type.String()),
      dependsOn: Type.Optional(Type.Array(Type.String(), { maxItems: 32 })), expectedHead: Type.Optional(Type.String()),
      checks: Type.Optional(Type.Array(Type.Object({ command: Type.String(), args: Type.Array(Type.String()), timeoutMs: Type.Optional(Type.Integer({ minimum: 1, maximum: 600000 })) }), { maxItems: 16 })),
    }),
    async execute(_id, params, signal, _update, ctx) {
      try {
        if (!ctx.isProjectTrusted()) throw new Error("Worktree management requires the host's existing project trust.");
        const helper = fileURLToPath(new URL("../scripts/worktree.ts", import.meta.url));
        const outcome = await ctx.executeTool("bash", { command: `${quote(process.execPath)} ${quote(helper)} ${quote(JSON.stringify(params))}`, timeout: 660 }, { signal });
        if (outcome.isError || outcome.result.isError) return { ...outcome.result, isError: true };
        const structured = outcome.result.structuredContent as { output?: string; truncated?: boolean } | undefined;
        if (structured?.truncated || (outcome.result.details as { truncation?: { truncated?: boolean } })?.truncation?.truncated) throw new Error("Worktree result was truncated. Inspect the durable ownership receipt before retrying.");
        const text = structured?.output ?? outcome.result.content.filter((part) => part.type === "text").map((part) => part.text).join("\n");
        const result = JSON.parse(text) as Record<string, unknown>;
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], details: result, isError: result.ok !== true };
      } catch (error) {
        if (signal?.aborted) throw error;
        return { content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }], details: {}, isError: true };
      }
    },
  });
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName === "subagent" && event.input.agent === "matt-compat.merger") {
      try {
        if (event.input.async !== false || (event.input.cwd && resolve(String(event.input.cwd)) !== resolve(ctx.cwd))) throw new Error("Merger children require async:false in the integration checkout.");
        beginIntegrationLease(ctx.cwd, event.toolCallId);
      } catch (error) { return { block: true, reason: error instanceof Error ? error.message : String(error) }; }
      return;
    }
    if (event.toolName === "subagent" && event.input.action === "resume" && typeof event.input.id === "string") {
      try {
        const entry = worktreeForRun(ctx.cwd, event.input.id);
        if (!entry) return;
        if (Object.keys(event.input).some((key) => !["action", "id", "message"].includes(key))) throw new Error("Owned worker resume permits only action, id and message; native stored capabilities remain authoritative.");
        if (entry.lease) manageWorktree(ctx.cwd, { action: "reconcile-child", id: entry.id });
        const latest = ownedWorktree(entry.path, ctx.cwd).receipt;
        if (latest.lastRun?.runId !== event.input.id) throw new Error("Resume the latest owned native run; stale lineage cannot reacquire this worktree.");
        const report = await preflightRole("matt-compat.worker", entry.path, pi, ctx);
        if (!report.ok) throw new Error(report.errors.join("\n"));
        beginWorktreeLease(entry.path, ctx.cwd, event.toolCallId, true);
        resumed.set(event.toolCallId, entry.path);
      } catch (error) { return { block: true, reason: error instanceof Error ? error.message : String(error) }; }
      return;
    }
    if (event.toolName !== "subagent" || typeof event.input.cwd !== "string" || resolve(event.input.cwd) === resolve(ctx.cwd)) return;
    if (typeof event.input.agent !== "string" || !event.input.agent.startsWith("matt-compat.")) return;
    try {
      ownedWorktree(event.input.cwd, ctx.cwd);
      if (event.input.agent !== "matt-compat.worker" || typeof event.input.async !== "boolean" || event.input.worktree !== false || typeof event.input.task !== "string") throw new Error("Owned worktree dispatch requires matt-compat.worker, explicit async, worktree:false and a task.");
      beginWorktreeLease(event.input.cwd, ctx.cwd, event.toolCallId);
    } catch (error) { return { block: true, reason: error instanceof Error ? error.message : String(error) }; }
  });
  pi.on("tool_result", (event, ctx) => {
    if (event.toolName === "subagent" && event.input.agent === "matt-compat.merger") {
      const details = event.details as { results?: Array<{ exitCode?: number; detached?: boolean; runner?: unknown; nativeMachine?: unknown }> } | undefined;
      if (details?.results?.length && details.results.every((result) => typeof result.exitCode === "number" && !result.detached && !result.runner && !result.nativeMachine)) {
        try { finishIntegrationLease(ctx.cwd, event.toolCallId); } catch { /* Retain uncertain integration ownership. */ }
      }
      return;
    }
    const resumedPath = resumed.get(event.toolCallId);
    if (event.toolName === "subagent" && resumedPath) {
      const details = event.details as { runId?: string; asyncDir?: string } | undefined;
      if (typeof details?.runId === "string" && typeof details.asyncDir === "string") {
        try { bindWorktreeRun(resumedPath, ctx.cwd, event.toolCallId, details.runId, details.asyncDir, true); }
        catch (error) { return { details: { ...details, compatLeaseError: error instanceof Error ? error.message : String(error) } }; }
      }
      resumed.delete(event.toolCallId);
      return;
    }
    if (event.toolName !== "subagent" || typeof event.input.cwd !== "string" || resolve(event.input.cwd) === resolve(ctx.cwd) || event.input.agent !== "matt-compat.worker") return;
    const details = event.details as { runId?: string; asyncDir?: string; results?: Array<{ exitCode?: number; detached?: boolean; runner?: unknown; nativeMachine?: unknown }> } | undefined;
    if (event.input.async === true) {
      if (typeof details?.runId === "string" && typeof details.asyncDir === "string") {
        try { bindWorktreeRun(event.input.cwd, ctx.cwd, event.toolCallId, details.runId, details.asyncDir, true); }
        catch (error) { return { details: { ...details, compatLeaseError: error instanceof Error ? error.message : String(error) } }; }
      }
      return;
    }
    // Missing/paused/remote terminal evidence retains the lease. Never infer completion from dispatch or elapsed time.
    if (!details?.results?.length || details.results.some((result) => typeof result.exitCode !== "number" || result.detached || result.runner || result.nativeMachine)) return;
    try { finishWorktreeLease(event.input.cwd, ctx.cwd, event.toolCallId, details.runId, !event.isError && details.results.every((result) => result.exitCode === 0)); }
    catch { /* Uncertain or changed ownership remains retained for inspection. */ }
  });
}
