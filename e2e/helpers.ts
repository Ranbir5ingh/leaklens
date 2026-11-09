import { expect, type Page } from "@playwright/test";

export const EXEC = { email: "exec@leaklens.demo", password: process.env.SEED_EXEC_PASSWORD ?? "Exec@Demo2026" };
export const FOUNDER = { email: "cofounder@leaklens.demo", password: process.env.SEED_COFOUNDER_PASSWORD ?? "Founder@Demo2026" };

export async function login(page: Page, who: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("Work email").fill(who.email);
  await page.getByLabel("Password").fill(who.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
}
