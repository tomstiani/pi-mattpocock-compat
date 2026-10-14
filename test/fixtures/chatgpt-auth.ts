// Explicit live-acceptance opt-in only. Never loaded by the package or offline tests.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI): void {
  if (process.env.MATT_LIVE_CHATGPT !== "1") throw new Error("Live ChatGPT acceptance requires explicit opt-in.");
  const auth = JSON.parse(readFileSync(join(homedir(), ".codex/auth.json"), "utf8"));
  const token: unknown = auth.tokens?.access_token;
  if (auth.auth_mode !== "chatgpt" || typeof token !== "string") throw new Error("An existing local ChatGPT sign-in is required.");
  const payload = JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString("utf8"));
  if (!(payload.exp * 1000 > Date.now())) throw new Error("The local ChatGPT sign-in has expired; sign in again locally.");
  // In-memory provider override; no token refresh, copying, or credential persistence.
  pi.registerProvider("openai-codex", { apiKey: token });
}
