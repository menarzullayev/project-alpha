import { expect, test } from "@playwright/test";
import { totpCode } from "../src/server/lib/totp";
import { db, signUp, uniqueEmail } from "./helpers";

/**
 * Root panel critical path. Promoting a user to superadmin needs direct DB
 * access (there is deliberately no self-service path), so this suite runs
 * only when E2E_DATABASE_URL is set. The promotion is reverted afterwards.
 */
const sql = db();
test.describe.configure({ mode: "serial" });
test.skip(!sql, "E2E_DATABASE_URL is required to grant a platform role");

let rootEmail = "";

test.afterAll(async () => {
  if (sql && rootEmail) await sql`update ops_agent.users set platform_role = null, totp_secret_encrypted = null, totp_enabled_at = null where email = ${rootEmail}`;
  await sql?.end();
});

test("customers cannot see the root panel", async ({ page }) => {
  await signUp(page, { org: "E2E Not Root" });
  const res = await page.goto("/root");
  expect(res?.status()).toBe(404);
  const api = await page.request.get("/api/root/overview");
  expect(api.status()).toBe(403);
});

test("superadmin enrolls 2FA, manages users and switches language and theme", async ({ page }) => {
  rootEmail = await signUp(page, { org: "E2E Root Home" });
  await sql!`update ops_agent.users set platform_role = 'superadmin' where email = ${rootEmail}`;

  await page.goto("/root");
  await expect(page).toHaveURL(/\/root\/mfa\/setup/);
  await page.getByRole("button", { name: "Generate key" }).click();
  const secret = (await page.getByTestId("totp-secret").innerText()).trim();
  expect(secret).toMatch(/^[A-Z2-7]{32}$/);
  await page.getByLabel("Authentication code").fill(totpCode(secret));
  await page.getByRole("button", { name: "Enable 2FA" }).click();
  await expect(page).toHaveURL(/\/root$/);
  await expect(page.getByRole("heading", { name: "Platform overview" })).toBeVisible();

  // Create a user and suspend them.
  await page.getByRole("link", { name: "Users" }).first().click();
  await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();
  const email = uniqueEmail("rootmade");
  await expect(async () => {
    await page.getByRole("button", { name: "Add user" }).click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await page.getByLabel("Name").fill("Root Made");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByTestId("temp-password")).toHaveValue(/.{14,}/);
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page).toHaveURL(/\/root\/users\/[0-9a-f-]{36}/);
  await page.getByRole("button", { name: "Suspend" }).click();
  await page.getByLabel("Reason").fill("E2E suspension check");
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText("E2E suspension check")).toBeVisible();

  // The action is in the audit log.
  await page.goto("/root/audit");
  await expect(page.getByText("user.suspended").first()).toBeVisible();

  // Language and theme.
  await page.getByLabel("Language").selectOption("uz");
  await expect(page.getByRole("heading", { name: "Audit jurnali" })).toBeVisible();
  await page.getByRole("radio", { name: "Qorong'i" }).click();
  await expect(page.getByTestId("theme-scope")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.getByTestId("theme-scope")).toHaveClass(/dark/);
  await page.getByLabel("Til").selectOption("en");
  await expect(page.getByRole("heading", { name: "Audit log" })).toBeVisible();
});
