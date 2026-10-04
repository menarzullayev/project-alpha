import { describe, expect, it } from "vitest";
import { detectLanguage } from "@/server/agent/language";
import { understand } from "@/server/agent/nlu";
import { matchCourse, retrieveKnowledge, type CourseFact } from "@/server/agent/retrieval";
import { extractPhone, mentions, normalize, stemMatch, tokens } from "@/server/agent/text";

describe("understand()", () => {
  it("detects multiple intents in priority order", () => {
    const r = understand("Ingliz tili narxi qancha va qachon boshlanadi?");
    expect(r.intents).toEqual(expect.arrayContaining(["price", "schedule"]));
    expect(r.intent).toBe("price");
    expect(r.confidence).toBe(0.8);
  });

  it("puts complaint before everything else", () => {
    const r = understand("Narxi qancha? Pulimni qaytaring!");
    expect(r.intent).toBe("complaint");
    expect(r.intents).toContain("price");
  });

  it("recognises human requests in uz/ru/en", () => {
    expect(understand("operator kerak").intent).toBe("human");
    expect(understand("Позовите менеджера").intent).toBe("human");
    expect(understand("I want a real person").intent).toBe("human");
  });

  it("supports extra escalation keywords and ignores blanks", () => {
    expect(understand("direktorni chaqiring", ["direktor"]).intents).toContain("human");
    expect(understand("direktorni chaqiring", ["  "]).intents).not.toContain("human");
  });

  it("parses numeric choices", () => {
    expect(understand("2").choice).toBe(2);
    expect(understand(" 3) ").choice).toBe(3);
    expect(understand("1.").choice).toBe(1);
    expect(understand("12").choice).toBe(12);
    expect(understand("2 ta").choice).toBeNull();
  });

  it("extracts phone numbers", () => {
    expect(understand("raqamim 90 123 45 67").phone).toBe("+998901234567");
  });

  it("returns unknown with low confidence for gibberish", () => {
    const r = understand("qwzx plmk");
    expect(r.intent).toBe("unknown");
    expect(r.intents).toEqual([]);
    expect(r.confidence).toBe(0.2);
  });

  it("recognises booking, cancel, thanks, affirm, deny", () => {
    expect(understand("Sinov darsiga yozilmoqchi edim").intents).toContain("booking");
    expect(understand("Записаться на пробный урок").intents).toContain("booking");
    expect(understand("bekor qiling").intent).toBe("cancel");
    expect(understand("Rahmat!").intent).toBe("thanks");
    expect(understand("ha").intent).toBe("affirm");
    expect(understand("нет").intent).toBe("deny");
  });
});

describe("extractPhone()", () => {
  it.each([
    ["901234567", "+998901234567"],
    ["90 123 45 67", "+998901234567"],
    ["998901234567", "+998901234567"],
    ["+998 (90) 123-45-67", "+998901234567"],
    ["+7 999 123 45 67", "+79991234567"],
    ["79991234567", "+79991234567"],
  ])("%s → %s", (input, expected) => {
    expect(extractPhone(input)).toBe(expected);
  });

  it("returns null for short numbers and text", () => {
    expect(extractPhone("12345")).toBeNull();
    expect(extractPhone("1")).toBeNull();
    expect(extractPhone("salom")).toBeNull();
  });
});

describe("detectLanguage()", () => {
  it("detects Russian from Cyrillic", () => {
    expect(detectLanguage("Сколько стоит курс?", "uz")).toEqual({ lang: "ru", confident: true });
  });
  it("detects Uzbek Cyrillic letters as uz", () => {
    expect(detectLanguage("Қанча туради?", "en").lang).toBe("uz");
  });
  it("detects Uzbek Latin", () => {
    expect(detectLanguage("Kurs narxi qancha?", "en")).toEqual({ lang: "uz", confident: true });
  });
  it("detects English", () => {
    expect(detectLanguage("How much is the course?", "uz")).toEqual({ lang: "en", confident: true });
  });
  it("falls back when nothing is recognisable", () => {
    expect(detectLanguage("", "ru")).toEqual({ lang: "ru", confident: false });
    expect(detectLanguage("123", "en")).toEqual({ lang: "en", confident: false });
  });
  it("short Cyrillic is not confident", () => {
    expect(detectLanguage("да", "uz")).toEqual({ lang: "ru", confident: false });
  });
});

describe("text helpers", () => {
  it("normalize lowercases, unifies apostrophes and ё", () => {
    expect(normalize("  Oʻzbek  TILI ")).toBe("o'zbek tili");
    expect(normalize("Ещё")).toBe("еще");
  });

  it("tokens strips punctuation but keeps inner apostrophes", () => {
    expect(tokens("To'lov, qancha?!")).toEqual(["to'lov", "qancha"]);
  });

  it("stemMatch tolerates suffixes", () => {
    expect(stemMatch("inglizcha", "ingliz")).toBe(true);
    expect(stemMatch("ingliz", "inglizcha")).toBe(true);
    expect(stemMatch("английского", "английский")).toBe(true);
    expect(stemMatch("narxlar", "narx")).toBe(true);
    expect(stemMatch("kurs", "kurs")).toBe(true);
  });

  it("stemMatch rejects unrelated words and phrases", () => {
    expect(stemMatch("python", "ingliz")).toBe(false);
    expect(stemMatch("bepul", "bepul dars")).toBe(false);
    expect(stemMatch("ab", "abc")).toBe(false);
    expect(stemMatch("yozilmoqchiman", "yozil")).toBe(false); // length difference > 6
  });

  it("mentions handles phrases and short words as whole words", () => {
    expect(mentions("Bepul dars bormi?", "bepul dars")).toBe(true);
    expect(mentions("hi there", "hi")).toBe(true);
    expect(mentions("this one", "hi")).toBe(false);
    expect(mentions("Inglizcha kurs", "ingliz")).toBe(true);
    expect(mentions("anything", "")).toBe(false);
  });
});

describe("retrieval", () => {
  const mk = (id: string, name: string, keywords: string[], category = ""): CourseFact => ({
    id, name, keywords, category, description: "", level: "", priceAmount: 1, pricePeriod: "month", durationWeeks: null, scheduleText: "", format: "offline",
  });

  it("returns null on ambiguous course references", () => {
    const a = mk("a", "Ingliz tili", [], "Tillar");
    const b = mk("b", "Rus tili", [], "Tillar");
    expect(matchCourse("tillar", [a, b])).toBeNull();
    expect(matchCourse("rus tili", [a, b])?.id).toBe("b");
  });

  it("knowledge retrieval needs a confidence floor", () => {
    const art = { id: "k", title: "Sertifikat", content: "Ha", category: "faq", keywords: ["sertifikat"] };
    expect(retrieveKnowledge("sertifikat berasizlarmi", [art])?.article.id).toBe("k");
    expect(retrieveKnowledge("salom", [art])).toBeNull();
  });
});
