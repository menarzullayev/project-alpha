/** Text normalisation shared by language detection, NLU and retrieval. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’ʻʼ`´]/g, "'")
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokens(text: string): string[] {
  return normalize(text)
    .split(/[^\p{L}\p{N}']+/u)
    .map((t) => t.replace(/^'+|'+$/g, ""))
    .filter(Boolean);
}

/**
 * Loose stem match tolerant of Uzbek/Russian suffixes: "inglizcha" ~ "ingliz",
 * "английского" ~ "английский". Compares a shared prefix of up to 5 letters.
 */
export function stemMatch(token: string, keyword: string): boolean {
  const k = normalize(keyword);
  if (k.includes(" ")) return false;
  if (token === k) return true;
  if (k.length < 3 || token.length < 3) return false;
  const n = Math.min(5, k.length, token.length);
  if (n < 4 && token.length !== k.length) return token.startsWith(k);
  return token.slice(0, n) === k.slice(0, n) && Math.abs(token.length - k.length) <= 6;
}

/** True when `text` mentions `keyword` (phrase keywords match as substrings). */
export function mentions(text: string, keyword: string): boolean {
  const k = normalize(keyword);
  if (!k) return false;
  const norm = normalize(text);
  if (k.includes(" ") || k.length <= 2) return ` ${norm} `.includes(` ${k} `) || (k.includes(" ") && norm.includes(k));
  return tokens(text).some((t) => stemMatch(t, k));
}

export function extractPhone(text: string): string | null {
  const m = text.replace(/[\s()-]/g, "").match(/\+?\d{9,15}/);
  if (!m) return null;
  let p = m[0];
  if (/^\d{9}$/.test(p)) p = `+998${p}`; // local Uzbek mobile without country code
  else if (/^998\d{9}$/.test(p)) p = `+${p}`;
  else if (!p.startsWith("+")) p = `+${p}`;
  return p;
}
