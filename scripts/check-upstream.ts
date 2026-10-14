import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { compareUpstream, snapshotUpstream } from "../src/upstream.ts";

const checkout = process.argv[2];
if (!checkout || process.argv.length !== 3) {
  console.error("Usage: npm run check:upstream -- /absolute/path/to/mattpocock-skills-checkout");
  process.exitCode = 2;
} else {
  try {
    const baseline = JSON.parse(await readFile(new URL("../compatibility.json", import.meta.url), "utf8"));
    const expected = JSON.parse(await readFile(new URL("../upstream.lock.json", import.meta.url), "utf8"));
    const current = await snapshotUpstream(checkout);
    const difference = compareUpstream(expected, current);
    const revision = execFileSync("git", ["-C", checkout, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    const contentMatches = Object.values(difference).every((names) => names.length === 0);
    console.log(JSON.stringify({ expectedRevision: baseline.upstream.revision, revision,
      revisionMatches: baseline.upstream.revision === revision, contentMatches, ...difference }, null, 2));
    process.exitCode = contentMatches ? 0 : 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  }
}
