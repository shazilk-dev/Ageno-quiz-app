import { after, NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { DecodedIdToken } from "firebase-admin/auth";
import { FieldValue, type DocumentSnapshot } from "firebase-admin/firestore";
import { auth, db } from "@/firebase/admin";
import { logActivity } from "@/lib/server/activity";
import { ServerTiming } from "@/lib/server/timing";

// Session expiration time (14 days in seconds)
const SESSION_EXPIRATION_TIME = 60 * 60 * 24 * 14;

/** A session made this soon after the Firebase sign-in is a sign-in; later ones are the 30-minute refresh. */
const FRESH_SIGN_IN_SEC = 5 * 60;

/**
 * Not a secret and proves nothing: it only tells the browser that a `session` cookie (which it can't read)
 * probably exists, so signed-out visitors don't ask the server about a session they don't have.
 */
const SIGNED_IN_HINT = "signed_in";

const SESSION_COOKIES = ["session", "user_role", SIGNED_IN_HINT];

/** "password" -> "email", "google.com" -> "google", as the activity log has always called them. */
const signInMethod = (decoded: DecodedIdToken): string => {
  const provider = decoded.firebase?.sign_in_provider ?? "unknown";
  if (provider === "password") return "email";
  return provider.replace(/\.com$/, "");
};

/**
 * Turns a fresh ID token into the 14-day session cookie. Only what the response needs is waited for (the
 * token check, the role, the cookie); the profile's `lastLoginAt`, a new person's profile, the role claim
 * and the activity log are written after the response has gone, with `after()`, which keeps the function
 * alive until they finish.
 */
export async function POST(request: NextRequest) {
  const timing = new ServerTiming();
  const body = await request.json().catch(() => null);
  const idToken: unknown = body?.idToken;
  if (typeof idToken !== "string" || !idToken) {
    return NextResponse.json({ error: "Missing ID token" }, { status: 400 });
  }

  let decoded: DecodedIdToken;
  try {
    decoded = await timing.time("verify", auth.verifyIdToken(idToken, true));
  } catch (error) {
    console.error("Token verification failed:", error);
    return timing.apply(
      NextResponse.json(
        { error: "Invalid ID token", code: (error as { code?: string }).code ?? "unknown_error" },
        { status: 401 }
      )
    );
  }

  const uid = decoded.uid;
  const profileRef = db.collection("users").doc(uid);

  // The role and the cookie don't depend on each other: fetch both at once.
  let profile: DocumentSnapshot | null;
  let sessionCookie: string;
  try {
    [profile, sessionCookie] = await timing.time(
      "session",
      Promise.all([
        db
          .getAll(profileRef, { fieldMask: ["role"] })
          .then(([snap]) => snap)
          .catch((error) => {
            console.warn("Could not read the profile for the role:", error);
            return null;
          }),
        auth.createSessionCookie(idToken, { expiresIn: SESSION_EXPIRATION_TIME * 1000 }),
      ])
    );
  } catch (error) {
    console.error("Failed to create session cookie:", error);
    return timing.apply(
      NextResponse.json(
        { error: "Failed to create session cookie", code: (error as { code?: string }).code ?? "unknown_error" },
        { status: 401 }
      )
    );
  }

  // The profile decides the role. If it couldn't be read, keep what the token already says and change nothing.
  const role: string = profile
    ? (profile.exists && (profile.get("role") as string)) || "user"
    : decoded.role === "admin"
      ? "admin"
      : "user";

  after(async () => {
    const userAgent = request.headers.get("user-agent");
    const method = signInMethod(decoded);
    const now = FieldValue.serverTimestamp();

    if (profile && !profile.exists) {
      // `create` fails if the sign-up route made the profile in the meantime, which is fine.
      await profileRef
        .create({
          email: decoded.email || "",
          displayName: decoded.name || "",
          role: "user",
          emailVerified: decoded.email_verified || false,
          photoURL: decoded.picture || null,
          createdAt: now,
          lastLoginAt: now,
          updatedAt: now,
          activityLogs: [],
          customClaims: { role: "user" },
        })
        .then(() => logActivity(uid, "account_created", { method }, userAgent))
        .catch((error) => console.warn("Could not create the profile:", error));
    } else if (profile) {
      await profileRef
        .update({
          lastLoginAt: now,
          updatedAt: now,
          ...(decoded.email_verified !== undefined && { emailVerified: decoded.email_verified }),
        })
        .catch((error) => console.warn("Could not update lastLoginAt:", error));
      if (Date.now() / 1000 - decoded.auth_time < FRESH_SIGN_IN_SEC) {
        await logActivity(uid, "login", { method }, userAgent);
      }
    }

    // Keep the role claim in step with the profile, for the Firestore rules and the next token.
    if (profile && decoded.role !== role) {
      try {
        const existing = (await auth.getUser(uid)).customClaims ?? {};
        await auth.setCustomUserClaims(uid, { ...existing, role });
      } catch (error) {
        console.warn("Could not update the role claim:", error);
      }
    }
  });

  const cookieStore = await cookies();
  const secure = process.env.NODE_ENV === "production";
  const base = { maxAge: SESSION_EXPIRATION_TIME, secure, path: "/", sameSite: "lax" as const };
  cookieStore.set({ name: "session", value: sessionCookie, httpOnly: true, ...base });
  // A hint for the middleware only; the admin layout and every API route check the real role.
  cookieStore.set({ name: "user_role", value: role, httpOnly: true, ...base });
  cookieStore.set({ name: SIGNED_IN_HINT, value: "1", httpOnly: false, ...base });

  return timing.apply(NextResponse.json({ success: true, role, uid }, { status: 200 }));
}

/**
 * Signs out. By default only this browser: its cookies are cleared. With `?scope=all` the person's refresh
 * tokens are revoked too, which signs them out on every device; that needs proof of who they are (their ID
 * token, or failing that this browser's session cookie) and reports a failure instead of hiding it.
 */
export async function DELETE(request: NextRequest) {
  const everywhere = request.nextUrl.searchParams.get("scope") === "all";
  const sessionCookie = request.cookies.get("session")?.value;
  const userAgent = request.headers.get("user-agent");

  if (everywhere) {
    const idToken = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
    try {
      const uid = idToken
        ? (await auth.verifyIdToken(idToken)).uid
        : (await auth.verifySessionCookie(sessionCookie ?? "")).uid;
      await auth.revokeRefreshTokens(uid);
      after(() => logActivity(uid, "logout_everywhere", {}, userAgent));
    } catch (error) {
      console.error("Could not sign out everywhere:", error);
      return NextResponse.json({ error: "Could not sign out everywhere" }, { status: 500 });
    }
  } else if (sessionCookie) {
    after(async () => {
      try {
        const { uid } = await auth.verifySessionCookie(sessionCookie);
        await logActivity(uid, "logout", {}, userAgent);
      } catch {
        // An invalid or expired session has no one to log against.
      }
    });
  }

  const cookieStore = await cookies();
  for (const name of SESSION_COOKIES) {
    cookieStore.set({ name, value: "", maxAge: 0, path: "/" });
  }
  return NextResponse.json({ success: true }, { status: 200 });
}
