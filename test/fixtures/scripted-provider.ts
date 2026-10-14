import assert from "node:assert/strict";
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { Type } from "typebox";
import { createAssistantMessageEventStream, type AssistantMessage, type ToolCall } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import worktreeProvider from "./worktree-provider.ts";
import researchProvider from "./research-provider.ts";

/** Exercises the real Pi loop without a network request or account credentials. */
export default function scriptedProvider(pi: ExtensionAPI): void {
  if (process.env.MATT_TEST_WORKTREE_PROBE === "1") worktreeProvider(pi);
  if (process.env.MATT_TEST_RESEARCH_PROBE) researchProvider(pi);
  const plan: Array<{ name: string; arguments: ToolCall["arguments"] }> = JSON.parse(process.env.MATT_TEST_CALLS ?? "[]");
  const evidence = process.env.MATT_TEST_EVIDENCE!;
  let cursor = 0;
  let latestNative: { runId: string; asyncDir: string } | undefined;
  if (process.env.MATT_TEST_WORKTREE_PROBE === "1") pi.registerTool({
    name: "fixture_wait_worker", label: "Fixture wait", description: "Wait for native process proof in acceptance fixtures only.", parameters: Type.Object({}),
    async execute() {
      for (let count = 0; count < 400; count++) {
        try {
          if (latestNative && JSON.parse(readFileSync(join(latestNative.asyncDir, "process-terminal.json"), "utf8")).state === "observed")
            return { content: [{ type: "text", text: "Native terminal proof observed" }], details: {} };
        } catch { /* Native publication may still be pending. */ }
        await pause(50);
      }
      throw new Error("No native process proof observed");
    },
  });
  pi.registerProvider("matt-compat-fixture", {
    api: "matt-compat-fixture",
    apiKey: "offline-fixture",
    baseUrl: "http://127.0.0.1",
    models: [{ id: "scripted", name: "Offline adapter test", reasoning: false, input: ["text"],
      contextWindow: 100000, maxTokens: 4096, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }],
    streamSimple(model, context) {
      appendFileSync(evidence, JSON.stringify({ kind: "request", context }) + "\n");
      let call = plan[cursor++];
      if (call && JSON.stringify(call).includes("$run")) {
        assert.ok(latestNative);
        call = JSON.parse(JSON.stringify(call).replaceAll("$run", latestNative.runId));
      }
      if (call && /\$(prepared|research)/.test(JSON.stringify(call))) {
        const previous = context.messages.findLast((entry) => entry.role === "toolResult" && (entry.toolName === "matt_review_prepare" || entry.toolName === "matt_research_prepare"));
        assert.ok(previous && previous.role === "toolResult");
        const body = previous.content.filter((part) => part.type === "text").map((part) => part.text).join("\n");
        const prepared = JSON.parse(body);
        if (JSON.stringify(call).includes("$research")) {
          assert.ok(prepared.launch);
          call = { name: "subagent", arguments: { ...prepared.launch, ...Object.fromEntries(Object.entries(call.arguments).filter(([key]) => key !== "$research")) } };
        } else {
          assert.equal(typeof prepared.bundleId, "string");
          call = JSON.parse(JSON.stringify(call).replaceAll("$prepared", prepared.bundleId));
        }
      }
      if (call && JSON.stringify(call).includes("$wt:")) {
        let serialized = JSON.stringify(call);
        for (const token of serialized.match(/\$wt:[a-z0-9-]+:[a-zA-Z]+/g) ?? []) {
          const [, ticket, field] = token.split(":");
          const candidates = context.messages.filter((entry) => entry.role === "toolResult" && entry.toolName === "matt_worktree").map((entry) => {
            if (entry.role !== "toolResult") return undefined;
            try { return JSON.parse(entry.content.filter((part) => part.type === "text").map((part) => part.text).join("\n")); } catch { return undefined; }
          }).filter((entry) => entry?.receipt?.ticket === ticket);
          const result = candidates.at(-1);
          assert.ok(result, `No receipt for ${token}`);
          const value = field === "planId" ? result.plan?.id : field === "head" ? result.head : field === "integrationHead" ? result.receipt.validation?.integrationHead : result.receipt[field!];
          assert.equal(typeof value, "string", token);
          serialized = serialized.replaceAll(token, value);
        }
        call = JSON.parse(serialized);
      }
      const message: AssistantMessage = {
        role: "assistant", api: model.api, provider: model.provider, model: model.id,
        content: call ? [{ type: "toolCall", id: `fixture-${cursor}`, name: call.name, arguments: call.arguments }]
          : [{ type: "text", text: "Offline fixture complete" }],
        stopReason: call ? "toolUse" : "stop", timestamp: Date.now(),
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      };
      const stream = createAssistantMessageEventStream();
      stream.push({ type: "start", partial: message });
      stream.push({ type: "done", reason: call ? "toolUse" : "stop", message });
      stream.end();
      return stream;
    },
  });
  if (process.env.MATT_TEST_CHILD_PROBE === "1") {
    pi.registerProvider("matt-child-fixture", {
      api: "matt-child-fixture", apiKey: "offline-child-fixture", baseUrl: "http://127.0.0.1",
      models: [{ id: "scripted", name: "Offline child probe", reasoning: false, input: ["text"],
        contextWindow: 100000, maxTokens: 4096, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }],
      streamSimple(model, context) {
        appendFileSync(evidence, JSON.stringify({ kind: "child_request", context }) + "\n");
        const active = new Set<string>();
        for (const entry of context.messages) {
          if (entry.role !== "system") continue;
          for (const tool of entry.toolsAdded ?? []) active.add(tool.name);
          for (const tool of entry.toolsRemoved ?? []) active.delete(tool.name);
        }
        const names = [...active];
        assert.ok(names.includes("Skill"));
        assert.ok(!names.includes("bash"));
        assert.ok(!names.includes("write"));
        assert.ok(!names.includes("subagent"));
        assert.match(JSON.stringify(context), /REPO_CONTEXT_MARKER/);
        const previous = context.messages.find((message) => message.role === "toolResult" && message.toolName === "Skill");
        if (previous) assert.match(JSON.stringify(previous), /TDD_CHILD_MARKER/);
        const message: AssistantMessage = {
          role: "assistant", api: model.api, provider: model.provider, model: model.id, timestamp: Date.now(),
          content: previous ? [{ type: "text", text: "CHILD_PROBE_OK" }]
            : [{ type: "toolCall", id: "child-load-skill", name: "Skill", arguments: { skill: "tdd" } }],
          stopReason: previous ? "stop" : "toolUse",
          usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        };
        const stream = createAssistantMessageEventStream();
        stream.push({ type: "start", partial: message });
        stream.push({ type: "done", reason: previous ? "stop" : "toolUse", message });
        stream.end();
        return stream;
      },
    });
  }
  const reviewProbe = process.env.MATT_TEST_REVIEW_PROBE;
  if (reviewProbe) {
    let started = 0;
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    pi.registerProvider("matt-review-fixture", {
      api: "matt-review-fixture", apiKey: "offline-review-fixture", baseUrl: "http://127.0.0.1",
      models: ["standards", "spec"].map((id) => ({ id, name: id, reasoning: false, input: ["text"] as ["text"],
        contextWindow: 100000, maxTokens: 4096, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } })),
      streamSimple(model, context) {
        const stream = createAssistantMessageEventStream();
        void (async () => {
          try {
            const data = JSON.stringify(context);
            assert.ok(!data.includes("PARENT_SECRET_MARKER"));
            assert.ok(!data.includes("DIRTY_TREE_NOT_REVIEWED"));
            assert.ok(!data.includes("OTHER_AXIS_PRIVATE_FINDING"));
            assert.match(data, /PINNED_DIFF_MARKER/);
            if (model.id === "standards") {
              assert.match(data, /STANDARD_FIXTURE_MARKER/);
              assert.match(data, /BASELINE_FIXTURE_MARKER/);
              assert.ok(!data.includes("SPEC_FIXTURE_MARKER"));
            } else {
              assert.match(data, /SPEC_FIXTURE_MARKER/);
              assert.ok(!data.includes("BASELINE_FIXTURE_MARKER"));
            }
            appendFileSync(evidence, JSON.stringify({ kind: "review_started", model: model.id, context }) + "\n");
            started++;
            if (started === (reviewProbe === "skip" ? 1 : 2)) release();
            await barrier;
            const failing = ["fail", "abort"].includes(reviewProbe) && model.id === "spec";
            const aborted = reviewProbe === "abort" && model.id === "spec";
            const message: AssistantMessage = {
              role: "assistant", api: model.api, provider: model.provider, model: model.id, timestamp: Date.now(),
              content: [{ type: "text", text: `${model.id.toUpperCase()}_REPORT OTHER_AXIS_PRIVATE_FINDING` }],
              stopReason: aborted ? "aborted" : failing ? "error" : "stop", ...(failing ? { errorMessage: aborted ? "Injected spec reviewer cancellation" : "Injected spec reviewer failure" } : {}),
              usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
                cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
            };
            stream.push({ type: "start", partial: message });
            if (failing) stream.push({ type: "error", reason: aborted ? "aborted" : "error", error: message });
            else stream.push({ type: "done", reason: "stop", message });
            stream.end();
          } catch (error) { stream.end(); throw error; }
        })();
        return stream;
      },
    });
  }
  pi.on("tool_execution_end", (event) => {
    const details = event.result.details as { runId?: string; asyncDir?: string } | undefined;
    if (event.toolName === "subagent" && details?.runId && details.asyncDir) latestNative = { runId: details.runId, asyncDir: details.asyncDir };
    appendFileSync(evidence, JSON.stringify({ kind: "result", tool: event.toolName, isError: event.isError, result: event.result }) + "\n");
  });
  if (process.env.MATT_TEST_BLOCK_WRITE === "1") pi.on("tool_call", (event) => {
    if (event.toolName === "write") return { block: true, reason: "Write denied by test policy" };
  });
  if (process.env.MATT_TEST_BLOCK_BASH === "1") pi.on("tool_call", (event) => {
    if (event.toolName === "bash") return { block: true, reason: "Bash denied by test policy" };
  });
  if (process.env.MATT_TEST_BLOCK_READ === "1") {
    pi.on("tool_call", (event) => {
      if (event.toolName === "read") return { block: true, reason: "Read denied by test policy" };
    });
  }
  if (process.env.MATT_TEST_RESEARCH_PROBE) {
    pi.on("message_start", (event) => {
      appendFileSync(evidence, JSON.stringify({ kind: "parent_message", message: event.message }) + "\n");
    });
    pi.on("agent_end", (_event, ctx) => {
      for (const entry of ctx.sessionManager.getEntries()) {
        if (entry.type === "custom_message" && ["subagent-notify", "matt-research-result"].includes(entry.customType))
          appendFileSync(evidence, JSON.stringify({ kind: "parent_notice", message: entry }) + "\n");
      }
      appendFileSync(evidence, JSON.stringify({ kind: "parent_end" }) + "\n");
    });
  } else pi.on("agent_end", () => { assert.equal(cursor, plan.length + 1); });
}
