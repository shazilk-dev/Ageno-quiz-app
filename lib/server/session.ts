import { cookies } from "next/headers";
import { cache } from "react";
import { auth } from "@/firebase/admin";

export interface SessionUser {
  uid: string;
  role: string;
}

/**
 * Who this request's `session` cookie belongs to, for server-rendered pages, or `null`. Verifies the
 * signature and expiry only (no revocation check, so no call to Google): good enough to choose what to
 * render for a person's *own* data. Anything an admin can do still goes through `getAdminAccess`, which
 * checks revocation. Once per request, however many components ask.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const sessionCookie = (await cookies()).get("session")?.value;
  if (!sessionCookie) return null;
  try {
    const decoded = await auth.verifySessionCookie(sessionCookie);
    return { uid: decoded.uid, role: typeof decoded.role === "string" ? decoded.role : "user" };
  } catch {
    return null;
  }
});
