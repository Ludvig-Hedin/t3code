import { execFileSync } from "node:child_process";

const json = execFileSync(
  "/usr/bin/security",
  ["find-generic-password", "-s", "Claude Code-credentials", "-w"],
  { encoding: "utf-8", timeout: 5000 },
).trim();
const creds = JSON.parse(json) as { claudeAiOauth?: { accessToken?: string } };
const token = creds.claudeAiOauth?.accessToken ?? "";
console.log("token ok:", token.length > 0);

const res = await fetch("https://api.anthropic.com/api/oauth/usage", {
  headers: {
    Authorization: "Bearer " + token,
    Accept: "application/json",
    "anthropic-beta": "oauth-2025-04-20",
    "User-Agent": "claude-code/1.0.0",
  },
});
console.log("status:", res.status);
const data = (await res.json()) as Record<string, unknown>;
const w = data["five_hour"] as Record<string, unknown> | null;
console.log("five_hour:", JSON.stringify(w));
const util = w?.["utilization"];
console.log("utilization:", util, "== null:", util == null);
