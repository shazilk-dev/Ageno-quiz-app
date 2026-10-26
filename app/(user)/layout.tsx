import SiteFrame from "@/components/layout/SiteFrame";
import { getSessionUser } from "@/lib/server/session";
import UserGate from "./UserGate";

/**
 * A person's own pages. They depend on who is asking, so they are rendered for each request; the pages
 * read their data on the server with the same session (`getSessionUser`, verified once per request).
 * No server redirect for a missing session: the browser may still be signed in (its session cookie gone),
 * and the sign-in page would send it straight back here. `UserGate` decides on the browser's sign-in.
 */
export default async function UserLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionUser();
  return (
    <SiteFrame>
      <UserGate serverSignedIn={session !== null}>{children}</UserGate>
    </SiteFrame>
  );
}
