// Who may reach what: the middleware's page rules, the server-side admin check, the debug routes that
// must not exist in production, and the sign-in redirect helper. No server or Firebase needed:
//   npx vitest run __tests__/access-control.test.ts
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const verifySessionCookie = vi.fn();
const userDoc = vi.fn();
vi.mock("@/firebase/admin", () => ({
  auth: { verifySessionCookie: (...args: unknown[]) => verifySessionCookie(...args) },
  db: {
    collection: () => ({ doc: () => ({ get: () => userDoc() }) }),
  },
}));

import { GET as debugRoute } from "@/app/api/auth/session/debug/route";
import { middleware } from "@/middleware";
import { safeRedirectPath } from "@/lib/navigation";
import { getAdminAccess } from "@/lib/server/admin-access";

const call = (path: string, cookies: Record<string, string> = {}) =>
  middleware(
    new NextRequest(`http://localhost${path}`, {
      headers: {
        cookie: Object.entries(cookies)
          .map(([k, v]) => `${k}=${v}`)
          .join("; "),
      },
    })
  );

const isRedirect = (res: Response) => res.status === 307 || res.status === 308;
const location = (res: Response) => new URL(res.headers.get("location") ?? "", "http://localhost");
const passesThrough = (res: Response) => res.headers.get("x-middleware-next") === "1";

describe("middleware: admin screens", () => {
  const adminPaths = ["/dashboard", "/quizzes", "/quizzes/new", "/quizzes/abc/edit", "/users", "/quiz-reports", "/settings"];

  it.each(adminPaths)("%s needs a session", async (path) => {
    const res = await call(path);
    expect(isRedirect(res)).toBe(true);
    expect(location(res).pathname).toBe("/sign-in");
    expect(location(res).searchParams.get("redirectTo")).toBe(path);
  });

  it.each(adminPaths)("%s sends a signed-in non-admin home", async (path) => {
    const res = await call(path, { session: "s", user_role: "user" });
    expect(isRedirect(res)).toBe(true);
    expect(location(res).pathname).toBe("/");
  });

  it.each(adminPaths)("%s lets the request on to the server-side check when the role cookie says admin", async (path) => {
    expect(passesThrough(await call(path, { session: "s", user_role: "admin" }))).toBe(true);
  });

  it("checks admin paths before the 'looks like a quiz code' rule (these names are 6+ letters)", async () => {
    // "/dashboard" and "/settings" are long enough to look like old quiz codes; they must still be gated.
    expect(isRedirect(await call("/settings"))).toBe(true);
    expect(isRedirect(await call("/dashboard"))).toBe(true);
  });

  it("hands the page's address on to server components, for the sign-in return trip", async () => {
    const res = await call("/quizzes/new?x=1", { session: "s", user_role: "admin" });
    expect(res.headers.get("x-middleware-request-x-pathname")).toBe("/quizzes/new?x=1");
  });
});

describe("middleware: everything else", () => {
  it.each(["/", "/sign-in", "/sign-up", "/reset-password", "/verify-email", "/join", "/q/abc123xyz", "/api/auth/session"])(
    "%s is open to anyone",
    async (path) => {
      expect(passesThrough(await call(path))).toBe(true);
    }
  );

  it.each([
    "/api/attempts/start",
    "/api/attempts/abc/submit",
    "/api/quizzes",
    "/api/quizzes/abc",
    "/api/quizzes/resolve",
    "/api/leaderboard",
    "/api/my-attempts",
  ])("%s is reachable without a cookie (the route checks the token itself)", async (path) => {
    expect(passesThrough(await call(path))).toBe(true);
  });

  it.each(["/profile", "/my-quizzes", "/leaderboard"])(
    "%s needs a session now (the leaderboard and ordinary pages are no longer public)",
    async (path) => {
      const res = await call(path);
      expect(isRedirect(res)).toBe(true);
      expect(location(res).searchParams.get("redirectTo")).toBe(path);
      expect(passesThrough(await call(path, { session: "s" }))).toBe(true);
    }
  );

  it("treats only capital-and-digit paths as old quiz codes", async () => {
    expect(passesThrough(await call("/ABC123"))).toBe(true);
    expect(passesThrough(await call("/JS2025"))).toBe(true);
    expect(isRedirect(await call("/profile"))).toBe(true);
    expect(isRedirect(await call("/somepage"))).toBe(true);
    expect(isRedirect(await call("/ab"))).toBe(true);
  });

  it("answers an unknown API path without a session with a 401, not a redirect", async () => {
    const res = await call("/api/anything-else");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Authentication required" });
  });

  it("no longer trusts the old '/quiz/join', '/admin' or '/(dev)' special cases", async () => {
    expect(isRedirect(await call("/quiz/join"))).toBe(true);
    expect(isRedirect(await call("/admin/anything"))).toBe(true);
    expect(isRedirect(await call("/(dev)/x"))).toBe(true);
  });
});

describe("development-only routes", () => {
  beforeEach(() => vi.unstubAllEnvs());
  afterEach(() => vi.unstubAllEnvs());

  const devPaths = ["/auth-test", "/useauth-test", "/api/auth/session/debug"];

  it.each(devPaths)("%s doesn't exist in production", async (path) => {
    vi.stubEnv("NODE_ENV", "production");
    const res = await call(path, { session: "s", user_role: "admin" });
    expect(res.status).toBe(404);
  });

  it.each(devPaths)("%s is available while developing", async (path) => {
    vi.stubEnv("NODE_ENV", "development");
    expect(passesThrough(await call(path, { session: "s" }))).toBe(true);
  });

  it("can be switched on in production on purpose", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ENABLE_DEV_ROUTES", "true");
    expect(passesThrough(await call("/auth-test", { session: "s" }))).toBe(true);
  });

  it("the debug endpoint itself says 404 in production, even if the middleware were skipped", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect((await debugRoute()).status).toBe(404);
  });
});

describe("getAdminAccess (the server-side admin check)", () => {
  beforeEach(() => {
    verifySessionCookie.mockReset();
    userDoc.mockReset();
  });

  it("treats a missing cookie as signed out without calling Firebase", async () => {
    expect(await getAdminAccess(undefined)).toEqual({ state: "signed-out" });
    expect(await getAdminAccess("")).toEqual({ state: "signed-out" });
    expect(verifySessionCookie).not.toHaveBeenCalled();
  });

  it("treats a cookie Firebase rejects (expired, forged, revoked) as signed out", async () => {
    verifySessionCookie.mockRejectedValue(new Error("auth/session-cookie-revoked"));
    expect(await getAdminAccess("forged")).toEqual({ state: "signed-out" });
    // Revocation is checked, not just the signature.
    expect(verifySessionCookie).toHaveBeenCalledWith("forged", true);
  });

  it("accepts the admin role claim without reading the profile", async () => {
    verifySessionCookie.mockResolvedValue({ uid: "u1", role: "admin" });
    expect(await getAdminAccess("good")).toEqual({ state: "admin", uid: "u1" });
    expect(userDoc).not.toHaveBeenCalled();
  });

  it("accepts an admin role on the profile when the claim hasn't caught up", async () => {
    verifySessionCookie.mockResolvedValue({ uid: "u2" });
    userDoc.mockResolvedValue({ data: () => ({ role: "admin" }) });
    expect(await getAdminAccess("good")).toEqual({ state: "admin", uid: "u2" });

    verifySessionCookie.mockResolvedValue({ uid: "u3", role: "user" });
    expect(await getAdminAccess("good")).toEqual({ state: "admin", uid: "u3" });
  });

  it("turns away a signed-in person who isn't an admin", async () => {
    verifySessionCookie.mockResolvedValue({ uid: "u4", role: "user" });
    userDoc.mockResolvedValue({ data: () => ({ role: "user" }) });
    expect(await getAdminAccess("good")).toEqual({ state: "not-admin", uid: "u4" });

    userDoc.mockResolvedValue({ data: () => undefined });
    expect(await getAdminAccess("good")).toEqual({ state: "not-admin", uid: "u4" });
  });
});

describe("safeRedirectPath", () => {
  it("follows paths on this site, with their query", () => {
    expect(safeRedirectPath("/join")).toBe("/join");
    expect(safeRedirectPath("/q/abc?x=1")).toBe("/q/abc?x=1");
    expect(safeRedirectPath("/quizzes/new")).toBe("/quizzes/new");
  });

  it("never leaves the site", () => {
    for (const bad of [
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "javascript:alert(1)",
      "evil.example",
      "",
      null,
      undefined,
    ]) {
      expect(safeRedirectPath(bad)).toBe("/");
    }
    expect(safeRedirectPath("//evil.example", "/join")).toBe("/join");
  });
});
