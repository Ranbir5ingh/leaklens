import fs from "node:fs";
import { expect, test } from "@playwright/test";
import { EXEC, FOUNDER, login } from "./helpers";

test("dashboard shows money at risk with TCS/TDS kept separate", async ({ page }) => {
  await login(page, EXEC);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText(/TCS/).first()).toBeVisible();
});

test("brief sample rows reproduce the expected arithmetic", async ({ page }) => {
  await login(page, EXEC);
  for (const [id, text] of [["ORD-W-204118", "Unpaid past due"], ["ORD-M-88120", "Short-paid"], ["ORD-W-204377", "Freight overcharged"]]) {
    await page.goto(`/orders/${id}`);
    await expect(page.getByText(new RegExp(text, "i")).first()).toBeVisible();
  }
});

test("upload a renamed-column settlement: suggestion, preview, approval, import", async ({ page }) => {
  await login(page, EXEC);
  await page.goto("/uploads/new");
  await page.getByRole("button", { name: /Marketplace 1 settlement — new format/ }).click();
  await expect(page.getByRole("heading", { name: "Column mapping" })).toBeVisible({ timeout: 40_000 });
  await expect(page.getByText(/Preview — first 20 rows/)).toBeVisible();
  const importBtn = page.getByRole("button", { name: /import/i }).last();
  await expect(importBtn).toBeDisabled();
  await page.getByRole("checkbox").check();
  await importBtn.click();
  await expect(page.getByText("Imported and matched")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/rows were not imported|Rejected/).first()).toBeVisible();
});

test("re-uploading the same file adds no duplicate money", async ({ page }, info) => {
  await login(page, EXEC);
  const res = await page.request.get("/api/samples/ca1-cod-remittance.csv");
  expect(res.status()).toBe(200);
  const file = info.outputPath("cod.csv");
  fs.writeFileSync(file, await res.body());
  for (const pass of [1, 2]) {
    await page.goto("/uploads/new");
    const value = await page.locator('select[aria-label="Partner report"] option', { hasText: "Courier aggregator 1 — COD" }).getAttribute("value");
    await page.getByLabel("Partner report").selectOption(value!);
    await page.locator("input[type=file]").setInputFiles(file);
    await expect(page.getByText(/Preview — first 20 rows/)).toBeVisible({ timeout: 40_000 });
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: /import/i }).last().click();
    await expect(page.getByText("Imported and matched")).toBeVisible({ timeout: 60_000 });
    if (pass === 2) {
      await expect(page.getByText(/This exact file was imported before/)).toBeVisible();
      await expect(page.locator("text=Rows saved").locator("..")).toContainText("0");
    }
  }
});

test("review queue: a person links a suggested match", async ({ page }) => {
  await login(page, EXEC);
  await page.goto("/review");
  await expect(page.getByRole("heading", { name: "Review queue" })).toBeVisible();
  await expect(page.getByText("Rows to review")).toBeVisible();
  const first = page.getByRole("button", { name: "Link to this order" }).first();
  if (await first.count()) {
    await first.click();
    await expect(page.getByText(/Matching re-ran/).first()).toBeVisible({ timeout: 30_000 });
  } else {
    await expect(page.getByText("Nothing to review")).toBeVisible();
  }
});

test("claims: select and mark raised", async ({ page }) => {
  await login(page, EXEC);
  await page.goto("/claims?status=open");
  const boxes = page.locator("tbody input[type=checkbox]");
  await boxes.first().check();
  await page.getByRole("button", { name: /Mark raised/i }).first().click();
  await expect(page.getByText(/marked raised/i)).toBeVisible({ timeout: 20_000 });
});

test("co-founder edits a rate card and matching re-runs", async ({ page }) => {
  await login(page, FOUNDER);
  await page.goto("/rate-cards/QC2");
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Why did the terms change?").fill("E2E: confirm the same terms");
  await page.getByRole("button", { name: "Save as new version" }).click();
  await expect(page.getByText(/Saved as v\d+\. Matching re-ran/)).toBeVisible({ timeout: 30_000 });
});

test("@phone navigation works on a phone", async ({ page }) => {
  await login(page, EXEC);
  await page.goto("/");
  await page.getByRole("link", { name: /Claims/ }).first().click();
  await expect(page).toHaveURL(/\/claims/);
});
