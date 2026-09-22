import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";
import { getSupabaseEnv } from "./env";

const PUBLIC_ROUTES = ["/login", "/signup"];
const PUBLIC_PREFIXES = ["/auth"];
const PROTECTED_PREFIXES = ["/dashboard", "/onboarding"];

function isPublicRoute(pathname: string) {
  return (
    PUBLIC_ROUTES.includes(pathname) ||
    PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  );
}

function isProtectedRoute(pathname: string) {
  return PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

const MOBILE_RESTRICTED_PATH = "/mobile-restricted";
// Just the app itself (sign-in and everything past it) — the public
// landing page, public forms, and the public join link stay open to
// everyone regardless of device, since those are meant to be filled out
// by anyone, phone included.
const MOBILE_BLOCKED_ROUTES = ["/login", "/signup"];
const MOBILE_BLOCKED_PREFIXES = ["/dashboard", "/onboarding"];

// Phones only. Deliberately narrow: real tablets should keep working.
// iPadOS 13+ Safari reports a desktop-class UA by default (no "iPad" or
// "Mobile" token) so iPads already fall outside this pattern; Android
// tablets conventionally omit "Mobile" from their UA even though they
// contain "Android", which is what "Android.*Mobile" (not bare "Android")
// specifically relies on. A dedicated mobile app is planned to cover
// phones properly — this reserves that ground rather than shipping a
// half-responsive experience there in the meantime.
const MOBILE_PHONE_UA = /iPhone|iPod|Android.*Mobile|Windows Phone|BlackBerry|Opera Mini|IEMobile/i;

function isMobileBlockedPath(pathname: string) {
  return (
    MOBILE_BLOCKED_ROUTES.includes(pathname) ||
    MOBILE_BLOCKED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
  );
}

function isMobilePhone(userAgent: string | null): boolean {
  return userAgent ? MOBILE_PHONE_UA.test(userAgent) : false;
}

// Refreshes the Supabase session cookie on every request and performs
// optimistic route protection, per the Next.js Proxy + Supabase SSR pattern.
// This is the app's single source of truth for which routes require auth —
// individual pages/layouts should not duplicate this check.
export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Checked first, and before any Supabase call — a blocked phone request
  // never needs a session refresh.
  if (isMobileBlockedPath(pathname) && isMobilePhone(request.headers.get("user-agent"))) {
    return NextResponse.redirect(new URL(MOBILE_RESTRICTED_PATH, request.url));
  }

  let response = NextResponse.next({ request });

  const { url, anonKey } = getSupabaseEnv();

  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Do not run any logic between createServerClient and getUser — it
  // refreshes the auth token and must run on every request.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (isProtectedRoute(pathname) && !user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (user && isPublicRoute(pathname)) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return response;
}
