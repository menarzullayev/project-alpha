import { expect, type Page } from "@playwright/test";
import postgres from "postgres";

export const PASSWORD = "E2ePassword123";

export function uniqueEmail(tag: string) {
  return `e2e-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

export async function signUp(page: Page, opts: { org: string; name?: string; email?: string }) {
  const email = opts.email ?? uniqueEmail("owner");
  await page.goto("/signup");
  await page.getByLabel("Education centre name").fill(opts.org);
  await page.getByLabel("Your name").fill(opts.name ?? "E2E Owner");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  return email;
}

export async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

export async function sendTestChat(page: Page, text: string) {
  const before = await page.locator("[aria-live=polite] .whitespace-pre-wrap").count();
  await expect(async () => {
    await page.getByLabel("Message", { exact: true }).fill(text);
    await expect(page.getByLabel("Message", { exact: true })).toHaveValue(text, { timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.locator("[aria-live=polite] .whitespace-pre-wrap")).toHaveCount(before + 2);
  return (await page.locator("[aria-live=polite] .whitespace-pre-wrap").last().innerText()).trim();
}

export function db() {
  const url = process.env.E2E_DATABASE_URL;
  return url ? postgres(url, { max: 1, prepare: false }) : null;
}
