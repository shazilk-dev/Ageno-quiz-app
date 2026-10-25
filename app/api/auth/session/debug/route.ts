import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { headers } from "next/headers";
import { auth } from "@/firebase/admin";
import { devRoutesEnabled } from "@/lib/dev-routes";

/**
 * Debug endpoint to check session cookie state 
 * Provides extended diagnostics for mobile/browser debugging
 */
export async function GET() {
  // Development only: it describes the caller's cookies and session. The middleware already hides it in
  // production; this keeps it hidden even if that ever changes.
  if (!devRoutesEnabled()) {
    return new NextResponse("Not found", { status: 404 });
  }

  try {
    const cookiesStore = await cookies();
    const sessionCookie = cookiesStore.get("session")?.value;
    const userRole = cookiesStore.get("user_role")?.value;

    // Get all cookies for debugging
    const allCookies = cookiesStore.getAll();
    
    // Get headers for device info
    const headersList = await headers();
    const userAgent = headersList.get('user-agent') || 'unknown';
    
    // Mobile detection (similar to client-side)
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
    
    // Verify the session cookie if it exists
    let sessionValid = false;
    let sessionData = null;
    let sessionError = null;
    
    if (sessionCookie) {
      try {
        const decodedClaims = await auth.verifySessionCookie(sessionCookie, true);
        sessionValid = true;
        sessionData = {
          uid: decodedClaims.uid,
          email: decodedClaims.email,
          role: decodedClaims.role || 'user'
        };
      } catch (error) {
        sessionError = error instanceof Error ? error.message : 'Unknown error';
      }
    }

    return NextResponse.json({
      device: {
        userAgent,
        isMobile,
        platform: headersList.get('sec-ch-ua-platform') || 'unknown'
      },
      cookies: {
        hasCookies: allCookies.length > 0,
        hasSessionCookie: !!sessionCookie,
        cookieNames: allCookies.map(cookie => cookie.name),
        sessionCookieLength: sessionCookie ? sessionCookie.length : 0,
        userRole: userRole || null
      },
      session: {
        valid: sessionValid,
        data: sessionData,
        error: sessionError
      },
      timestamp: new Date().toISOString()
    }, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        "Pragma": "no-cache"
      }
    });
  } catch (error) {
    console.error("Session debug error:", error);
    return NextResponse.json(
      { 
        error: "Failed to debug session",
        message: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}
