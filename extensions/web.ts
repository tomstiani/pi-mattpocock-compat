import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";
import type { ExtensionAPI, ExtensionFactory } from "@earendil-works/pi-coding-agent";

/** Load the explicitly pinned provider only in research children. */
export default async function webCapabilities(pi: ExtensionAPI): Promise<void> {
  const require = createRequire(import.meta.url);
  let manifestPath: string;
  try {
    manifestPath = require.resolve("pi-web-access/package.json");
  } catch {
    throw new Error("Research requires pi-web-access@0.40.0. Install that provider beside pi-mattpocock-compat before launching a researcher.");
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.version !== "0.40.0") throw new Error(`Expected pi-web-access@0.40.0; found ${String(manifest.version)}.`);
  if (!Array.isArray(manifest.pi?.extensions) || manifest.pi.extensions.length !== 1) throw new Error("Unsupported pi-web-access extension manifest.");
  const entry = require.resolve(resolve(dirname(manifestPath), manifest.pi.extensions[0]));
  // Pi's jiti loader handles this dynamic import in extension code.
  const provider = await import(entry) as { default: ExtensionFactory };
  await provider.default(pi);
}
