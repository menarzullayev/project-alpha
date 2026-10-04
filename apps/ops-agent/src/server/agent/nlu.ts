import { extractPhone, mentions, normalize } from "./text";

export const INTENTS = [
  "greeting",
  "thanks",
  "human",
  "complaint",
  "price",
  "schedule",
  "booking",
  "courses",
  "location",
  "cancel",
  "affirm",
  "deny",
  "unknown",
] as const;
export type Intent = (typeof INTENTS)[number];

const LEXICON: Record<Exclude<Intent, "unknown">, string[]> = {
  greeting: ["salom", "assalomu", "assalom", "hello", "hi", "hey", "привет", "здравствуйте", "добрый", "/start", "start"],
  thanks: ["rahmat", "raxmat", "thanks", "thank", "спасибо", "благодарю"],
  human: ["operator", "admin", "administrator", "menejer", "manager", "human", "odam bilan", "real person", "оператор", "менеджер", "администратор", "живой", "qo'ng'iroq qiling", "call me", "позвоните"],
  complaint: ["shikoyat", "pul qaytar", "pulimni", "aldad", "aldash", "refund", "complaint", "scam", "жалоба", "возврат", "обман", "верните", "sud", "lawyer", "суд"],
  price: ["narx", "narxi", "qancha", "necha pul", "to'lov", "tolov", "price", "cost", "how much", "fee", "pricing", "цена", "стоимость", "сколько стоит", "сколько", "оплата"],
  schedule: ["jadval", "qachon", "vaqt", "soat", "kunlari", "schedule", "when", "timetable", "time", "расписание", "когда", "время", "график"],
  booking: ["yozil", "yozilish", "yozilmoqchi", "ro'yxat", "royxat", "sinov", "bepul dars", "trial", "book", "booking", "sign up", "signup", "register", "enroll", "записать", "запис", "пробн", "бесплатн"],
  courses: ["kurs", "kurslar", "yo'nalish", "fanlar", "courses", "course", "programs", "курс", "курсы", "направлени"],
  location: ["manzil", "qayerda", "qayerdasiz", "filial", "address", "location", "where", "адрес", "где", "находитесь"],
  cancel: ["bekor", "cancel", "отмен", "kerak emas"],
  affirm: ["ha", "xa", "albatta", "yes", "yeah", "ok", "okay", "да", "конечно", "хорошо", "mayli"],
  deny: ["yo'q", "yoq", "no", "нет", "не надо"],
};

/** Ordering matters: risk first, then transactional intents, then informational. */
const PRIORITY: Exclude<Intent, "unknown">[] = [
  "complaint",
  "human",
  "cancel",
  "booking",
  "price",
  "schedule",
  "location",
  "courses",
  "thanks",
  "greeting",
  "affirm",
  "deny",
];

export type NluResult = {
  intent: Intent;
  /** All intents detected, in priority order (a message can ask price + schedule). */
  intents: Intent[];
  phone: string | null;
  choice: number | null;
  confidence: number;
};

export function understand(text: string, extraEscalation: string[] = []): NluResult {
  const norm = normalize(text);
  const found = new Set<Intent>();
  for (const intent of PRIORITY) {
    if (LEXICON[intent].some((k) => mentions(norm, k))) found.add(intent);
  }
  if (extraEscalation.some((k) => k.trim() && mentions(norm, k))) found.add("human");

  const choiceMatch = norm.match(/^\s*(\d{1,2})\s*[).]?\s*$/);
  const choice = choiceMatch ? Number(choiceMatch[1]) : null;
  const phone = extractPhone(text);

  const intents: Intent[] = PRIORITY.filter((i) => found.has(i));
  const intent: Intent = intents[0] ?? "unknown";
  return { intent, intents, phone, choice, confidence: intents.length ? 0.8 : 0.2 };
}
