import { getDb } from "@/server/db/client";
import { sendDailyReports } from "@/server/domains/analytics";
import { env } from "@/server/env";
import { safeEqual } from "@/server/lib/crypto";
import { logger } from "@/server/lib/logger";

export const maxDuration = 60;

/** Invoked by Vercel Cron with `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: Request) {
  const secret = env().CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const result = await sendDailyReports(getDb());
  logger.info("daily reports sent", result);
  return Response.json(result);
}
