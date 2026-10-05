import { randomUUID } from "node:crypto";
import type { MessagingProvider, OutboundOptions } from "./types";

/**
 * Delivers nothing externally; outbound messages are only persisted. Used by
 * the dashboard test chat and by sandbox integrations (demo workspaces).
 */
export class SandboxMessagingProvider implements MessagingProvider {
  readonly name = "sandbox";
  readonly sent: { chatId: string; text: string; opts?: OutboundOptions }[] = [];

  async sendText(chatId: string, text: string, opts?: OutboundOptions) {
    this.sent.push({ chatId, text, opts });
    return { externalId: `sandbox-${randomUUID()}` };
  }
}
