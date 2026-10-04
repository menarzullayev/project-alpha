export type OutboundOptions = {
  /** Ask the user to share their phone number via Telegram's contact button. */
  requestContact?: boolean;
  /** Quick-reply buttons (rendered as a reply keyboard). */
  quickReplies?: string[];
};

export interface MessagingProvider {
  readonly name: string;
  sendText(chatId: string, text: string, opts?: OutboundOptions): Promise<{ externalId: string }>;
}
