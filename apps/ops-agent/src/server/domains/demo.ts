/**
 * Demo workspace content for an education centre. Sample conversations are
 * produced by running scripted customer messages through the real agent
 * pipeline (sandbox delivery), so leads, bookings and handoffs are genuine.
 */
import { and, eq, sql } from "drizzle-orm";
import { processInbound } from "../agent/orchestrator";
import type { Db } from "../db/client";
import { courses } from "../db/schema";
import { SandboxMessagingProvider } from "../providers/messaging/sandbox";
import type { TenantContext } from "../tenancy";
import { updateAgentSettings } from "./agent-settings";
import { recordAudit } from "./audit";
import { createCourse, createSlot } from "./courses";
import { createKnowledge } from "./knowledge";
import { createSandboxIntegration } from "./integrations";

const COURSES = [
  {
    name: "Ingliz tili (General English)",
    description: "Boshlang'ichdan Upper-Intermediate gacha. Guruhda 8–10 o'quvchi, haftasiga 3 dars.",
    category: "Tillar",
    level: "Beginner – Upper-Intermediate",
    keywords: ["ingliz", "english", "inglizcha", "английский"],
    priceAmount: 450000,
    pricePeriod: "month" as const,
    durationWeeks: 24,
    scheduleText: "Dush/Chor/Juma 15:00 yoki 18:00",
    format: "offline" as const,
  },
  {
    name: "IELTS Intensive",
    description: "IELTS 6.5+ ga tayyorlov: 4 ko'nikma, haftalik mock test.",
    category: "Tillar",
    level: "Intermediate+",
    keywords: ["ielts", "айелтс", "mock"],
    priceAmount: 750000,
    pricePeriod: "month" as const,
    durationWeeks: 12,
    scheduleText: "Sesh/Pay/Shan 10:00",
    format: "hybrid" as const,
  },
  {
    name: "Rus tili",
    description: "So'zlashuv va grammatika, kattalar uchun.",
    category: "Tillar",
    level: "Beginner – Intermediate",
    keywords: ["rus", "russian", "русский", "ruscha"],
    priceAmount: 380000,
    pricePeriod: "month" as const,
    durationWeeks: 16,
    scheduleText: "Sesh/Pay 19:00",
    format: "offline" as const,
  },
  {
    name: "Matematika (DTM tayyorlov)",
    description: "Abituriyentlar uchun DTM testlariga tayyorlov, haftalik test sinovlari.",
    category: "Aniq fanlar",
    level: "Abituriyent",
    keywords: ["matematika", "math", "dtm", "математика", "abituriyent"],
    priceAmount: 400000,
    pricePeriod: "month" as const,
    durationWeeks: 32,
    scheduleText: "Dush/Chor/Juma 16:00",
    format: "offline" as const,
  },
  {
    name: "Python dasturlash",
    description: "Noldan dasturlash: Python asoslari, loyihalar, portfolio.",
    category: "IT",
    level: "Beginner",
    keywords: ["python", "dasturlash", "programming", "it", "программирование", "coding"],
    priceAmount: 600000,
    pricePeriod: "month" as const,
    durationWeeks: 20,
    scheduleText: "Shan/Yak 11:00",
    format: "hybrid" as const,
  },
];

const KNOWLEDGE = [
  {
    title: "Manzil va mo'ljal",
    content: "Bizning manzil: Toshkent, Chilonzor tumani, Bunyodkor ko'chasi 12. Mo'ljal: Chilonzor metro bekati yonida. Ish vaqti: Dushanba–Shanba 9:00–20:00.",
    category: "location",
    keywords: ["manzil", "qayerda", "address", "адрес", "где", "mo'ljal", "location"],
  },
  {
    title: "To'lov usullari",
    content: "To'lovni naqd pul, Click, Payme yoki bank kartasi orqali amalga oshirish mumkin. To'lov har oyning boshida qilinadi.",
    category: "payment",
    keywords: ["to'lov", "tolov", "click", "payme", "karta", "оплата", "payment", "naqd"],
  },
  {
    title: "Chegirmalar",
    content: "Bir oilaning ikkinchi farzandiga 10% chegirma. 3 oylik to'lovni oldindan qilganda 5% chegirma beriladi.",
    category: "pricing",
    keywords: ["chegirma", "skidka", "скидка", "discount", "aksiya"],
  },
  {
    title: "Bepul sinov darsi",
    content: "Har bir kurs bo'yicha bitta bepul sinov darsi bor. Sinov darsidan keyin o'qituvchi darajangizni aniqlab, mos guruhni tavsiya qiladi.",
    category: "faq",
    keywords: ["bepul", "free", "бесплатно", "sinov darsi"],
  },
  {
    title: "Sertifikat",
    content: "Kursni muvaffaqiyatli tugatgan o'quvchilarga markazimiz sertifikati beriladi.",
    category: "faq",
    keywords: ["sertifikat", "certificate", "сертификат", "diplom"],
  },
];

const SCRIPTS: { user: { id: string; name: string; username: string }; messages: string[] }[] = [
  { user: { id: "demo-1001", name: "Aziza Karimova", username: "aziza_k" }, messages: ["Assalomu alaykum", "Ingliz tili kursi narxi qancha?", "Sinov darsiga yozilmoqchiman", "1", "+998901234567"] },
  { user: { id: "demo-1002", name: "Dmitry Ivanov", username: "dmitry_iv" }, messages: ["Здравствуйте, какие у вас курсы?", "Сколько стоит Python?", "Где вы находитесь?"] },
  { user: { id: "demo-1003", name: "Bekzod Tursunov", username: "bekzod_t" }, messages: ["IELTS kursi qachon?", "yozilaman", "2", "+998 93 555 44 33"] },
  { user: { id: "demo-1004", name: "Malika Yusupova", username: "malika_y" }, messages: ["Salom, chegirma bormi?", "Pulimni qaytarib bering, darslar yomon"] },
  { user: { id: "demo-1005", name: "John Miller", username: "jmiller" }, messages: ["Hello! How much is the math course?", "Do you have parking for bicycles?", "and a swimming pool?"] },
];

export async function seedDemoData(db: Db, ctx: TenantContext, opts: { conversations?: boolean } = {}) {
  const [existing] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(courses)
    .where(and(eq(courses.orgId, ctx.orgId)));
  if (existing.n > 0) return { skipped: true as const };

  const created = [];
  for (const c of COURSES) created.push(await createCourse(db, ctx, { ...c, isActive: true }));
  // Trial slots over the next two weeks at realistic local times (Asia/Tashkent = UTC+5).
  const now = new Date();
  for (const [i, course] of created.entries()) {
    for (let d = 1; d <= 12; d += 2) {
      const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + d + (i % 2), 5 + (i % 3) * 2, 0));
      await createSlot(db, ctx, course.id, { startsAt: day, durationMin: 60, capacity: 6, location: "Chilonzor filiali, 2-xona" });
    }
  }
  for (const k of KNOWLEDGE) await createKnowledge(db, ctx, { ...k, status: "approved" });
  await createKnowledge(db, ctx, {
    title: "Yozgi lager (qoralama)",
    content: "Yozgi lager dasturi hali tasdiqlanmagan.",
    category: "draft",
    keywords: ["lager", "camp"],
    status: "draft",
  });
  await updateAgentSettings(db, ctx, {
    agentName: "Bilim yordamchisi",
    defaultLanguage: "uz",
    businessInfo: "O'quv markazi: tillar, aniq fanlar va IT kurslari.",
  });
  const integration = await createSandboxIntegration(db, ctx);

  if (opts.conversations !== false) {
    const messaging = new SandboxMessagingProvider();
    let seq = 1;
    for (const script of SCRIPTS) {
      for (const text of script.messages) {
        await processInbound(
          db,
          {
            orgId: ctx.orgId,
            channel: "telegram",
            integrationId: integration?.id ?? null,
            chatId: script.user.id,
            from: { userId: script.user.id, username: script.user.username, fullName: script.user.name, language: null },
            text,
            externalMessageId: `demo-${seq++}`,
          },
          { messaging, llm: null },
        );
      }
    }
  }
  await recordAudit(db, ctx, { action: "organization.demo_data_loaded", entityType: "organization", entityId: ctx.orgId });
  return { skipped: false as const, courses: created.length };
}
