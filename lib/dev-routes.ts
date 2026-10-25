/**
 * Pages and endpoints that exist only to help while developing (`app/(dev)/*`, `/api/auth/session/debug`).
 * They are switched off in production builds unless `ENABLE_DEV_ROUTES=true` is set on purpose.
 */
export const DEV_ROUTE_PREFIXES = [
  "/auth-test",
  "/useauth-test",
  "/api/auth/session/debug",
];

export const devRoutesEnabled = (): boolean =>
  process.env.NODE_ENV !== "production" ||
  process.env.ENABLE_DEV_ROUTES === "true";

export const isDevRoute = (pathname: string): boolean =>
  DEV_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
