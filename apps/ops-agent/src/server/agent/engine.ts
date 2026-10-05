/**
 * The agent's decision core: a pure function from (message, business facts,
 * conversation state) to a reply plus side-effect *requests*. It never talks
 * to the database or network, which keeps it deterministic and testable.
 *
 * Grounding rule: every factual statement in a reply is rendered from
 * CourseFact / SlotFact / KnowledgeFact records. Nothing is invented; when no
 * approved fact answers the question, the agent asks or escalates.
 */
import type { ConversationState } from "../db/schema";
import { detectLanguage, type Lang } from "./language";
import { type Intent, understand } from "./nlu";
import { type CourseFact, type KnowledgeFact, matchCourse, retrieveKnowledge, type SlotFact } from "./retrieval";
import { formatPrice, formatSlot, T } from "./templates";

export type AgentInput = {
  text: string;
  /** Phone number shared through Telegram's contact button, if any. */
  sharedPhone?: string | null;
  isStart?: boolean;
  org: { name: string; timezone: string; currency: string };
  settings: {
    agentName: string;
    defaultLanguage: Lang;
    greeting: string;
    escalationKeywords: string[];
    maxUnknownBeforeHandoff: number;
  };
  customer: { fullName: string | null; phone: string | null };
  state: ConversationState;
  courses: CourseFact[];
  slots: SlotFact[];
  knowledge: KnowledgeFact[];
};

export type AgentAction =
  | { type: "set_interest"; courseId: string }
  | { type: "save_name"; fullName: string }
  | { type: "save_phone"; phone: string }
  | { type: "book"; slotId: string; courseId: string }
  | { type: "handoff"; reason: string };

export type AgentDecision = {
  reply: string;
  quickReplies?: string[];
  requestContact?: boolean;
  actions: AgentAction[];
  state: ConversationState;
  intent: Intent | "course_info" | "faq" | "slot_choice" | "provide_name" | "provide_phone";
  confidence: number;
  /** Ids of the records the reply was grounded on. */
  sources: string[];
  language: Lang;
};

const MAX_SLOTS_OFFERED = 3;

function priceOf(lang: Lang, c: CourseFact, currency: string) {
  return formatPrice(lang, c.priceAmount, c.pricePeriod, currency);
}

function courseDetails(lang: Lang, c: CourseFact, currency: string): string {
  const lines: string[] = [];
  if (c.description) lines.push(c.description);
  const price = priceOf(lang, c, currency);
  const labels = {
    uz: { price: "Narxi", schedule: "Jadval", duration: "Davomiyligi", weeks: "hafta", format: "Format", level: "Daraja" },
    ru: { price: "Цена", schedule: "Расписание", duration: "Длительность", weeks: "нед.", format: "Формат", level: "Уровень" },
    en: { price: "Price", schedule: "Schedule", duration: "Duration", weeks: "weeks", format: "Format", level: "Level" },
  }[lang];
  lines.push(`💰 ${labels.price}: ${price}`);
  if (c.scheduleText) lines.push(`🗓 ${labels.schedule}: ${c.scheduleText}`);
  if (c.durationWeeks) lines.push(`⏳ ${labels.duration}: ${c.durationWeeks} ${labels.weeks}`);
  if (c.level) lines.push(`🎯 ${labels.level}: ${c.level}`);
  return lines.join("\n");
}

function courseList(lang: Lang, courses: CourseFact[], currency: string) {
  return courses.map((c, i) => `${i + 1}. ${c.name} — ${priceOf(lang, c, currency)}`).join("\n");
}

function upcomingSlots(input: AgentInput, courseId: string): SlotFact[] {
  const now = Date.now();
  return input.slots
    .filter((s) => s.courseId === courseId && s.available > 0 && s.startsAt.getTime() > now)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    .slice(0, MAX_SLOTS_OFFERED);
}

function looksLikeName(text: string): string | null {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length < 2 || t.length > 60) return null;
  if (!/^[\p{L}' .-]+$/u.test(t)) return null;
  if (t.split(" ").length > 4) return null;
  return t
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function decide(input: AgentInput): AgentDecision {
  const state: ConversationState = { ...input.state };
  const detected = detectLanguage(input.text, state.language ?? input.settings.defaultLanguage);
  const lang: Lang = detected.confident || !state.language ? detected.lang : state.language;
  state.language = lang;
  const t = T[lang];
  const currency = input.org.currency;
  const nlu = understand(input.text, input.settings.escalationKeywords);
  const actions: AgentAction[] = [];
  const sources: string[] = [];
  const phone = input.sharedPhone ?? nlu.phone;
  const customer = { ...input.customer };

  const done = (
    reply: string,
    intent: AgentDecision["intent"],
    extra: Partial<Pick<AgentDecision, "quickReplies" | "requestContact" | "confidence">> = {},
  ): AgentDecision => ({
    reply,
    actions,
    state,
    intent,
    sources,
    language: lang,
    confidence: extra.confidence ?? nlu.confidence,
    quickReplies: extra.quickReplies,
    requestContact: extra.requestContact,
  });

  const handoff = (reason: string, complaint = false): AgentDecision => {
    actions.push({ type: "handoff", reason });
    state.stage = "idle";
    state.unknownCount = 0;
    return done(complaint ? t.handoffComplaint : t.handoff, complaint ? "complaint" : "human", { confidence: 0.9 });
  };

  // Phone numbers are valuable whenever they arrive.
  if (phone && phone !== customer.phone) {
    actions.push({ type: "save_phone", phone });
    customer.phone = phone;
  }

  // 1. Safety first: complaints and explicit requests for a human always escalate.
  if (nlu.intents.includes("complaint")) return handoff("complaint", true);
  if (nlu.intents.includes("human")) return handoff("customer_requested_human");

  const mentionedCourse = matchCourse(input.text, input.courses);
  if (mentionedCourse) {
    state.courseId = mentionedCourse.id;
    actions.push({ type: "set_interest", courseId: mentionedCourse.id });
  }
  const activeCourse = input.courses.find((c) => c.id === state.courseId) ?? null;

  /** Continue the booking funnel: slot → name → phone → book. */
  const advanceBooking = (): AgentDecision => {
    if (!state.slotId || !activeCourse) {
      state.stage = "idle";
      return done(t.whichCourse, "booking");
    }
    if (!customer.fullName) {
      state.stage = "awaiting_name";
      return done(t.askName, "booking");
    }
    if (!customer.phone) {
      state.stage = "awaiting_phone";
      return done(t.askPhone, "booking", { requestContact: true });
    }
    const slot = input.slots.find((s) => s.id === state.slotId);
    if (!slot) {
      state.stage = "awaiting_slot";
      state.slotId = undefined;
      return offerSlots(activeCourse);
    }
    actions.push({ type: "book", slotId: slot.id, courseId: activeCourse.id });
    sources.push(activeCourse.id, slot.id);
    state.stage = "booked";
    state.offeredSlotIds = undefined;
    return done(t.booked(activeCourse.name, formatSlot(lang, slot.startsAt, input.org.timezone), slot.location), "booking", {
      confidence: 0.95,
    });
  };

  const offerSlots = (course: CourseFact): AgentDecision => {
    const slots = upcomingSlots(input, course.id);
    sources.push(course.id);
    if (!slots.length) {
      actions.push({ type: "handoff", reason: "no_trial_slots" });
      state.stage = "idle";
      return done(t.noSlots(course.name), "booking", { confidence: 0.9 });
    }
    state.stage = "awaiting_slot";
    state.offeredSlotIds = slots.map((s) => s.id);
    sources.push(...slots.map((s) => s.id));
    const lines = slots
      .map((s, i) => `${i + 1}) ${formatSlot(lang, s.startsAt, input.org.timezone)}${s.location ? ` — ${s.location}` : ""}`)
      .join("\n");
    return done(t.offerSlots(course.name, lines), "booking", {
      quickReplies: slots.map((_, i) => String(i + 1)),
      confidence: 0.9,
    });
  };

  if (nlu.intents.includes("cancel") && state.stage && state.stage !== "idle" && state.stage !== "booked") {
    state.stage = "idle";
    state.offeredSlotIds = undefined;
    state.slotId = undefined;
    return done(t.cancelled, "cancel");
  }

  // 2. Stage-specific continuations of the booking funnel.
  if (state.stage === "awaiting_slot" && state.offeredSlotIds?.length && !mentionedCourse) {
    if (nlu.choice !== null) {
      const n = state.offeredSlotIds.length;
      if (nlu.choice < 1 || nlu.choice > n) return done(t.invalidChoice(n), "slot_choice", { quickReplies: state.offeredSlotIds.map((_, i) => String(i + 1)) });
      state.slotId = state.offeredSlotIds[nlu.choice - 1];
      return advanceBooking();
    }
  }
  if (state.stage === "awaiting_name" && nlu.intent === "unknown" && !phone) {
    const name = looksLikeName(input.text);
    if (name) {
      actions.push({ type: "save_name", fullName: name });
      customer.fullName = name;
      return advanceBooking();
    }
  }
  if (state.stage === "awaiting_phone") {
    if (customer.phone && phone) return advanceBooking();
    if (nlu.intent === "unknown" && /\d/.test(input.text)) return done(t.invalidPhone, "provide_phone", { requestContact: true });
  }
  if (state.stage === "awaiting_name" && phone && !customer.fullName) {
    // Some users send the phone first; keep asking for the name.
    return done(t.askName, "provide_phone");
  }

  // 3. Fresh intents.
  const has = (i: Intent) => nlu.intents.includes(i);
  const kb = retrieveKnowledge(input.text, input.knowledge);

  if (input.isStart || (has("greeting") && nlu.intents.length === 1 && !mentionedCourse && !kb)) {
    state.unknownCount = 0;
    const greet = input.settings.greeting.trim() || t.greeting(input.settings.agentName, input.org.name);
    return done(greet, "greeting", { quickReplies: t.menu, confidence: 0.95 });
  }

  if (has("booking") || (state.stage === "awaiting_course" && mentionedCourse) || (has("affirm") && state.courseId && state.stage === "idle" && !has("price"))) {
    state.unknownCount = 0;
    if (!input.courses.length) return handoff("no_courses_configured");
    if (activeCourse) {
      state.slotId = undefined;
      return offerSlots(activeCourse);
    }
    state.stage = "awaiting_course";
    sources.push(...input.courses.map((c) => c.id));
    return done(`${t.whichCourse}\n${courseList(lang, input.courses, currency)}`, "booking", {
      quickReplies: input.courses.slice(0, 6).map((c) => c.name),
    });
  }

  if (has("price") || has("schedule")) {
    state.unknownCount = 0;
    if (!input.courses.length) return handoff("no_courses_configured");
    const target = mentionedCourse ?? activeCourse;
    const parts: string[] = [];
    if (target) {
      sources.push(target.id);
      if (has("price")) parts.push(t.priceLine(target.name, priceOf(lang, target, currency)).replace(/^• /, "💰 "));
      if (has("schedule")) {
        parts.push(t.scheduleLine(target.name, target.scheduleText || t.noSchedule));
        const slots = upcomingSlots(input, target.id);
        if (slots.length) {
          sources.push(...slots.map((s) => s.id));
          parts.push(slots.map((s) => `• ${formatSlot(lang, s.startsAt, input.org.timezone)}`).join("\n"));
        }
      }
    } else {
      sources.push(...input.courses.map((c) => c.id));
      if (has("price")) parts.push(`${t.pricesIntro}\n${input.courses.map((c) => t.priceLine(c.name, priceOf(lang, c, currency))).join("\n")}`);
      if (has("schedule")) parts.push(input.courses.map((c) => t.scheduleLine(c.name, c.scheduleText || t.noSchedule)).join("\n"));
    }
    parts.push(t.bookCta);
    if (state.stage !== "awaiting_slot") state.stage = "idle";
    return done(parts.join("\n\n"), has("price") ? "price" : "schedule", { quickReplies: [t.menu[2]], confidence: 0.85 });
  }

  if (mentionedCourse) {
    state.unknownCount = 0;
    sources.push(mentionedCourse.id);
    state.stage = "idle";
    return done(`${t.courseInfo(mentionedCourse.name, courseDetails(lang, mentionedCourse, currency))}\n\n${t.bookCta}`, "course_info", {
      quickReplies: [t.menu[2]],
      confidence: 0.85,
    });
  }

  if (kb) {
    state.unknownCount = 0;
    sources.push(kb.article.id);
    return done(kb.article.content, "faq", { confidence: Math.min(0.95, 0.5 + kb.score / 10) });
  }

  if (has("courses")) {
    state.unknownCount = 0;
    if (!input.courses.length) return handoff("no_courses_configured");
    sources.push(...input.courses.map((c) => c.id));
    return done(t.courseList(courseList(lang, input.courses, currency)), "courses", {
      quickReplies: input.courses.slice(0, 6).map((c) => c.name),
      confidence: 0.85,
    });
  }

  if (has("location")) return handoff("location_not_in_knowledge");

  if (has("thanks")) return done(t.thanks, "thanks", { confidence: 0.9 });
  if (has("greeting")) {
    const greet = input.settings.greeting.trim() || t.greeting(input.settings.agentName, input.org.name);
    return done(greet, "greeting", { quickReplies: t.menu });
  }
  if (has("deny")) {
    state.stage = "idle";
    return done(t.cancelled, "deny");
  }

  if (phone && !nlu.intents.length) {
    if (state.stage === "awaiting_phone" || state.slotId) return advanceBooking();
    return done(t.phoneSaved, "provide_phone", { confidence: 0.9 });
  }

  // 4. Nothing grounded answers this: clarify, then escalate.
  state.unknownCount = (state.unknownCount ?? 0) + 1;
  if (state.unknownCount >= input.settings.maxUnknownBeforeHandoff) return handoff("unable_to_answer");
  return done(t.unknown, "unknown", { quickReplies: t.menu, confidence: 0.2 });
}
