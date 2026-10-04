import { normalize, tokens } from "./text";

export type Lang = "uz" | "ru" | "en";

const UZ = ["salom", "assalomu", "qancha", "narxi", "narx", "kurs", "kurslar", "bormi", "bor", "kerak", "qachon", "yozilmoqchiman", "yozilish", "rahmat", "ha", "yo'q", "qanday", "nima", "men", "uchun", "dars", "darslar", "tili", "o'qish", "sinov", "manzil", "qayerda", "vaqt", "iltimos", "xohlayman"];
const EN = ["hello", "hi", "hey", "price", "how", "much", "what", "course", "courses", "the", "is", "are", "want", "book", "trial", "when", "where", "thanks", "thank", "please", "lesson", "english", "schedule", "cost", "can", "i", "you", "do", "have"];

export function detectLanguage(text: string, fallback: Lang): { lang: Lang; confident: boolean } {
  const norm = normalize(text);
  if (!norm) return { lang: fallback, confident: false };
  const cyr = (norm.match(/[а-яәөүұқғңһўҳ]/g) ?? []).length;
  const lat = (norm.match(/[a-z]/g) ?? []).length;
  if (cyr > lat) return { lang: /[ўқғҳ]/.test(norm) ? "uz" : "ru", confident: cyr >= 3 };
  const toks = tokens(text);
  let uz = 0;
  let en = 0;
  for (const t of toks) {
    if (UZ.includes(t) || /o'|g'|sh|ch|lar$|mi$|ni$|ga$|dan$/.test(t)) uz++;
    if (EN.includes(t)) en++;
  }
  if (uz === 0 && en === 0) return { lang: fallback, confident: false };
  return { lang: en > uz ? "en" : "uz", confident: Math.abs(en - uz) >= 1 };
}
