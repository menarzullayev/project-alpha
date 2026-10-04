import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

test("dashboard is usable on a phone: drawer navigation and no horizontal scroll", async ({ page }) => {
  await signUp(page, { org: "Mobile Centre" });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("dialog").getByRole("link", { name: "Courses & slots" }).click();
  await expect(page).toHaveURL(/\/courses/);
  await expect(page.getByRole("heading", { name: "Courses & trial slots" })).toBeVisible();
});
