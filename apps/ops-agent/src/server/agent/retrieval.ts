import { mentions, stemMatch, tokens } from "./text";

export type CourseFact = {
  id: string;
  name: string;
  description: string;
  category: string;
  level: string;
  keywords: string[];
  priceAmount: number;
  pricePeriod: string;
  durationWeeks: number | null;
  scheduleText: string;
  format: string;
};

export type SlotFact = { id: string; courseId: string; startsAt: Date; location: string; available: number };

export type KnowledgeFact = { id: string; title: string; content: string; category: string; keywords: string[] };

const STOP = new Set(["kurs", "kursi", "kurslar", "course", "courses", "курс", "курсы", "tili", "language", "язык", "for", "uchun", "and", "va"]);

/** Scores how strongly a message refers to a course. 0 = no reference. */
export function scoreCourse(text: string, course: CourseFact): number {
  let score = 0;
  for (const kw of course.keywords) if (mentions(text, kw)) score += 3;
  const nameTokens = tokens(course.name).filter((t) => t.length >= 3 && !STOP.has(t));
  const msgTokens = tokens(text);
  for (const nt of nameTokens) if (msgTokens.some((mt) => stemMatch(mt, nt))) score += 2;
  if (course.category && mentions(text, course.category)) score += 1;
  return score;
}

export function matchCourse(text: string, courses: CourseFact[]): CourseFact | null {
  let best: CourseFact | null = null;
  let bestScore = 0;
  let tie = false;
  for (const c of courses) {
    const s = scoreCourse(text, c);
    if (s > bestScore) {
      best = c;
      bestScore = s;
      tie = false;
    } else if (s === bestScore && s > 0) {
      tie = true;
    }
  }
  // Ambiguous references ("til kurslari") resolve to nothing rather than a guess.
  return bestScore >= 2 && !tie ? best : null;
}

/** Keyword retrieval over approved knowledge. Returns the best article above a confidence floor. */
export function retrieveKnowledge(text: string, articles: KnowledgeFact[]): { article: KnowledgeFact; score: number } | null {
  const msgTokens = tokens(text).filter((t) => t.length >= 3);
  if (!msgTokens.length) return null;
  let best: { article: KnowledgeFact; score: number } | null = null;
  for (const a of articles) {
    let score = 0;
    for (const kw of a.keywords) if (mentions(text, kw)) score += 3;
    const titleTokens = tokens(a.title).filter((t) => t.length >= 4);
    for (const tt of titleTokens) if (msgTokens.some((mt) => stemMatch(mt, tt))) score += 1;
    if (score > (best?.score ?? 0)) best = { article: a, score };
  }
  return best && best.score >= 3 ? best : null;
}
