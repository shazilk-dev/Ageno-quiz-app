/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { auth, db } from "@/firebase/admin";
import { cookies } from "next/headers";
import admin from "firebase-admin";

// Session expiration time (14 days in seconds)
const SESSION_EXPIRATION_TIME = 60 * 60 * 24 * 14;

export async function POST(request: NextRequest) {
  try {
    const { idToken } = await request.json();

    if (!idToken) {
      return NextResponse.json({ error: "Missing ID token" }, { status: 400 });
    }
    
    try {
      // 1. Verify the ID token
      let decodedToken;
      try {
        decodedToken = await auth.verifyIdToken(idToken, true);
      } catch (verifyError: any) {
        console.error("Token verification failed:", verifyError);
        
        return NextResponse.json(
          {
            error: "Invalid ID token",
            message: verifyError instanceof Error ? verifyError.message : "Unknown error",
            code: verifyError.code || "unknown_error",
          },
          { status: 401 }
        );
      }

      const uid = decodedToken.uid;
      
      // 2. Get or update user document
      let userRole = "user";
      try {
        const userDoc = await db.collection("users").doc(uid).get();

        if (userDoc.exists) {
          // Update existing user document with new login timestamp
          const userData = userDoc.data();
          userRole = userData?.role || "user";

          // Update in a non-blocking way to improve performance
          db.collection("users").doc(uid).update({
            lastLoginAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          }).catch(error => {
            console.warn("Non-critical error updating user document:", error);
          });
        } else {
          // Create new user document with all required fields
          db.collection("users")
            .doc(uid)
            .set({
              email: decodedToken.email || "",
              displayName: decodedToken.name || "",
              role: "user",
              emailVerified: decodedToken.email_verified || false,
              photoURL: decodedToken.picture || null,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              lastLoginAt: admin.firestore.FieldValue.serverTimestamp(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              activityLogs: [],
              customClaims: {
                role: "user",
              },
            })
            .catch(error => {
              console.warn("Non-critical error creating user document:", error);
            });
        }
      } catch (firestoreError) {
        console.warn("Could not access Firestore for user document:", firestoreError);
        // Continue with session creation even if Firestore update fails
      }

      // 3. Ensure custom claims are set correctly (non-blocking)
      try {
        // Get current custom claims
        const userRecord = await auth.getUser(uid);
        const existingClaims = userRecord.customClaims || {};

        // Only update claims if role is missing or different
        if (existingClaims.role !== userRole) {
          auth.setCustomUserClaims(uid, {
            ...existingClaims,
            role: userRole,
          }).catch(error => {
            console.warn("Non-critical error updating custom claims:", error);
          });
        }
      } catch (claimsError) {
        console.warn("Could not verify custom claims:", claimsError);
      }

      // 4. Create a session cookie
      let sessionCookie;
      try {
        sessionCookie = await auth.createSessionCookie(idToken, {
          expiresIn: SESSION_EXPIRATION_TIME * 1000, // Firebase Auth uses milliseconds
        });
      } catch (cookieError: any) {
        console.error("Failed to create session cookie:", cookieError);

        return NextResponse.json(
          {
            error: "Failed to create session cookie",
            message: cookieError instanceof Error ? cookieError.message : "Unknown error",
            code: cookieError.code || "unknown_error",
          },
          { status: 401 }
        );
      }

      const cookiesStore = await cookies();

      // 5. Set session cookie for authentication with improved security
      cookiesStore.set({
        name: "session",
        value: sessionCookie,
        maxAge: SESSION_EXPIRATION_TIME,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production", 
        path: "/",
        sameSite: "lax", // "lax" allows the cookie to be sent with top-level navigations
      });

      // Set user role cookie for authorization in middleware
      cookiesStore.set({
        name: "user_role",
        value: userRole,
        maxAge: SESSION_EXPIRATION_TIME,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        path: "/",
        sameSite: "lax",
      });

      return NextResponse.json(
        {
          success: true,
          role: userRole,
          uid: uid,
        },
        { status: 200 }
      );
    } catch (sessionError: any) {
      console.error("Session error:", sessionError);
      return NextResponse.json(
        {
          error: "Session processing error",
          message: sessionError instanceof Error ? sessionError.message : "Unknown error",
          code: sessionError.code || "unknown_error",
        },
        { status: 401 }
      );
    }
  } catch (error: any) {
    console.error("Session creation error:", error);
    return NextResponse.json(
      {
        error: "Failed to create session",
        message: error instanceof Error ? error.message : "Unknown error",
        code: error.code || "unknown_error",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const cookiesStore = await cookies();

    // Clear session cookie
    cookiesStore.set({
      name: "session",
      value: "",
      maxAge: 0,
      path: "/",
    });

    // Clear user role cookie
    cookiesStore.set({
      name: "user_role",
      value: "",
      maxAge: 0,
      path: "/",
    });

    // Also revoke all Firebase sessions if we have a session cookie
    // This ensures user is logged out across all devices
    try {
      const sessionCookie = request.cookies.get("session")?.value;
      if (sessionCookie) {
        const decodedClaims = await auth.verifySessionCookie(sessionCookie);
        await auth.revokeRefreshTokens(decodedClaims.sub);
      }
    } catch (error) {
      // Non-critical error, still consider logout successful
      console.warn("Could not revoke refresh tokens:", error);
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("Session deletion error:", error);
    return NextResponse.json(
      { error: "Failed to delete session" },
      { status: 500 }
    );
  }
}
