export type RetryOptions = {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Return false to stop retrying (non-retryable error). */
  shouldRetry?: (err: unknown, attempt: number) => boolean;
  /** Override the computed delay, e.g. to honour a server's retry_after. */
  delayFor?: (err: unknown, attempt: number) => number | undefined;
  onRetry?: (err: unknown, attempt: number, delayMs: number) => void;
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Retries `fn` with exponential backoff and full jitter. */
export async function withRetry<T>(fn: (attempt: number) => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const base = opts.baseDelayMs ?? 250;
  const max = opts.maxDelayMs ?? 4000;
  const sleep = opts.sleep ?? defaultSleep;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      if (attempt === attempts || (opts.shouldRetry && !opts.shouldRetry(err, attempt))) break;
      const computed = Math.min(max, base * 2 ** (attempt - 1));
      const delay = opts.delayFor?.(err, attempt) ?? Math.round(Math.random() * computed);
      opts.onRetry?.(err, attempt, delay);
      await sleep(delay);
    }
  }
  throw lastErr;
}
