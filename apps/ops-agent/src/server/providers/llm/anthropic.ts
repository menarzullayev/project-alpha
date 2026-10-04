import { withRetry } from "../../lib/retry";
import { type FetchLike, isRetryableStatus, ProviderError } from "../http";
import type { LlmProvider, LlmRequest } from "./types";

export class AnthropicProvider implements LlmProvider {
  readonly name = "anthropic";
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly timeoutMs = 15_000,
  ) {}

  async complete(req: LlmRequest): Promise<string> {
    return withRetry(
      async () => {
        const res = await this.fetchImpl("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": this.apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: this.model,
            max_tokens: req.maxTokens ?? 400,
            temperature: req.temperature ?? 0.2,
            system: req.system,
            messages: req.messages,
          }),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (!res.ok) {
          const retryAfter = Number(res.headers.get("retry-after"));
          throw new ProviderError(
            `Anthropic API ${res.status}`,
            res.status,
            isRetryableStatus(res.status),
            Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined,
          );
        }
        const data = (await res.json()) as { content?: { type: string; text?: string }[] };
        const text = (data.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("").trim();
        if (!text) throw new ProviderError("Anthropic returned an empty response", res.status, false);
        return text;
      },
      {
        attempts: 3,
        shouldRetry: (e) => !(e instanceof ProviderError) || e.retryable,
        delayFor: (e) => (e instanceof ProviderError ? e.retryAfterMs : undefined),
      },
    );
  }
}
