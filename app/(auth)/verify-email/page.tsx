"use client";

import { CircleCheck } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import AuthFrame from "@/components/auth/AuthFrame";
import { Alert, Button, Skeleton } from "@/components/ui";
import { useAuth } from "@/contexts/auth-context";
import { sendVerificationEmail } from "@/lib/actions/auth.actions";

function VerifyEmailContent() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromLink = searchParams.get("mode") === "verifyEmail" && !!searchParams.get("oobCode");

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [countdown, setCountdown] = useState(0);

  // Nobody to verify: sign in first.
  useEffect(() => {
    if (!loading && !user) router.push("/sign-in");
  }, [loading, user, router]);

  // The resend button waits a minute between emails.
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  // Coming from the link in the email: Firebase has done the check, so reload to pick up the new state.
  useEffect(() => {
    if (!fromLink) return;
    const timer = setTimeout(() => window.location.reload(), 3000);
    return () => clearTimeout(timer);
  }, [fromLink]);

  const resend = async () => {
    if (!user) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await sendVerificationEmail(user);
      if (result === true) {
        setMessage({ type: "success", text: "Verification email sent. Check your inbox and spam folder." });
        setCountdown(60);
      } else {
        setMessage({
          type: "error",
          text: (typeof result === "object" && result.message) || "We couldn't send the email. Please try again.",
        });
      }
    } catch (failure) {
      console.error("Verification email error:", failure);
      setMessage({ type: "error", text: "Something went wrong. Please try again in a moment." });
    } finally {
      setBusy(false);
    }
  };

  if (loading || !user) return <VerifySkeleton />;

  if (fromLink || user.emailVerified) {
    return (
      <AuthFrame eyebrow="// EMAIL" title={fromLink ? "Email verified" : "Already verified"}>
        <div role="status" className="space-y-5">
          <p className="flex items-start gap-3 text-text-body">
            <CircleCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
            {fromLink
              ? "Thanks. Your email address is verified."
              : "Your email address is already verified. There's nothing more to do."}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/join">Find a quiz</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/profile">Your profile</Link>
            </Button>
          </div>
        </div>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame
      eyebrow="// EMAIL"
      title="Verify your email"
      description={
        <>
          We sent a link to <strong className="font-medium text-text">{user.email}</strong>. Open it to finish. Check your
          spam folder too.
        </>
      }
    >
      {message && (
        <Alert variant={message.type} className="mb-5">
          {message.text}
        </Alert>
      )}
      <p className="mb-4 text-text-muted">Didn&apos;t get it? You can ask for another.</p>
      <Button className="w-full" onClick={() => void resend()} loading={busy} disabled={countdown > 0}>
        {countdown > 0 ? `Send again in ${countdown}s` : "Send the email again"}
      </Button>
    </AuthFrame>
  );
}

function VerifySkeleton() {
  return (
    <div data-theme="dark" className="flex-1 bg-bg" aria-busy="true" aria-label="Loading">
      <div className="mx-auto w-full max-w-md px-4 py-16">
        <Skeleton className="h-72 w-full rounded-lg" />
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<VerifySkeleton />}>
      <VerifyEmailContent />
    </Suspense>
  );
}
