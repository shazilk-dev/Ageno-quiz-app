/* eslint-disable @typescript-eslint/no-explicit-any */
// lib/actions/session.actions.ts
import { User } from "firebase/auth";

export interface SessionResult {
  success: boolean;
  error?: string;
  details?: any;
}

const NO_CACHE = { "Cache-Control": "no-cache, no-store, must-revalidate" };

/**
 * True when the server has probably given this browser a session (the readable `signed_in` cookie set
 * next to the httpOnly `session` one). Only used to skip pointless session checks; it proves nothing.
 */
export const hasSessionHint = (): boolean =>
  typeof document !== "undefined" && /(?:^|;\s*)signed_in=1(?:;|$)/.test(document.cookie);

/** Sends an ID token to the server, which answers with the session cookie. */
async function postSession(idToken: string, action: string): Promise<SessionResult> {
  try {
    const response = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...NO_CACHE },
      body: JSON.stringify({ idToken }),
    });
    const data = await response.json().catch(() => ({ error: "Could not parse server response" }));
    if (!response.ok) {
      console.error(`Server rejected session ${action}:`, data);
      return {
        success: false,
        error: data.error || `Failed to ${action} session (${response.status})`,
        details: data,
      };
    }
    return { success: true, details: data };
  } catch (error: any) {
    console.error(`Network error during session ${action}:`, error);
    return { success: false, error: `Network error during session ${action}`, details: error.message };
  }
}

/**
 * Creates the session cookie right after a sign-in. The token the sign-in just minted is used as is:
 * forcing a refresh here would only add another trip to Google.
 */
export const createSession = async (user: User): Promise<SessionResult> => {
  let idToken: string;
  try {
    idToken = await user.getIdToken();
  } catch (error: any) {
    console.error("Failed to get ID token:", error);
    return { success: false, error: "Failed to get authentication token", details: error.message };
  }
  return postSession(idToken, "create");
};

/** Renews the session cookie in the background (every 30 minutes) from a freshly minted token. */
export const refreshSession = async (user: User): Promise<SessionResult> => {
  let idToken: string;
  try {
    idToken = await user.getIdToken(true);
  } catch (error: any) {
    console.error("Failed to refresh ID token:", error);
    return { success: false, error: "Failed to refresh authentication token", details: error.message };
  }
  return postSession(idToken, "refresh");
};

/**
 * Clears this browser's session cookies. With `everywhere`, the server also revokes the person's refresh
 * tokens, signing them out on every device; pass the signed-in user so their ID token can prove who asks.
 */
export const clearSession = async ({
  everywhere = false,
  user,
}: { everywhere?: boolean; user?: User | null } = {}): Promise<SessionResult> => {
  try {
    const headers: Record<string, string> = { ...NO_CACHE };
    if (everywhere && user) headers.Authorization = `Bearer ${await user.getIdToken()}`;

    const response = await fetch(`/api/auth/session${everywhere ? "?scope=all" : ""}`, {
      method: "DELETE",
      credentials: "include",
      headers,
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: "Could not parse response" }));
      return {
        success: false,
        error: data.error || `Failed to clear session (${response.status})`,
        details: data,
      };
    }
    return { success: true };
  } catch (error: any) {
    console.error("Error clearing session:", error);
    return { success: false, error: "Network error while clearing session", details: error.message };
  }
};

// Check if the user has a valid session
export const checkSession = async (): Promise<{
  isAuthenticated: boolean;
  user?: any;
  error?: string;
  reason?: string;
}> => {
  // Don't wait forever for an answer.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);

  try {
    const response = await fetch("/api/auth/session/check", {
      method: "GET",
      headers: { "Content-Type": "application/json", ...NO_CACHE },
      credentials: "include",
      signal: controller.signal,
    });

    let data;
    try {
      data = await response.json();
    } catch (parseError) {
      console.error("Failed to parse session check response:", parseError);
      return { isAuthenticated: false, error: "Failed to parse server response", reason: "parse_error" };
    }

    if (!response.ok) {
      if (response.status === 401) {
        if (data.reason === "token_revoked") {
          console.warn("Session token has been revoked. Clearing local session data.");
        }
        return { isAuthenticated: false, reason: data.reason || "unauthorized" };
      }
      return {
        isAuthenticated: false,
        error: data.error || `Session check failed (${response.status})`,
        reason: data.reason,
      };
    }

    return { isAuthenticated: data.isAuthenticated, user: data.user };
  } catch (error: any) {
    if (error.name === "AbortError") {
      console.error("Session check request timed out");
      return { isAuthenticated: false, error: "Session check request timed out", reason: "timeout" };
    }
    console.error("Network error checking session:", error);
    return {
      isAuthenticated: false,
      error: error.message || "Network error checking session",
      reason: "network_error",
    };
  } finally {
    clearTimeout(timeoutId);
  }
};
