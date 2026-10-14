import assert from "node:assert/strict";
import { appendFileSync } from "node:fs";
import { createAssistantMessageEventStream, type AssistantMessage, type ToolCall } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** A process-loadable model fixture; the web tools themselves are the real pinned provider. */
export default function researchProvider(pi: ExtensionAPI): void {
  pi.registerProvider("matt-research-fixture", {
    api: "matt-research-fixture", apiKey: "offline-research-fixture", baseUrl: "http://127.0.0.1",
    models: [{ id: "scripted", name: "Detached research fixture", reasoning: false, input: ["text"],
      contextWindow: 100000, maxTokens: 4096, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }],
    streamSimple(model, context) {
      const stream = createAssistantMessageEventStream();
      void (async () => {
        const evidence = process.env.MATT_TEST_EVIDENCE!;
        appendFileSync(evidence, JSON.stringify({ kind: "research_request", context, pid: process.pid }) + "\n");
        const previous = context.messages.filter((message) => message.role === "toolResult");
        const fetched = previous.find((message) => message.role === "toolResult" && message.toolName === "fetch_content");
        const loaded = previous.find((message) => message.role === "toolResult" && message.toolName === "Skill");
        if (process.env.MATT_TEST_RESEARCH_PROBE === "delayed" && !loaded) await new Promise((resolve) => setTimeout(resolve, 1500));
        assert.match(JSON.stringify(context), /REPO_CONTEXT_MARKER/);
        assert.ok(!JSON.stringify(context).includes("PARENT_SECRET_MARKER"));
        if (fetched) {
          if (process.env.MATT_TEST_RESEARCH_PROBE === "blocked") {
            assert.equal(fetched.isError, true);
            assert.match(JSON.stringify(fetched), /Blocked internal address/);
          } else {
            assert.equal(fetched.isError, false, JSON.stringify(fetched));
            assert.match(JSON.stringify(fetched), process.env.MATT_TEST_RESEARCH_PROBE === "live" ? /Example Domain/ : /PRIMARY_SOURCE_FIXTURE_MARKER/);
          }
        }
        if (loaded) assert.equal(loaded.isError, false, JSON.stringify(loaded));
        const failing = process.env.MATT_TEST_RESEARCH_PROBE === "fail" || (process.env.MATT_TEST_RESEARCH_PROBE === "blocked" && Boolean(fetched));
        const report = `# Research findings\n\nThe local primary source reports ${process.env.MATT_TEST_RESEARCH_PROBE === "live" ? "Example Domain" : "PRIMARY_SOURCE_FIXTURE_MARKER"}. [Primary source](${process.env.MATT_TEST_SOURCE_URL}).\n\nEvidence came from the fetched source. Research confidence here is a deterministic fixture.\n`;
        const call: { name: string; arguments: ToolCall["arguments"] } | undefined = !loaded ? { name: "Skill", arguments: { skill: "research" } }
          : !fetched ? { name: "fetch_content", arguments: { url: process.env.MATT_TEST_SOURCE_URL!, mode: "raw" } } : undefined;
        const message: AssistantMessage = {
          role: "assistant", api: model.api, provider: model.provider, model: model.id, timestamp: Date.now(),
          content: failing ? [] : call ? [{ type: "toolCall", id: `research-${previous.length}`, ...call }] : [{ type: "text", text: report }],
          stopReason: failing ? "error" : call ? "toolUse" : "stop", ...(failing ? { errorMessage: process.env.MATT_TEST_RESEARCH_PROBE === "blocked" ? "Research source unavailable: Blocked internal address" : "Injected detached research failure" } : {}),
          usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        };
        stream.push({ type: "start", partial: message });
        if (failing) stream.push({ type: "error", reason: "error", error: message });
        else stream.push({ type: "done", reason: call ? "toolUse" : "stop", message });
        stream.end();
      })().catch((error) => { stream.end(); throw error; });
      return stream;
    },
  });
}
