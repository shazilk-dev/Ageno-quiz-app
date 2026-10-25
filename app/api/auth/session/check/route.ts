/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { auth, db } from "@/firebase/admin";
import { cookies } from "next/headers";

// Cache control headers to prevent caching of session responses
const CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  "Pragma": "no-cache",
  "Expires": "0",
  "Surrogate-Control": "no-store" 
};

// Define interface for enhanced user with additional properties
interface EnhancedUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  emailVerified: boolean;
  photoURL: string | null;
  role: string;
  lastLoginAt?: unknown;
  createdAt?: unknown;
}

export async function GET() {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("session")?.value;

    // Helper function to create a response with cleared cookies
    const createClearedCookieResponse = (reason = "no_cookie") => {
      const response = NextResponse.json(
        { isAuthenticated: false, reason },
        { status: 401, headers: CACHE_HEADERS }
      );

      // Clear all auth cookies
      response.cookies.set("session", "", {
        maxAge: 0,
        path: "/",
      });

      response.cookies.set("user_role", "", {
        maxAge: 0,
        path: "/",
      });

      return response;
    };

    // If no session cookie, return unauthenticated response
    if (!sessionCookie) {
      return createClearedCookieResponse();
    }    try {
      // First try to verify without checking revocation
      let decodedClaims;
      try {
        // First step: verify session without checking revocation
        decodedClaims = await auth.verifySessionCookie(sessionCookie);
        
        // If that succeeded, try to verify with revocation check
        try {
          await auth.verifySessionCookie(sessionCookie, true);        } catch {
          // Session is valid but revoked, clear it
          return createClearedCookieResponse("token_revoked");
        }
      } catch (basicVerifyError) {
        // Session is completely invalid (not just revoked)
        console.error("Invalid session token format:", basicVerifyError);
        return createClearedCookieResponse("invalid_token");
      }
      
      const uid = decodedClaims.uid;
      
      // Initialize response with basic data from decoded claims
      const responseData = {
        isAuthenticated: true,
        user: {
          uid,
          email: decodedClaims.email || null,
          displayName: decodedClaims.name || null,
          emailVerified: decodedClaims.email_verified || false,
          photoURL: decodedClaims.picture || null,
          role: decodedClaims.role || "user",
        } as EnhancedUser
      };
      
      // Try to get additional user data from Firestore with a timeout
      try {
        // Create a timeout that rejects after 4000ms
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Firestore timeout')), 5000);
        });
        
        // Fetch user data
        const userDocPromise = db.collection("users").doc(uid).get();
        
        // Race between the Firestore query and the timeout
        const userDoc = await Promise.race([
          userDocPromise, 
          timeoutPromise
        ]) as any;
        
        if (userDoc && userDoc.exists) {
          const userData = userDoc.data() || {};
          
          // Only override with Firestore data if it exists
          if (userData) {
            // Update basic fields if they exist in Firestore
            if (userData.role) responseData.user.role = userData.role;
            if (userData.displayName) responseData.user.displayName = userData.displayName;
            if (userData.emailVerified !== undefined) responseData.user.emailVerified = userData.emailVerified;
            if (userData.photoURL) responseData.user.photoURL = userData.photoURL;
            
            // Add additional fields that only exist in Firestore
            responseData.user.lastLoginAt = userData.lastLoginAt || null;
            responseData.user.createdAt = userData.createdAt || null;
          }
        }
      } catch (firestoreError) {
        // Non-critical error, continue with just the claims data
        console.warn("Could not enhance session data with Firestore:", firestoreError);
      }
      
      // Return the authenticated response with cache headers
      const response = NextResponse.json(responseData, { status: 200 });
      
      // Set cache control headers to prevent caching
      Object.entries(CACHE_HEADERS).forEach(([key, value]) => {
        response.headers.set(key, value);
      });
      
      return response;
    } catch (verifyError) {
      console.error("Session verification error:", verifyError);
      // Session is invalid or revoked, clear it
      return createClearedCookieResponse("verification_error");
    }
  } catch (error) {
    console.error("Session check error:", error);
    // General error handling
    return NextResponse.json(
      {
        isAuthenticated: false,
        error: "Session check failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500, headers: CACHE_HEADERS }
    );
  }
}