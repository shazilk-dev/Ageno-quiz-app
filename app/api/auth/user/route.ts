/* eslint-disable @typescript-eslint/no-explicit-any */
import { after, NextRequest, NextResponse } from "next/server";
import { auth, db } from "@/firebase/admin";
import admin from "firebase-admin";
import { logActivity } from "@/lib/server/activity";
import { renameOnLeaderboard } from "@/lib/server/leaderboard-store";

/**
 * Creates or refreshes the signed-in person's own profile. Who they are comes from the verified ID token,
 * never from the request body, and a role is never taken from the caller: new profiles are `user`, and an
 * existing profile keeps the role it has (admins change roles from the admin screens). Without this a body
 * of `{ role: "admin" }` would make any signed-in person an admin.
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("Authorization");
    const idToken = authHeader?.startsWith("Bearer ")
      ? authHeader.substring(7)
      : null;

    if (!idToken) {
      return NextResponse.json(
        { error: "Missing or invalid authorization token" },
        { status: 401 }
      );
    }

    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(idToken);
    } catch (tokenError: any) {
      console.error("Invalid ID token:", tokenError);
      return NextResponse.json(
        { error: "Invalid authorization token" },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    const { uid: requestedUid, displayName, photoURL = null } = body as {
      uid?: unknown;
      displayName?: unknown;
      photoURL?: unknown;
    };

    const uid = decodedToken.uid;
    if (requestedUid !== undefined && requestedUid !== uid) {
      return NextResponse.json(
        { error: "You can only update your own profile" },
        { status: 403 }
      );
    }

    const profile = {
      displayName: typeof displayName === "string" ? displayName.slice(0, 200) : "",
      email: decodedToken.email ?? "",
      photoURL: typeof photoURL === "string" ? photoURL.slice(0, 2000) : null,
      emailVerified: decodedToken.email_verified ?? false,
    };

    try {
      const userRef = db.collection("users").doc(uid);
      const userDoc = await userRef.get();

      if (userDoc.exists) {
        await userRef.update({
          ...profile,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        if (userDoc.data()?.displayName !== profile.displayName) {
          after(() => renameOnLeaderboard(uid, profile.displayName));
        }
      } else {
        await userRef.set({
          ...profile,
          role: "user",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          lastLoginAt: admin.firestore.FieldValue.serverTimestamp(),
          activityLogs: [],
          customClaims: { role: "user" },
        });
        await auth.setCustomUserClaims(uid, { role: "user" });
        const userAgent = request.headers.get("user-agent");
        after(() => logActivity(uid, "account_created", { method: "email" }, userAgent));
      }

      return NextResponse.json(
        {
          success: true,
          message: userDoc.exists
            ? "User updated successfully"
            : "User created successfully",
        },
        { status: 200 }
      );
    } catch (firestoreError: any) {
      console.error("Error managing user document:", firestoreError);
      return NextResponse.json(
        { error: "Failed to manage user document" },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error("User management error:", error);
    return NextResponse.json({ error: "Failed to manage user" }, { status: 500 });
  }
}

// Get user data by ID - useful for admin panel
export async function GET(request: NextRequest) {
  try {
    // Verify the requester is authenticated and authorized
    const authHeader = request.headers.get("Authorization");
    const idToken = authHeader?.startsWith("Bearer ")
      ? authHeader.substring(7)
      : null;

    if (!idToken) {
      return NextResponse.json(
        { error: "Missing or invalid authorization token" },
        { status: 401 }
      );
    }

    // Verify the token and check admin role
    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(idToken);
      // Make sure the requester is an admin
      if (decodedToken.role !== "admin") {
        return NextResponse.json(
          { error: "Insufficient permissions" },
          { status: 403 }
        );
      }
    } catch (tokenError: any) {
      console.error("Invalid ID token:", tokenError);
      return NextResponse.json(
        { error: "Invalid authorization token" },
        { status: 401 }
      );
    }

    // Get user ID from query params
    const targetUserId = request.nextUrl.searchParams.get("uid");


    // Validate targetUserId format
    if (!targetUserId) {
      return NextResponse.json(
        { error: "Missing user ID parameter" },
        { status: 400 }
      );
    }

    // Ensure targetUserId is not an ID token (tokens are usually much longer than UIDs)
    if (targetUserId.length > 128) {
      console.error("Target user ID appears to be a token, not a UID");
      return NextResponse.json(
        { error: "Invalid user ID format" },
        { status: 400 }
      );
    }

    try {
      // Get user data from Firestore
      const userDoc = await db.collection("users").doc(targetUserId).get();

      if (!userDoc.exists) {
        console.warn(`User document not found for ID: ${targetUserId}`);
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }

      const userData = userDoc.data();

      // Get Auth user data for complete picture
      try {
        const userRecord = await auth.getUser(targetUserId);

        return NextResponse.json({
          success: true,
          user: {
            ...userData,
            uid: targetUserId,
            authDisplayName: userRecord.displayName,
            authPhotoURL: userRecord.photoURL,
            authEmailVerified: userRecord.emailVerified,
            authDisabled: userRecord.disabled,
            authProviders: userRecord.providerData.map(
              (provider) => provider.providerId
            ),
          },
        });
      } catch (authError: any) {
        console.error(
          `Error fetching auth user data for ID ${targetUserId}:`,
          authError
        );

        // Return partial data if Firestore data exists but Auth record fails
        return NextResponse.json({
          success: true,
          warning: "Limited user data available (Auth record not found)",
          user: {
            ...userData,
            uid: targetUserId,
          },
        });
      }
    } catch (error: any) {
      console.error("Error fetching user data:", error);
      return NextResponse.json(
        {
          error: "Failed to fetch user data",
          message: error.message,
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error("User fetch error:", error);
    return NextResponse.json(
      {
        error: "Failed to process user request",
        message: error.message,
      },
      { status: 500 }
    );
  }
}
