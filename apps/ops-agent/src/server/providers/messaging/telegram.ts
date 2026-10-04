import { withRetry } from "../../lib/retry";
import { type FetchLike, isRetryableStatus, ProviderError } from "../http";
import type { MessagingProvider, OutboundOptions } from "./types";

type TgResponse<T> = { ok: boolean; result?: T; description?: string; error_code?: number; parameters?: { retry_after?: number } };

/** Thin Telegram Bot API client with retries that honour `retry_after`. */
export class TelegramClient {
  constructor(
    private readonly token: string,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly sleep?: (ms: number) => Promise<void>,
  ) {}

  async call<T>(method: string, body: Record<string, unknown>): Promise<T> {
    return withRetry(
      async () => {
        let res: Response;
        try {
          res = await this.fetchImpl(`https://api.telegram.org/bot${this.token}/${method}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(10_000),
          });
        } catch (err) {
          throw new ProviderError(`Telegram ${method} network error: ${(err as Error).message}`, null, true);
        }
        let data: TgResponse<T>;
        try {
          data = (await res.json()) as TgResponse<T>;
        } catch {
          throw new ProviderError(`Telegram ${method} returned non-JSON (${res.status})`, res.status, isRetryableStatus(res.status));
        }
        if (!res.ok || !data.ok) {
          const status = data.error_code ?? res.status;
          const retryAfter = data.parameters?.retry_after;
          throw new ProviderError(
            `Telegram ${method} failed: ${data.description ?? res.status}`,
            status,
            isRetryableStatus(status),
            retryAfter ? retryAfter * 1000 : undefined,
          );
        }
        return data.result as T;
      },
      {
        attempts: 3,
        baseDelayMs: 300,
        sleep: this.sleep,
        shouldRetry: (e) => e instanceof ProviderError && e.retryable,
        delayFor: (e) => (e instanceof ProviderError && e.retryAfterMs ? Math.min(e.retryAfterMs, 5000) : undefined),
      },
    );
  }

  getMe() {
    return this.call<{ id: number; username: string; first_name: string }>("getMe", {});
  }

  setWebhook(url: string, secretToken: string) {
    return this.call<boolean>("setWebhook", {
      url,
      secret_token: secretToken,
      allowed_updates: ["message", "edited_message"],
      drop_pending_updates: false,
    });
  }

  deleteWebhook() {
    return this.call<boolean>("deleteWebhook", {});
  }
}

export class TelegramMessagingProvider implements MessagingProvider {
  readonly name = "telegram";
  constructor(private readonly client: TelegramClient) {}

  async sendText(chatId: string, text: string, opts: OutboundOptions = {}) {
    let reply_markup: Record<string, unknown> | undefined;
    if (opts.requestContact) {
      reply_markup = {
        keyboard: [[{ text: "📱 Telefon raqamni yuborish", request_contact: true }]],
        resize_keyboard: true,
        one_time_keyboard: true,
      };
    } else if (opts.quickReplies?.length) {
      reply_markup = {
        keyboard: opts.quickReplies.map((q) => [{ text: q }]),
        resize_keyboard: true,
        one_time_keyboard: true,
      };
    } else {
      reply_markup = { remove_keyboard: true };
    }
    const result = await this.client.call<{ message_id: number }>("sendMessage", {
      chat_id: chatId,
      text: text.slice(0, 4096),
      reply_markup,
    });
    return { externalId: String(result.message_id) };
  }
}
