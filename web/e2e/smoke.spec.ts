import { expect, test } from "@playwright/test";

test("dev sign-in reaches the dashboard", async ({ page }) => {
  await page.goto("/signin");
  // The dev credentials are pre-filled; just submit.
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
});

test("unauthenticated dashboard redirects to sign-in", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/signin/);
});
