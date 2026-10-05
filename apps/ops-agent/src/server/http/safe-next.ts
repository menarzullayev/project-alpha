/** Accepts only same-origin absolute paths, so `?next=` cannot become an open redirect. */
export function safeNext(v: unknown): string | null {
  if (typeof v !== "string" || !v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\") || v.length > 200) return null;
  return /^\/[\w\-/?=&.%]*$/.test(v) ? v : null;
}
