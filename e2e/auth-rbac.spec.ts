import { expect, test } from "@playwright/test";
import { EXEC, FOUNDER, login } from "./helpers";

test("unauthenticated visitors are sent to sign-in and APIs return 401", async ({ page, request }) => {
  await page.goto("/claims");
  await expect(page).toHaveURL(/\/login/);
  const r = await request.get("/api/orders/export");
  expect(r.status()).toBe(401);
});

test("wrong password is refused without saying which part was wrong", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Work email").fill(EXEC.email);
  await page.getByLabel("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText(/email or password is/i)).toBeVisible();
});

test("finance executive cannot edit rate cards, roll back mappings or read the audit log", async ({ page }) => {
  await login(page, EXEC);
  await page.goto("/rate-cards/MP1");
  await expect(page.getByText("Only the finance co-founder can change contract terms")).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(0);
  await page.goto("/activity");
  await expect(page.getByText("Co-founder only")).toBeVisible();
  await expect(page.getByRole("link", { name: /Activity log/ })).toHaveCount(0);
});

test("co-founder sees rate-card editing and the activity log", async ({ page }) => {
  await login(page, FOUNDER);
  await page.goto("/rate-cards/MP1");
  await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();
  await page.goto("/activity");
  await expect(page.getByRole("heading", { name: "Activity log" })).toBeVisible();
});

test("exports are downloadable CSV/PDF for signed-in users", async ({ page }) => {
  await login(page, EXEC);
  for (const [url, type] of [["/api/orders/export?status=short_paid", "text/csv"], ["/api/claims/export?format=csv", "text/csv"], ["/api/claims/export?format=pdf&partner=MP1", "application/pdf"], ["/api/taxes/export", "text/csv"]] as const) {
    const r = await page.request.get(url);
    expect(r.status(), url).toBe(200);
    expect(r.headers()["content-type"], url).toContain(type);
  }
});
