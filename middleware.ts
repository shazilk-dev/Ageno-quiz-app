import { NextRequest, NextResponse } from "next/server";

// Define public paths that don't require authentication
const PUBLIC_PATHS = [
  "/",
  "/sign-in",
  "/sign-up",
  "/reset-password",
  "/verify-email",
  "/api/auth/session",
  "/api/auth/session/check",
  "/quiz/join",
  "/join",
  "/leaderboard",
];

// Static assets patterns to bypass middleware
const STATIC_FILE_PATTERNS = [
  /^\/_next\//,
  /^\/favicon\.ico$/,
  /^\/robots\.txt$/,
  /^\/manifest\.json$/,
  /^\/sitemap\.xml$/,
  /\.(svg|png|jpg|jpeg|gif|webp|ico|ttf|woff|woff2|eot|otf|css|js|json|map)$/,
];

// Function to check if a path is public
const isPublicPath = (pathname: string): boolean => {
  // Check against exact matches in PUBLIC_PATHS
  if (PUBLIC_PATHS.includes(pathname)) {
    return true;
  }
  
  // Check against static file patterns
  if (STATIC_FILE_PATTERNS.some(pattern => pattern.test(pathname))) {
    return true;
  }
  
  // Check path prefixes
  if (
    pathname.startsWith("/api/auth/session") ||
    pathname.startsWith("/api/auth/user/public") ||
    // These check the caller's ID token themselves (guests are allowed to take open quizzes).
    pathname.startsWith("/api/attempts") ||
    pathname.startsWith("/api/quizzes/") ||
    pathname.startsWith("/join") ||
    pathname.startsWith("/quiz/join") ||
    pathname.startsWith("/leaderboard") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/(dev)") || // Allow access to development routes
    pathname.includes("/auth-test") || // Explicitly allow access to auth-test page
    pathname.includes("/useauth-test") // Explicitly allow access to useauth-test page
  ) {
    return true;
  }
  
  // Check for valid quiz code pattern (6+ alphanumeric characters)
  const QUIZ_CODE_PATTERN = /^\/[A-Za-z0-9]{6,}$/;
  if (QUIZ_CODE_PATTERN.test(pathname)) {
    return true;
  }
  
  return false;
};

// Check if a path is an admin path
const isAdminPath = (pathname: string): boolean => {
  return (
    pathname.startsWith("/admin") ||
    pathname.includes("/admin/") ||
    pathname.startsWith("/(admin)")
  );
};

export async function middleware(request: NextRequest) {
  const session = request.cookies.get("session")?.value;
  const userRole = request.cookies.get("user_role")?.value;
  const pathname = request.nextUrl.pathname;

  // 1. Allow access to public paths without authentication
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // 2. Check if session exists
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

  // 3. Check admin access
  if (isAdminPath(pathname) && userRole !== "admin") {
    // For API routes, return 403 instead of redirect
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      );
    }
    
    // Redirect non-admin users to home
    return NextResponse.redirect(new URL("/", request.url));
  }

  // User is authenticated and authorized
  return NextResponse.next();
}

/**
 * Redirect to sign-in page with the current URL as redirect target
 */
function redirectToSignIn(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = "/sign-in";
  
  // Get original path with query parameters
  const fullPath = request.nextUrl.pathname + 
    (request.nextUrl.search ? request.nextUrl.search : "");
  
  // Properly encode the redirect path
  url.search = `redirectTo=${encodeURIComponent(fullPath)}`;
  
  // Return response with cache-control headers to prevent caching redirects
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
    "/api/:path*"
  ],
};
