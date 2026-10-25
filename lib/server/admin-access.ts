import { auth, db } from "@/firebase/admin";

export type AdminAccess =
  | { state: "admin"; uid: string }
  | { state: "signed-out" }
  | { state: "not-admin"; uid: string };

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

  if (decoded.role === "admin") return { state: "admin", uid: decoded.uid };

  const profile = await db.collection("users").doc(decoded.uid).get();
  return profile.data()?.role === "admin"
    ? { state: "admin", uid: decoded.uid }
    : { state: "not-admin", uid: decoded.uid };
}
