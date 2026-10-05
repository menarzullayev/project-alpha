export type LlmMessage = { role: "user" | "assistant"; content: string };

export type LlmRequest = {
  system: string;
  messages: LlmMessage[];
  maxTokens?: number;
  temperature?: number;
};

/** Minimal provider contract: plain text in, plain text out. */
export interface LlmProvider {
  readonly name: string;
  complete(req: LlmRequest): Promise<string>;
}
