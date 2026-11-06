import { NextResponse, type NextRequest } from "next/server";
import { callbackRedirect } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

/** OAuth / email-confirmation landing: exchanges the PKCE code for a session cookie. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const code = request.nextUrl.searchParams.get("code");
  let ok = false;
  if (code) {
    const { error } = await (await createClient()).auth.exchangeCodeForSession(code);
    ok = !error;
  }
  return NextResponse.redirect(new URL(callbackRedirect(locale, ok), request.url));
}
