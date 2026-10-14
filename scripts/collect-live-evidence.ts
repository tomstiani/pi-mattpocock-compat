import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const [scenario, directory] = process.argv.slice(2);
if (!scenario || !directory || !["grill-with-docs", "research", "code-review", "implement-spec"].includes(scenario)) throw new Error("Supply scenario and completed live fixture directory.");
const summary = JSON.parse(readFileSync(join(directory, "summary.json"), "utf8"));
if (summary.ok !== true || summary.scenario !== scenario) throw new Error("No successful acceptance summary.");
const target = resolve("docs/evidence/live", scenario); mkdirSync(target, { recursive: true });
const events: any[] = readFileSync(join(directory, "events.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
const results = events.filter((event) => event.type === "tool_execution_end");
const nativeRuns = new Map<string, unknown>();
const reports: Array<{ agent: string; model?: string; context?: string; output: string; launchContractDigest?: string }> = [];
for (const event of results.filter((event) => event.toolName === "subagent")) {
  const details = event.result?.details;
  for (const child of details?.results ?? []) if (child.finalOutput) reports.push({ agent: child.agent, model: child.model, context: child.context, output: child.finalOutput, launchContractDigest: child.launchContractDigest });
  if (details?.asyncDir) {
    const status = JSON.parse(readFileSync(join(details.asyncDir, "status.json"), "utf8"));
    nativeRuns.set(status.runId, { runId: status.runId, toolCallId: status.toolCallId, state: status.state, cwd: status.cwd, sessionFile: status.sessionFile,
      processTerminal: status.processTerminal, steps: status.steps?.map((step: any) => ({ agent: step.agent, model: step.model, context: step.context, skills: step.skills, status: step.status, exitCode: step.exitCode, startedAt: step.startedAt, endedAt: step.endedAt, toolCount: step.toolCount, launchContractDigest: step.launchContractDigest })) });
  }
}
const finals = events.filter((event) => event.type === "message_end" && event.message?.role === "assistant" && event.message.stopReason === "stop")
  .map((event) => event.message.content.filter((part: any) => part.type === "text").map((part: any) => part.text).join("\n"));
writeFileSync(join(target, "evidence.json"), JSON.stringify({ ...summary, rawConversationSha256: createHash("sha256").update(readFileSync(join(directory, "events.jsonl"))).digest("hex"),
  toolResults: results.map((event) => ({ tool: event.toolName, isError: event.isError, ...(event.isError ? { diagnostic: event.result?.content?.filter((part: any) => part.type === "text").map((part: any) => part.text).join("\n").slice(0,1600) } : {}) })),
  nativeRuns: [...nativeRuns.values()], worktreeEvents: results.filter((event) => event.toolName === "matt_worktree").map((event) => event.result?.details), reports, finalMessages: finals }, null, 2) + "\n");
for (const file of ["GLOSSARY.md", "tickets.json", "spec.md"]) if (existsSync(join(directory, "repo", file))) cpSync(join(directory, "repo", file), join(target, file));
if (existsSync(join(directory, "repo/docs/research"))) cpSync(join(directory, "repo/docs/research"), join(target, "research"), { recursive: true });
if (existsSync(join(directory, "repo/.git/matt-compat"))) cpSync(join(directory, "repo/.git/matt-compat"), join(target, "worktree-evidence"), { recursive: true });
console.log(JSON.stringify({ scenario, evidence: target, reports: reports.length, nativeRuns: nativeRuns.size }));
