"use client";

import JoinCodeForm from "@/components/join/JoinCodeForm";
import { useAuth } from "@/contexts/auth-context";

/** The access-code field for the home page. It only needs to know whether to hint at signing in. */
export default function HomeCodeForm() {
  const { user, loading } = useAuth();
  return <JoinCodeForm signedIn={loading ? null : !!user} className="w-full" />;
}
