// The session route: sign-in waits only for the token check, the role and the cookie; the profile, the role
// claim and the activity log are written afterwards (`after()`). Sign-out is this browser only unless asked.
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  afterTasks: [] as Array<() => unknown>,
  cookies: new Map<string, { value: string; httpOnly?: boolean; maxAge?: number }>(),
  profile: null as { exists: boolean; role?: string } | null,
  profileFails: false,
  auth: {
    verifyIdToken: vi.fn(),
    createSessionCookie: vi.fn(),
    verifySessionCookie: vi.fn(),
    revokeRefreshTokens: vi.fn(),
    getUser: vi.fn(),
    setCustomUserClaims: vi.fn(),
  },
  update: vi.fn(),
  create: vi.fn(),
  logActivity: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => state.afterTasks.push(task),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    set: ({ name, ...rest }: { name: string; value: string }) => state.cookies.set(name, rest),
  }),
}));
vi.mock("@/firebase/admin", () => ({
  auth: state.auth,
  db: {
    collection: () => ({ doc: () => ({ update: state.update, create: state.create }) }),
    getAll: async () => {
      if (state.profileFails) throw new Error("unavailable");
      const profile = state.profile;
      return [{ exists: !!profile?.exists, get: (field: string) => (field === "role" ? profile?.role : undefined) }];
    },
  },
}));
vi.mock("@/lib/server/activity", () => ({ logActivity: state.logActivity }));

import { DELETE, POST } from "@/app/api/auth/session/route";

const signIn = (body: unknown = { idToken: "token" }) =>
  POST(new NextRequest("http://localhost/api/auth/session", { method: "POST", body: JSON.stringify(body) }));

const runAfter = async () => {
  for (const task of state.afterTasks.splice(0)) await task();
};

const nowSec = () => Math.floor(Date.now() / 1000);

beforeEach(() => {
  state.afterTasks = [];
  state.cookies.clear();
  state.profile = { exists: true, role: "user" };
  state.profileFails = false;
  Object.values(state.auth).forEach((fn) => fn.mockReset());
  state.update.mockReset().mockResolvedValue(undefined);
  state.create.mockReset().mockResolvedValue(undefined);
  state.logActivity.mockReset().mockResolvedValue(undefined);
  state.auth.verifyIdToken.mockResolvedValue({
    uid: "u1",
    role: "user",
    auth_time: nowSec(),
    firebase: { sign_in_provider: "password" },
  });
  state.auth.createSessionCookie.mockResolvedValue("session-cookie");
  state.auth.getUser.mockResolvedValue({ customClaims: { beta: true } });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("POST /api/auth/session", () => {
  it("rejects a request without a token", async () => {
    expect((await signIn({})).status).toBe(400);
    expect(state.auth.verifyIdToken).not.toHaveBeenCalled();
  });

  it("rejects a token that doesn't verify, without making a cookie", async () => {
    state.auth.verifyIdToken.mockRejectedValue(Object.assign(new Error("bad"), { code: "auth/argument-error" }));
    const response = await signIn();
    expect(response.status).toBe(401);
    expect(state.auth.createSessionCookie).not.toHaveBeenCalled();
    expect(state.cookies.size).toBe(0);
  });

  it("verifies once with revocation, sets the cookies, and reports where the time went", async () => {
    const response = await signIn();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, role: "user", uid: "u1" });
    expect(state.auth.verifyIdToken).toHaveBeenCalledTimes(1);
    expect(state.auth.verifyIdToken).toHaveBeenCalledWith("token", true);
    expect(state.cookies.get("session")).toMatchObject({ value: "session-cookie", httpOnly: true });
    expect(state.cookies.get("user_role")).toMatchObject({ value: "user", httpOnly: true });
    expect(state.cookies.get("signed_in")).toMatchObject({ value: "1", httpOnly: false });
    expect(response.headers.get("server-timing")).toMatch(/verify;dur=.*session;dur=.*total;dur=/);
  });

  it("does the bookkeeping after the response: lastLoginAt and a login entry for a fresh sign-in", async () => {
    await signIn();
    expect(state.update).not.toHaveBeenCalled();
    expect(state.logActivity).not.toHaveBeenCalled();

    await runAfter();
    expect(state.update).toHaveBeenCalledTimes(1);
    expect(state.logActivity).toHaveBeenCalledWith("u1", "login", { method: "email" }, null);
    expect(state.auth.setCustomUserClaims).not.toHaveBeenCalled();
  });

  it("doesn't log a login for the 30-minute refresh", async () => {
    state.auth.verifyIdToken.mockResolvedValue({ uid: "u1", auth_time: nowSec() - 3600, role: "user" });
    await signIn();
    await runAfter();
    expect(state.update).toHaveBeenCalledTimes(1);
    expect(state.logActivity).not.toHaveBeenCalled();
  });

  it("creates a new person's profile and logs the account, e.g. a first Google sign-in", async () => {
    state.profile = { exists: false };
    state.auth.verifyIdToken.mockResolvedValue({
      uid: "u2",
      email: "new@example.com",
      name: "New",
      auth_time: nowSec(),
      firebase: { sign_in_provider: "google.com" },
    });
    await signIn();
    await runAfter();
    expect(state.create).toHaveBeenCalledWith(expect.objectContaining({ email: "new@example.com", role: "user" }));
    expect(state.logActivity).toHaveBeenCalledWith("u2", "account_created", { method: "google" }, null);
  });

  it("gives a token without a role claim one, keeping the other claims", async () => {
    state.auth.verifyIdToken.mockResolvedValue({ uid: "u1", auth_time: nowSec() });
    await signIn();
    await runAfter();
    expect(state.auth.setCustomUserClaims).toHaveBeenCalledWith("u1", { beta: true, role: "user" });
  });

  it("takes the role from the profile and brings the claim in line, keeping other claims", async () => {
    state.profile = { exists: true, role: "admin" };
    const response = await signIn();
    expect((await response.json()).role).toBe("admin");
    expect(state.cookies.get("user_role")?.value).toBe("admin");
    await runAfter();
    expect(state.auth.setCustomUserClaims).toHaveBeenCalledWith("u1", { beta: true, role: "admin" });
  });

  it("keeps the token's role and touches nothing when the profile can't be read", async () => {
    state.profileFails = true;
    state.auth.verifyIdToken.mockResolvedValue({ uid: "u1", role: "admin", auth_time: nowSec() });
    const response = await signIn();
    expect((await response.json()).role).toBe("admin");
    await runAfter();
    expect(state.update).not.toHaveBeenCalled();
    expect(state.create).not.toHaveBeenCalled();
    expect(state.auth.setCustomUserClaims).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/auth/session", () => {
  const signOut = (query = "", headers: Record<string, string> = {}) =>
    DELETE(
      new NextRequest(`http://localhost/api/auth/session${query}`, {
        method: "DELETE",
        headers: { cookie: "session=abc", ...headers },
      })
    );

  it("signs out this browser only: clears every session cookie and revokes nothing", async () => {
    state.auth.verifySessionCookie.mockResolvedValue({ uid: "u1" });
    const response = await signOut();
    expect(response.status).toBe(200);
    for (const name of ["session", "user_role", "signed_in"]) {
      expect(state.cookies.get(name)).toMatchObject({ value: "", maxAge: 0 });
    }
    await runAfter();
    expect(state.auth.revokeRefreshTokens).not.toHaveBeenCalled();
    expect(state.logActivity).toHaveBeenCalledWith("u1", "logout", {}, null);
  });

  it("signs out everywhere when asked, proven by the ID token", async () => {
    state.auth.verifyIdToken.mockResolvedValue({ uid: "u1" });
    const response = await signOut("?scope=all", { authorization: "Bearer id-token" });
    expect(response.status).toBe(200);
    expect(state.auth.verifyIdToken).toHaveBeenCalledWith("id-token");
    expect(state.auth.revokeRefreshTokens).toHaveBeenCalledWith("u1");
  });

  it("reports a failed sign-out everywhere and keeps this browser signed in", async () => {
    state.auth.verifyIdToken.mockRejectedValue(new Error("expired"));
    const response = await signOut("?scope=all", { authorization: "Bearer id-token" });
    expect(response.status).toBe(500);
    expect(state.auth.revokeRefreshTokens).not.toHaveBeenCalled();
    expect(state.cookies.size).toBe(0);
  });
});
