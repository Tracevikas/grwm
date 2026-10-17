"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AuthState = {
  error?: string;
  /** Set once a code has been emailed; the form moves to the code step. */
  email?: string;
};

async function origin() {
  return (await headers()).get("origin") ?? "";
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Emails a one-time code (and a sign-in link) to the address, creating the account if new. */
export async function sendCode(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL.test(email)) return { error: "Enter a valid email address." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, emailRedirectTo: `${await origin()}/auth/callback` },
  });
  if (error) {
    if (error.status === 429) return { error: "Too many codes requested. Wait a minute and try again.", email };
    return { error: error.message };
  }
  return { email };
}

/** Checks the emailed code and signs the user in. */
export async function verifyCode(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const token = String(formData.get("code") ?? "").replace(/\s/g, "");
  if (!/^\d{6,10}$/.test(token)) return { error: "Enter the code from the email.", email };

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) return { error: "That code is wrong or has expired. Check the email or send a new code.", email };
  redirect("/");
}

export async function signInWithGoogle() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${await origin()}/auth/callback` },
  });
  if (error || !data.url) redirect("/login?error=google");
  redirect(data.url);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
