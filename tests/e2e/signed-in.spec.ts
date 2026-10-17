import fs from "node:fs";
import { createServerClient } from "@supabase/ssr";
import { expect, test, type Page } from "@playwright/test";

// Runs against your real Supabase project with a dedicated test account:
//   E2E_EMAIL, E2E_PASSWORD  → navigation tests (give the test user a password in
//     Supabase → Authentication → Users; the app itself is passwordless)
//   E2E_PHOTO (path to a full-length outfit photo) → also the full upload + OpenAI flow,
//   which costs one vision call and cleans up the outfit it creates.
const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;
const photo = process.env.E2E_PHOTO;

test.skip(!email || !password, "Set E2E_EMAIL and E2E_PASSWORD to run signed-in tests");

/**
 * Signs in through the Supabase API and hands the session cookies to the
 * browser, so tests don't need to read a code from an inbox.
 */
async function signIn(page: Page, baseURL: string) {
  const cookies: { name: string; value: string }[] = [];
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => cookies,
      setAll: (toSet) => toSet.forEach(({ name, value }) => cookies.push({ name, value })),
    },
  });
  const { error } = await supabase.auth.signInWithPassword({ email: email!, password: password! });
  if (error) throw new Error(`Test sign-in failed: ${error.message}`);

  await page.context().addCookies(cookies.map((c) => ({ ...c, url: baseURL })));
  await page.goto("/");
  await expect(page).toHaveURL(/\/$/);
}

test.beforeEach(async ({ page, baseURL }) => {
  await signIn(page, baseURL!);
});

test("wardrobe, history and log tabs work without errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await expect(page.getByRole("heading", { name: /^\d+ pieces?$/ })).toBeVisible();

  await page.getByRole("link", { name: "Diary" }).click();
  await expect(page.getByRole("heading", { name: "Diary" })).toBeVisible();

  await page.getByRole("link", { name: "Log outfit" }).click();
  await expect(page.getByRole("heading", { name: "What are you wearing?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save to my wardrobe" })).toBeDisabled();
  // Date defaults to the browser's today.
  const today = await page.evaluate(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  });
  await expect(page.getByLabel("Worn on")).toHaveValue(today);

  await page.getByRole("link", { name: "Wardrobe" }).click();
  await expect(page.getByRole("heading", { name: /^\d+ pieces?$/ })).toBeVisible();

  expect(errors).toEqual([]);
});

test("category filter and search update the URL", async ({ page }) => {
  // Filters only show once the wardrobe has pieces.
  test.skip(await page.getByText("Your wardrobe fills itself.").isVisible(), "Wardrobe is empty");
  await page.getByRole("link", { name: "Shoes" }).click();
  await expect(page).toHaveURL(/category=shoes/);

  await page.getByPlaceholder(/Search/).fill("zzz-no-such-item");
  await page.getByPlaceholder(/Search/).press("Enter");
  await expect(page).toHaveURL(/q=zzz-no-such-item/);
  await expect(page).toHaveURL(/category=shoes/);
  await expect(page.getByText("Nothing matches that yet.")).toBeVisible();
});

test("sign out returns to login", async ({ page }) => {
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});

test("logs an outfit photo end to end and catalogues its pieces", async ({ page }) => {
  test.skip(!photo || !fs.existsSync(photo), "Set E2E_PHOTO to a full-length outfit photo to run the AI flow");
  test.setTimeout(120_000);

  await page.goto("/log");
  await page.getByLabel("Choose a photo from your gallery").setInputFiles(photo!);
  await expect(page.getByAltText("Outfit preview")).toBeVisible();
  await page.getByLabel("Note").fill("e2e test");
  await page.getByRole("button", { name: "Save to my wardrobe" }).click();

  await expect(page.getByText(/Saved \d+ pieces/)).toBeVisible({ timeout: 90_000 });

  await page.getByRole("link", { name: "Review outfit" }).click();
  await expect(page).toHaveURL(/\/outfits\/[0-9a-f-]{36}$/);
  await expect(page.getByText("e2e test")).toBeVisible();
  const pieces = page.locator("ul li a[href^='/items/']");
  expect(await pieces.count()).toBeGreaterThan(0);

  // Open one catalogued item and check it links back to this outfit.
  const outfitUrl = page.url();
  await pieces.first().click();
  await expect(page).toHaveURL(/\/items\/[0-9a-f-]{36}$/);
  await expect(page.getByText(/times? worn/)).toBeVisible();
  await expect(page.locator(`a[href='${new URL(outfitUrl).pathname}']`)).toBeVisible();

  // Clean up the outfit (items stay in the wardrobe, like real usage).
  await page.goto(outfitUrl);
  await page.getByRole("button", { name: "Delete outfit" }).click();
  await expect(page).toHaveURL(/\/outfits$/);
});
