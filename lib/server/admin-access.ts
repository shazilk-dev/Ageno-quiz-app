import { auth, db } from "@/firebase/admin";
import { ApiError } from "./request";

export type AdminAccess =
  | { state: "admin"; uid: string }
  | { state: "signed-out" }
  | { state: "not-admin"; uid: string };

/** The role the Firestore rules read: the `role` claim, or `users/{uid}.role`. */
async function isAdminUser(uid: string, claimRole: unknown): Promise<boolean> {
  if (claimRole === "admin") return true;
  const profile = await db.collection("users").doc(uid).get();
  return profile.data()?.role === "admin";
}

/**
 * Decides, on the server, whether a session cookie belongs to an admin. The cookie is verified with
 * Firebase (including revocation), and the role is read the same way the Firestore rules read it: the
 * `role` claim, or `users/{uid}.role`. The `user_role` cookie is never consulted: anyone can set that.
 */
export async function getAdminAccess(
  sessionCookie: string | undefined
): Promise<AdminAccess> {
  if (!sessionCookie) return { state: "signed-out" };

  let decoded;
  try {
    decoded = await auth.verifySessionCookie(sessionCookie, true);
  } catch {
    return { state: "signed-out" };
  }

  return (await isAdminUser(decoded.uid, decoded.role))
    ? { state: "admin", uid: decoded.uid }
    : { state: "not-admin", uid: decoded.uid };
}

/**
 * Guards the admin API routes: a valid, unrevoked ID token (Bearer) that belongs to an admin. Returns the
 * admin's uid. Signed out is a 401, signed in but not an admin is a 403; nothing else gets through.
 */
export async function requireAdmin(request: Request): Promise<string> {
  const token = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!token) {
    throw new ApiError(401, "sign_in_required", "Sign in to continue.");
  }
  let decoded;
  try {
    decoded = await auth.verifyIdToken(token, true);
  } catch {
    throw new ApiError(401, "invalid_token", "Your sign-in has expired. Sign in again and retry.");
  }
  if (!(await isAdminUser(decoded.uid, decoded.role))) {
    throw new ApiError(403, "admin_required", "Only admins can do that.");
  }
  return decoded.uid;
}
