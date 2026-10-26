"use client";

import type { MultiFactorInfo, User } from "firebase/auth";
import { ChevronRight, Clock, LogOut, Smartphone } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { Badge, Button, Card, Skeleton } from "@/components/ui";
import { useAuth } from "@/contexts/auth-context";
import { getMfaStatus, unenrollMfaFactor } from "@/lib/actions/auth-account";
import { sendVerificationEmail } from "@/lib/actions/auth-core";
import type { ProfileAction } from "./use-profile-action";

// The setup steps (reCAPTCHA, TOTP, the QR code library) load only when someone starts one.
const PhoneMfaSetup = lazy(() => import("./PhoneMfaSetup"));
const TotpMfaSetup = lazy(() => import("./TotpMfaSetup"));

interface SectionProps {
  user: User;
  action: ProfileAction;
}

type Setup = "phone" | "totp" | null;

const factorKind = (factor: MultiFactorInfo) =>
  factor.factorId === "phone" ? "SMS" : "Authenticator app";

function readFactors(user: User): MultiFactorInfo[] {
  try {
    return getMfaStatus(user).availableFactors;
  } catch (error) {
    console.error("Error getting MFA status:", error);
    return [];
  }
}

/** Email verification and two-factor sign-in. */
export default function SecuritySection({ user, action }: SectionProps) {
  const [factors, setFactors] = useState(() => readFactors(user));
  const [setup, setSetup] = useState<Setup>(null);
  const [confirmEverywhere, setConfirmEverywhere] = useState(false);
  const { logoutEverywhere } = useAuth();
  const { busy, run } = action;

  // Once signed out, the (user) layout sends the person to sign in.
  const signOutEverywhere = () =>
    run(logoutEverywhere, {
      failure: "We couldn't sign you out of your other devices. Please try again.",
    });

  const finishSetup = () => {
    setFactors(readFactors(user));
    setSetup(null);
  };

  const remove = (factor: MultiFactorInfo) =>
    run(() => unenrollMfaFactor(user, factor.uid), {
      success: "Second factor removed.",
      failure: "We couldn't remove it. Please try again.",
      onSuccess: () => setFactors(readFactors(user)),
    });

  return (
    <div className="max-w-2xl space-y-6">
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg">Email verification</h3>
            <p className="mt-1 text-sm text-text-muted">
              A verified email helps you recover your account.
            </p>
          </div>
          {user.emailVerified ? (
            <Badge variant="teal">Verified</Badge>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() =>
                void run(() => sendVerificationEmail(user), {
                  success: "Verification email sent. Check your inbox.",
                  failure: "We couldn't send the verification email. Please try again.",
                })
              }
            >
              Verify email
            </Button>
          )}
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg">Two-factor sign-in</h3>
            <p className="mt-1 max-w-[65ch] text-sm text-text-muted">
              Ask for a code as well as your password when you sign in.
            </p>
          </div>
          <Badge variant={factors.length > 0 ? "teal" : "outline"}>
            {factors.length > 0 ? "On" : "Off"}
          </Badge>
        </div>

        {factors.length > 0 && (
          <ul className="mt-4 divide-y divide-border rounded-lg border border-border">
            {factors.map((factor) => (
              <li key={factor.uid} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <p className="min-w-0 text-sm">
                  <span className="truncate">{factor.displayName || "Second factor"}</span>{" "}
                  <span className="text-text-muted">({factorKind(factor)})</span>
                </p>
                <Button variant="danger" size="sm" disabled={busy} onClick={() => void remove(factor)}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4">
          {setup === "phone" ? (
            <Suspense fallback={<Skeleton className="h-32 w-full" />}>
              <PhoneMfaSetup user={user} action={action} onDone={finishSetup} onCancel={() => setSetup(null)} />
            </Suspense>
          ) : setup === "totp" ? (
            <Suspense fallback={<Skeleton className="h-32 w-full" />}>
              <TotpMfaSetup user={user} action={action} onDone={finishSetup} onCancel={() => setSetup(null)} />
            </Suspense>
          ) : (
            <div className="space-y-2">
              {(
                [
                  ["phone", Smartphone, "Add phone verification"],
                  ["totp", Clock, "Add an authenticator app"],
                ] as const
              ).map(([kind, Icon, label]) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setSetup(kind)}
                  className="transition-fast flex min-h-11 w-full items-center justify-between gap-3 rounded-md border border-border px-4 text-left text-sm hover:border-border-strong"
                >
                  <span className="flex items-center gap-3">
                    <Icon className="size-4 text-text-muted" aria-hidden="true" />
                    {label}
                  </span>
                  <ChevronRight className="size-4 text-text-muted" aria-hidden="true" />
                </button>
              ))}
            </div>
          )}
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg">Signed-in devices</h3>
            <p className="mt-1 max-w-[65ch] text-sm text-text-muted">
              Lost a device or signed in somewhere you shouldn&apos;t have? Sign out everywhere, including here.
            </p>
          </div>
          {!confirmEverywhere && (
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => setConfirmEverywhere(true)}>
              <LogOut className="size-4" aria-hidden="true" />
              Sign out of all devices
            </Button>
          )}
        </div>
        {confirmEverywhere && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-md border border-border p-4">
            <p className="min-w-0 flex-1 text-sm">You&apos;ll need to sign in again on every device.</p>
            <Button variant="danger" size="sm" loading={busy} onClick={() => void signOutEverywhere()}>
              Sign out everywhere
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setConfirmEverywhere(false)}>
              Cancel
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
