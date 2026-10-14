import { manageWorktree, type WorktreeRequest } from "../src/worktrees.ts";
try {
  const request = JSON.parse(process.argv[2] ?? "{}") as WorktreeRequest;
  process.stdout.write(JSON.stringify(manageWorktree(process.cwd(), request)) + "\n");
} catch (error) {
  process.stdout.write(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }) + "\n");
}
