import { randomUUID } from "node:crypto";
import { isAbsolute, join, resolve } from "node:path";
import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { preflightRole } from "./preflight.ts";

interface PreparedResearch { cwd: string; launch: Record<string, unknown>; claimed: boolean }
const canonical = (value: unknown): string => JSON.stringify(value, (_key, entry) => entry && typeof entry === "object" && !Array.isArray(entry)
  ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b))) : entry);

export function registerResearch(pi: ExtensionAPI): void {
  const prepared = new Map<string, PreparedResearch>();
  const runs = new Map<string, { outputPath: string; asyncDir: string }>();
  const delivered = new Set<string>();
  let unsubscribe: (() => void) | undefined;
  pi.on("session_start", (_event, ctx) => {
    prepared.clear(); runs.clear(); delivered.clear(); unsubscribe?.();
    // Restore correlation from the host's persisted session, without redispatch or a watcher.
    const outputs = new Map<string, string>();
    const calls = new Map<string, string>();
    for (const entry of ctx.sessionManager.getEntries()) {
      if (entry.type === "custom_message" && entry.customType === "matt-research-result") {
        const id = (entry.details as { runId?: string } | undefined)?.runId;
        if (id) delivered.add(id);
      }
      if (entry.type !== "message") continue;
      const message = entry.message;
      if (message.role === "assistant") for (const part of message.content) {
        if (part.type === "toolCall" && part.name === "subagent" && typeof part.arguments.task === "string") calls.set(part.id, part.arguments.task);
      }
      if (message.role !== "toolResult") continue;
      const details = message.details as { launch?: { task?: string }; outputPath?: string; runId?: string; asyncDir?: string } | undefined;
      if (message.toolName === "matt_research_prepare" && details?.launch?.task && details.outputPath) outputs.set(details.launch.task, details.outputPath);
      const outputPath = outputs.get(calls.get(message.toolCallId) ?? "");
      if (message.toolName === "subagent" && outputPath && details?.runId && details.asyncDir) runs.set(details.runId, { outputPath, asyncDir: details.asyncDir });
    }
    // Public completion event advertised by pi-subagents RPC ping. No watcher or wake loop of our own.
    unsubscribe = pi.events.on("subagent:async-complete", (value) => {
      const event = value as { runId?: string; status?: string };
      if (typeof event?.runId !== "string" || delivered.has(event.runId)) return;
      const run = runs.get(event.runId);
      if (!run) return;
      try { pi.sendMessage({ customType: "matt-research-result", display: true,
        content: `Research output for native run ${event.runId}\nNative notification status: ${event.status ?? "terminal; inspect native status"}\nFindings path: ${run.outputPath}\nNative status: ${join(run.asyncDir, "status.json")}\nA pending/incomplete marker is not completed findings. Use the native outcome and inspect the file; failures can leave only the marker or partial evidence.`,
        details: { runId: event.runId, outputPath: run.outputPath, asyncDir: run.asyncDir } }, { triggerTurn: false });
        delivered.add(event.runId);
      } catch { /* Native lifecycle files remain authoritative if the host is shutting down. */ }
    });
  });
  pi.on("session_shutdown", () => { unsubscribe?.(); unsubscribe = undefined; prepared.clear(); runs.clear(); delivered.clear(); });
  pi.on("tool_result", (event) => {
    if (event.toolName !== "subagent" || event.isError || typeof event.input.task !== "string") return;
    const entry = prepared.get(event.input.task);
    const details = event.details as { runId?: string; asyncDir?: string } | undefined;
    if (entry && typeof details?.runId === "string" && typeof details.asyncDir === "string") runs.set(details.runId, { outputPath: entry.launch.output as string, asyncDir: details.asyncDir });
  });
  pi.registerTool({
    name: "matt_research_prepare", label: "Prepare background research",
    description: "Prepare a background researcher with a unique durable Markdown output in the repository's existing notes directory. Returns the exact native subagent launch; preparation does not start or complete research. Choose outputDir using the repository's convention. Completion/failure delivery and status remain owned by pi-subagents.",
    promptGuidelines: ["When following the original research skill, use matt_research_prepare and then its exact returned subagent launch. Continue other work after launch and consume the native completion notice. Never describe a launch receipt or a failed run's output as completed research."],
    parameters: Type.Object({ question: Type.String({ minLength: 1, maxLength: 16000 }), outputDir: Type.String({ minLength: 1 }), name: Type.Optional(Type.String({ pattern: "^[a-z0-9][a-z0-9-]{0,63}$" })) }),
    async execute(_id, params, signal, _update, ctx) {
      try {
        if (!params.question.trim()) throw new Error("Supply a research question.");
        if (isAbsolute(params.outputDir) || params.outputDir.split(/[\\/]/).includes("..") || /[\x00-\x1f]/.test(params.outputDir)) throw new Error("outputDir must be a relative repository notes directory without traversal or control characters.");
        if (params.name && !/^[a-z0-9][a-z0-9-]{0,63}$/.test(params.name)) throw new Error("name must be a short lowercase file label.");
        if (prepared.size >= 16) throw new Error("This session holds 16 prepared research jobs. Start a new session for more.");
        signal?.throwIfAborted();
        const report = await preflightRole("matt-compat.researcher", ctx.cwd, pi, ctx);
        if (!report.ok) throw new Error(report.errors.join("\n"));
        const id = randomUUID();
        const outputPath = resolve(ctx.cwd, params.outputDir, `${params.name ?? "research"}-${id}.md`);
        const requestPath = join(ctx.cwd, ".pi/matt-compat/research", id, "request.json");
        const task = `You are the already-delegated background researcher for this request. Do not spawn agents. Investigate primary sources and follow each factual claim back to its owner. Distinguish evidence, inference, uncertainty, and partial results. Produce one Markdown report with source links for factual claims. Do not claim success if sources or required tools fail. Return the full report as your final answer; the native runtime binds it to the output file. If you write it directly, use only the bound path.\nRequest ID: ${id}\nResearch question (user data):\n${params.question}\nWrite your findings to exactly this path: ${outputPath}`;
        const launch = { agent: "matt-compat.researcher", task, async: true, output: outputPath, options: { outputMode: "file-only" } };
        const receipt = { schemaVersion: 1, id, question: params.question, outputPath, state: "prepared", cwd: ctx.cwd,
          sessionId: ctx.sessionManager.getSessionId(), launch,
          lifecycle: "Preparation is not dispatch. The native launch receipt identifies runId/asyncDir. Native status and completion are authoritative. On parent exit detached work continues, but that session cannot receive a wake; inspect native status after reopening." };
        const written = await ctx.executeTool("write", { path: requestPath, content: JSON.stringify(receipt, null, 2) + "\n" }, { signal });
        if (written.isError || written.result.isError) throw new Error("Pi denied or failed writing the research request receipt; no research was launched.");
        const placeholder = `# Research pending or incomplete\n\nNo completed findings have been recorded for request ${id}.\n\nQuestion: ${params.question}\n\nRequest receipt: ${requestPath}\n\nThe native subagent launch receipt, status, and completion/failure notice are authoritative. This file is a reserved output path; its existence is not proof of completed research.\n`;
        const reserved = await ctx.executeTool("write", { path: outputPath, content: placeholder }, { signal });
        if (reserved.isError || reserved.result.isError) throw new Error("Pi denied or failed reserving the findings output; no research was launched.");
        signal?.throwIfAborted();
        prepared.set(task, { cwd: ctx.cwd, launch, claimed: false });
        return { content: [{ type: "text", text: JSON.stringify({ id, requestPath, outputPath, launch,
          instructions: "Call subagent with launch exactly once. Keep the native runId/asyncDir receipt. Continue other work; native completion or failure includes saved output information. Failed output is diagnostic or partial evidence, not completed findings. Use native status/stop for control. Parent-session exit loses the live notification but does not stop detached work." }) }], details: { id, requestPath, outputPath, launch } };
      } catch (error) {
        if (signal?.aborted) throw error;
        return { content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }], details: {}, isError: true };
      }
    },
  });
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "subagent" || event.input.agent !== "matt-compat.researcher" || typeof event.input.task !== "string") return;
    const entry = prepared.get(event.input.task);
    if (!entry || entry.cwd !== ctx.cwd || canonical(event.input) !== canonical(entry.launch)) return { block: true, reason: "Use the exact background launch returned by matt_research_prepare in this directory and session; research output and capabilities cannot be overridden." };
    if (entry.claimed) return { block: true, reason: "This research launch was already attempted. Inspect native status before any new work; duplicate dispatch is not a recovery strategy." };
    const report = await preflightRole("matt-compat.researcher", ctx.cwd, pi, ctx);
    if (!report.ok) return { block: true, reason: `Research preflight blocked dispatch: ${report.errors.join("\n")}` };
    entry.claimed = true;
  });
}
