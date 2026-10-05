import { expect, test } from "@playwright/test";
import { db, PASSWORD, sendTestChat, signIn, signUp, uniqueEmail } from "./helpers";

test.describe.configure({ mode: "serial" });

let ownerEmail = "";
let leadUrl = "";

test("health endpoint reports ok", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.status).toBe("ok");
  expect(body.checks.database.ok).toBe(true);
});

test("unauthenticated users are redirected to login and APIs return 401", async ({ page, request }) => {
  await page.goto("/leads");
  await expect(page).toHaveURL(/\/login/);
  const res = await request.get("/api/v1/leads");
  expect(res.status()).toBe(401);
});

test("owner signs up, loads demo data and sees a populated dashboard", async ({ page }) => {
  ownerEmail = await signUp(page, { org: "E2E Academy" });
  await expect(page.getByText("Set up your AI agent")).toBeVisible();
  await page.getByRole("button", { name: /Load demo education centre/ }).click();
  await expect(page.getByText("Leads (30 days)")).toBeVisible();
  await expect(page.getByText("Set up your AI agent")).toHaveCount(0, { timeout: 45_000 });
  await page.goto("/leads");
  await expect(page.getByRole("link", { name: "Aziza Karimova" })).toBeVisible();
  await page.goto("/bookings");
  await expect(page.getByText("Aziza Karimova")).toBeVisible();
  await page.goto("/conversations?status=handoff");
  await expect(page.getByText("Malika Yusupova")).toBeVisible();
});

test("AI agent books a trial lesson end-to-end in the test chat", async ({ page }) => {
  await signIn(page, ownerEmail);
  await page.goto("/agent");
  await page.getByRole("button", { name: "Reset" }).click();
  const greet = await sendTestChat(page, "Salom");
  expect(greet).toContain("Assalomu alaykum");
  const price = await sendTestChat(page, "Python kursi narxi qancha?");
  expect(price).toContain("600 000");
  const slots = await sendTestChat(page, "Sinov darsiga yozilmoqchiman");
  expect(slots).toContain("1)");
  const ask = await sendTestChat(page, "1");
  expect(ask).toMatch(/Telefon raqamingizni/);
  const booked = await sendTestChat(page, "+998 90 111 22 33");
  expect(booked).toContain("✅");
  await page.goto("/bookings");
  await expect(page.getByText("E2E Owner (test)").first()).toBeVisible();
  await page.goto("/leads?q=E2E%20Owner");
  await expect(page.getByRole("combobox", { name: "Lead status" }).first()).toHaveValue("trial_booked");
  leadUrl = (await page.getByRole("link", { name: /E2E Owner \(test\)/ }).first().getAttribute("href")) ?? "";
  expect(leadUrl).toMatch(/^\/leads\//);
});

test("complaints are handed off and an operator can reply and hand back", async ({ page }) => {
  await signIn(page, ownerEmail);
  await page.goto("/agent");
  await page.getByRole("button", { name: "Reset" }).click();
  const r = await sendTestChat(page, "Shikoyatim bor, pulimni qaytaring");
  expect(r).toContain("uzr");
  await page.getByRole("link", { name: "Open conversation" }).click();
  await expect(page.getByText("Needs human")).toBeVisible();
  // On a cold production page, typing can land before hydration resets the
  // controlled textarea; retry until the button reflects the text.
  await expect(async () => {
    await page.getByLabel("Reply").fill("Salom! Men administratorman, hozir yordam beraman.");
    await expect(page.getByRole("button", { name: "Send" })).toBeEnabled({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Men administratorman")).toBeVisible();
  await page.getByRole("button", { name: "Hand back to AI" }).click();
  await expect(page.getByText("AI agent", { exact: true }).first()).toBeVisible();
});

test("owner manages catalog: creates a course and a trial slot", async ({ page }) => {
  await signIn(page, ownerEmail);
  await page.goto("/courses");
  await page.getByRole("button", { name: "New course" }).click();
  await page.getByLabel("Course name").fill("Koreys tili");
  await page.getByLabel("Price").fill("500000");
  await page.getByLabel("Keywords").fill("koreys, korean, корейский");
  await page.getByRole("button", { name: "Create course" }).click();
  await expect(page.getByRole("heading", { name: "Koreys tili" })).toBeVisible();
});

test("RBAC: a viewer invited by the owner cannot modify data", async ({ page, browser }) => {
  await signIn(page, ownerEmail);
  await page.goto("/team");
  await page.getByRole("button", { name: "Invite member" }).click();
  const viewerEmail = uniqueEmail("viewer");
  await page.getByLabel("Email").fill(viewerEmail);
  await page.getByLabel("Role").selectOption("viewer");
  await page.getByRole("button", { name: "Create invitation" }).click();
  const link = await page.getByLabel("Invitation link").inputValue();
  const invitePath = new URL(link).pathname;

  const ctx = await browser.newContext();
  const v = await ctx.newPage();
  await v.goto(invitePath);
  await v.getByLabel("Your name").fill("E2E Viewer");
  await v.getByLabel("Choose a password").fill(PASSWORD);
  await v.getByRole("button", { name: "Accept invitation" }).click();
  await expect(v).toHaveURL(/\/dashboard/);
  await v.goto("/leads");
  await expect(v.getByRole("button", { name: "Add lead" })).toHaveCount(0);
  await expect(v.getByRole("combobox", { name: "Lead status" })).toHaveCount(0);
  const res = await v.request.post("/api/v1/courses", {
    data: { name: "Hack", priceAmount: 1 },
    headers: { origin: new URL(v.url()).origin },
  });
  expect(res.status()).toBe(403);
  await v.goto("/audit");
  await expect(v).toHaveURL(/denied=1/);
  await ctx.close();
});

test("tenant isolation: another workspace cannot see this workspace's lead", async ({ browser }) => {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await signUp(p, { org: "Rival Centre" });
  await p.goto(leadUrl);
  await expect(p.getByText("Page not found")).toBeVisible();
  await expect(p.getByText("E2E Owner (test)")).toHaveCount(0);
  const api = await p.request.get(`/api/v1${leadUrl}`);
  expect(api.status()).toBe(404);
  await p.goto("/leads");
  await expect(p.getByText("No leads yet")).toBeVisible();
  await ctx.close();
});

test("Telegram webhook: rejects bad secret, processes updates idempotently", async ({ request }) => {
  const sql = db();
  test.skip(!sql, "E2E_DATABASE_URL not set");
  const [row] = await sql!`
    select i.id, i.webhook_secret from ops_agent.integrations i
    join ops_agent.organizations o on o.id = i.org_id where o.name = 'E2E Academy' order by i.created_at desc limit 1`;
  expect(row).toBeTruthy();
  const url = `/api/telegram/webhook/${row.id}`;
  const updateId = Math.floor(Math.random() * 1e9);
  const update = {
    update_id: updateId,
    message: { message_id: updateId, date: 1, chat: { id: 777000 + (updateId % 1000), type: "private" }, from: { id: 777000 + (updateId % 1000), first_name: "Webhook", last_name: "Tester" }, text: "IELTS narxi qancha?" },
  };
  const bad = await request.post(url, { data: update, headers: { "x-telegram-bot-api-secret-token": "wrong" } });
  expect(bad.status()).toBe(401);
  const headers = { "x-telegram-bot-api-secret-token": row.webhook_secret };
  const [a, b] = await Promise.all([request.post(url, { data: update, headers }), request.post(url, { data: update, headers })]);
  expect(a.status()).toBe(200);
  expect(b.status()).toBe(200);
  const again = await request.post(url, { data: update, headers });
  expect((await again.json()).status).toBe("duplicate");
  const msgs = await sql!`select m.direction, m.body from ops_agent.messages m join ops_agent.conversations c on c.id = m.conversation_id
    where c.integration_id = ${row.id} and c.external_chat_id = ${String(update.message.chat.id)} order by m.created_at`;
  expect(msgs.filter((m) => m.direction === "inbound")).toHaveLength(1);
  expect(msgs.filter((m) => m.direction === "outbound")).toHaveLength(1);
  expect(msgs[1].body).toContain("750 000");
  await sql!.end();
});
