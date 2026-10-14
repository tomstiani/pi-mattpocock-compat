import assert from "node:assert/strict";
import { appendFileSync } from "node:fs";
import { createAssistantMessageEventStream, type AssistantMessage, type ToolCall } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function worktreeProvider(pi: ExtensionAPI): void {
  pi.registerProvider("matt-worktree-fixture", {
    api: "matt-worktree-fixture", apiKey: "offline-worktree-fixture", baseUrl: "http://127.0.0.1",
    models: ["worker", "merger"].map((id) => ({ id, name: id, reasoning: false, input: ["text"] as ["text"], contextWindow: 100000, maxTokens: 4096,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } })),
    streamSimple(model, context) {
      const request = context.messages.find((entry) => entry.role === "user" && JSON.stringify(entry.content).includes("FIXTURE_TICKET "));
      assert.ok(request?.role === "user");
      const text = typeof request.content === "string" ? request.content : request.content.filter((part) => part.type === "text").map((part) => part.text).join("\n");
      const match = text.match(/FIXTURE_TICKET (\{[^\n]+\})/); assert.ok(match);
      const task = JSON.parse(match[1]!) as { file: string; content: string; dependency?: string; head?: string; fail?: boolean };
      const prior = context.messages.filter((entry) => entry.role === "toolResult");
      for (const entry of prior) assert.equal(entry.isError, false, JSON.stringify(entry));
      assert.match(JSON.stringify(context), /REPO_CONTEXT_MARKER/);
      assert.ok(!JSON.stringify(context).includes("PARENT_SECRET_MARKER"));
      const plan: Array<{ name: string; arguments: ToolCall["arguments"] }> = model.id === "merger"
        ? [{ name: "bash", arguments: { command: `git merge --no-ff --no-edit ${task.head}` } }]
        : [{ name: "Skill", arguments: { skill: "tdd" } }, ...(task.dependency ? [{ name: "read", arguments: { path: task.dependency } }] : []),
          { name: "write", arguments: { path: task.file, content: task.content } },
          { name: "bash", arguments: { command: `git add -- ${task.file}` } },
          { name: "bash", arguments: { command: "git commit --quiet -m fixture-ticket" } }];
      const call = plan[prior.length];
      const failing = task.fail && prior.length === 2;
      appendFileSync(process.env.MATT_TEST_EVIDENCE!, JSON.stringify({ kind: "worktree_request", model: model.id, task, context }) + "\n");
      const message: AssistantMessage = { role: "assistant", api: model.api, provider: model.provider, model: model.id, timestamp: Date.now(),
        content: failing ? [] : call ? [{ type: "toolCall", id: `wt-${prior.length}`, ...call }] : [{ type: "text", text: "TICKET_COMPLETE: committed fixture work; real-model TDD quality remains untested." }],
        stopReason: failing ? "error" : call ? "toolUse" : "stop", ...(failing ? { errorMessage: "Injected worker failure after write" } : {}),
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } };
      const stream = createAssistantMessageEventStream(); stream.push({ type: "start", partial: message });
      if (failing) stream.push({ type: "error", reason: "error", error: message }); else stream.push({ type: "done", reason: call ? "toolUse" : "stop", message });
      stream.end(); return stream;
    },
  });
}
