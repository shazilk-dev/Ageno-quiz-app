import { auth, db } from "@/firebase/admin";
import { ApiError, assertSafeId } from "./request";

/**
 * Deletes a person for real: their sign-in account (so they can't just sign back in and get a fresh
 * profile), their profile with its sub-collections, their activity log and any attempts still on file.
 * Their finished results stay: they feed the quiz reports and the leaderboard, and show as an unknown
 * user from then on.
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
  await db.recursiveDelete(profileRef);
  return { deleted: true };
}
