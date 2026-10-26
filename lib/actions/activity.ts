import { apiRequest } from "@/lib/api-client";

/**
 * Adds an entry to the signed-in person's activity log, through the server. Callers don't wait for it:
 * it's a record, not part of the action. (Sign-in, sign-up, sign-out and profile changes are logged by
 * the server routes themselves.)
 */
export function recordActivity(type: string, details?: Record<string, unknown>): void {
  apiRequest("/api/account/activity", { method: "POST", body: { type, details } }).catch((error) =>
    console.warn(`Could not record "${type}":`, error)
  );
}
