import { expect, test } from "@playwright/test";

// Signed-out behaviour. Safe to run anywhere: nothing is written to Supabase.

test("redirects signed-out visitors to the login page", async ({ page }) => {
  for (const path of ["/", "/log", "/outfits", "/items/00000000-0000-0000-0000-000000000000"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
  }
});

test("login page renders and toggles to sign up", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: /get ready with me/i })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();

  await page.getByRole("button", { name: /Create an account/ }).click();
  await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
});

test("wrong credentials show Supabase's error", async ({ page }) => {
  await page.goto("/login");
  await page.getByPlaceholder("Email").fill("nobody-e2e@example.com");
  await page.getByPlaceholder("Password").fill("definitely-wrong");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText(/invalid login credentials/i)).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test("analyze API refuses signed-out requests", async ({ request }) => {
  const res = await request.post("/api/outfits/00000000-0000-0000-0000-000000000000/analyze");
  expect(res.status()).toBe(401);
});

test("PWA manifest and icon are served", async ({ request }) => {
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBe(true);
  expect(await manifest.json()).toMatchObject({ short_name: "GRWM", display: "standalone", start_url: "/" });

  const icon = await request.get("/icon.svg");
  expect(icon.ok()).toBe(true);
  expect(icon.headers()["content-type"]).toContain("svg");
});

test("auth callback without a code returns to login", async ({ page }) => {
  await page.goto("/auth/callback");
  await expect(page).toHaveURL(/\/login$/);
});
