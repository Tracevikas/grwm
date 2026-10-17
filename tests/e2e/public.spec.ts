import { expect, test } from "@playwright/test";

// Signed-out behaviour. Safe to run anywhere: nothing is written to Supabase.

test("redirects signed-out visitors to the login page", async ({ page }) => {
  for (const path of ["/", "/log", "/outfits", "/items/00000000-0000-0000-0000-000000000000"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
  }
});

test("login page offers Google and an emailed sign-in link", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: /get ready with me/i })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Email me a sign-in link" })).toBeVisible();
  await expect(page.getByPlaceholder("Password")).toHaveCount(0);
});

test("Continue with Google hands off to Supabase's Google authorize URL", async ({ page }) => {
  await page.goto("/login");
  // Stop at the hand-off: don't actually visit Supabase or Google.
  const handoff = page.waitForRequest((r) => /\/auth\/v1\/authorize\?.*provider=google/.test(r.url()));
  await page.route(/\/auth\/v1\/authorize/, (route) => route.abort());
  await page.getByRole("button", { name: "Continue with Google" }).click();
  const url = new URL((await handoff).url());
  expect(url.searchParams.get("redirect_to")).toMatch(/\/auth\/callback$/);
});

test("a failed Google return shows Supabase's reason", async ({ page }) => {
  await page.goto("/auth/callback?code=not-a-real-code");
  await expect(page).toHaveURL(/\/login\?error=link&reason=/);
  await expect(page.getByText(/Sign-in didn't finish/)).toBeVisible();
});

test("an expired email link explains what to do", async ({ page }) => {
  await page.goto("/auth/confirm#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired");
  await expect(page.getByText("This sign-in link has expired or was already used.")).toBeVisible();
  // Tokens and errors are cleared from the address bar.
  await expect(page).toHaveURL(/\/auth\/confirm$/);
  await page.getByRole("link", { name: "Back to sign in" }).click();
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
  await expect(page).toHaveURL(/\/login\?error=link$/);
});
