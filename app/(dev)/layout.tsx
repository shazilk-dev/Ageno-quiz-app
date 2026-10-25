import { notFound } from "next/navigation";
import { devRoutesEnabled } from "@/lib/dev-routes";

/** Developer test pages. They don't exist in production unless ENABLE_DEV_ROUTES=true is set on purpose. */
export default function DevLayout({ children }: { children: React.ReactNode }) {
  if (!devRoutesEnabled()) notFound();
  return children;
}
