import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/firebase/admin";

/**
 * Adds an entry to a person's activity log (`users/{uid}.activityLogs`), in the same shape the browser
 * used to write. Never throws: the log is a record, not something a sign-in or sign-out should wait on
 * or fail over. Run it from `after()` so it doesn't delay the response.
 */
export async function logActivity(
  uid: string,
  type: string,
  details: Record<string, unknown> = {},
  userAgent: string | null = null
): Promise<void> {
  try {
    await db
      .collection("users")
      .doc(uid)
      .update({
        activityLogs: FieldValue.arrayUnion({
          type,
          timestamp: new Date(),
          details,
          userAgent: userAgent ?? "unknown",
        }),
        updatedAt: FieldValue.serverTimestamp(),
      });
  } catch (error) {
    // A missing profile (5 = NOT_FOUND) just means there is nothing to log against yet.
    if ((error as { code?: number }).code !== 5) {
      console.warn(`Could not log "${type}" for ${uid}:`, error);
    }
  }
}
