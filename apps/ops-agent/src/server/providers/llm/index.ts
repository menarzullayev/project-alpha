import { env } from "../../env";
import { AnthropicProvider } from "./anthropic";
import { OpenAiProvider } from "./openai";
import type { LlmProvider } from "./types";

export type { LlmProvider, LlmRequest, LlmMessage } from "./types";

/**
 * Returns the configured LLM provider, or null when the deployment runs the
 * built-in deterministic engine only (LLM_PROVIDER=rules or no API key).
 */
export function getLlmProvider(): LlmProvider | null {
  const e = env();
  if (e.LLM_PROVIDER === "anthropic" && e.ANTHROPIC_API_KEY) return new AnthropicProvider(e.ANTHROPIC_API_KEY, e.ANTHROPIC_MODEL);
  if (e.LLM_PROVIDER === "openai" && e.OPENAI_API_KEY) return new OpenAiProvider(e.OPENAI_API_KEY, e.OPENAI_MODEL);
  return null;
}
