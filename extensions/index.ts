import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerSkillAdapter } from "../src/skill-extension.ts";
import { registerLaunchPreflight } from "../src/launch-extension.ts";

import { registerReview } from "../src/review.ts";

import { registerResearch } from "../src/research.ts";

import { registerWorktrees } from "../src/worktree-extension.ts";

export default function mattPocockCompat(pi: ExtensionAPI): void {
  registerSkillAdapter(pi);
  registerLaunchPreflight(pi);
  registerReview(pi);
  registerResearch(pi);
  registerWorktrees(pi);
}
