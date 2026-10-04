import { afterEach, describe, expect, it, vi } from "vitest";
import { decryptSecret, encryptSecret, hashPassword, randomToken, safeEqual, sha256, verifyPassword } from "@/server/lib/crypto";
import { withRetry } from "@/server/lib/retry";
import { ProviderError } from "@/server/providers/http";
import { AnthropicProvider } from "@/server/providers/llm/anthropic";
import { OpenAiProvider } from "@/server/providers/llm/openai";
import { SandboxMessagingProvider } from "@/server/providers/messaging/sandbox";
import { TelegramClient, TelegramMessagingProvider } from "@/server/providers/messaging/telegram";

type Call = { url: string; body: any };

/** A scripted fetch: each entry is a Response factory or an Error to throw. */
function scriptedFetch(steps: (() => Response | Error)[]) {
  const calls: Call[] = [];
  const f = async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const step = steps[Math.min(calls.length - 1, steps.length - 1)]();
    if (step instanceof Error) throw step;
    return step;
  };
  return { fetch: f, calls };
}

const tgOk = (result: unknown) => () => Response.json({ ok: true, result });
const tgErr = (status: number, description: string, retryAfter?: number) => () =>
  Response.json({ ok: false, error_code: status, description, ...(retryAfter ? { parameters: { retry_after: retryAfter } } : {}) }, { status });

describe("TelegramClient / TelegramMessagingProvider", () => {
  it("sends a message and returns the Telegram message id", async () => {
    const { fetch, calls } = scriptedFetch([tgOk({ message_id: 42 })]);
    const sleep = vi.fn(async () => {});
    const provider = new TelegramMessagingProvider(new TelegramClient("123:TOKEN", fetch, sleep));
    const r = await provider.sendText("777", "Salom");
    expect(r).toEqual({ externalId: "42" });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.telegram.org/bot123:TOKEN/sendMessage");
    expect(calls[0].body).toMatchObject({ chat_id: "777", text: "Salom", reply_markup: { remove_keyboard: true } });
    expect(sleep).not.toHaveBeenCalled();
  });

  it("renders a contact button / quick replies and truncates to 4096 chars", async () => {
    const { fetch, calls } = scriptedFetch([tgOk({ message_id: 1 })]);
    const provider = new TelegramMessagingProvider(new TelegramClient("t", fetch, async () => {}));
    await provider.sendText("1", "x".repeat(5000), { requestContact: true, quickReplies: ["a"] });
    await provider.sendText("1", "q", { quickReplies: ["1", "2"] });
    expect(calls[0].body.text).toHaveLength(4096);
    expect(calls[0].body.reply_markup.keyboard[0][0]).toMatchObject({ request_contact: true });
    expect(calls[1].body.reply_markup.keyboard).toEqual([[{ text: "1" }], [{ text: "2" }]]);
  });

  it("honours 429 retry_after and then succeeds", async () => {
    const { fetch, calls } = scriptedFetch([tgErr(429, "Too Many Requests: retry after 3", 3), tgOk({ message_id: 9 })]);
    const sleep = vi.fn(async (_ms: number) => {});
    const provider = new TelegramMessagingProvider(new TelegramClient("t", fetch, sleep));
    await expect(provider.sendText("1", "hi")).resolves.toEqual({ externalId: "9" });
    expect(calls).toHaveLength(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(3000);
  });

  it("caps an excessive retry_after at 5s", async () => {
    const { fetch } = scriptedFetch([tgErr(429, "slow down", 60), tgOk({ message_id: 9 })]);
    const sleep = vi.fn(async (_ms: number) => {});
    await new TelegramClient("t", fetch, sleep).call("sendMessage", {});
    expect(sleep).toHaveBeenCalledWith(5000);
  });

  it("fails fast on a 400 (non-retryable) after one call", async () => {
    const { fetch, calls } = scriptedFetch([tgErr(400, "Bad Request: chat not found"), tgOk({ message_id: 1 })]);
    const sleep = vi.fn(async () => {});
    const provider = new TelegramMessagingProvider(new TelegramClient("t", fetch, sleep));
    const err = await provider.sendText("1", "hi").catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.status).toBe(400);
    expect(err.retryable).toBe(false);
    expect(err.message).toContain("chat not found");
    expect(calls).toHaveLength(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("retries network errors", async () => {
    const { fetch, calls } = scriptedFetch([() => new TypeError("fetch failed"), tgOk({ message_id: 5 })]);
    const provider = new TelegramMessagingProvider(new TelegramClient("t", fetch, async () => {}));
    await expect(provider.sendText("1", "hi")).resolves.toEqual({ externalId: "5" });
    expect(calls).toHaveLength(2);
  });

  it("gives up after 3 attempts on persistent 5xx", async () => {
    const { fetch, calls } = scriptedFetch([tgErr(502, "Bad Gateway")]);
    const client = new TelegramClient("t", fetch, async () => {});
    await expect(client.getMe()).rejects.toMatchObject({ status: 502, retryable: true });
    expect(calls).toHaveLength(3);
  });

  it("treats non-JSON responses as errors (retryable only for 5xx)", async () => {
    const { fetch, calls } = scriptedFetch([() => new Response("<html>", { status: 404 })]);
    await expect(new TelegramClient("t", fetch, async () => {}).getMe()).rejects.toThrow(/non-JSON/);
    expect(calls).toHaveLength(1);
  });

  it("setWebhook sends url and secret token", async () => {
    const { fetch, calls } = scriptedFetch([tgOk(true)]);
    await new TelegramClient("t", fetch, async () => {}).setWebhook("https://x/hook", "sec");
    expect(calls[0].body).toMatchObject({ url: "https://x/hook", secret_token: "sec" });
  });
});

describe("SandboxMessagingProvider", () => {
  it("records sent messages", async () => {
    const p = new SandboxMessagingProvider();
    const r = await p.sendText("c", "hello", { quickReplies: ["a"] });
    expect(r.externalId).toMatch(/^sandbox-/);
    expect(p.sent).toEqual([{ chatId: "c", text: "hello", opts: { quickReplies: ["a"] } }]);
  });
});

describe("LLM providers", () => {
  const anthropicOk = (text: string) => () => Response.json({ content: [{ type: "text", text }] });

  it("Anthropic: retries a 500 then succeeds", async () => {
    const { fetch, calls } = scriptedFetch([() => new Response("err", { status: 500 }), anthropicOk("Salom")]);
    const p = new AnthropicProvider("key", "claude-haiku-4-5-20251001", fetch);
    const out = await p.complete({ system: "sys", messages: [{ role: "user", content: "hi" }], maxTokens: 50 });
    expect(out).toBe("Salom");
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe("https://api.anthropic.com/v1/messages");
    expect(calls[0].body).toMatchObject({ model: "claude-haiku-4-5-20251001", system: "sys", max_tokens: 50 });
  });

  it("Anthropic: does not retry a 400", async () => {
    const { fetch, calls } = scriptedFetch([() => new Response("bad", { status: 400 }), anthropicOk("x")]);
    const p = new AnthropicProvider("key", "m", fetch);
    await expect(p.complete({ system: "s", messages: [] })).rejects.toMatchObject({ status: 400, retryable: false });
    expect(calls).toHaveLength(1);
  });

  it("Anthropic: empty content is a non-retryable error", async () => {
    const { fetch, calls } = scriptedFetch([() => Response.json({ content: [] })]);
    await expect(new AnthropicProvider("k", "m", fetch).complete({ system: "s", messages: [] })).rejects.toThrow(/empty/);
    expect(calls).toHaveLength(1);
  });

  it("OpenAI: retries 503 then returns content", async () => {
    const { fetch, calls } = scriptedFetch([
      () => new Response("", { status: 503 }),
      () => Response.json({ choices: [{ message: { content: " ok " } }] }),
    ]);
    expect(await new OpenAiProvider("k", "m", fetch).complete({ system: "s", messages: [] })).toBe("ok");
    expect(calls).toHaveLength(2);
    expect(calls[0].body.messages[0]).toEqual({ role: "system", content: "s" });
  });
});

describe("withRetry", () => {
  afterEach(() => vi.restoreAllMocks());

  it("uses exponential backoff with full jitter, capped at maxDelayMs", async () => {
    vi.spyOn(Math, "random").mockReturnValue(1);
    const delays: number[] = [];
    const fn = vi.fn(async () => {
      throw new Error("nope");
    });
    await expect(
      withRetry(fn, { attempts: 5, baseDelayMs: 100, maxDelayMs: 500, sleep: async (ms) => void delays.push(ms) }),
    ).rejects.toThrow("nope");
    expect(fn).toHaveBeenCalledTimes(5);
    expect(delays).toEqual([100, 200, 400, 500]);
  });

  it("jitter keeps delays within [0, computed]", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const delays: number[] = [];
    await expect(withRetry(async () => Promise.reject(new Error("x")), { attempts: 3, sleep: async (ms) => void delays.push(ms) })).rejects.toThrow();
    expect(delays).toEqual([0, 0]);
  });

  it("returns as soon as an attempt succeeds and passes the attempt number", async () => {
    const seen: number[] = [];
    const r = await withRetry(
      async (n) => {
        seen.push(n);
        if (n < 2) throw new Error("first");
        return "done";
      },
      { sleep: async () => {} },
    );
    expect(r).toBe("done");
    expect(seen).toEqual([1, 2]);
  });

  it("stops when shouldRetry returns false", async () => {
    const fn = vi.fn(async () => {
      throw new Error("fatal");
    });
    const sleep = vi.fn(async () => {});
    await expect(withRetry(fn, { attempts: 4, shouldRetry: () => false, sleep })).rejects.toThrow("fatal");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("delayFor overrides the computed delay and onRetry is notified", async () => {
    const delays: number[] = [];
    const onRetry = vi.fn();
    await expect(
      withRetry(async () => Promise.reject(new Error("x")), {
        attempts: 3,
        delayFor: (_e, attempt) => attempt * 1000,
        onRetry,
        sleep: async (ms) => void delays.push(ms),
      }),
    ).rejects.toThrow();
    expect(delays).toEqual([1000, 2000]);
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry.mock.calls[0][1]).toBe(1);
  });
});

describe("crypto", () => {
  it("encrypt/decrypt roundtrip; ciphertext is randomised and hides the plaintext", () => {
    const secret = "123456789:AAH-bot-token_value";
    const a = encryptSecret(secret);
    const b = encryptSecret(secret);
    expect(a).not.toBe(b);
    expect(a.startsWith("v1.")).toBe(true);
    expect(a).not.toContain(secret);
    expect(decryptSecret(a)).toBe(secret);
    expect(decryptSecret(b)).toBe(secret);
  });

  it("detects tampering", () => {
    const enc = encryptSecret("top secret value");
    const [v, iv, tag, data] = enc.split(".");
    const flipped = (data[0] === "A" ? "B" : "A") + data.slice(1);
    expect(() => decryptSecret([v, iv, tag, flipped].join("."))).toThrow();
    const badTag = (tag[0] === "A" ? "B" : "A") + tag.slice(1);
    expect(() => decryptSecret([v, iv, badTag, data].join("."))).toThrow();
  });

  it("rejects unsupported formats", () => {
    expect(() => decryptSecret("v2.a.b.c")).toThrow("Unsupported secret format");
    expect(() => decryptSecret("garbage")).toThrow("Unsupported secret format");
  });

  it("hashPassword / verifyPassword", async () => {
    const h = await hashPassword("correct-horse-42");
    expect(h).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(await hashPassword("correct-horse-42")).not.toBe(h);
    expect(await verifyPassword("correct-horse-42", h)).toBe(true);
    expect(await verifyPassword("wrong-horse-42", h)).toBe(false);
    expect(await verifyPassword("correct-horse-42", "not-a-hash")).toBe(false);
  });

  it("sha256, safeEqual, randomToken", () => {
    expect(sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(randomToken(16)).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(randomToken()).not.toBe(randomToken());
  });
});
