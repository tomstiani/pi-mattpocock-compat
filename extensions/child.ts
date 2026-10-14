import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerSkillAdapter } from "../src/skill-extension.ts";

/** Children receive the skill adapter without registering parent launch hooks. */
export default function childCapabilities(pi: ExtensionAPI): void {
  registerSkillAdapter(pi);
}
