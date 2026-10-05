import type { Lang } from "./language";

type Dict = {
  greeting: (agent: string, org: string) => string;
  menu: string[];
  thanks: string;
  handoff: string;
  handoffComplaint: string;
  courseList: (lines: string) => string;
  noCourses: string;
  courseInfo: (name: string, details: string) => string;
  bookCta: string;
  priceLine: (name: string, price: string) => string;
  pricesIntro: string;
  scheduleLine: (name: string, schedule: string) => string;
  whichCourse: string;
  offerSlots: (course: string, lines: string) => string;
  noSlots: (course: string) => string;
  askName: string;
  askPhone: string;
  invalidPhone: string;
  invalidChoice: (n: number) => string;
  booked: (course: string, when: string, location: string) => string;
  bookingFailed: string;
  phoneSaved: string;
  unknown: string;
  cancelled: string;
  inHandoff: string;
  perPeriod: Record<string, string>;
  weekdays: string[];
  months: string[];
  noSchedule: string;
  locationFallback: string;
};

export const T: Record<Lang, Dict> = {
  uz: {
    greeting: (agent, org) => `Assalomu alaykum! Men ${org} yordamchisi — ${agent}. Kurslar, narxlar va bepul sinov darsiga yozilish bo'yicha yordam beraman.`,
    menu: ["📚 Kurslar", "💰 Narxlar", "📝 Sinov darsiga yozilish"],
    thanks: "Arzimaydi! Yana savollaringiz bo'lsa, yozing 🙂",
    handoff: "Savolingizni administratorga uzatdim. Tez orada siz bilan bog'lanishadi.",
    handoffComplaint: "Noqulaylik uchun uzr so'raymiz. Murojaatingizni mas'ul xodimga uzatdim — u siz bilan tez orada bog'lanadi.",
    courseList: (l) => `Bizdagi kurslar:\n${l}\n\nQaysi biri qiziqtiradi?`,
    noCourses: "Hozircha faol kurslar ro'yxati kiritilmagan. Savolingizni administratorga uzataman.",
    courseInfo: (n, d) => `📘 ${n}\n${d}`,
    bookCta: "Bepul sinov darsiga yozilishni xohlaysizmi?",
    priceLine: (n, p) => `• ${n} — ${p}`,
    pricesIntro: "Narxlar:",
    scheduleLine: (n, s) => `🗓 ${n}: ${s}`,
    whichCourse: "Qaysi kursga yozilmoqchisiz?",
    offerSlots: (c, l) => `${c} bo'yicha bo'sh vaqtlar:\n${l}\n\nQulay variant raqamini yozing.`,
    noSlots: (c) => `${c} bo'yicha hozircha bo'sh sinov vaqtlari yo'q. Administrator siz bilan bog'lanib, qulay vaqtni kelishadi.`,
    askName: "Ismingizni yozib yuboring, iltimos.",
    askPhone: "Telefon raqamingizni yuboring (masalan, +998 90 123 45 67) yoki pastdagi tugmani bosing.",
    invalidPhone: "Raqamni tushunmadim. Iltimos, +998 90 123 45 67 ko'rinishida yuboring.",
    invalidChoice: (n) => `Iltimos, 1 dan ${n} gacha bo'lgan raqamni tanlang.`,
    booked: (c, w, l) => `✅ Siz ${c} sinov darsiga yozildingiz: ${w}${l ? `, ${l}` : ""}. Kutib qolamiz!`,
    bookingFailed: "Kechirasiz, bu vaqt band bo'lib qoldi. Boshqa vaqtni tanlaysizmi?",
    phoneSaved: "Rahmat, raqamingizni saqladim.",
    unknown: "Kechirasiz, savolingizni to'liq tushunmadim. Kurslar, narxlar yoki sinov darsi haqida so'rashingiz mumkin.",
    cancelled: "Yaxshi, bekor qildim. Yana nima bilan yordam bera olaman?",
    inHandoff: "",
    perPeriod: { month: "so'm/oy", course: "so'm (butun kurs)", lesson: "so'm/dars" },
    weekdays: ["Yak", "Dush", "Sesh", "Chor", "Pay", "Jum", "Shan"],
    months: ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"],
    noSchedule: "jadval administrator bilan kelishiladi",
    locationFallback: "Manzil bo'yicha ma'lumotni administrator yuboradi.",
  },
  ru: {
    greeting: (agent, org) => `Здравствуйте! Я ${agent}, помощник ${org}. Помогу с курсами, ценами и записью на бесплатный пробный урок.`,
    menu: ["📚 Курсы", "💰 Цены", "📝 Записаться на пробный урок"],
    thanks: "Пожалуйста! Если будут вопросы — пишите 🙂",
    handoff: "Я передал ваш вопрос администратору. С вами скоро свяжутся.",
    handoffComplaint: "Приносим извинения за неудобства. Я передал обращение ответственному сотруднику — он скоро свяжется с вами.",
    courseList: (l) => `Наши курсы:\n${l}\n\nКакой вас интересует?`,
    noCourses: "Список курсов пока не заполнен. Передаю ваш вопрос администратору.",
    courseInfo: (n, d) => `📘 ${n}\n${d}`,
    bookCta: "Хотите записаться на бесплатный пробный урок?",
    priceLine: (n, p) => `• ${n} — ${p}`,
    pricesIntro: "Цены:",
    scheduleLine: (n, s) => `🗓 ${n}: ${s}`,
    whichCourse: "На какой курс хотите записаться?",
    offerSlots: (c, l) => `Свободное время по курсу «${c}»:\n${l}\n\nНапишите номер удобного варианта.`,
    noSlots: (c) => `По курсу «${c}» пока нет свободных пробных уроков. Администратор свяжется с вами и подберёт время.`,
    askName: "Напишите, пожалуйста, ваше имя.",
    askPhone: "Отправьте номер телефона (например, +998 90 123 45 67) или нажмите кнопку ниже.",
    invalidPhone: "Не удалось распознать номер. Отправьте в формате +998 90 123 45 67.",
    invalidChoice: (n) => `Пожалуйста, выберите номер от 1 до ${n}.`,
    booked: (c, w, l) => `✅ Вы записаны на пробный урок «${c}»: ${w}${l ? `, ${l}` : ""}. Ждём вас!`,
    bookingFailed: "К сожалению, это время уже занято. Выберете другое?",
    phoneSaved: "Спасибо, номер сохранён.",
    unknown: "Извините, я не совсем понял вопрос. Спросите о курсах, ценах или пробном уроке.",
    cancelled: "Хорошо, отменил. Чем ещё могу помочь?",
    inHandoff: "",
    perPeriod: { month: "сум/мес", course: "сум за курс", lesson: "сум/урок" },
    weekdays: ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"],
    months: ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"],
    noSchedule: "расписание согласуется с администратором",
    locationFallback: "Адрес пришлёт администратор.",
  },
  en: {
    greeting: (agent, org) => `Hello! I'm ${agent}, the assistant for ${org}. I can help with courses, prices and booking a free trial lesson.`,
    menu: ["📚 Courses", "💰 Prices", "📝 Book a trial lesson"],
    thanks: "You're welcome! Write any time 🙂",
    handoff: "I've passed your question to an administrator. They'll contact you shortly.",
    handoffComplaint: "We're sorry for the trouble. I've passed this to a staff member who will contact you shortly.",
    courseList: (l) => `Our courses:\n${l}\n\nWhich one interests you?`,
    noCourses: "The course list isn't available yet. I'm passing your question to an administrator.",
    courseInfo: (n, d) => `📘 ${n}\n${d}`,
    bookCta: "Would you like to book a free trial lesson?",
    priceLine: (n, p) => `• ${n} — ${p}`,
    pricesIntro: "Prices:",
    scheduleLine: (n, s) => `🗓 ${n}: ${s}`,
    whichCourse: "Which course would you like to book?",
    offerSlots: (c, l) => `Available times for ${c}:\n${l}\n\nReply with the number of the option you prefer.`,
    noSlots: (c) => `There are no open trial slots for ${c} right now. An administrator will contact you to arrange a time.`,
    askName: "Please send your name.",
    askPhone: "Please send your phone number (e.g. +998 90 123 45 67) or tap the button below.",
    invalidPhone: "I couldn't read that number. Please send it like +998 90 123 45 67.",
    invalidChoice: (n) => `Please choose a number from 1 to ${n}.`,
    booked: (c, w, l) => `✅ You're booked for a ${c} trial lesson: ${w}${l ? `, ${l}` : ""}. See you there!`,
    bookingFailed: "Sorry, that time was just taken. Would you like another one?",
    phoneSaved: "Thanks, I've saved your number.",
    unknown: "Sorry, I didn't quite understand. You can ask about courses, prices or a trial lesson.",
    cancelled: "OK, cancelled. What else can I help with?",
    inHandoff: "",
    perPeriod: { month: "UZS/month", course: "UZS (full course)", lesson: "UZS/lesson" },
    weekdays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    months: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    noSchedule: "schedule arranged with the administrator",
    locationFallback: "An administrator will send you the address.",
  },
};

export function formatPrice(lang: Lang, amount: number, period: string, currency: string): string {
  const num = amount.toLocaleString("ru-RU").replace(/ /g, " ");
  if (currency === "UZS") return `${num} ${T[lang].perPeriod[period] ?? T[lang].perPeriod.month}`;
  return `${num} ${currency}/${period}`;
}

export function formatSlot(lang: Lang, date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const wdIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  const d = T[lang];
  const month = d.months[Number(get("month")) - 1];
  const day = get("day");
  const time = `${get("hour")}:${get("minute")}`;
  if (lang === "en") return `${d.weekdays[wdIndex]}, ${month} ${day}, ${time}`;
  if (lang === "ru") return `${d.weekdays[wdIndex]}, ${day} ${month}, ${time}`;
  return `${d.weekdays[wdIndex]}, ${day}-${month}, ${time}`;
}
