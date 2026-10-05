import type { PlatformRole } from "./rbac";

/** The authenticated root-panel operator. */
export type RootContext = {
  userId: string;
  email: string;
  role: PlatformRole;
  sessionId: string;
  ip?: string | null;
  userAgent?: string | null;
};
