import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { fakeSupabase } from "./fake-supabase";

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("REDIRECT"), { url });
  },
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ origin: "http://localhost:3000" }),
}));

let fake = fakeSupabase();
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => fake.client }));
// The email link is sent with a separate implicit-flow client.
const createSupabaseClient = vi.fn<(...args: unknown[]) => unknown>(() => fake.client);
vi.mock("@supabase/supabase-js", () => ({ createClient: (...a: unknown[]) => createSupabaseClient(...a) }));

import { GET as callback } from "@/app/auth/callback/route";
import { sendCode, signInWithGoogle, signOut, verifyCode } from "@/app/login/actions";

const form = (entries: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
};

describe("sendCode", () => {
  beforeEach(() => {
    fake = fakeSupabase();
  });

  it("emails a sign-in link to /auth/confirm, creating the account if needed", async () => {
    await expect(sendCode({}, form({ email: "  Riya@Example.com " }))).resolves.toEqual({ email: "riya@example.com" });
    expect(fake.client.auth.signInWithOtp).toHaveBeenCalledWith({
      email: "riya@example.com",
      options: { shouldCreateUser: true, emailRedirectTo: "http://localhost:3000/auth/confirm" },
    });
  });

  it("uses the implicit flow so the link works in any browser", async () => {
    await sendCode({}, form({ email: "a@b.co" }));
    const options = createSupabaseClient.mock.calls.at(-1)![2] as { auth: { flowType: string; persistSession: boolean } };
    expect(options.auth).toMatchObject({ flowType: "implicit", persistSession: false });
  });

  it("rejects invalid addresses without calling Supabase", async () => {
    await expect(sendCode({}, form({ email: "not-an-email" }))).resolves.toEqual({ error: "Enter a valid email address." });
    expect(fake.client.auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it("keeps the user on the code step when rate limited", async () => {
    fake.client.auth.signInWithOtp.mockResolvedValue({ data: {}, error: { message: "rate limit", status: 429 } });
    await expect(sendCode({}, form({ email: "a@b.co" }))).resolves.toEqual({
      error: expect.stringContaining("Wait a minute"),
      email: "a@b.co",
    });
  });

  it("surfaces other Supabase errors", async () => {
    fake.client.auth.signInWithOtp.mockResolvedValue({ data: {}, error: { message: "Signups not allowed" } });
    await expect(sendCode({}, form({ email: "a@b.co" }))).resolves.toEqual({ error: "Signups not allowed" });
  });
});

describe("verifyCode", () => {
  beforeEach(() => {
    fake = fakeSupabase();
  });

  it("signs in with the code and goes home", async () => {
    await expect(verifyCode({}, form({ email: "a@b.co", code: "123 456" }))).rejects.toMatchObject({ url: "/" });
    expect(fake.client.auth.verifyOtp).toHaveBeenCalledWith({ email: "a@b.co", token: "123456", type: "email" });
  });

  it("rejects codes that aren't digits", async () => {
    await expect(verifyCode({}, form({ email: "a@b.co", code: "12ab" }))).resolves.toEqual({
      error: "Enter the code from the email.",
      email: "a@b.co",
    });
    expect(fake.client.auth.verifyOtp).not.toHaveBeenCalled();
  });

  it("explains a wrong or expired code and stays on the code step", async () => {
    fake.client.auth.verifyOtp.mockResolvedValue({ data: {}, error: { message: "Token has expired or is invalid" } });
    await expect(verifyCode({}, form({ email: "a@b.co", code: "000000" }))).resolves.toEqual({
      error: expect.stringContaining("wrong or has expired"),
      email: "a@b.co",
    });
  });
});

describe("signInWithGoogle", () => {
  beforeEach(() => {
    fake = fakeSupabase();
  });

  it("sends the user to Google via Supabase, returning to the callback", async () => {
    await expect(signInWithGoogle()).rejects.toMatchObject({ url: "https://test.supabase.co/auth/v1/authorize?provider=google" });
    expect(fake.client.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: "http://localhost:3000/auth/callback" },
    });
  });

  it("returns to login with a message if it can't start", async () => {
    fake.client.auth.signInWithOAuth.mockResolvedValue({ data: { url: null }, error: { message: "provider disabled" } });
    await expect(signInWithGoogle()).rejects.toMatchObject({ url: "/login?error=google" });
  });
});

it("signOut ends the session and goes to /login", async () => {
  fake = fakeSupabase();
  await expect(signOut()).rejects.toMatchObject({ url: "/login" });
  expect(fake.client.auth.signOut).toHaveBeenCalled();
});

describe("GET /auth/callback", () => {
  beforeEach(() => {
    fake = fakeSupabase();
  });

  it("exchanges the code and goes home", async () => {
    const res = await callback(new NextRequest("http://localhost:3000/auth/callback?code=abc"));
    expect(fake.client.auth.exchangeCodeForSession).toHaveBeenCalledWith("abc");
    expect(res.headers.get("location")).toBe("http://localhost:3000/");
  });

  it("sends bad or missing codes back to /login with the reason", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    fake.client.auth.exchangeCodeForSession.mockResolvedValue({ error: { message: "code verifier not found" } } as never);
    const bad = await callback(new NextRequest("http://localhost:3000/auth/callback?code=old"));
    expect(new URL(bad.headers.get("location")!).searchParams.get("reason")).toBe(
      "it finished in a different browser from the one you started in",
    );

    fake.client.auth.exchangeCodeForSession.mockResolvedValue({ error: { message: "Invalid grant" } } as never);
    const other = await callback(new NextRequest("http://localhost:3000/auth/callback?code=old"));
    expect(other.headers.get("location")).toBe("http://localhost:3000/login?error=link&reason=Invalid+grant");

    const missing = await callback(new NextRequest("http://localhost:3000/auth/callback"));
    expect(missing.headers.get("location")).toBe("http://localhost:3000/login?error=link");
  });

  it("passes on provider errors that Supabase reports, e.g. Google misconfigured", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await callback(
      new NextRequest("http://localhost:3000/auth/callback?error=server_error&error_description=Unable+to+exchange+external+code"),
    );
    expect(res.headers.get("location")).toBe("http://localhost:3000/login?error=link&reason=Unable+to+exchange+external+code");
    expect(fake.client.auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });
});
