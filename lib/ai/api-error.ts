import Anthropic from "@anthropic-ai/sdk";

/** A Claude API failure as one readable line for the coach (and the server log), instead of a bare status code. */
export function apiErrorText(e: InstanceType<typeof Anthropic.APIError>, where: string): string {
  const body = e.error as { error?: { message?: string; type?: string } } | undefined;
  const msg = (body?.error?.message ?? e.message ?? "").replace(/\s+/g, " ").trim();
  console.error(`[claude] ${where}: ${e.status} ${body?.error?.type ?? ""} ${msg} (request ${e.requestID ?? "?"})`);
  if (/credit balance/i.test(msg)) return "Your Anthropic account is out of credits. Add some at console.anthropic.com → Billing, then try again.";
  if (/usage limit|spend limit|monthly limit/i.test(msg)) return "Your Anthropic account hit its spending limit. Raise it at console.anthropic.com → Limits.";
  return `Claude API error ${e.status ?? ""}: ${msg.slice(0, 200) || "no details"}`.trim();
}
