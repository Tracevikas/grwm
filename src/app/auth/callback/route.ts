import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Landing point for Google sign-in (PKCE: Supabase sends back a one-time code).
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}/`);
    console.warn("auth/callback: code exchange failed:", error.message);
    return failed(
      origin,
      /code verifier/i.test(error.message) ? "it finished in a different browser from the one you started in" : error.message,
    );
  }

  // Supabase reports provider problems (e.g. Google misconfigured) as query params.
  const reason = searchParams.get("error_description") ?? searchParams.get("error");
  console.warn("auth/callback: no code:", reason ?? "(no reason given)");
  return failed(origin, reason);
}

function failed(origin: string, reason: string | null) {
  const url = new URL("/login", origin);
  url.searchParams.set("error", "link");
  if (reason) url.searchParams.set("reason", reason.slice(0, 200));
  return NextResponse.redirect(url);
}
