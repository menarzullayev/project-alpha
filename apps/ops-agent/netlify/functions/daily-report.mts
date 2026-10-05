/**
 * Netlify Scheduled Function: triggers the daily report endpoint every day
 * at 04:00 UTC (09:00 Asia/Tashkent). The endpoint itself is authenticated
 * with CRON_SECRET, so this function holds no logic of its own.
 */
export default async function dailyReport() {
  const base = process.env.APP_URL;
  const secret = process.env.CRON_SECRET;
  if (!base || !secret) return new Response("APP_URL and CRON_SECRET are required", { status: 500 });
  const res = await fetch(`${base.replace(/\/$/, "")}/api/cron/daily-report`, { headers: { authorization: `Bearer ${secret}` } });
  return new Response(await res.text(), { status: res.status });
}

export const config = { schedule: "0 4 * * *" };
