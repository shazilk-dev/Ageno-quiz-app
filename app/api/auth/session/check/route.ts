import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/firebase/admin";

// Cache control headers to prevent caching of session responses
const CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  "Pragma": "no-cache",
  "Expires": "0",
  "Surrogate-Control": "no-store"
};

/** A bad session: say why, and clear every session cookie so the browser stops presenting it. */
function clearedCookieResponse(reason: string) {
  const response = NextResponse.json(
    { isAuthenticated: false, reason },
    { status: 401, headers: CACHE_HEADERS }
  );
  for (const name of ["session", "user_role", "signed_in"]) {
    response.cookies.set(name, "", { maxAge: 0, path: "/" });
  }
  return response;
}

/**
 * Who is signed in, according to the session cookie. One verification, revocation included; everything
 * returned comes from the verified cookie (the role is the custom claim), so no database read is needed.
 */
export async function GET() {
  const sessionCookie = (await cookies()).get("session")?.value;

  // No session cookie: nobody is signed in. That is an answer, not an error, so it is a 200 (a 401 here
  // shows up as a red error in every signed-out visitor's console). An invalid or revoked session below
  // is still a 401.
  if (!sessionCookie) {
    return NextResponse.json(
      { isAuthenticated: false, reason: "no_cookie" },
      { status: 200, headers: CACHE_HEADERS }
    );
  }

  let decoded;
  try {
    decoded = await auth.verifySessionCookie(sessionCookie, true);
  } catch (error) {
    if ((error as { code?: string }).code === "auth/session-cookie-revoked") {
      return clearedCookieResponse("token_revoked");
    }
    console.error("Invalid session cookie:", error);
    return clearedCookieResponse("invalid_token");
  }

  return NextResponse.json(
    {
      isAuthenticated: true,
      user: {
        uid: decoded.uid,
        email: decoded.email || null,
        displayName: decoded.name || null,
        emailVerified: decoded.email_verified || false,
        photoURL: decoded.picture || null,
        role: decoded.role || "user",
      },
    },
    { status: 200, headers: CACHE_HEADERS }
  );
}
