import { describe, expect, it } from "vitest";
import type { AgentInput } from "@/server/agent/engine";
import { buildFacts, groundedAnswer, passesGroundingGuard } from "@/server/agent/grounded-llm";
import { formatPrice } from "@/server/agent/templates";
import type { LlmProvider, LlmRequest } from "@/server/providers/llm";

class FakeLlm implements LlmProvider {
  readonly name = "fake";
  calls: LlmRequest[] = [];
  constructor(private readonly answer: string | (() => Promise<string>)) {}
  async complete(req: LlmRequest) {
    this.calls.push(req);
    return typeof this.answer === "string" ? this.answer : this.answer();
  }
}

const input: AgentInput = {
  text: "Ingliz tili oyiga qancha turadi?",
  org: { name: "Bilim Markazi", timezone: "Asia/Tashkent", currency: "UZS" },
  settings: { agentName: "Bilim", defaultLanguage: "uz", greeting: "", escalationKeywords: [], maxUnknownBeforeHandoff: 2 },
  customer: { fullName: null, phone: null },
  state: {},
  courses: [
    {
      id: "c1", name: "Ingliz tili", description: "Umumiy kurs", category: "Tillar", level: "A1", keywords: ["ingliz"],
      priceAmount: 450000, pricePeriod: "month", durationWeeks: 24, scheduleText: "Dush 15:00", format: "offline",
    },
  ],
  slots: [],
  knowledge: [{ id: "k1", title: "Sayt", content: "Batafsil: https://bilim.uz/kurslar", category: "faq", keywords: [] }],
};

describe("passesGroundingGuard", () => {
  const facts = buildFacts(input, "uz");

  it("facts contain the formatted price and FAQ", () => {
    expect(facts).toContain(formatPrice("uz", 450000, "month", "UZS"));
    expect(facts).toContain("https://bilim.uz/kurslar");
  });

  it("accepts answers whose numbers all appear in the facts (any spacing)", () => {
    expect(passesGroundingGuard("Ingliz tili oyiga 450 000 so'm, darslar 15:00 da.", facts)).toBe(true);
    expect(passesGroundingGuard("Narxi 450000 so'm.", facts)).toBe(true);
    expect(passesGroundingGuard("Kurs 24 hafta davom etadi.", facts)).toBe(true);
    expect(passesGroundingGuard("Ha, bunday kurs bor.", facts)).toBe(true);
  });

  it("rejects invented numbers", () => {
    expect(passesGroundingGuard("Narxi 300 000 so'm.", facts)).toBe(false);
    expect(passesGroundingGuard("Chegirma 30% beriladi.", facts)).toBe(false);
    expect(passesGroundingGuard("Qo'ng'iroq qiling: +998 71 200 00 00", facts)).toBe(false);
  });

  // BUG: the guard checks digit *substrings* of all fact digits concatenated, so an
  // invented number that happens to occur inside a real one is accepted.
  it("rejects invented numbers that merely occur inside a fact number (50% vs 450 000, 15 vs 15:00)", () => {
    expect(passesGroundingGuard("Chegirma 50% beriladi.", facts)).toBe(false);
    expect(passesGroundingGuard("Chegirma 15% beriladi.", facts)).toBe(false);
  });

  it("rejects URLs that are not in the facts and accepts ones that are", () => {
    expect(passesGroundingGuard("Ro'yxatdan o'ting: https://evil.example/pay", facts)).toBe(false);
    expect(passesGroundingGuard("Batafsil: https://bilim.uz/kurslar", facts)).toBe(true);
  });
});

describe("groundedAnswer", () => {
  it("returns null when the model says UNKNOWN", async () => {
    const llm = new FakeLlm("UNKNOWN");
    expect(await groundedAnswer(llm, input, "uz", [])).toBeNull();
    expect(llm.calls).toHaveLength(1);
  });

  it("returns a grounded answer and sends facts + history to the model", async () => {
    const llm = new FakeLlm("  Ingliz tili kursi oyiga 450 000 so'm turadi.  ");
    const answer = await groundedAnswer(llm, input, "uz", [
      { role: "user", content: "Salom" },
      { role: "assistant", content: "Assalomu alaykum" },
    ]);
    expect(answer).toBe("Ingliz tili kursi oyiga 450 000 so'm turadi.");
    const req = llm.calls[0];
    expect(req.system).toContain("FACTS:");
    expect(req.system).toContain('Course "Ingliz tili"');
    expect(req.system).toContain("Uzbek");
    expect(req.messages.at(-1)).toEqual({ role: "user", content: input.text });
    expect(req.messages).toHaveLength(3);
  });

  it("rejects a hallucinated price", async () => {
    const llm = new FakeLlm("Ingliz tili oyiga 390 000 so'm.");
    expect(await groundedAnswer(llm, input, "uz", [])).toBeNull();
  });

  it("rejects empty and overly long answers", async () => {
    expect(await groundedAnswer(new FakeLlm("   "), input, "uz", [])).toBeNull();
    expect(await groundedAnswer(new FakeLlm("a".repeat(1300)), input, "uz", [])).toBeNull();
  });

  it("only sends the last 6 history messages", async () => {
    const llm = new FakeLlm("UNKNOWN");
    const history = Array.from({ length: 10 }, (_, i) => ({ role: "user" as const, content: `m${i}` }));
    await groundedAnswer(llm, input, "en", history);
    expect(llm.calls[0].messages.map((m) => m.content)).toEqual(["m4", "m5", "m6", "m7", "m8", "m9", input.text]);
    expect(llm.calls[0].system).toContain("English");
  });

  it("propagates provider errors to the caller", async () => {
    const llm = new FakeLlm(() => Promise.reject(new Error("boom")));
    await expect(groundedAnswer(llm, input, "uz", [])).rejects.toThrow("boom");
  });
});
