import { describe, expect, it } from "vitest";
import { type AgentInput, decide } from "@/server/agent/engine";
import type { CourseFact, KnowledgeFact, SlotFact } from "@/server/agent/retrieval";
import { formatPrice, formatSlot, T } from "@/server/agent/templates";
import type { ConversationState } from "@/server/db/schema";

const H = 3600_000;
const inHours = (h: number) => new Date(Date.now() + h * H);

const ENGLISH: CourseFact = {
  id: "c-en",
  name: "Ingliz tili (General English)",
  description: "Boshlang'ichdan Upper-Intermediate gacha.",
  category: "Tillar",
  level: "Beginner",
  keywords: ["ingliz", "english", "inglizcha", "английский"],
  priceAmount: 450000,
  pricePeriod: "month",
  durationWeeks: 24,
  scheduleText: "Dush/Chor/Juma 15:00",
  format: "offline",
};
const IELTS: CourseFact = {
  id: "c-ielts",
  name: "IELTS Intensive",
  description: "IELTS 6.5+ ga tayyorlov.",
  category: "Tillar",
  level: "Intermediate+",
  keywords: ["ielts"],
  priceAmount: 750000,
  pricePeriod: "month",
  durationWeeks: 12,
  scheduleText: "Sesh/Pay/Shan 10:00",
  format: "hybrid",
};
const PYTHON: CourseFact = {
  id: "c-py",
  name: "Python dasturlash",
  description: "Noldan dasturlash.",
  category: "IT",
  level: "Beginner",
  keywords: ["python", "dasturlash"],
  priceAmount: 600000,
  pricePeriod: "month",
  durationWeeks: 20,
  scheduleText: "",
  format: "hybrid",
};

// English: four bookable future slots (only the first three are offered), a past one and a full one.
const SLOTS: SlotFact[] = [
  { id: "s-past", courseId: "c-en", startsAt: inHours(-5), location: "Room 1", available: 3 },
  { id: "s-full", courseId: "c-en", startsAt: inHours(10), location: "Room 1", available: 0 },
  { id: "s-en-3", courseId: "c-en", startsAt: inHours(72), location: "Room 3", available: 2 },
  { id: "s-en-1", courseId: "c-en", startsAt: inHours(24), location: "Room 1", available: 5 },
  { id: "s-en-4", courseId: "c-en", startsAt: inHours(96), location: "", available: 1 },
  { id: "s-en-2", courseId: "c-en", startsAt: inHours(48), location: "Room 2", available: 4 },
  { id: "s-py-1", courseId: "c-py", startsAt: inHours(30), location: "Lab", available: 6 },
  // IELTS deliberately has no slots.
];

const DISCOUNT: KnowledgeFact = {
  id: "k-discount",
  title: "Chegirmalar",
  content: "Bir oilaning ikkinchi farzandiga 10% chegirma.",
  category: "pricing",
  keywords: ["chegirma", "скидка", "discount"],
};
const PAYMENT: KnowledgeFact = {
  id: "k-payment",
  title: "To'lov usullari",
  content: "To'lovni Click yoki Payme orqali qilish mumkin.",
  category: "payment",
  keywords: ["click", "payme", "karta"],
};

const ORG = { name: "Bilim Markazi", timezone: "Asia/Tashkent", currency: "UZS" };

function input(text: string, over: Partial<AgentInput> = {}): AgentInput {
  return {
    text,
    org: ORG,
    settings: { agentName: "Bilim", defaultLanguage: "uz", greeting: "", escalationKeywords: [], maxUnknownBeforeHandoff: 2 },
    customer: { fullName: "Aziza", phone: null },
    state: {},
    courses: [ENGLISH, IELTS, PYTHON],
    slots: SLOTS,
    knowledge: [DISCOUNT, PAYMENT],
    ...over,
  };
}

const price = (lang: "uz" | "ru" | "en", c: CourseFact) => formatPrice(lang, c.priceAmount, c.pricePeriod, "UZS");
const actionTypes = (d: { actions: { type: string }[] }) => d.actions.map((a) => a.type);

describe("decide(): greetings", () => {
  it("greets on /start in the default language (uz)", () => {
    const d = decide(input("", { isStart: true }));
    expect(d.intent).toBe("greeting");
    expect(d.language).toBe("uz");
    expect(d.reply).toBe(T.uz.greeting("Bilim", "Bilim Markazi"));
    expect(d.quickReplies).toEqual(T.uz.menu);
    expect(d.actions).toEqual([]);
  });

  it("greets in Uzbek", () => {
    const d = decide(input("Salom"));
    expect(d.intent).toBe("greeting");
    expect(d.language).toBe("uz");
    expect(d.reply).toContain("Assalomu alaykum");
  });

  it("greets in Russian", () => {
    const d = decide(input("Здравствуйте"));
    expect(d.intent).toBe("greeting");
    expect(d.language).toBe("ru");
    expect(d.reply).toBe(T.ru.greeting("Bilim", "Bilim Markazi"));
    expect(d.state.language).toBe("ru");
  });

  it("greets in English", () => {
    const d = decide(input("Hello"));
    expect(d.intent).toBe("greeting");
    expect(d.language).toBe("en");
    expect(d.reply).toBe(T.en.greeting("Bilim", "Bilim Markazi"));
  });

  it("uses the configured custom greeting when set", () => {
    const d = decide(input("", { isStart: true, settings: { ...input("").settings, greeting: "Xush kelibsiz!" } }));
    expect(d.reply).toBe("Xush kelibsiz!");
  });
});

describe("decide(): prices, schedule, course info", () => {
  it("answers the price of a named course and records interest", () => {
    const d = decide(input("Ingliz tili narxi qancha?"));
    expect(d.intent).toBe("price");
    expect(d.reply).toContain(`Ingliz tili (General English) — ${price("uz", ENGLISH)}`);
    expect(d.reply).not.toContain(price("uz", IELTS));
    expect(d.actions).toContainEqual({ type: "set_interest", courseId: "c-en" });
    expect(d.state.courseId).toBe("c-en");
    expect(d.sources).toContain("c-en");
  });

  it("lists every course price when no course is named", () => {
    const d = decide(input("Narxlar qancha?"));
    expect(d.intent).toBe("price");
    expect(d.reply).toContain(T.uz.pricesIntro);
    for (const c of [ENGLISH, IELTS, PYTHON]) expect(d.reply).toContain(`${c.name} — ${price("uz", c)}`);
    expect(d.sources).toEqual(expect.arrayContaining(["c-en", "c-ielts", "c-py"]));
    expect(actionTypes(d)).not.toContain("set_interest");
  });

  it("grounding: every number in a price reply comes from course facts", () => {
    const d = decide(input("How much is the IELTS course?"));
    expect(d.language).toBe("en");
    expect(d.reply).toContain(price("en", IELTS));
    const digits = (d.reply.match(/\d+/g) ?? []).join("");
    expect(digits).toBe("750000");
  });

  it("answers schedule with the course schedule text and up to 3 upcoming bookable slots", () => {
    const d = decide(input("Ingliz tili qachon?"));
    expect(d.intent).toBe("schedule");
    expect(d.reply).toContain(T.uz.scheduleLine(ENGLISH.name, ENGLISH.scheduleText));
    const shown = ["s-en-1", "s-en-2", "s-en-3"].map((id) => SLOTS.find((s) => s.id === id)!);
    for (const s of shown) expect(d.reply).toContain(formatSlot("uz", s.startsAt, ORG.timezone));
    for (const id of ["s-past", "s-full", "s-en-4"]) {
      const s = SLOTS.find((x) => x.id === id)!;
      expect(d.reply).not.toContain(formatSlot("uz", s.startsAt, ORG.timezone));
    }
    expect(d.sources).toEqual(expect.arrayContaining(["c-en", "s-en-1", "s-en-2", "s-en-3"]));
    expect(d.sources).not.toContain("s-past");
    expect(d.sources).not.toContain("s-full");
  });

  it("schedule without course lists every course's schedule (fallback text when empty)", () => {
    const d = decide(input("Darslar jadvali qanday?"));
    expect(d.intent).toBe("schedule");
    expect(d.reply).toContain(T.uz.scheduleLine(IELTS.name, IELTS.scheduleText));
    expect(d.reply).toContain(T.uz.scheduleLine(PYTHON.name, T.uz.noSchedule));
  });

  it("gives course info when a course is mentioned by a keyword stem (inglizcha)", () => {
    const d = decide(input("inglizcha haqida ma'lumot bering"));
    expect(d.intent).toBe("course_info");
    expect(d.reply).toContain(`📘 ${ENGLISH.name}`);
    expect(d.reply).toContain(price("uz", ENGLISH));
    expect(d.reply).toContain(ENGLISH.scheduleText);
    expect(d.actions).toContainEqual({ type: "set_interest", courseId: "c-en" });
  });

  it("matches a course by Russian keyword stem (английского)", () => {
    const d = decide(input("Расскажите про курс английского"));
    expect(d.state.courseId).toBe("c-en");
    expect(d.language).toBe("ru");
  });
});

describe("decide(): booking funnel", () => {
  it("runs booking → course → slots → choice → phone → book", () => {
    // 1. Booking intent without a course: asks which course.
    const d1 = decide(input("Sinov darsiga yozilmoqchiman"));
    expect(d1.intent).toBe("booking");
    expect(d1.state.stage).toBe("awaiting_course");
    expect(d1.reply).toContain(T.uz.whichCourse);
    expect(d1.quickReplies).toEqual([ENGLISH.name, IELTS.name, PYTHON.name]);
    expect(d1.actions).toEqual([]);

    // 2. Course name: offers the first 3 upcoming bookable slots, numbered.
    const d2 = decide(input("Ingliz tili", { state: d1.state }));
    expect(d2.intent).toBe("booking");
    expect(d2.state.stage).toBe("awaiting_slot");
    expect(d2.state.courseId).toBe("c-en");
    expect(d2.state.offeredSlotIds).toEqual(["s-en-1", "s-en-2", "s-en-3"]);
    expect(d2.quickReplies).toEqual(["1", "2", "3"]);
    expect(d2.reply).toContain("1) ");
    expect(d2.reply).toContain("3) ");
    expect(d2.reply).not.toContain("4) ");
    expect(d2.actions).toContainEqual({ type: "set_interest", courseId: "c-en" });

    // 3. "1": name is known, so it asks for the phone with a contact button.
    const d3 = decide(input("1", { state: d2.state }));
    expect(d3.state.slotId).toBe("s-en-1");
    expect(d3.state.stage).toBe("awaiting_phone");
    expect(d3.reply).toBe(T.uz.askPhone);
    expect(d3.requestContact).toBe(true);
    expect(d3.actions).toEqual([]);

    // 4. Phone: saves it and books.
    const d4 = decide(input("+998 90 123 45 67", { state: d3.state }));
    expect(d4.actions).toEqual([
      { type: "save_phone", phone: "+998901234567" },
      { type: "book", slotId: "s-en-1", courseId: "c-en" },
    ]);
    expect(d4.state.stage).toBe("booked");
    expect(d4.state.offeredSlotIds).toBeUndefined();
    expect(d4.reply).toContain(ENGLISH.name);
    const slot = SLOTS.find((s) => s.id === "s-en-1")!;
    expect(d4.reply).toContain(formatSlot("uz", slot.startsAt, ORG.timezone));
    expect(d4.sources).toEqual(expect.arrayContaining(["c-en", "s-en-1"]));
  });

  it("books immediately after the slot choice when name and phone are known", () => {
    const state: ConversationState = { stage: "awaiting_slot", courseId: "c-en", offeredSlotIds: ["s-en-1", "s-en-2", "s-en-3"], language: "uz" };
    const d = decide(input("2", { state, customer: { fullName: "Aziza", phone: "+998901112233" } }));
    expect(d.actions).toEqual([{ type: "book", slotId: "s-en-2", courseId: "c-en" }]);
    expect(d.state.stage).toBe("booked");
  });

  it("rejects an out-of-range slot number", () => {
    const state: ConversationState = { stage: "awaiting_slot", courseId: "c-en", offeredSlotIds: ["s-en-1", "s-en-2", "s-en-3"], language: "uz" };
    const d = decide(input("7", { state }));
    expect(d.intent).toBe("slot_choice");
    expect(d.reply).toBe(T.uz.invalidChoice(3));
    expect(d.state.slotId).toBeUndefined();
    expect(d.state.stage).toBe("awaiting_slot");
    expect(d.actions).toEqual([]);
  });

  it("collects the name when the customer's name is unknown", () => {
    const state: ConversationState = { stage: "awaiting_slot", courseId: "c-en", offeredSlotIds: ["s-en-1", "s-en-2", "s-en-3"], language: "uz" };
    const d1 = decide(input("1", { state, customer: { fullName: null, phone: null } }));
    expect(d1.state.stage).toBe("awaiting_name");
    expect(d1.reply).toBe(T.uz.askName);

    const d2 = decide(input("aziza karimova", { state: d1.state, customer: { fullName: null, phone: null } }));
    expect(d2.actions).toEqual([{ type: "save_name", fullName: "Aziza Karimova" }]);
    expect(d2.state.stage).toBe("awaiting_phone");
    expect(d2.reply).toBe(T.uz.askPhone);

    const d3 = decide(input("901234567", { state: d2.state, customer: { fullName: "Aziza Karimova", phone: null } }));
    expect(d3.actions).toEqual([
      { type: "save_phone", phone: "+998901234567" },
      { type: "book", slotId: "s-en-1", courseId: "c-en" },
    ]);
  });

  it("uses a phone shared via the Telegram contact button", () => {
    const state: ConversationState = { stage: "awaiting_phone", courseId: "c-en", slotId: "s-en-2", language: "uz" };
    const d = decide(input("", { state, sharedPhone: "+998935554433" }));
    expect(d.actions).toEqual([
      { type: "save_phone", phone: "+998935554433" },
      { type: "book", slotId: "s-en-2", courseId: "c-en" },
    ]);
  });

  it("hands off with reason no_trial_slots when the course has no upcoming slots", () => {
    const d = decide(input("IELTS kursiga yozilmoqchiman"));
    expect(d.state.courseId).toBe("c-ielts");
    expect(d.actions).toContainEqual({ type: "handoff", reason: "no_trial_slots" });
    expect(d.reply).toBe(T.uz.noSlots(IELTS.name));
    expect(d.state.stage).toBe("idle");
  });

  it("cancels mid-funnel", () => {
    const state: ConversationState = { stage: "awaiting_slot", courseId: "c-en", offeredSlotIds: ["s-en-1", "s-en-2"], language: "uz" };
    const d = decide(input("bekor qilish", { state }));
    expect(d.intent).toBe("cancel");
    expect(d.reply).toBe(T.uz.cancelled);
    expect(d.state.stage).toBe("idle");
    expect(d.state.offeredSlotIds).toBeUndefined();
    expect(d.state.slotId).toBeUndefined();
    expect(actionTypes(d)).not.toContain("book");
  });
});

describe("decide(): escalation", () => {
  it("complaint → handoff with apology", () => {
    const d = decide(input("Pulimni qaytarib bering, darslar yomon"));
    expect(d.intent).toBe("complaint");
    expect(d.actions).toContainEqual({ type: "handoff", reason: "complaint" });
    expect(d.reply).toBe(T.uz.handoffComplaint);
  });

  it("'operator' → handoff", () => {
    const d = decide(input("operator bilan gaplashmoqchiman"));
    expect(d.intent).toBe("human");
    expect(d.actions).toEqual([{ type: "handoff", reason: "customer_requested_human" }]);
    expect(d.reply).toBe(T.uz.handoff);
  });

  it("complaint wins even mid-funnel", () => {
    const state: ConversationState = { stage: "awaiting_slot", courseId: "c-en", offeredSlotIds: ["s-en-1"], language: "ru" };
    const d = decide(input("Это обман, верните деньги", { state }));
    expect(d.actions).toContainEqual({ type: "handoff", reason: "complaint" });
    expect(d.state.stage).toBe("idle");
  });

  it("custom escalation keyword → handoff; without it the same text is not escalated", () => {
    const base = input("direktor bilan gaplashsam bo'ladimi");
    const d = decide({ ...base, settings: { ...base.settings, escalationKeywords: ["direktor"] } });
    expect(d.actions).toEqual([{ type: "handoff", reason: "customer_requested_human" }]);
    const plain = decide(base);
    expect(actionTypes(plain)).not.toContain("handoff");
  });

  it("unknown twice → handoff (maxUnknownBeforeHandoff=2)", () => {
    const d1 = decide(input("Velosiped uchun joy bormi?"));
    expect(d1.intent).toBe("unknown");
    expect(d1.reply).toBe(T.uz.unknown);
    expect(d1.state.unknownCount).toBe(1);
    expect(d1.actions).toEqual([]);
    const d2 = decide(input("Basseyn ham bormi?", { state: d1.state }));
    expect(d2.actions).toEqual([{ type: "handoff", reason: "unable_to_answer" }]);
    expect(d2.state.unknownCount).toBe(0);
  });

  it("respects a larger maxUnknownBeforeHandoff", () => {
    const base = input("Velosiped uchun joy bormi?");
    const settings = { ...base.settings, maxUnknownBeforeHandoff: 3 };
    const d1 = decide({ ...base, settings });
    const d2 = decide({ ...base, settings, state: d1.state });
    expect(actionTypes(d2)).not.toContain("handoff");
    const d3 = decide({ ...base, settings, state: d2.state });
    expect(actionTypes(d3)).toContain("handoff");
  });
});

describe("decide(): knowledge grounding", () => {
  it("answers from an approved knowledge article verbatim and cites it", () => {
    const d = decide(input("Click orqali to'lasa bo'ladimi?"));
    expect(d.intent).toBe("faq");
    expect(d.reply).toBe(PAYMENT.content);
    expect(d.sources).toEqual(["k-payment"]);
  });

  it("does not answer from facts it was not given (e.g. draft articles filtered out)", () => {
    const d = decide(input("Chegirma bormi?", { knowledge: [PAYMENT] }));
    expect(d.reply).not.toContain("10%");
    expect(d.intent).toBe("unknown");
    expect(d.sources).toEqual([]);
  });

  it("'Salom, chegirma bormi?' answers the knowledge question, not a greeting", () => {
    const d = decide(input("Salom, chegirma bormi?"));
    expect(d.intent).toBe("faq");
    expect(d.reply).toBe(DISCOUNT.content);
    expect(d.sources).toEqual(["k-discount"]);
  });

  it("hands off when no courses are configured and a price is asked", () => {
    const d = decide(input("Narxi qancha?", { courses: [] }));
    expect(d.actions).toEqual([{ type: "handoff", reason: "no_courses_configured" }]);
  });
});
