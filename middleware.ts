import { NextRequest, NextResponse } from "next/server";
import { devRoutesEnabled, isDevRoute } from "@/lib/dev-routes";

/**
 * First line of defence only. It runs on the edge, where the Firebase Admin SDK doesn't, so it can see
 * that a `session` cookie exists but not whether it is genuine. The real checks are on the server:
 * the admin layout verifies the session cookie and the role (`app/(admin)/layout.tsx`), and every API
 * route verifies the caller's token itself.
 */

// Pages anyone can open without signing in. Quiz lobbies (/q/...) are viewable; starting needs sign-in.
const PUBLIC_PATHS = new Set([
  "/",
  "/sign-in",
  "/sign-up",
  "/reset-password",
  "/verify-email",
  "/join",
]);

const PUBLIC_PREFIXES = [
  "/q/",
  // The quiz format's schema, templates and examples (`npm run build:format`): an AI tool fetches these.
  "/ageno-quiz/",
  "/api/auth/session",
  // These check the caller's ID token themselves. (`/api/auth/user` is called by sign-up, before there
  // is a session cookie.)
  "/api/auth/user",
  "/api/account",
  "/api/attempts",
  "/api/quizzes",
  "/api/leaderboard",
  "/api/admin",
  "/api/my-attempts",
];

// The admin screens as they are served (route groups don't appear in URLs).
const ADMIN_PREFIXES = [
  "/dashboard",
  "/quizzes",
  "/users",
  "/quiz-reports",
  "/settings",
];

// Static assets bypass the checks.
const STATIC_FILE_PATTERNS = [
  /^\/_next\//,
  /^\/favicon\.ico$/,
  /^\/robots\.txt$/,
  /^\/manifest\.json$/,
  /^\/sitemap\.xml$/,
  /\.(svg|png|jpg|jpeg|gif|webp|ico|ttf|woff|woff2|eot|otf|css|js|json|map)$/,
];

// Older shared links look like /<ACCESSCODE>. Codes are capitals and digits, which keeps ordinary pages
// such as /profile out of this rule.
const LEGACY_QUIZ_CODE = /^\/[A-Z0-9]{5,10}$/;

/** True for the path itself or anything below it ("/quizzes" and "/quizzes/abc", but not "/quizzes-extra"). */
const matchesPrefix = (pathname: string, prefixes: string[]) =>
  prefixes.some((prefix) => {
    const base = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
    return pathname === base || pathname.startsWith(`${base}/`);
  });

const isAdminPath = (pathname: string) => matchesPrefix(pathname, ADMIN_PREFIXES);

const isPublicPath = (pathname: string): boolean =>
  PUBLIC_PATHS.has(pathname) ||
  STATIC_FILE_PATTERNS.some((pattern) => pattern.test(pathname)) ||
  matchesPrefix(pathname, PUBLIC_PREFIXES) ||
  LEGACY_QUIZ_CODE.test(pathname);

export async function middleware(request: NextRequest) {
  const session = request.cookies.get("session")?.value;
  const userRole = request.cookies.get("user_role")?.value;
  const { pathname, search } = request.nextUrl;

  // 0. Development-only pages and endpoints don't exist in production.
  if (isDevRoute(pathname) && !devRoutesEnabled()) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Server components can't see the URL, so pass it on (the admin layout uses it to come back here).
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname + search);
  const next = () => NextResponse.next({ request: { headers: requestHeaders } });

  // 1. Admin screens: needs a session, and the role cookie is a cheap hint. It is not trusted: the admin
  //    layout verifies the session cookie and the role on the server before rendering anything.
  if (isAdminPath(pathname)) {
    if (!session) return redirectToSignIn(request);
    if (userRole !== "admin") return NextResponse.redirect(new URL("/", request.url));
    return next();
  }

  // 2. Public pages.
  if (isPublicPath(pathname)) return next();

  // 3. Everything else needs a session.
  if (!session) {
    // For API routes, return 401 instead of redirect
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }
    return redirectToSignIn(request);
  }

  return next();
}

/**
 * Redirect to sign-in page with the current URL as redirect target
 */
function redirectToSignIn(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = "/sign-in";

  const fullPath = request.nextUrl.pathname + request.nextUrl.search;
  url.search = `redirectTo=${encodeURIComponent(fullPath)}`;

  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}

/**
 * Configure paths that require middleware
 */
export const config = {
  matcher: [
    // Match all request paths except for static assets
    "/((?!_next/static|_next/image|favicon.ico).*)",

    // Also explicitly include API routes
    "/api/:path*",
  ],
};
