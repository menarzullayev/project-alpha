"use client";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public details?: Record<string, string[] | undefined>,
  ) {
    super(message);
  }
}

/** JSON fetch against our own API with consistent error handling. */
export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: init.body !== undefined ? { "content-type": "application/json" } : undefined,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    credentials: "same-origin",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = (data as { error?: { message?: string; code?: string; details?: Record<string, string[]> } }).error;
    const fieldMsg = err?.details && typeof err.details === "object" ? Object.entries(err.details).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`).join("; ") : "";
    throw new ApiError(fieldMsg && err?.code === "validation_error" ? fieldMsg : (err?.message ?? `Request failed (${res.status})`), res.status, err?.code, err?.details);
  }
  return data as T;
}
