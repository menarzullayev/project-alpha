/** Error raised by outbound HTTP providers; carries retry hints. */
export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
    public readonly retryable: boolean,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export function isRetryableStatus(status: number) {
  return status === 429 || status >= 500;
}
