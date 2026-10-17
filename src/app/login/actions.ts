"use server";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Sends the sign-in email using the implicit flow. The SSR clients use PKCE,
 * which ties the link to the browser that asked for it, so tapping it in the
 * Gmail or Mail app (a different browser) fails. Implicit links carry the
 * session themselves and work in any browser; /auth/confirm stores it.
 */
function emailLinkClient() {
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export type AuthState = {
  error?: string;
  /** Set once a code has been emailed; the form moves to the code step. */
  email?: string;
};

async function origin() {
  return (await headers()).get("origin") ?? "";
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Emails a sign-in link (and a code, if the template shows one), creating the account if new. */
export async function sendCode(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL.test(email)) return { error: "Enter a valid email address." };

  const { error } = await emailLinkClient().auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, emailRedirectTo: `${await origin()}/auth/confirm` },
  });
  if (error) {
    if (error.status === 429) return { error: "Too many emails requested. Wait a minute and try again.", email };
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
  if (error) return { error: "That code is wrong or has expired. Check the email or send a new link.", email };
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
