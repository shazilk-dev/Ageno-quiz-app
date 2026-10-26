import { auth } from "@/firebase/client";

/** A failed call to one of our own API routes. `message` is written for the person using the app. */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

const NETWORK_MESSAGE =
  "We couldn't reach the server. Check your connection and try again.";

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  /** Send the sign-in token (default). Public, cacheable routes pass `false`, so a shared cache can serve them. */
  auth?: boolean;
}

/**
 * Calls one of our API routes. When someone is signed in their ID token goes along, so the server knows
 * who is asking. A token that can't be fetched is an error, not a reason to carry on as a stranger.
 */
export async function apiRequest<T>(
  path: string,
  { method = "GET", body, auth: withAuth = true }: RequestOptions = {}
): Promise<T> {
  const headers: Record<string, string> = {};
  const user = withAuth ? auth.currentUser : null;
  if (user) {
    try {
      headers.Authorization = `Bearer ${await user.getIdToken()}`;
    } catch {
      throw new ApiRequestError(
        401,
        "invalid_token",
        "Your sign-in has expired. Sign in again and retry."
      );
    }
  }
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiRequestError(0, "network", NETWORK_MESSAGE);
  }

  let payload: { error?: string; message?: string } | null = null;
  try {
    payload = await response.json();
  } catch {
    // An empty or non-JSON body is handled below.
  }
  if (!response.ok) {
    throw new ApiRequestError(
      response.status,
      payload?.error ?? "unknown",
      payload?.message ?? "Something went wrong. Try again."
    );
  }
  return payload as T;
}
