import assert from "node:assert/strict";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

/** Explicit web test double; never part of the distributed runtime extensions. */
export default function offlineWeb(pi: ExtensionAPI): void {
  for (const name of ["web_search", "fetch_content", "get_search_content", "source_check"]) pi.registerTool({
    name, label: `Offline ${name}`, description: "Deterministic lifecycle fixture; performs no network request.",
    parameters: Type.Object({ url: Type.Optional(Type.String()), mode: Type.Optional(Type.String()) }),
    async execute(_id, params) {
      assert.equal(name, "fetch_content");
      assert.equal(params.url, "https://primary.example.invalid/spec");
      return { content: [{ type: "text", text: "PRIMARY_SOURCE_FIXTURE_MARKER: deterministic source fixture" }], details: { fixture: true } };
    },
  });
}
