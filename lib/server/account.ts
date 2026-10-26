import type { DecodedIdToken } from "firebase-admin/auth";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/firebase/admin";
import { ApiError } from "@/lib/server/request";

/**
 * A person's own profile and activity log, written for them by the server. The browser used to write
 * these with the Firestore SDK; now it calls `/api/account/*`, so the client bundle carries no Firestore
 * and the rules can deny the browser everything.
 */

const MAX_NAME = 200;
const MAX_PHOTO_URL = 2000;

/**
 * Brings `users/{uid}` in line with the person's Firebase account after they change it in the browser.
 * The display name and photo come from the body (Firebase Auth already has them); the email and whether
 * it's verified come from the verified token, never from the body. Never touches the role.
 */
export async function updateOwnProfile(
  token: DecodedIdToken,
  body: Record<string, unknown>
): Promise<string[]> {
  const changes: Record<string, unknown> = {};

  if (body.displayName !== undefined) {
    if (typeof body.displayName !== "string" || !body.displayName.trim()) {
      throw new ApiError(400, "invalid_name", "Enter a display name.");
    }
    if (body.displayName.trim().length > MAX_NAME) {
      throw new ApiError(400, "invalid_name", `Keep the name under ${MAX_NAME} characters.`);
    }
    changes.displayName = body.displayName.trim();
  }
  if (body.photoURL !== undefined) {
    if (
      typeof body.photoURL !== "string" ||
      body.photoURL.length > MAX_PHOTO_URL ||
      !body.photoURL.startsWith("https://")
    ) {
      throw new ApiError(400, "invalid_photo", "That picture address isn't valid.");
    }
    changes.photoURL = body.photoURL;
  }

  try {
    await db
      .collection("users")
      .doc(token.uid)
      .update({
        ...changes,
        email: token.email ?? "",
        emailVerified: token.email_verified ?? false,
        updatedAt: FieldValue.serverTimestamp(),
      });
  } catch (error) {
    // 5 = NOT_FOUND: the profile is created at the first sign-in, so there's nothing to update yet.
    if ((error as { code?: number }).code === 5) {
      throw new ApiError(404, "no_profile", "Your profile isn't set up yet. Sign out and in again.");
    }
    throw error;
  }
  return Object.keys(changes);
}

/** What the browser may record. Sign-in, sign-up and sign-out are logged by the session routes instead. */
export const BROWSER_ACTIVITY_TYPES = new Set([
  "verification_email_sent",
  "profile_updated",
  "email_changed",
  "password_changed",
  "mfa_enabled",
  "mfa_disabled",
]);

const MAX_DETAILS_JSON = 1000;

/** Checks an activity entry from the browser. Oversized or non-object details are dropped, not refused. */
export function readActivity(body: Record<string, unknown>): {
  type: string;
  details: Record<string, unknown>;
} {
  if (typeof body.type !== "string" || !BROWSER_ACTIVITY_TYPES.has(body.type)) {
    throw new ApiError(400, "invalid_activity", "That activity can't be recorded.");
  }
  const details =
    body.details && typeof body.details === "object" && !Array.isArray(body.details)
      ? (body.details as Record<string, unknown>)
      : {};
  return {
    type: body.type,
    details: JSON.stringify(details).length <= MAX_DETAILS_JSON ? details : {},
  };
}
