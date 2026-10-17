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

import { GET as callback } from "@/app/auth/callback/route";
import { signIn, signOut, signUp } from "@/app/login/actions";

const creds = () => {
  const fd = new FormData();
  fd.set("email", "a@b.com");
  fd.set("password", "secret1");
  return fd;
};

describe("login actions", () => {
  beforeEach(() => {
    fake = fakeSupabase();
  });

  it("signIn returns the Supabase error message", async () => {
    fake.client.auth.signInWithPassword.mockResolvedValue({ data: {}, error: { message: "Invalid login credentials" } } as never);
    await expect(signIn({}, creds())).resolves.toEqual({ error: "Invalid login credentials" });
  });

  it("signIn redirects home on success", async () => {
    await expect(signIn({}, creds())).rejects.toMatchObject({ url: "/" });
    expect(fake.client.auth.signInWithPassword).toHaveBeenCalledWith({ email: "a@b.com", password: "secret1" });
  });

  it("signUp asks the user to confirm their email when there is no session yet", async () => {
    fake.client.auth.signUp.mockResolvedValue({ data: { session: null }, error: null } as never);
    await expect(signUp({}, creds())).resolves.toEqual({ message: expect.stringContaining("confirm your email") });
    expect(fake.client.auth.signUp).toHaveBeenCalledWith(
      expect.objectContaining({ options: { emailRedirectTo: "http://localhost:3000/auth/callback" } }),
    );
  });

  it("signUp redirects home when confirmation is disabled", async () => {
    await expect(signUp({}, creds())).rejects.toMatchObject({ url: "/" });
  });

  it("signUp surfaces errors", async () => {
    fake.client.auth.signUp.mockResolvedValue({ data: {}, error: { message: "Password too short" } } as never);
    await expect(signUp({}, creds())).resolves.toEqual({ error: "Password too short" });
  });

  it("signOut ends the session and goes to /login", async () => {
    await expect(signOut()).rejects.toMatchObject({ url: "/login" });
    expect(fake.client.auth.signOut).toHaveBeenCalled();
  });
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

  it("sends bad or missing codes back to /login", async () => {
    fake.client.auth.exchangeCodeForSession.mockResolvedValue({ error: { message: "expired" } } as never);
    const bad = await callback(new NextRequest("http://localhost:3000/auth/callback?code=old"));
    expect(bad.headers.get("location")).toBe("http://localhost:3000/login");

    const missing = await callback(new NextRequest("http://localhost:3000/auth/callback"));
    expect(missing.headers.get("location")).toBe("http://localhost:3000/login");
  });
});
