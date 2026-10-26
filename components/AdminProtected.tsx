"use client";

import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui";
import { useAuth } from "@/contexts/auth-context";

interface AdminProtectedProps {
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * Renders its children only for an admin, and the fallback for anyone else. This keeps the UI honest; the
 * real checks are on the server (the admin layout and every admin route).
 */
export default function AdminProtected({
  children,
  fallback = null,
}: AdminProtectedProps) {
  const { isAdmin, loading } = useAuth();

  if (loading) {
    return <Skeleton aria-busy="true" className="mx-auto mt-8 h-24 w-full max-w-6xl" />;
  }

  return isAdmin ? <>{children}</> : <>{fallback}</>;
}
