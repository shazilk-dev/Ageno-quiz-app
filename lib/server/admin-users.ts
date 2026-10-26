import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { auth, db } from "@/firebase/admin";
import type { AdminUserDTO } from "@/lib/admin-types";
import { renameOnLeaderboard } from "./leaderboard-store";
import { ApiError, assertSafeId } from "./request";

/**
 * Deletes a person for real: their sign-in account (so they can't just sign back in and get a fresh
 * profile), their profile with its sub-collections, their activity log and any attempts still on file.
 * Their finished results stay: they feed the quiz reports and the leaderboard, and show as an unknown
 * user from then on (the name copied onto their leaderboard rows is cleared).
 *
 * Refuses to delete yourself, and the last admin (an app nobody can administer is not recoverable).
 */
export async function deleteUserAccount(
  targetUid: unknown,
  actingUid: string
): Promise<{ deleted: true }> {
  assertSafeId(targetUid, "user");
  if (targetUid === actingUid) {
    throw new ApiError(400, "cannot_delete_self", "You can't delete your own account from here.");
  }

  const profileRef = db.collection("users").doc(targetUid);
  const profile = await profileRef.get();
  if (profile.data()?.role === "admin") {
    const admins = await db.collection("users").where("role", "==", "admin").count().get();
    if (admins.data().count <= 1) {
      throw new ApiError(400, "last_admin", "That's the last admin. Make someone else an admin first.");
    }
  }

  try {
    await auth.deleteUser(targetUid);
  } catch (error) {
    // Already gone from Auth (a profile left behind): carry on and clean up the rest.
    if ((error as { code?: string }).code !== "auth/user-not-found") throw error;
  }

  for (const [collection, field] of [
    ["attempts", "userId"],
    ["userActivities", "userId"],
  ] as const) {
    for (;;) {
      const page = await db.collection(collection).where(field, "==", targetUid).select().limit(300).get();
      if (page.empty) break;
      await Promise.all(page.docs.map((doc) => db.recursiveDelete(doc.ref)));
    }
  }
  await renameOnLeaderboard(targetUid, null);
  await db.recursiveDelete(profileRef);
  return { deleted: true };
}

/** Sign-up and login times are server timestamps, but older profiles may hold plain numbers or dates. */
function toMillis(value: unknown): number | null {
  if (value instanceof Timestamp) return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** At most this many people are listed; `total` says how many exist. */
export const MAX_LISTED_USERS = 500;

/**
 * The people list for the Users screen, newest first. Only the fields the screen shows are read (not the
 * activity logs kept on the profile).
 */
export async function listUsers(): Promise<{ users: AdminUserDTO[]; total: number }> {
  const [snapshot, count] = await Promise.all([
    db
      .collection("users")
      .select("email", "displayName", "role", "emailVerified", "createdAt", "lastLoginAt")
      .limit(MAX_LISTED_USERS)
      .get(),
    db.collection("users").count().get(),
  ]);

  const users = snapshot.docs.map((doc): AdminUserDTO => {
    const data = doc.data();
    return {
      id: doc.id,
      email: typeof data.email === "string" ? data.email : "",
      displayName: typeof data.displayName === "string" ? data.displayName : "",
      role: data.role === "admin" ? "admin" : "user",
      emailVerified: data.emailVerified === true,
      createdAt: toMillis(data.createdAt),
      lastLoginAt: toMillis(data.lastLoginAt),
    };
  });
  users.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  return { users, total: count.data().count };
}

/**
 * Makes someone an admin or a plain user. The role lives in two places the rules read (the `role` claim
 * and `users/{uid}.role`), so both are set here, and a demotion also ends the person's current sessions:
 * a token issued while they were an admin would otherwise keep working until it expires.
 *
 * You can't change your own role (an admin can't lock themselves out by accident), which also means the
 * last admin can't be demoted by the one person who could undo it.
 */
export async function setUserRole(
  targetUid: unknown,
  role: unknown,
  actingUid: string
): Promise<{ id: string; role: "admin" | "user" }> {
  assertSafeId(targetUid, "user");
  if (role !== "admin" && role !== "user") {
    throw new ApiError(400, "invalid_role", "The role must be admin or user.");
  }
  if (targetUid === actingUid) {
    throw new ApiError(400, "cannot_change_own_role", "You can't change your own role. Ask another admin.");
  }

  const profileRef = db.collection("users").doc(targetUid);
  const profile = await profileRef.get();
  if (!profile.exists) {
    throw new ApiError(404, "user_not_found", "We couldn't find that user.");
  }

  let claims: Record<string, unknown>;
  try {
    claims = (await auth.getUser(targetUid)).customClaims ?? {};
  } catch (error) {
    if ((error as { code?: string }).code === "auth/user-not-found") {
      throw new ApiError(404, "user_not_found", "That person's sign-in account no longer exists.");
    }
    throw error;
  }

  await auth.setCustomUserClaims(targetUid, { ...claims, role });
  await profileRef.update({ role, updatedAt: FieldValue.serverTimestamp() });
  if (role === "user") await auth.revokeRefreshTokens(targetUid);
  return { id: targetUid, role };
}
