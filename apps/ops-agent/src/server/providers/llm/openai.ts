import { withRetry } from "../../lib/retry";
import { type FetchLike, isRetryableStatus, ProviderError } from "../http";
import type { LlmProvider, LlmRequest } from "./types";

export class OpenAiProvider implements LlmProvider {
  readonly name = "openai";
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly timeoutMs = 15_000,
  ) {}

  async complete(req: LlmRequest): Promise<string> {
    return withRetry(
      async () => {
        const res = await this.fetchImpl("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
          body: JSON.stringify({
            model: this.model,
            max_tokens: req.maxTokens ?? 400,
            temperature: req.temperature ?? 0.2,
            messages: [{ role: "system", content: req.system }, ...req.messages],
          }),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (!res.ok) throw new ProviderError(`OpenAI API ${res.status}`, res.status, isRetryableStatus(res.status));
        const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        const text = data.choices?.[0]?.message?.content?.trim();
        if (!text) throw new ProviderError("OpenAI returned an empty response", res.status, false);
        return text;
      },
      { attempts: 3, shouldRetry: (e) => !(e instanceof ProviderError) || e.retryable },
    );
  }
}
